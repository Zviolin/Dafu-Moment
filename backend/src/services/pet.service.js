/**
 * 宠物养成服务（r78 测试修正）：
 * - 每用户一只宠物，首次访问懒创建；点亮天数按宠物创建日真实计算（不再固定 128 天）
 * - 喂食优先消耗签到获得的道具，道具为 0 时可用 10 金币喂食，金币不足给出明确引导
 * - 装扮需真实购买：未拥有的装扮扣金币并写入 user_dress，已拥有可直接切换
 * - 全服福宝数 / 榜单全部来自 pet 表真实计数，不再使用前端假数据
 * 表：pet / pet_dress / user_dress / feed_record / coin_transaction
 */
const { query, query_one, get_conn } = require('../db/pool');
const { err } = require('../utils/api-error');

/** 每次喂食获得经验 */
const FEED_EXP = 10;
/** 金币喂养价格 */
const FEED_COIN_PRICE = 10;
/** 每级所需经验 */
const EXP_PER_LEVEL = 50;

/**
 * 经验转等级
 * @param {number} exp
 * @returns {number}
 */
function level_of(exp) {
    return Math.min(20, Math.floor(Number(exp || 0) / EXP_PER_LEVEL) + 1);
}

/**
 * 查询金币余额（无流水按 0）
 * @param {number} userId
 * @param {Object|null} conn - 事务连接（可选）
 * @returns {Promise<number>}
 */
async function coin_balance(userId, conn = null) {
    const sql = 'SELECT balance_after FROM coin_transaction WHERE user_id = ? ORDER BY id DESC LIMIT 1';
    const row = conn
        ? (await conn.query(sql, [userId]))[0][0]
        : await query_one(sql, [userId]);
    return row ? Number(row.balance_after) || 0 : 0;
}

/**
 * 计算福宝心情与「是否从未投喂」标记
 * 口径：以最近一次投喂为基准；从未投喂时以领养时间（pet.created_at）为基准，
 * 避免刚领养的福宝一打开页面就被判成「饿肚子 / 超过 24 小时没喂食」
 * @param {Date|string|null} last_fed_at - 最近投喂时间
 * @param {Date|string|null} created_at - 领养时间
 * @returns {{mood: string, fed_never: boolean}} mood: happy 满足 / normal 待机 / hungry 饿肚子
 */
function mood_of(last_fed_at, created_at) {
    const fed_never = !last_fed_at;
    const since = last_fed_at || created_at || null;
    const hours = since ? (Date.now() - new Date(since).getTime()) / 3600000 : 999;
    // 未投喂过且领养不足 24 小时 → 待机；其余按「距上次投喂/领养」时长判定
    if (fed_never && hours < 24) return { mood: 'normal', fed_never: true };
    if (hours < 12) return { mood: 'happy', fed_never };
    if (hours < 24) return { mood: 'normal', fed_never };
    return { mood: 'hungry', fed_never };
}

/**
 * 懒创建宠物并返回原始行
 * @param {number} userId
 * @returns {Promise<Object>}
 */
async function ensure_pet(userId) {
    await query('INSERT IGNORE INTO pet (user_id) VALUES (?)', [userId]);
    const row = await query_one(
        `SELECT p.*, DATEDIFF(CURDATE(), DATE(p.created_at)) + 1 AS lit_days
         FROM pet p WHERE p.user_id = ?`,
        [userId]
    );
    return row;
}

/**
 * 宠物状态（含金币、装扮目录、心情）
 * @param {number} userId
 * @returns {Promise<Object>}
 */
