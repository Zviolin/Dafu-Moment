/**
 * 打卡服务（2.0 主库口径；15-差距文档 T-01；03 §5.9；AC10/AC11/AC12）
 * 与 checkin.service.js 的分工：checkin.service.js 是数据库 3.0（location/check_in_dish/
 *   check_in_image/footprint 那套表）的实现，供 3.0 入口与 v3 路由使用；本文件是 2.0 主库
 *   （init.sql 的 check_in 表：canteen_id + photos/dish_ids JSON）的实现，供 /api/checkin 使用。
 *   两套表结构不同，故实现分文件存放，互不覆盖。
 * 幂等口径：直接 INSERT 撞 uk_check_in_dup，捕获 ER_DUP_ENTRY 后回查既有记录 id，
 *   再抛 409 + data.checkinId（不先查后插，防并发双写）。
 * 删除为物理删：唯一键按 (user_id, canteen_id, check_in_date) 占位，软删会挡住当天再打卡。
 * 日期口径：check_in_date 由应用层按 +08:00 生成 YYYY-MM-DD 字符串写入，不依赖 MySQL
 *   服务器时区；读出统一 DATE_FORMAT(..., '%Y-%m-%d')——连接池 dateStrings:false 会把
 *   DATE 列转成 JS Date，res.json 序列化后偏一天，必须显式格式化。
 * 响应字段用 camelCase（checkinId/checkinDate/dishIds）：与 15-差距文档验收示例一致，
 *   属 §2.5 响应 snake 规则的登记例外（点赞接口 {liked, likeCount} 同款既有先例）。
 */
const config = require('../config');
const { query, query_one, get_conn } = require('../db/pool');
const { err } = require('../utils/api-error');

/**
 * 今日日期串（+08:00，YYYY-MM-DD）
 * @returns {string}
 */
function today_str() {
    return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

/**
 * 防御解析 JSON 数组列（mysql2 有时返字符串、有时返已解析数组）
 * @param {*} v - JSON 列原值
 * @returns {Array} 非数组一律归一为 []
 */
function parse_arr(v) {
    if (Array.isArray(v)) return v;
    if (typeof v === 'string') {
        try {
            const a = JSON.parse(v);
            return Array.isArray(a) ? a : [];
        } catch {
            return [];
        }
    }
    return [];
}

/**
 * 打卡行转响应对象（camelCase 字段，日期已为 YYYY-MM-DD 字符串）
 * @param {Object} r - 查询行
 * @returns {Object}
 */
function to_resp(r) {
    return {
        id: r.id,
        canteenId: r.canteen_id,
        canteenName: r.canteen_name || undefined,
        checkinDate: r.check_in_date,
        visibility: r.visibility,
        note: r.note,
        photos: parse_arr(r.photos),
        dishIds: parse_arr(r.dish_ids).map(Number),
        createdAt: r.created_at,
    };
}

/**
 * 提交打卡（一人一点位一天一条，唯一键兜底幂等）
 * @param {number} uid - 用户 id
 * @param {Object} input - {canteen_id, visibility, note, photos, dish_ids}
 * @returns {Promise<{checkinId:number, checkinDate:string}>}
 * @throws 404 点位不存在 / 409+data.checkinId 当天已在该点位打卡
 */
async function create_checkin(uid, input) {
    const canteen = await query_one('SELECT id FROM canteen WHERE id = ?', [input.canteen_id]);
    if (!canteen) throw err.not_found('点位不存在');
    const today = today_str();
    try {
        const r = await query(
            'INSERT INTO check_in (user_id, canteen_id, check_in_date, visibility, note, photos, dish_ids) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [uid, input.canteen_id, today, input.visibility, input.note,
             JSON.stringify(input.photos), JSON.stringify(input.dish_ids)]
        );
        return { checkinId: r.insertId, checkinDate: today };
    } catch (e) {
        if (e && e.code === 'ER_DUP_ENTRY') {
            // 撞唯一键：回查既有记录 id 一并返回，前端据此引导「另记一条」
            const existing = await query_one(
                'SELECT id FROM check_in WHERE user_id = ? AND canteen_id = ? AND check_in_date = ?',
                [uid, input.canteen_id, today]
            );
            throw err.conflict('今天已在该点位打过卡，可选择「另记一条」', existing ? { checkinId: existing.id } : undefined);
        }
        throw e;
    }
}

/**
 * 另记一条：往当天既有打卡追加菜品/图片，note 非空则覆盖（不新建记录）
 * 读-改-写走事务 + FOR UPDATE 行锁，防同用户并发追加互相覆盖
 * @param {number} uid - 用户 id
 * @param {Object} input - {canteen_id, dish_ids, photos, note}
 * @returns {Promise<{checkinId:number, dishIds:number[]}>}
 * @throws 404 当天无打卡记录 / 422 合并后图片超上限
 */
async function append_checkin(uid, input) {
    const conn = await get_conn();
    try {
        await conn.beginTransaction();
        const [rows] = await conn.query(
            'SELECT id, dish_ids, photos, note FROM check_in WHERE user_id = ? AND canteen_id = ? AND check_in_date = ? FOR UPDATE',
            [uid, input.canteen_id, today_str()]
        );
        if (!rows.length) throw err.not_found('今天还没有在该点位打卡，请先打卡');
        const row = rows[0];
        const dish_ids = [...new Set([...parse_arr(row.dish_ids).map(Number), ...input.dish_ids])];
        const photos = [...parse_arr(row.photos), ...input.photos];
        if (photos.length > config.numbers.CHECKIN_PHOTOS_MAX) {
            throw err.invalid(`图片最多 ${config.numbers.CHECKIN_PHOTOS_MAX} 张`);
        }
        const note = input.note || row.note;
        await conn.query('UPDATE check_in SET dish_ids = ?, photos = ?, note = ? WHERE id = ?',
            [JSON.stringify(dish_ids), JSON.stringify(photos), note, row.id]);
        await conn.commit();
        return { checkinId: row.id, dishIds: dish_ids };
    } catch (e) {
        await conn.rollback();
        throw e;
    } finally {
        conn.release();
    }
}

