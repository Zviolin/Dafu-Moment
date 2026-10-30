/**
 * 用户数据服务：收藏（T-09 三分组：想吃/常吃/自定义分组）、收藏分组 CRUD、举报、我的上报记录、点位提交
 */
const { pool, query, query_one } = require('../db/pool');
const config = require('../config');
const { err } = require('../utils/api-error');
const { assert } = require('../utils/validate');

/**
 * 设置/取消收藏（15-差距文档 T-09：listType 0 想吃 / 1 常吃 / 2 自定义分组 / null 取消）
 * @param {number} userId
 * @param {Object} input - {subjectType, subjectId, listType, groupId}
 */
async function set_favorite(userId, input) {
    const { subjectType, subjectId, listType } = input;
    assert([0, 1, 2].includes(subjectType), 'subjectType 不合法');
    if (listType === null || listType === undefined) {
        await query(
            'DELETE FROM favorite WHERE user_id = ? AND subject_type = ? AND subject_id = ?',
            [userId, subjectType, subjectId]
        );
        return { listType: null };
    }
    const lt = Number(listType);
    assert([0, 1, 2].includes(lt), 'listType 仅支持 0（想吃）/ 1（常吃）/ 2（自定义分组）');
    let groupId = null;
    if (lt === 2) {
        // 自定义分组：必须带本人名下分组
        groupId = Number(input.groupId);
        assert(Number.isInteger(groupId) && groupId > 0, '自定义分组收藏必须指定分组');
        const g = await query_one('SELECT id, user_id FROM favorite_group WHERE id = ?', [groupId]);
        if (!g) throw err.not_found('收藏分组不存在');
        if (Number(g.user_id) !== Number(userId)) throw err.forbidden('收藏分组不属于当前用户');
    } else {
        // 内置分组（想吃/常吃）不落 favorite_group，groupId 必须为空
        assert(input.groupId === null || input.groupId === undefined, '仅自定义分组收藏可指定分组');
    }
    // 一对象一条（PRIMARY KEY 约束）：撞键改组，不新增行
    await query(
        `INSERT INTO favorite (user_id, subject_type, subject_id, list_type, group_id) VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE list_type = VALUES(list_type), group_id = VALUES(group_id)`,
        [userId, subjectType, subjectId, lt, groupId]
    );
    return { listType: lt, groupId };
}

/**
 * 我的收藏列表（带对象名、均分与分组名；T-09 支持 listType/groupId 过滤）
 * @param {number} userId
 * @param {Object} [filter] - {listType, groupId}，均空则全量
 */
async function my_favorites(userId, filter = {}) {
    const cond = ['f.user_id = ?'];
    const params = [userId];
    if (filter.listType !== undefined && filter.listType !== null && filter.listType !== '') {
        const lt = Number(filter.listType);
        assert([0, 1, 2].includes(lt), 'listType 不合法');
        cond.push('f.list_type = ?');
        params.push(lt);
    }
    if (filter.groupId !== undefined && filter.groupId !== null && filter.groupId !== '') {
        const gid = Number(filter.groupId);
        assert(Number.isInteger(gid) && gid > 0, 'groupId 不合法');
        cond.push('f.group_id = ?');
        params.push(gid);
    }
    const rows = await query(
        `SELECT f.*, g.group_name,
            CASE f.subject_type WHEN 0 THEN (SELECT name FROM dish WHERE id = f.subject_id)
                                WHEN 1 THEN (SELECT name FROM station WHERE id = f.subject_id)
                                ELSE (SELECT name FROM canteen WHERE id = f.subject_id) END AS subject_name,
            sm.rating_avg, sm.review_count
         FROM favorite f
         LEFT JOIN favorite_group g ON g.id = f.group_id
         LEFT JOIN review_summary sm ON sm.subject_type = f.subject_type AND sm.subject_id = f.subject_id
         WHERE ${cond.join(' AND ')} ORDER BY f.created_at DESC`,
        params
    );
    return rows;
}

/* ---------------- 收藏分组（15-差距文档 T-09；AC06） ---------------- */

/** 内置分组名保留字（「想吃」「常吃」为 list_type 0/1 内置语义，不落表，自定义组禁占用） */
const RESERVED_GROUP_NAMES = ['想吃', '常吃'];

/** 分组名校验：trim 后 1-32 字，且不得占用内置名；返回清洗后的名字 */
function assert_group_name(name) {
    const n = String(name || '').trim();
    assert(n.length >= 1 && n.length <= config.numbers.FAVORITE_GROUP_NAME_MAX, `分组名需 1-${config.numbers.FAVORITE_GROUP_NAME_MAX} 字`);
    assert(!RESERVED_GROUP_NAMES.includes(n), '「想吃」「常吃」为内置分组，请换个名字');
    return n;
}

