/**
 * 管理后台服务：审核队列 / 内容维护 / 举报处理 / 用户治理 / 敏感词 / 点位提交审核 / 看板
 */
const { query, query_one } = require('../db/pool');
const aggregation = require('./aggregation.service');
const notification = require('./notification.service');
const { load_dfa_from_db } = require('../utils/dfa');
const { err } = require('../utils/api-error');
const { assert } = require('../utils/validate');

/**
 * 待审队列（status=1 待人工，含分项得分 JSON 与作者）
 * @param {number} page
 */
async function audit_list(page = 1) {
    const pageSize = 20;
    const total = await query_one("SELECT COUNT(*) c FROM review WHERE status = 1");
    const list = await query(
        `SELECT r.id, r.user_id, r.subject_type, r.subject_id, r.overall_score, r.dimension_scores,
                r.content, r.tags, r.status_reason, r.created_at, u.nickname,
                CASE r.subject_type WHEN 0 THEN (SELECT name FROM dish WHERE id = r.subject_id)
                                    WHEN 1 THEN (SELECT name FROM station WHERE id = r.subject_id)
                                    ELSE (SELECT name FROM canteen WHERE id = r.subject_id) END AS subject_name,
                (SELECT GROUP_CONCAT(object_key) FROM review_image WHERE review_id = r.id) AS images
         FROM review r JOIN user u ON u.id = r.user_id
         WHERE r.status = 1 ORDER BY r.created_at ASC LIMIT ? OFFSET ?`,
        [pageSize, (page - 1) * pageSize]
    );
    return { list, total: Number(total.c), page, pageSize };
}

/**
 * 审核处置（pass/fold/ban → 重算 + 通知）
 * @param {number} adminId
 * @param {number} reviewId
 * @param {Object} input - {action, reason}
 */
async function audit_handle(adminId, reviewId, input) {
    const { action, reason } = input;
    assert(['pass', 'fold', 'ban'].includes(action), 'action 不合法');
    assert(typeof reason === 'string' && reason.trim().length > 0, '处置理由必填');
    const review = await query_one('SELECT * FROM review WHERE id = ?', [reviewId]);
    if (!review) throw err.not_found('评价不存在');
    if (review.status !== 1 && review.status !== 2) throw err.conflict('该评价不在待审状态');

    const statusMap = { pass: 0, fold: 2, ban: 3 };
    const wasVisible = review.status === 0;
    const newStatus = statusMap[action];
    await query(
        'UPDATE review SET status = ?, status_reason = ?, updated_at = NOW() WHERE id = ?',
        [newStatus, reason.trim(), reviewId]
    );
    // 处置生效 → 重算（原可见则先减，目标可见直接全量重算最稳）
    if (wasVisible || newStatus === 0) {
        await aggregation.recalc(review.subject_type, review.subject_id);
    }
    const actionText = { pass: '已通过审核并展示', fold: '已被下架（不计入评分）', ban: '已被屏蔽' }[action];
    await notification.create(review.user_id, 'audit', '你的点评收到处置通知',
        `你的点评「${String(review.content).slice(0, 30)}…」${actionText}。理由：${reason.trim()}`, 'review', reviewId);
    return { status: newStatus };
}

/* ---------------- 内容维护 ---------------- */

/** 可空数值化（null/undefined/空串/非有限数 → null；供坐标 COALESCE 更新） */
function num_or_null(v) {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
}

/**
 * 标签数组规范化（canteen.tags JSON 列）：字符串数组、去空白、最多 8 个每个 ≤16 字
 * @param {*} v - 入参 tags（期望 string[]）
 * @returns {string[]|null} 非法/为空返回 null（COALESCE 语义：不更新）
 */
function normalize_tags(v) {
    if (!Array.isArray(v)) return null;
    const tags = v.map((x) => String(x).trim()).filter((x) => x.length > 0 && x.length <= 16).slice(0, 8);
    return tags.length > 0 ? tags : null;
}

/** 新增食堂默认落点：旗山校区图书馆主馆（官方 POI 26.056812,119.198453，楼栋级） */
const CANTEEN_DEFAULT_POS = [26.0568, 119.1985];