async function state(userId) {
    const p = await ensure_pet(userId);
    const coins = await coin_balance(userId);
    const dressRows = await query(
        `SELECT d.id, d.name, d.price, d.min_level, d.image, d.sort,
                (ud.user_id IS NOT NULL) AS owned
         FROM pet_dress d
         LEFT JOIN user_dress ud ON ud.dress_id = d.id AND ud.user_id = ?
         ORDER BY d.sort, d.id`,
        [userId]
    );
    const level = level_of(p.exp);
    const { mood, fed_never } = mood_of(p.last_fed_at, p.created_at);
    return {
        name: p.name,
        level,
        exp: Number(p.exp) || 0,
        exp_next: level >= 20 ? 0 : level * EXP_PER_LEVEL,
        exp_level_base: (level - 1) * EXP_PER_LEVEL,
        props: Number(p.props) || 0,
        coins,
        lit_days: Math.max(1, Number(p.lit_days) || 1),
        feed_total: Number(p.feed_total) || 0,
        dress_id: p.dress_id || null,
        mood,
        fed_never,
        last_fed_at: p.last_fed_at,
        feed_price: FEED_COIN_PRICE,
        dresses: dressRows.map((d) => ({
            id: d.id,
            name: d.name,
            price: Number(d.price) || 0,
            min_level: Number(d.min_level) || 1,
            image: d.image || '',
            owned: Number(d.owned) === 1,
            active: p.dress_id === d.id,
            locked: level < (Number(d.min_level) || 1),
        })),
    };
}

/**
 * 喂食（道具优先；无道具时扣 10 金币）
 * @param {number} userId
 * @returns {Promise<Object>} 最新宠物状态
 */
async function feed(userId) {
    const conn = await get_conn();
    // 消耗口径需在事务外回传给前端（道具 or 金币）
    let costType = 'prop';
    let costAmount = 1;
    try {
        await conn.beginTransaction();
        await conn.query('INSERT IGNORE INTO pet (user_id) VALUES (?)', [userId]);
        const [rows] = await conn.query('SELECT * FROM pet WHERE user_id = ? FOR UPDATE', [userId]);
        const p = rows[0];
        if (Number(p.props) > 0) {
            await conn.query('UPDATE pet SET props = props - 1 WHERE user_id = ?', [userId]);
        } else {
            const balance = await coin_balance(userId, conn);
            if (balance < FEED_COIN_PRICE) {
                throw err.invalid(
                    `喂养道具不足：每日首次签到可领取 1 个道具，也可用 ${FEED_COIN_PRICE} 金币喂养（当前 ${balance} 金币）`
                );
            }
            await conn.query(
                `INSERT INTO coin_transaction (user_id, change_type, amount, biz_type, biz_id, balance_after, remark)
                 VALUES (?, 2, ?, 2, NULL, ?, '宠物喂食')`,
                [userId, FEED_COIN_PRICE, balance - FEED_COIN_PRICE]
            );
            costType = 'coin';
            costAmount = FEED_COIN_PRICE;
        }
        await conn.query(
            `UPDATE pet SET exp = exp + ?, feed_total = feed_total + 1, last_fed_at = NOW()
             WHERE user_id = ?`,
            [FEED_EXP, userId]
        );
        await conn.query(
            'INSERT INTO feed_record (user_id, cost_type, cost_amount) VALUES (?, ?, ?)',
            [userId, costType, costAmount]
        );
        await conn.commit();
    } catch (e) {
        await conn.rollback();
        throw e;
    } finally {
        conn.release();
    }
    const s = await state(userId);
    return { ...s, fed_cost_type: costType, fed_cost_amount: costAmount };
}

/**
 * 购买 / 穿戴装扮（未拥有先扣金币，已拥有直接切换）
 * @param {number} userId
 * @param {string} dressId
 * @returns {Promise<Object>}
 */