/**
 * 我的打卡记录（分页四键，canteen_id 可选筛选，时间倒序）
 * @param {number} uid - 用户 id
 * @param {Object} opt - {canteen_id:number|null, page:number, size:number}
 * @returns {Promise<{list:Array, total:number, page:number, size:number}>}
 */
async function list_checkins(uid, opt) {
    const where = ['ci.user_id = ?'];
    const params = [uid];
    if (opt.canteen_id !== null) {
        where.push('ci.canteen_id = ?');
        params.push(opt.canteen_id);
    }
    const w = where.join(' AND ');
    const total_row = await query_one(`SELECT COUNT(*) AS n FROM check_in ci WHERE ${w}`, params);
    const rows = await query(
        `SELECT ci.id, ci.canteen_id, c.name AS canteen_name,
                DATE_FORMAT(ci.check_in_date, '%Y-%m-%d') AS check_in_date,
                ci.visibility, ci.note, ci.photos, ci.dish_ids, ci.created_at
         FROM check_in ci JOIN canteen c ON c.id = ci.canteen_id
         WHERE ${w}
         ORDER BY ci.check_in_date DESC, ci.id DESC
         LIMIT ? OFFSET ?`,
        [...params, opt.size, (opt.page - 1) * opt.size]
    );
    return { list: rows.map(to_resp), total: total_row ? Number(total_row.n) : 0, page: opt.page, size: opt.size };
}

/**
 * 打卡日历（03 §5.9 日历聚合）：按月分组，一天可有多点位多条
 * @param {number} uid - 用户 id
 * @param {string} month - YYYY-MM
 * @returns {Promise<{days:Array<{checkinDate:string, count:number, visibility:number, dishIds:number[]}>}>} 该月无数据返空数组
 */
async function checkin_calendar(uid, month) {
    const rows = await query(
        `SELECT DATE_FORMAT(check_in_date, '%Y-%m-%d') AS check_in_date, visibility, dish_ids
         FROM check_in
         WHERE user_id = ? AND DATE_FORMAT(check_in_date, '%Y-%m') = ?
         ORDER BY check_in_date, id`,
        [uid, month]
    );
    const by_day = new Map();
    for (const r of rows) {
        const day = by_day.get(r.check_in_date) || { checkinDate: r.check_in_date, count: 0, visibility: r.visibility, dishIds: [] };
        day.count += 1;
        day.visibility = Math.min(day.visibility, r.visibility); // 当日多条取最公开的一档
        day.dishIds = [...new Set([...day.dishIds, ...parse_arr(r.dish_ids).map(Number)])];
        by_day.set(r.check_in_date, day);
    }
    return { days: [...by_day.values()] };
}

/**
 * 打卡统计（AC12）：四项均为数字，无记录返回全 0
 * @param {number} uid - 用户 id
 * @returns {Promise<{totalDays:number, monthDays:number, continuousDays:number, monthCanteens:number}>}
 */
async function checkin_stats(uid) {
    const today = today_str();
    const month = today.slice(0, 7);
    const rows = await query(
        `SELECT DISTINCT DATE_FORMAT(check_in_date, '%Y-%m-%d') AS d
         FROM check_in WHERE user_id = ? ORDER BY d DESC`,
        [uid]
    );
    const days = rows.map((r) => r.d);
    // 连续天数：从今天起逐日回推；今天没打则从昨天起算（昨天的连续不白丢）
    let continuous = 0;
    let expect = today;
    if (days.length && days[0] !== today) {
        const yesterday = new Date(Date.now() + 8 * 3600 * 1000 - 24 * 3600 * 1000).toISOString().slice(0, 10);
        expect = days[0] === yesterday ? yesterday : '';
    }
    for (const d of days) {
        if (d !== expect) break;
        continuous += 1;
        expect = new Date(`${expect}T00:00:00+08:00`);
        expect = new Date(expect.getTime() - 24 * 3600 * 1000).toISOString().slice(0, 10);
    }
    const canteen_row = await query_one(
        `SELECT COUNT(DISTINCT canteen_id) AS n FROM check_in
         WHERE user_id = ? AND DATE_FORMAT(check_in_date, '%Y-%m') = ?`,
        [uid, month]
    );
    return {
        totalDays: days.length,
        monthDays: days.filter((d) => d.startsWith(month)).length,
        continuousDays: continuous,
        monthCanteens: canteen_row ? Number(canteen_row.n) : 0,
    };
}

/**
 * 删除打卡（物理删：唯一键按日占位，软删会挡住当天再打卡）
 * @param {number} uid - 当前用户 id
 * @param {number} id - 打卡记录 id
 * @returns {Promise<{deleted:boolean, checkinId:number}>}
 * @throws 404 记录不存在 / 403 非本人记录
 */
async function delete_checkin(uid, id) {
    const row = await query_one('SELECT id, user_id FROM check_in WHERE id = ?', [id]);
    if (!row) throw err.not_found('打卡记录不存在');
    if (row.user_id !== uid) throw err.forbidden('不能删除他人的打卡记录');
    await query('DELETE FROM check_in WHERE id = ?', [id]);
    return { deleted: true, checkinId: id };
}

module.exports = { create_checkin, append_checkin, list_checkins, checkin_calendar, checkin_stats, delete_checkin };