/**
 * 新增食堂（未传坐标时落图书馆中心，保证新增即出现在校位地图上；type/avg_price 为 v2.0 点位字段）
 * v2.1：created_by 记录入人（路由传 req.user.id），tags 支持字符串数组
 * @param {number} actorId - 操作管理员 ID（写入 created_by）
 * @param {Object} input - {name, campus, location, type, avgPrice, lat, lng, coverObjectKey, tags[]}
 * @returns {Promise<{id: number}>}
 */
async function create_canteen(actorId, input) {
    const lat = num_or_null(input.lat) ?? CANTEEN_DEFAULT_POS[0];
    const lng = num_or_null(input.lng) ?? CANTEEN_DEFAULT_POS[1];
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) throw err.invalid('坐标不合法');
    const type = Number(input.type === undefined || input.type === null || input.type === '' ? 0 : input.type);
    assert([0, 1, 2, 3, 4].includes(type), '点位类型不合法');
    const tags = normalize_tags(input.tags);
    const r = await query(
        'INSERT INTO canteen (name, campus, location, type, avg_price, lat, lng, cover_object_key, tags, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [input.name, input.campus || '旗山校区', input.location || '', type, num_or_null(input.avgPrice), lat, lng,
            input.coverObjectKey || null, tags ? JSON.stringify(tags) : null, actorId]
    );
    return { id: r.insertId };
}

/** 编辑食堂（enabled 不动；lat/lng/cover/type/avg_price 传了才更新——COALESCE 保持原值，避免编辑静默改点位/类型；tags 同口径） */
async function update_canteen(id, input) {
    const lat = num_or_null(input.lat);
    const lng = num_or_null(input.lng);
    if ((lat !== null && Math.abs(lat) > 90) || (lng !== null && Math.abs(lng) > 180)) {
        throw err.invalid('坐标不合法');
    }
    // type 传了才更新：显式校验合法值，防止静默改型 / 写入越界值
    let type = null;
    if (input.type !== undefined && input.type !== null && input.type !== '') {
        type = Number(input.type);
        assert([0, 1, 2, 3, 4].includes(type), '点位类型不合法');
    }
    const tags = normalize_tags(input.tags);
    await query(
        `UPDATE canteen SET name = ?, campus = ?, location = ?, type = COALESCE(?, type),
            avg_price = COALESCE(?, avg_price), tags = COALESCE(?, tags),
            lat = COALESCE(?, lat), lng = COALESCE(?, lng), cover_object_key = COALESCE(?, cover_object_key) WHERE id = ?`,
        [input.name, input.campus || '旗山校区', input.location || '', type, num_or_null(input.avgPrice),
            tags ? JSON.stringify(tags) : null, lat, lng, input.coverObjectKey || null, id]
    );
}

async function delete_canteen(id) {
    await query('UPDATE canteen SET enabled = 0 WHERE id = ?', [id]);
}

/**
 * 食堂上架 / 下架（enabled: 1 上架 / 0 下架）
 */
async function set_canteen_status(id, enabled) {
    assert([0, 1].includes(Number(enabled)), '状态不合法');
    await query('UPDATE canteen SET enabled = ? WHERE id = ?', [Number(enabled), id]);
}

async function create_station(input) {
    const r = await query(
        'INSERT INTO station (canteen_id, name, category, cover_object_key) VALUES (?, ?, ?, ?)',
        [input.canteenId, input.name, input.category || '', input.coverObjectKey || null]
    );
    return { id: r.insertId };
}

async function update_station(id, input) {
    await query(
        'UPDATE station SET name = ?, category = ?, cover_object_key = COALESCE(?, cover_object_key) WHERE id = ?',
        [input.name, input.category || '', input.coverObjectKey || null, id]
    );
}

/**
 * 下架窗口（status=2，历史评价保留）
 */
async function delete_station(id) {
    await query('UPDATE station SET status = 2 WHERE id = ?', [id]);
}

/**
 * 窗口状态切换（0 营业 / 1 休摊 / 2 下架——上架即置回 0）
 */