/**
 * 我的分组列表（带每组收藏数 fav_count）
 * @param {number} userId
 */
async function list_favorite_groups(userId) {
    return query(
        `SELECT g.id, g.group_name, g.created_at,
                (SELECT COUNT(*) FROM favorite f WHERE f.group_id = g.id) AS fav_count
         FROM favorite_group g WHERE g.user_id = ? ORDER BY g.id ASC`,
        [userId]
    );
}

/**
 * 新建分组：每人上限 FAVORITE_GROUP_MAX；同名靠 uk_favorite_group 硬约束兜底（ER_DUP_ENTRY→409）
 * @param {number} userId
 * @param {string} name
 */
async function create_favorite_group(userId, name) {
    const n = assert_group_name(name);
    const cnt = await query_one('SELECT COUNT(*) AS n FROM favorite_group WHERE user_id = ?', [userId]);
    assert(cnt && Number(cnt.n) < config.numbers.FAVORITE_GROUP_MAX, `分组最多 ${config.numbers.FAVORITE_GROUP_MAX} 个`);
    try {
        const r = await query('INSERT INTO favorite_group (user_id, group_name) VALUES (?, ?)', [userId, n]);
        return { id: r.insertId, groupName: n };
    } catch (e) {
        if (e && e.code === 'ER_DUP_ENTRY') throw err.conflict('分组名已存在');
        throw e;
    }
}

/**
 * 改名分组：仅本人（越权按 404 处理，不暴露存在性）；同名校验同创建
 * @param {number} userId
 * @param {number} groupId
 * @param {string} name
 */
async function rename_favorite_group(userId, groupId, name) {
    const g = await query_one('SELECT id, user_id FROM favorite_group WHERE id = ?', [groupId]);
    if (!g || Number(g.user_id) !== Number(userId)) throw err.not_found('分组不存在');
    const n = assert_group_name(name);
    try {
        await query('UPDATE favorite_group SET group_name = ? WHERE id = ?', [n, groupId]);
    } catch (e) {
        if (e && e.code === 'ER_DUP_ENTRY') throw err.conflict('分组名已存在');
        throw e;
    }
    return { id: Number(groupId), groupName: n };
}

/**
 * 删除分组（物理删）：事务内先把组内收藏回落「想吃」（list_type=0, group_id=NULL），再删组
 * @param {number} userId
 * @param {number} groupId
 */
async function delete_favorite_group(userId, groupId) {
    const g = await query_one('SELECT id, user_id FROM favorite_group WHERE id = ?', [groupId]);
    if (!g || Number(g.user_id) !== Number(userId)) throw err.not_found('分组不存在');
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        await conn.query('UPDATE favorite SET list_type = 0, group_id = NULL WHERE group_id = ? AND user_id = ?', [groupId, userId]);
        await conn.query('DELETE FROM favorite_group WHERE id = ?', [groupId]);
        await conn.commit();
    } catch (e) {
        await conn.rollback();
        throw e;
    } finally {
        conn.release();
    }
    return { deleted: true };
}

/**
 * 校验收藏目标存在且未下架（与评价对象口径一致：0 菜品 / 1 档口 / 2 点位）
 * @param {number} subjectType
 * @param {number} subjectId
 * @returns {Promise<void>} 不存在抛 404
 */
async function assert_favorite_target(subjectType, subjectId) {
    let row = null;
    if (subjectType === 0) {
        row = await query_one('SELECT id FROM dish WHERE id = ? AND status = 0', [subjectId]);
        if (!row) throw err.not_found('菜品不存在或已下架');
    } else if (subjectType === 1) {
        row = await query_one('SELECT id FROM station WHERE id = ? AND status < 2', [subjectId]);
        if (!row) throw err.not_found('档口不存在或已下架');
    } else {
        row = await query_one('SELECT id FROM canteen WHERE id = ? AND enabled = 1', [subjectId]);
        if (!row) throw err.not_found('点位不存在或已下架');
    }
}

/**
 * 查询是否已收藏（03 §5.5）：GET /favorites/status
 * @param {number} userId
 * @param {Object} input - {subjectType, subjectId}
 * @returns {Promise<{favored: boolean}>}
 */
async function favorite_status(userId, input) {
    const subjectType = Number(input.subjectType);
    const subjectId = Number(input.subjectId);
    assert([0, 1, 2].includes(subjectType), 'targetType 不合法');
    assert(Number.isInteger(subjectId) && subjectId > 0, 'targetId 不合法');
    const row = await query_one(
        'SELECT 1 AS favored FROM favorite WHERE user_id = ? AND subject_type = ? AND subject_id = ?',
        [userId, subjectType, subjectId]
    );
    return { favored: !!row };
}