async function wear_dress(userId, dressId) {
    const dress = await query_one('SELECT * FROM pet_dress WHERE id = ?', [dressId]);
    if (!dress) throw err.not_found('装扮不存在');
    const conn = await get_conn();
    let bought = false;
    try {
        await conn.beginTransaction();
        await conn.query('INSERT IGNORE INTO pet (user_id) VALUES (?)', [userId]);
        const [rows] = await conn.query('SELECT * FROM pet WHERE user_id = ? FOR UPDATE', [userId]);
        const p = rows[0];
        const level = level_of(p.exp);
        const [ownedRows] = await conn.query(
            'SELECT dress_id FROM user_dress WHERE user_id = ? AND dress_id = ?',
            [userId, dressId]
        );
        const owned = ownedRows.length > 0;
        if (!owned) {
            if (level < Number(dress.min_level)) {
                throw err.invalid(`需要 Lv.${dress.min_level} 才能解锁「${dress.name}」`);
            }
            const price = Number(dress.price) || 0;
            const balance = await coin_balance(userId, conn);
            if (balance < price) {
                throw err.invalid(`金币不足：「${dress.name}」需要 ${price} 金币，当前 ${balance}，完成任务可赚金币`);
            }
            await conn.query(
                `INSERT INTO coin_transaction (user_id, change_type, amount, biz_type, biz_id, balance_after, remark)
                 VALUES (?, 2, ?, 3, NULL, ?, ?)`,
                [userId, price, balance - price, `购买装扮：${dress.name}`]
            );
            await conn.query(
                'INSERT INTO user_dress (user_id, dress_id) VALUES (?, ?)',
                [userId, dressId]
            );
            bought = true;
        }
        await conn.query('UPDATE pet SET dress_id = ? WHERE user_id = ?', [dressId, userId]);
        await conn.commit();
    } catch (e) {
        await conn.rollback();
        throw e;
    } finally {
        conn.release();
    }
    const s = await state(userId);
    return { ...s, dress_bought: bought, dress_name: dress.name };
}

/**
 * 修改宠物名
 * @param {number} userId
 * @param {string} name
 * @returns {Promise<Object>}
 */
async function rename(userId, name) {
    const n = String(name || '').trim();
    if (!n || n.length > 16) throw err.invalid('宠物名需 1-16 个字符');
    await ensure_pet(userId);
    await query('UPDATE pet SET name = ? WHERE user_id = ?', [n, userId]);
    return state(userId);
}

/**
 * 宠物广场（真实用户宠物榜）
 * @param {number} userId
 * @returns {Promise<Object>}
 */
async function community(userId) {
    const totalRow = await query_one('SELECT COUNT(*) c FROM pet');
    const rows = await query(
        `SELECT p.user_id, p.name, p.exp, p.feed_total, p.dress_id, p.last_fed_at, p.created_at,
                DATEDIFF(CURDATE(), DATE(p.created_at)) + 1 AS lit_days,
                u.nickname, u.avatar, u.avatar_object_key
         FROM pet p JOIN user u ON u.id = p.user_id
         ORDER BY p.feed_total DESC, p.exp DESC, p.user_id ASC
         LIMIT 20`
    );
    const list = rows.map((r, i) => {
        const { mood, fed_never } = mood_of(r.last_fed_at, r.created_at);
        return {
            rank: i + 1,
            user_id: Number(r.user_id),
            pet_name: r.name,
            nickname: r.nickname,
            avatar: Number(r.avatar) || 0,
            avatar_object_key: r.avatar_object_key || null,
            level: level_of(r.exp),
            feed_total: Number(r.feed_total) || 0,
            lit_days: Math.max(1, Number(r.lit_days) || 1),
            dress_id: r.dress_id || null,
            mood,
            fed_never,
            is_me: Number(r.user_id) === Number(userId),
        };
    });
    // 累计投喂榜：只收「喂过至少 1 次」的福宝，避免 0 次也上榜；名次在榜内重新从 1 起算
    const ranking = list
        .filter((x) => x.feed_total > 0)
        .slice(0, 3)
        .map((x, i) => ({ ...x, rank: i + 1 }));
    const my_rank = list.some((x) => x.is_me && x.feed_total > 0)
        ? (ranking.find((x) => x.is_me) || null)
        : null;
    return {
        total: Number(totalRow.c) || 0,
        list,
        ranking,
        my_rank,
    };
}

module.exports = { state, feed, wear_dress, rename, community, level_of };