async function set_station_status(id, status) {
    assert([0, 1, 2].includes(Number(status)), '状态不合法');
    await query('UPDATE station SET status = ? WHERE id = ?', [Number(status), id]);
}

/**
 * 指定窗口负责人
 */
async function set_station_manager(id, userId) {
    const u = await query_one('SELECT id FROM `user` WHERE id = ?', [userId]);
    if (!u) throw err.not_found('用户不存在');
    await query('UPDATE station SET manager_user_id = ? WHERE id = ?', [userId, id]);
}

/** 推荐菜布尔 → tinyint（undefined/空 → 0；仅 create 用） */
function recommended_bit(v) {
    return v === undefined || v === null || v === '' ? 0 : (v ? 1 : 0);
}

async function create_dish(input) {
    const r = await query(
        `INSERT INTO dish (station_id, name, price, taste_tags, taboo_tags, cover_object_key, is_recommended, first_seen_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
        [input.stationId, input.name, input.price || 0, (input.tasteTags || []).join(','),
            (input.tabooTags || []).join(','), input.coverObjectKey || null, recommended_bit(input.recommended)]
    );
    return { id: r.insertId };
}

/** 编辑菜品（不动 status——在售状态由专用 status 接口管理，避免编辑静默下架；recommended 传了才更新） */
async function update_dish(id, input) {
    const recommended = input.recommended === undefined || input.recommended === null || input.recommended === ''
        ? null : (input.recommended ? 1 : 0);
    await query(
        `UPDATE dish SET name = ?, price = ?, taste_tags = ?, taboo_tags = ?, is_recommended = COALESCE(?, is_recommended),
            cover_object_key = COALESCE(?, cover_object_key) WHERE id = ?`,
        [input.name, input.price || 0, (input.tasteTags || []).join(','), (input.tabooTags || []).join(','),
            recommended, input.coverObjectKey || null, id]
    );
}

async function delete_dish(id) {
    await query('UPDATE dish SET status = 1 WHERE id = ?', [id]);
}

/**
 * 菜品上架 / 下架（status: 0 在售 / 1 下架）
 */
async function set_dish_status(id, status) {
    assert([0, 1].includes(Number(status)), '状态不合法');
    await query('UPDATE dish SET status = ? WHERE id = ?', [Number(status), id]);
}

/* ---------------- 举报处理 ---------------- */

/**
 * 举报列表
 */
async function report_list(status = 'open') {
    return query(
        `SELECT rp.*, u.nickname AS reporter_name,
                r.content AS review_content, r.status AS review_status
         FROM report rp
         JOIN user u ON u.id = rp.reporter_id
         LEFT JOIN review r ON r.subject_type = 0 AND rp.subject_type = 0 AND r.id = rp.subject_id
         WHERE rp.status = ? ORDER BY rp.created_at DESC LIMIT 100`,
        [status]
    );
}

/**
 * 处理举报：resolved（可连带折叠评价）/ rejected
 */
async function handle_report(adminId, reportId, input) {
    const { action, reason = '', foldReview = false } = input;
    assert(['resolved', 'rejected'].includes(action), 'action 不合法');
    const rp = await query_one('SELECT * FROM report WHERE id = ?', [reportId]);
    if (!rp) throw err.not_found('举报不存在');
    if (rp.status !== 'open') throw err.conflict('该举报已处理');
    await query(
        "UPDATE report SET status = ?, handled_by = ?, handled_at = NOW() WHERE id = ?",
        [action, adminId, reportId]
    );
    // 举报成立且被举报对象是评价 → 连带折叠 + 重算 + 通知
    if (action === 'resolved' && rp.subject_type === 0 && foldReview) {
        const review = await query_one('SELECT * FROM review WHERE id = ?', [rp.subject_id]);
        if (review && review.status === 0) {
            await query(
                'UPDATE review SET status = 2, status_reason = ? WHERE id = ?',
                [`举报成立：${reason}`, rp.subject_id]
            );
            await aggregation.recalc(review.subject_type, review.subject_id);
            await notification.create(review.user_id, 'report', '你的点评被举报成立',
                `你的点评已被下架。理由：${reason}`, 'review', review.id);
        }
    }
    // 通知举报人
    await notification.create(rp.reporter_id, 'report', '举报处理结果',
        `你提交的举报已${action === 'resolved' ? '处理完成' : '被驳回'}。${reason}`, 'report', rp.id);
}

/* ---------------- 点位提交审核（v2.0：用户报点位/档口/菜品 → 人工审核上架） ---------------- */

/**
 * 点位提交列表（按审核状态筛选，含提交人与挂靠对象名）
 * @param {number} status - audit_status：0 待审 / 1 通过 / 2 驳回
 * @returns {Promise<{list: Array, total: number}>}
 */
async function point_submit_list(status = 0) {
    const total = await query_one('SELECT COUNT(*) c FROM point_submit WHERE audit_status = ?', [Number(status)]);
    const list = await query(
        `SELECT ps.*, u.nickname AS submitter_name,
                CASE ps.submit_type WHEN 1 THEN (SELECT name FROM canteen WHERE id = ps.target_id)
                                    WHEN 2 THEN (SELECT name FROM station WHERE id = ps.target_id)
                                    ELSE NULL END AS target_name
         FROM point_submit ps JOIN user u ON u.id = ps.submitter_id
         WHERE ps.audit_status = ? ORDER BY ps.created_at ASC LIMIT 100`,
        [Number(status)]
    );
    return { list, total: Number(total.c) };
}

/**
 * 通过点位提交：按 submit_type 写入主表（canteen/station/dish），置通过状态并通知提交人
 * @param {number} adminId
 * @param {number} id - point_submit.id
 * @param {Object} input - {comment}
 * @returns {Promise<{id: number, createdId: number}>}
 */
async function point_submit_approve(adminId, id, input = {}) {
    const row = await query_one('SELECT * FROM point_submit WHERE id = ?', [id]);
    if (!row) throw err.not_found('提交不存在');
    if (Number(row.audit_status) !== 0) throw err.conflict('该提交已处理');
    // payload 为 JSON 列，mysql2 返回字符串，先解析
    let payload = row.payload;
    if (typeof payload === 'string') {
        try { payload = JSON.parse(payload); } catch { payload = {}; }
    }
    payload = payload || {};
    const name = String(payload.name || '').trim();
    let createdId = null;
    if (Number(row.submit_type) === 0) {
        // 新点位：type 取 payload.type（默认 0 校内食堂），人均可空；created_by 记提交人（03 §2 录入留痕）
        const r = await query(
            'INSERT INTO canteen (name, type, campus, location, avg_price, created_by) VALUES (?, ?, ?, ?, ?, ?)',
            [name, Number(payload.type) || 0, '旗山校区', payload.location || '', payload.avgPrice ?? null, row.submitter_id]
        );
        createdId = r.insertId;
    } else if (Number(row.submit_type) === 1) {
        // 新档口：挂靠提交时校验过的点位
        const r = await query(
            'INSERT INTO station (canteen_id, name, category) VALUES (?, ?, ?)',
            [row.target_id, name, payload.category || '']
        );
        createdId = r.insertId;
    } else if (Number(row.submit_type) === 2) {
        // 新菜品：挂靠提交时校验过的档口
        const r = await query(
            'INSERT INTO dish (station_id, name, price, taste_tags, taboo_tags, first_seen_at) VALUES (?, ?, ?, ?, ?, NOW())',
            [row.target_id, name, payload.price || 0, payload.tasteTags || '', payload.tabooTags || '']
        );
        createdId = r.insertId;
    } else {
        // 档口入驻申请：仅回写审核结论，由运营线下开通档口后台账号
        createdId = null;
    }
    await query(
        'UPDATE point_submit SET audit_status = 1, auditor_id = ?, audit_comment = ? WHERE id = ?',
        [adminId, String(input.comment || '').slice(0, 255), id]
    );
    const pass_text = Number(row.submit_type) === 3
        ? `你提交的「${name}」入驻申请已通过，运营会尽快联系你开通档口后台`
        : `你提交的「${name}」已审核通过并上架`;
    await notification.create(row.submitter_id, 'audit', '点位提交已通过', pass_text, 'point_submit', id);
    return { id, createdId };
}

/**
 * 驳回点位提交：必须给出审核意见，通知提交人
 * @param {number} adminId
 * @param {number} id - point_submit.id
 * @param {Object} input - {comment}
 */
async function point_submit_reject(adminId, id, input = {}) {
    const comment = String(input.comment || '').trim();
    assert(comment.length >= 1 && comment.length <= 255, '请填写驳回意见（1-255 字）');
    const row = await query_one('SELECT * FROM point_submit WHERE id = ?', [id]);
    if (!row) throw err.not_found('提交不存在');
    if (Number(row.audit_status) !== 0) throw err.conflict('该提交已处理');
    await query(
        'UPDATE point_submit SET audit_status = 2, auditor_id = ?, audit_comment = ? WHERE id = ?',
        [adminId, comment, id]
    );
    // payload 仅用于取名称做通知文案，解析失败不影响驳回
    let payload = row.payload;
    if (typeof payload === 'string') {
        try { payload = JSON.parse(payload); } catch { payload = {}; }
    }
    const name = String((payload || {}).name || '内容').slice(0, 32);
    await notification.create(row.submitter_id, 'audit', '点位提交未通过',
        `你提交的「${name}」未通过审核。理由：${comment}`, 'point_submit', id);
}

/* ---------------- 用户治理 ---------------- */

/**
 * 用户搜索
 */
async function user_list(q = '') {
    const kw = `%${q}%`;
    return query(
        `SELECT id, username, nickname, avatar, role, status, muted_until, created_at,
            (SELECT COUNT(*) FROM review WHERE user_id = user.id) AS review_count
         FROM user WHERE username LIKE ? OR nickname LIKE ? ORDER BY id LIMIT 50`,
        [kw, kw]
    );
}

/**
 * 禁言/封禁/恢复
 */
async function set_user_status(adminId, userId, input) {
    const { status, days = 0, reason = '' } = input;
    assert([0, 1, 2].includes(Number(status)), '状态不合法');
    const u = await query_one('SELECT * FROM `user` WHERE id = ?', [userId]);
    if (!u) throw err.not_found('用户不存在');
    if (u.role === 1) throw err.forbidden('不能处置管理员账号');
    const mutedUntil = Number(status) === 1
        ? new Date(Date.now() + Number(days) * 86400000)
        : null;
    await query('UPDATE `user` SET status = ?, muted_until = ? WHERE id = ?', [Number(status), mutedUntil, userId]);
    const text = { 0: '账号已恢复正常', 1: `你已被禁言 ${days} 天`, 2: '你的账号已被封禁（只读模式）' }[Number(status)];
    await notification.create(userId, Number(status) === 2 ? 'ban' : 'mute', '账号状态变更',
        `${text}。理由：${reason}`, null, null);
}

/* ---------------- 敏感词库 ---------------- */

async function word_list() {
    return query('SELECT id, word, level FROM banned_word ORDER BY level, id');
}

async function word_add(input) {
    assert(input.word && input.word.trim(), '词语不能为空');
    assert([1, 2, 3].includes(Number(input.level)), 'level 需为 1/2/3');
    await query(
        'INSERT INTO banned_word (word, level) VALUES (?, ?) ON DUPLICATE KEY UPDATE level = VALUES(level)',
        [input.word.trim(), Number(input.level)]
    );
    await load_dfa_from_db(query);
}

async function word_delete(id) {
    await query('DELETE FROM banned_word WHERE id = ?', [id]);
    await load_dfa_from_db(query);
}

/* ---------------- 数据看板 ---------------- */

/**
 * 看板数据：日评价量 / 日举报量 / 评分分布 / 审核吞吐 / 汇总（近 30 天）
 */
async function dashboard() {
    const reviewsDaily = await query(
        `SELECT DATE(created_at) d, COUNT(*) c FROM review
         WHERE created_at > NOW() - INTERVAL 30 DAY GROUP BY DATE(created_at) ORDER BY d`
    );
    const reportsDaily = await query(
        `SELECT DATE(created_at) d, COUNT(*) c FROM report
         WHERE created_at > NOW() - INTERVAL 30 DAY GROUP BY DATE(created_at) ORDER BY d`
    );
    const ratingDist = await query(
        `SELECT ROUND(overall_score) AS score, COUNT(*) c FROM review WHERE status = 0
         GROUP BY ROUND(overall_score) ORDER BY score`
    );
    // 审核吞吐：按 updated_at 统计下架 / 驳回 / 处置通过与申诉
    const auditDaily = await query(
        `SELECT DATE(updated_at) d,
                SUM(status = 2) offline, SUM(status = 3) rejected,
                SUM(status = 0 AND status_reason <> '') passed
         FROM review WHERE updated_at > NOW() - INTERVAL 30 DAY
         GROUP BY DATE(updated_at) ORDER BY d`
    );
    // totals 口径 camelCase（前端看板契约：totalReviews/pendingReviews/openReports/pendingSubmits/totalUsers/totalPoints）
    const totals = await query_one(
        `SELECT (SELECT COUNT(*) FROM review) totalReviews,
                (SELECT COUNT(*) FROM review WHERE status = 1) pendingReviews,
                (SELECT COUNT(*) FROM report WHERE status = 'open') openReports,
                (SELECT COUNT(*) FROM user) totalUsers,
                (SELECT COUNT(*) FROM point_submit WHERE audit_status = 0) pendingSubmits,
                (SELECT COUNT(*) FROM canteen) totalPoints`
    );
    return { reviewsDaily, reportsDaily, ratingDist, auditDaily, totals };
}

/* ---------------- 窗口公告管理 ---------------- */

/**
 * 公告列表（含窗口/食区/作者名，最近 200 条）
 */
async function post_list() {
    return query(
        `SELECT p.*, s.name AS station_name, c.name AS canteen_name, u.nickname AS author_name
         FROM station_post p
         JOIN station s ON s.id = p.station_id
         JOIN canteen c ON c.id = s.canteen_id
         JOIN user u ON u.id = p.author_id
         ORDER BY p.id DESC LIMIT 200`
    );
}

/**
 * 后台直接发布公告（无需负责人身份，作者记为操作管理员）
 * @param {number} adminId
 * @param {Object} input - {stationId, type, content, days}
 */
async function post_create(adminId, input) {
    const { stationId, type, content, days = 3 } = input;
    const s = await query_one('SELECT id FROM station WHERE id = ? AND status = 0', [Number(stationId)]);
    if (!s) throw err.not_found('窗口不存在或已下架');
    assert(['new_dish', 'menu_change', 'away', 'promo'].includes(type), '公告类型不合法');
    assert(typeof content === 'string' && content.trim(), '公告内容必填');
    const r = await query(
        'INSERT INTO station_post (station_id, author_id, type, content, starts_at, ends_at) VALUES (?, ?, ?, ?, NOW(), DATE_ADD(NOW(), INTERVAL ? DAY))',
        [Number(stationId), adminId, type, String(content).trim().slice(0, 200), Number(days) || 3]
    );
    return { id: r.insertId };
}

/**
 * 删除公告（硬删，公告无历史追溯需求）
 */
async function post_delete(id) {
    const r = await query('DELETE FROM station_post WHERE id = ?', [Number(id)]);
    if (!r.affectedRows) throw err.not_found('公告不存在');
}

/* ---------------- 运维维护 ---------------- */

/**
 * 全量重算：聚合摘要全量重建（与 seed、定时任务同款口径）
 */
async function maintenance_recalc() {
    await aggregation.recalc_all();
    return { recalculated: true };
}

module.exports = {
    audit_list, audit_handle,
    create_canteen, update_canteen, delete_canteen, set_canteen_status,
    create_station, update_station, delete_station, set_station_status, set_station_manager,
    create_dish, update_dish, delete_dish, set_dish_status,
    report_list, handle_report,
    point_submit_list, point_submit_approve, point_submit_reject,
    user_list, set_user_status,
    word_list, word_add, word_delete,
    post_list, post_create, post_delete,
    maintenance_recalc,
    dashboard,
};