/**
 * 显式取消收藏（03 §5.5）：DELETE /favorites/:targetType/:targetId
 * 目标不存在或未收藏均 404
 * @param {number} userId
 * @param {number} subjectType - 路径参数 targetType（0/1/2，与 set_favorite 值域一致）
 * @param {number} subjectId - 路径参数 targetId
 * @returns {Promise<{favored: boolean}>}
 */
async function unset_favorite(userId, subjectType, subjectId) {
    subjectType = Number(subjectType);
    subjectId = Number(subjectId);
    assert([0, 1, 2].includes(subjectType), 'targetType 不合法');
    assert(Number.isInteger(subjectId) && subjectId > 0, 'targetId 不合法');
    await assert_favorite_target(subjectType, subjectId);
    const r = await query(
        'DELETE FROM favorite WHERE user_id = ? AND subject_type = ? AND subject_id = ?',
        [userId, subjectType, subjectId]
    );
    if (!r.affectedRows) throw err.not_found('未收藏该对象');
    return { favored: false };
}

/**
 * 点位提交（用户报新点位/档口/菜品/入驻申请，payload JSON 留痕，进后台审核）
 * @param {number} userId
 * @param {Object} input - {submitType: 0点位/1档口/2菜品/3档口入驻, targetId, payload}
 * @returns {Promise<{id: number}>}
 */
async function create_point_submit(userId, input) {
    const submitType = Number(input.submitType);
    assert([0, 1, 2, 3].includes(submitType), 'submitType 不合法');
    const raw = input.payload && typeof input.payload === 'object' ? input.payload : {};
    const targetId = input.targetId === undefined || input.targetId === null || input.targetId === ''
        ? null : Number(input.targetId);
    let payload;
    if (submitType === 0) {
        // 新点位：名称必填，类型/位置/人均可选
        const name = String(raw.name || '').trim();
        assert(name.length >= 1 && name.length <= 64, '点位名称需 1-64 字');
        const type = raw.type === undefined || raw.type === null || raw.type === '' ? 0 : Number(raw.type);
        assert([0, 1, 2, 3, 4].includes(type), '点位类型不合法');
        const location = raw.location === undefined || raw.location === null ? '' : String(raw.location);
        assert(location.length <= 128, '位置描述不能超过 128 字');
        let avgPrice = null;
        if (raw.avgPrice !== undefined && raw.avgPrice !== null && raw.avgPrice !== '') {
            avgPrice = Number(raw.avgPrice);
            assert(Number.isFinite(avgPrice) && avgPrice >= 0 && avgPrice <= 999, '人均消费需为 0-999 的数字');
        }
        payload = { name, type, location: location.slice(0, 128), avgPrice };
    } else if (submitType === 1) {
        // 新档口：必须挂靠在架点位；名称必填，品类可选
        assert(Number.isInteger(targetId) && targetId > 0, '缺少挂靠点位');
        const canteen = await query_one('SELECT id FROM canteen WHERE id = ? AND enabled = 1', [targetId]);
        if (!canteen) throw err.not_found('挂靠点位不存在或已下架');
        const name = String(raw.name || '').trim();
        assert(name.length >= 1 && name.length <= 64, '档口名称需 1-64 字');
        const category = String(raw.category || '').trim().slice(0, 32);
        payload = { name, category };
    } else if (submitType === 2) {
        // 新菜品：必须挂靠未下架档口；名称必填，价格/口味/忌口可选
        assert(Number.isInteger(targetId) && targetId > 0, '缺少挂靠档口');
        const station = await query_one('SELECT id FROM station WHERE id = ? AND status < 2', [targetId]);
        if (!station) throw err.not_found('挂靠档口不存在或已下架');
        const name = String(raw.name || '').trim();
        assert(name.length >= 1 && name.length <= 64, '菜品名称需 1-64 字');
        let price = null;
        if (raw.price !== undefined && raw.price !== null && raw.price !== '') {
            price = Number(raw.price);
            assert(Number.isFinite(price) && price >= 0, '价格需为不小于 0 的数字');
        }
        const tasteTags = String(raw.tasteTags || '').slice(0, 128);
        const tabooTags = String(raw.tabooTags || '').slice(0, 128);
        payload = { name, price, tasteTags, tabooTags };
    } else {
        // 档口入驻申请：店名/联系人/手机号必填，位置与简介选填，进后台人工审核
        const name = String(raw.name || '').trim();
        assert(name.length >= 1 && name.length <= 64, '档口名称需 1-64 字');
        const contact = String(raw.contact || '').trim();
        assert(contact.length >= 1 && contact.length <= 32, '联系人需 1-32 字');
        const phone = String(raw.phone || '').trim();
        assert(/^1\d{10}$/.test(phone), '请输入 11 位手机号');
        const position = String(raw.position || '').trim().slice(0, 128);
        const intro = String(raw.intro || '').trim().slice(0, 300);
        payload = { name, contact, phone, position, intro };
    }
    // payload 列为 JSON 类型，必须 stringify 后传参
    const r = await query(
        'INSERT INTO point_submit (submitter_id, submit_type, target_id, payload) VALUES (?, ?, ?, ?)',
        [userId, submitType, targetId, JSON.stringify(payload)]
    );
    return { id: r.insertId };
}

