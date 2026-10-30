/**
 * 点评服务（v2.1）：发布（DFA 机审分流）/ 修改重评 / 删除 / 投票 / 点赞 / 列表
 * 分项评分由 review_dimension 配置驱动：写入前校验适用性并计算加权总分 overall_score
 * 事务边界（02 §四.1）：INSERT review + INSERT review_image×n + 聚合重算
 */
const { pool, query, query_one } = require('../db/pool');
const aggregation = require('./aggregation.service');
const guard = require('./guard.service');
const dimension = require('./dimension.service');
const media = require('./media.service');
const notification = require('./notification.service');
const { err } = require('../utils/api-error');

/**
 * 校验被评对象存在且未下架，返回其点位类型（维度适用性判定用）
 * @param {number} subjectType - 0 菜品 / 1 档口 / 2 点位
 * @param {number} subjectId
 * @returns {Promise<number>} canteenType
 */
async function assert_subject_exists(subjectType, subjectId) {
    if (subjectType === 0) {
        const row = await query_one(
            `SELECT c.type FROM dish d
             JOIN station s ON s.id = d.station_id
             JOIN canteen c ON c.id = s.canteen_id
             WHERE d.id = ? AND d.status = 0`,
            [subjectId]
        );
        if (!row) throw err.not_found('菜品不存在或已下架');
        return Number(row.type);
    }
    if (subjectType === 1) {
        const row = await query_one(
            `SELECT c.type FROM station s JOIN canteen c ON c.id = s.canteen_id
             WHERE s.id = ? AND s.status < 2`,
            [subjectId]
        );
        if (!row) throw err.not_found('档口不存在或已下架');
        return Number(row.type);
    }
    if (subjectType === 2) {
        const row = await query_one('SELECT type FROM canteen WHERE id = ? AND enabled = 1', [subjectId]);
        if (!row) throw err.not_found('点位不存在或已下架');
        return Number(row.type);
    }
    throw err.invalid('subjectType 不合法');
}

/**
 * 发布评价（DFA 机审：无命中直接发布 / 命中转人工）
 * @param {number} userId
 * @param {Object} input - {subjectType, subjectId, dimensionScores, content, isAnonymous, tags[], imageKeys[]}
 * @returns {Promise<{reviewId: number, status: number, reason: string}>}
 */