/**
 * 提交举报（同对象同人去重）
 * @param {number} userId
 * @param {Object} input - {subjectType, subjectId, reason, detail}
 */
async function create_report(userId, input) {
    const { subjectType, subjectId, reason, detail = '' } = input;
    assert([0, 1, 2].includes(subjectType), 'subjectType 不合法');
    assert(Number.isInteger(reason) && reason >= 1 && reason <= 5, '请选择举报理由');
    const dup = await query_one(
        `SELECT id FROM report WHERE reporter_id = ? AND subject_type = ? AND subject_id = ? AND status = 'open'`,
        [userId, subjectType, subjectId]
    );
    if (dup) throw err.conflict('该内容已在处理中，请勿重复举报');
    await query(
        'INSERT INTO report (reporter_id, subject_type, subject_id, reason, detail) VALUES (?, ?, ?, ?, ?)',
        [userId, subjectType, subjectId, reason, String(detail).slice(0, 300)]
    );
}

/**
 * 申诉：已下架（2）评价重新进入人工复审队列（状态机 已下架→待人工→申诉成立→已发布）
 * @param {number} userId
 * @param {number} reviewId
 */
async function appeal_review(userId, reviewId) {
    const review = await query_one(
        'SELECT id, status, status_reason FROM review WHERE id = ? AND user_id = ?',
        [reviewId, userId]
    );
    if (!review) throw err.not_found('评价不存在');
    if (review.status !== 2) throw err.invalid('仅被下架的评价可申诉');
    await query(
        "UPDATE review SET status = 1, status_reason = '申诉复审中', updated_at = NOW() WHERE id = ?",
        [reviewId]
    );
    return { status: 1, reason: '申诉复审中' };
}

/**
 * 我的点位提交记录（15-差距文档 T-30；AC09 状态回写）
 * 直接读 point_submit 主表：audit_status 0 待审 / 1 通过 / 2 驳回 + audit_comment，
 * 审核结论本就落在主表，无需另建 audit_record 表。
 * @param {number} userId
 * @param {Object} opt - {page, size}
 * @returns {Promise<{list:Array, total:number, page:number, size:number}>}
 */
async function my_point_submits(userId, opt) {
    const total_row = await query_one('SELECT COUNT(*) AS n FROM point_submit WHERE submitter_id = ?', [userId]);
    const rows = await query(
        `SELECT id, submit_type, target_id, payload, audit_status, audit_comment, created_at
         FROM point_submit WHERE submitter_id = ?
         ORDER BY id DESC LIMIT ? OFFSET ?`,
        [userId, opt.size, (opt.page - 1) * opt.size]
    );
    // payload 为 JSON 列，mysql2 有时返字符串，统一解析成对象
    const list = rows.map((r) => ({
        ...r,
        payload: typeof r.payload === 'string' ? JSON.parse(r.payload) : (r.payload || {}),
    }));
    return { list, total: total_row ? Number(total_row.n) : 0, page: opt.page, size: opt.size };
}

/**
 * 我的举报记录（15-差距文档 T-30）：status open/resolved/rejected + handled_at
 * @param {number} userId
 * @param {Object} opt - {page, size}
 * @returns {Promise<{list:Array, total:number, page:number, size:number}>}
 */
async function my_reports(userId, opt) {
    const total_row = await query_one('SELECT COUNT(*) AS n FROM report WHERE reporter_id = ?', [userId]);
    const rows = await query(
        `SELECT id, subject_type, subject_id, reason, detail, status, handled_at, created_at
         FROM report WHERE reporter_id = ?
         ORDER BY id DESC LIMIT ? OFFSET ?`,
        [userId, opt.size, (opt.page - 1) * opt.size]
    );
    return { list: rows, total: total_row ? Number(total_row.n) : 0, page: opt.page, size: opt.size };
}

module.exports = {
    set_favorite, my_favorites, favorite_status, unset_favorite,
    list_favorite_groups, create_favorite_group, rename_favorite_group, delete_favorite_group,
    create_point_submit, create_report, appeal_review,
    my_point_submits, my_reports,
};