async function create_review(userId, input) {
    const { subjectType, subjectId, content, imageKeys = [], tags = [] } = input;
    const canteenType = await assert_subject_exists(subjectType, subjectId);

    // 分项得分校验 + 加权总分
    const { overall, dimensionScores } = await dimension.validate_and_score(canteenType, input.dimensionScores);

    // 图片归属校验（24h 内本人上传，防引用他人图片）
    if (imageKeys.length > 0) {
        const owned = await media.verify_ownership(userId, imageKeys);
        if (!owned) throw err.forbidden('图片校验失败：请在本页面重新上传');
    }

    // 机审分流（仅 DFA 敏感词）
    const verdict = guard.moderate({ content });

    // 事务：review + review_image + 聚合重算
    const conn = await pool.getConnection();
    let reviewId;
    try {
        await conn.beginTransaction();
        const [r1] = await conn.query(
            `INSERT INTO review
                (user_id, subject_type, subject_id, overall_score, dimension_scores,
                 content, is_anonymous, tags, status, status_reason)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [userId, subjectType, subjectId, overall, JSON.stringify(dimensionScores),
                verdict.maskedContent, input.isAnonymous ? 1 : 0, tags.join(','),
                verdict.status, verdict.reason]
        );
        reviewId = r1.insertId;
        for (const key of imageKeys.slice(0, 3)) {
            await conn.query(
                'INSERT INTO review_image (review_id, object_key) VALUES (?, ?)',
                [reviewId, key]
            );
        }
        // 聚合重算移至事务提交后执行（recalc 走连接池独立连接，事务内调用读不到本事务未提交数据）
        await conn.commit();
    } catch (e) {
        await conn.rollback();
        throw e;
    } finally {
        conn.release();
    }
    // 仅已发布参与聚合（不计分原则）
    if (verdict.status === 0) {
        await aggregation.recalc(subjectType, subjectId);
    }
    return { reviewId, status: verdict.status, reason: verdict.reason };
}

/**
 * 修改重评（覆盖更新 → 前后对象全量重算）
 * @param {number} userId
 * @param {number} reviewId
 * @param {Object} input - 同发布
 * @returns {Promise<{status: number, reason: string}>}
 */
async function update_review(userId, reviewId, input) {
    const old = await query_one('SELECT * FROM review WHERE id = ? AND user_id = ?', [reviewId, userId]);
    if (!old) throw err.not_found('评价不存在');
    if (old.status === 3) throw err.forbidden('已被驳回的评价不能修改');
    const { subjectType, subjectId, content, imageKeys = [], tags = [] } = input;
    const canteenType = await assert_subject_exists(subjectType, subjectId);
    const { overall, dimensionScores } = await dimension.validate_and_score(canteenType, input.dimensionScores);

    // 重新机审
    const verdict = guard.moderate({ content });

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        await conn.query(
            `UPDATE review SET subject_type = ?, subject_id = ?, overall_score = ?, dimension_scores = ?,
                content = ?, is_anonymous = ?, tags = ?, status = ?, status_reason = ?
             WHERE id = ? AND user_id = ?`,
            [subjectType, subjectId, overall, JSON.stringify(dimensionScores),
                verdict.maskedContent, input.isAnonymous ? 1 : 0, tags.join(','),
                verdict.status, verdict.reason, reviewId, userId]
        );
        await conn.query('DELETE FROM review_image WHERE review_id = ?', [reviewId]);
        for (const key of imageKeys.slice(0, 3)) {
            await conn.query('INSERT INTO review_image (review_id, object_key) VALUES (?, ?)', [reviewId, key]);
        }
        await conn.commit();
    } catch (e) {
        await conn.rollback();
        throw e;
    } finally {
        conn.release();
    }

    // 新旧状态/对象都可能变化 → 前后对象全量重算（原可见先减，新可见计入）
    await aggregation.recalc(old.subject_type, old.subject_id);
    if (old.subject_type !== subjectType || old.subject_id !== subjectId) {
        await aggregation.recalc(subjectType, subjectId);
    }
    return { status: verdict.status, reason: verdict.reason };
}

/**
 * 自删评价（已发布参与过聚合 → 重算）
 * @param {number} userId
 * @param {number} reviewId
 */
async function delete_review(userId, reviewId) {
    const old = await query_one('SELECT * FROM review WHERE id = ? AND user_id = ?', [reviewId, userId]);
    if (!old) throw err.not_found('评价不存在');
    await query('DELETE FROM review_image WHERE review_id = ?', [reviewId]);
    await query('DELETE FROM review_reply WHERE review_id = ?', [reviewId]);
    await query('DELETE FROM review WHERE id = ?', [reviewId]);
    await aggregation.recalc(old.subject_type, old.subject_id);
}

/**
 * 投票（delta 计数，前端 localStorage 去重——课程口径）
 * @param {number} reviewId
 * @param {number} delta - +1 / -1 / 0 表示撤销
 * @param {string} field - up|down
 */
async function vote(reviewId, delta, field) {
    const old = await query_one('SELECT id FROM review WHERE id = ?', [reviewId]);
    if (!old) throw err.not_found('评价不存在');
    const col = field === 'up' ? 'up_count' : 'down_count';
    await query(
        `UPDATE review SET ${col} = GREATEST(0, ${col} + ?) WHERE id = ?`,
        [delta, reviewId]
    );
}

/**
 * 评价列表（hot = Laplace 平滑排序；dim:<key> = 按适用维度得分排序；匿名脱敏）
 * @param {number} subjectType
 * @param {number} subjectId
 * @param {string} sort - hot|new|dim:<dimension_key>
 * @param {number} page
 * @param {number} pageSize
 * @param {number|null} viewerId - 当前登录人（计算 liked 已点赞标记；null 表示未登录）
 * @returns {Promise<{list: Array, total: number}>}
 */
async function list_reviews(subjectType, subjectId, sort = 'new', page = 1, pageSize = 20, viewerId = null) {
    const offset = (page - 1) * pageSize;
    // 作用域：传 subject_id → 按点评对象过滤；不传 → 全站最新流（首页气泡 / 点评圈共用）
    const scoped = subjectId !== null && subjectId !== undefined
        && Number.isInteger(Number(subjectId)) && Number(subjectId) > 0;
    // 排序表达式：维度排序仅在对象作用域内生效，且维度必须适用于该对象的点位类型
    let order = 'created_at DESC';
    let dimPath = null;
    if (typeof sort === 'string' && sort.startsWith('dim:')) {
        const key = sort.slice(4);
        if (!scoped) throw err.invalid('按维度排序需指定点评对象');
        const canteenType = await assert_subject_exists(Number(subjectType), Number(subjectId));
        const dims = await dimension.dims_for_type(canteenType);
        if (!dims.some((d) => d.key === key)) throw err.invalid('该维度不适用于当前点评对象');
        order = 'CAST(JSON_UNQUOTE(JSON_EXTRACT(r.dimension_scores, ?)) AS DECIMAL(3,1)) DESC, r.created_at DESC';
        dimPath = `$.${key}`;
    } else if (sort === 'hot') {
        order = '(up_count + 1) / (up_count + down_count + 2) DESC, created_at DESC';
    }
    // liked：当前用户是否已赞（未登录恒 0；EXISTS 子查询走 uk_user_review 唯一索引）
    const likedSelect = viewerId
        ? '(SELECT COUNT(*) FROM review_like rl WHERE rl.review_id = r.id AND rl.user_id = ?) AS liked'
        : '0 AS liked';
    const params = viewerId ? [viewerId] : [];
    const total = await query_one(
        scoped
            ? "SELECT COUNT(*) c FROM review WHERE subject_type = ? AND subject_id = ? AND status IN (0, 2)"
            : "SELECT COUNT(*) c FROM review WHERE status IN (0, 2)",
        scoped ? [subjectType, subjectId] : []
    );
    const list = await query(
        `SELECT r.id, r.user_id, r.overall_score, r.dimension_scores, r.content, r.is_anonymous,
                r.tags, r.status, r.status_reason, r.up_count, r.down_count, r.like_count, ${likedSelect}, r.created_at,
                u.nickname, u.avatar, u.avatar_object_key,
                (SELECT GROUP_CONCAT(object_key) FROM review_image WHERE review_id = r.id AND status = 0) AS images,
                (SELECT CONCAT(rr.user_id, '|', rr.content, '|', rr.created_at, '|', u2.nickname)
                   FROM review_reply rr JOIN user u2 ON u2.id = rr.user_id
                  WHERE rr.review_id = r.id LIMIT 1) AS reply
         FROM review r JOIN user u ON u.id = r.user_id
         WHERE ${scoped ? 'r.subject_type = ? AND r.subject_id = ? AND ' : ''}r.status IN (0, 2)
         ORDER BY ${order}
         LIMIT ? OFFSET ?`,
        [...params, ...(scoped ? [subjectType, subjectId] : []), ...(dimPath ? [dimPath] : []), pageSize, offset]
    );
    return {
        list: list.map(map_review_row),
        total: Number(total.c),
    };
}

/**
 * 行 → 前端结构（匿名脱敏；dimension_scores JSON 解析；点赞计数/标记）
 * @param {Object} r - review 行
 * @returns {Object}
 */
function map_review_row(r) {
    const anonymous = Number(r.is_anonymous) === 1;
    let reply = null;
    if (r.reply) {
        const [uid, content, created, nickname] = r.reply.split('|');
        reply = { userId: Number(uid), content, createdAt: created, nickname };
    }
    let dims = r.dimension_scores;
    if (typeof dims === 'string') {
        try { dims = JSON.parse(dims); } catch { dims = {}; }
    }
    const out = {
        id: r.id,
        userId: anonymous ? 0 : r.user_id,
        nickname: anonymous ? '匿名同学' : r.nickname,
        avatar: anonymous ? -1 : r.avatar,
        // 自定义头像（MinIO objectKey 裸串，前端需补 /img/ 前缀）；匿名点评一律置空
        avatar_object_key: anonymous ? null : (r.avatar_object_key || null),
        isAnonymous: anonymous,
        overallScore: Number(r.overall_score),
        dimensionScores: dims || {},
        content: r.content,
        tags: r.tags ? r.tags.split(',') : [],
        status: r.status,
        statusReason: r.status === 2 ? r.status_reason : '',
        upCount: r.up_count,
        downCount: r.down_count,
        likeCount: Number(r.like_count) || 0,
        liked: Number(r.liked) === 1,
        createdAt: r.created_at,
        images: r.images ? r.images.split(',') : [],
        reply,
    };
    // 跨对象列表（他人主页/我的评价）带被评对象信息，单对象列表行无此字段
    if (r.subject_type !== undefined && r.subject_type !== null) {
        out.subjectType = Number(r.subject_type);
        out.subjectId = Number(r.subject_id);
        out.subjectName = r.subject_name || '已删除对象';
    }
    return out;
}

/**
 * 点赞 toggle（03 §5.4）：未赞 → INSERT review_like + like_count+1；已赞 → DELETE + like_count-1
 * like_count 为冗余计数，真实来源是 review_like 表（uk_user_review 唯一键防重复点赞）
 * @param {number} userId
 * @param {number} reviewId
 * @returns {Promise<{liked: boolean, likeCount: number}>}
 */
async function toggle_like(userId, reviewId) {
    const r = await query_one('SELECT id, user_id, like_count FROM review WHERE id = ?', [reviewId]);
    if (!r) throw err.not_found('评价不存在');
    // INSERT IGNORE：撞唯一键说明已赞 → 走取消分支
    const ins = await query(
        'INSERT IGNORE INTO review_like (user_id, review_id) VALUES (?, ?)',
        [userId, reviewId]
    );
    if (ins.affectedRows > 0) {
        await query('UPDATE review SET like_count = like_count + 1 WHERE id = ?', [reviewId]);
        // 新增点赞且非自赞 → 给作者写 like 通知（同类型 24h 内合并展示）
        if (Number(r.user_id) !== Number(userId)) {
            const liker = await query_one('SELECT nickname FROM `user` WHERE id = ?', [userId]);
            await notification.create(
                r.user_id, 'like', '收到新的点赞',
                `${liker ? liker.nickname : '有同学'} 赞了你的评价`, 'review', reviewId
            );
        }
    } else {
        await query('DELETE FROM review_like WHERE user_id = ? AND review_id = ?', [userId, reviewId]);
        // GREATEST 防御负数（历史数据不一致时不至于出现 -1）
        await query('UPDATE review SET like_count = GREATEST(0, like_count - 1) WHERE id = ?', [reviewId]);
    }
    // 更新后回读，避免并发 toggle 时计数漂移
    const fresh = await query_one('SELECT like_count FROM review WHERE id = ?', [reviewId]);
    return { liked: ins.affectedRows > 0, likeCount: Number(fresh.like_count) };
}

/**
 * 我的评价列表（含待人工/已下架，个人档案用）
 * @param {number} userId
 * @returns {Promise<Array>}
 */
async function my_reviews(userId) {
    const list = await query(
        `SELECT r.*,
            CASE r.subject_type WHEN 0 THEN (SELECT name FROM dish WHERE id = r.subject_id)
                                WHEN 1 THEN (SELECT name FROM station WHERE id = r.subject_id)
                                ELSE (SELECT name FROM canteen WHERE id = r.subject_id) END AS subject_name,
            (SELECT GROUP_CONCAT(object_key) FROM review_image WHERE review_id = r.id AND status = 0) AS images
         FROM review r WHERE r.user_id = ? ORDER BY r.created_at DESC LIMIT 200`,
        [userId]
    );
    return list.map((r) => {
        let dims = r.dimension_scores;
        if (typeof dims === 'string') {
            try { dims = JSON.parse(dims); } catch { dims = {}; }
        }
        return {
            id: r.id,
            subjectType: r.subject_type,
            subjectId: r.subject_id,
            subjectName: r.subject_name || '已删除对象',
            overallScore: Number(r.overall_score),
            dimensionScores: dims || {},
            content: r.content,
            tags: r.tags ? r.tags.split(',') : [],
            status: r.status,
            statusReason: r.status_reason,
            upCount: r.up_count,
            downCount: r.down_count,
            likeCount: Number(r.like_count) || 0,
            createdAt: r.created_at,
            images: r.images ? r.images.split(',') : [],
        };
    });
}

/**
 * 他人主页评价列表（03 §5.2：仅已发布，created_at 倒序分页）
 * 行结构与 list_reviews 对齐，复用 map_review_row（含被评对象名称）
 * @param {number} userId - 主页主人
 * @param {number|null} viewerId - 访客（计算 liked 已赞标记）
 * @param {number} page
 * @param {number} pageSize - 固定 10（03 §5.1 分页约定）
 * @returns {Promise<{list: Array, total: number, page: number, size: number}>}
 */
async function list_user_reviews(userId, viewerId = null, page = 1, pageSize = 10) {
    const offset = (page - 1) * pageSize;
    const likedSelect = viewerId
        ? '(SELECT COUNT(*) FROM review_like rl WHERE rl.review_id = r.id AND rl.user_id = ?) AS liked'
        : '0 AS liked';
    const params = viewerId ? [viewerId] : [];
    const total = await query_one(
        'SELECT COUNT(*) c FROM review WHERE user_id = ? AND status = 0',
        [userId]
    );
    const list = await query(
        `SELECT r.id, r.user_id, r.subject_type, r.subject_id, r.overall_score, r.dimension_scores,
                r.content, r.is_anonymous, r.tags, r.status, r.status_reason,
                r.up_count, r.down_count, r.like_count, ${likedSelect}, r.created_at,
                u.nickname, u.avatar, u.avatar_object_key,
                CASE r.subject_type WHEN 0 THEN (SELECT name FROM dish WHERE id = r.subject_id)
                                    WHEN 1 THEN (SELECT name FROM station WHERE id = r.subject_id)
                                    ELSE (SELECT name FROM canteen WHERE id = r.subject_id) END AS subject_name,
                (SELECT GROUP_CONCAT(object_key) FROM review_image WHERE review_id = r.id AND status = 0) AS images
         FROM review r JOIN user u ON u.id = r.user_id
         WHERE r.user_id = ? AND r.status = 0
         ORDER BY r.created_at DESC
         LIMIT ? OFFSET ?`,
        [...params, userId, pageSize, offset]
    );
    return {
        list: list.map(map_review_row),
        total: Number(total.c),
        page,
        size: pageSize,
    };
}

/**
 * 单条评价详情（发布后跳转/申诉用）
 * @param {number} id
 * @param {number|null} viewerId - 当前登录人（计算 liked）
 * @returns {Promise<Object|null>}
 */
async function get_review(id, viewerId = null) {
    const likedSelect = viewerId
        ? '(SELECT COUNT(*) FROM review_like rl WHERE rl.review_id = r.id AND rl.user_id = ?) AS liked'
        : '0 AS liked';
    const params = viewerId ? [viewerId] : [];
    const r = await query_one(
        `SELECT r.*, ${likedSelect}, u.nickname, u.avatar, u.avatar_object_key,
            (SELECT GROUP_CONCAT(object_key) FROM review_image WHERE review_id = r.id AND status = 0) AS images
         FROM review r JOIN user u ON u.id = r.user_id WHERE r.id = ?`,
        [...params, id]
    );
    if (!r) return null;
    const out = map_review_row(r);
    // r.* 带 subject_type 会被行映射补 subject 字段，此处详情页无对象名子查询 → 移除避免误报「已删除对象」
    delete out.subjectType;
    delete out.subjectId;
    delete out.subjectName;
    return out;
}

module.exports = {
    create_review, update_review, delete_review, vote, toggle_like,
    list_reviews, my_reviews, list_user_reviews, get_review, assert_subject_exists,
};
