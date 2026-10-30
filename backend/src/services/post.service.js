/**
 * 社区动态服务（r78 测试修正）：
 * - 发布动态真实落 post 表，供点评圈「推荐 / 最新」与「分享一条美食动态」任务使用
 * - 点赞写 post_like 并同步 like_count；评论数实时统计
 * - 仅返回 status=0 且未软删的动态
 */
const { query, query_one } = require('../db/pool');
const { err } = require('../utils/api-error');

/**
 * 防御解析 JSON 列
 * @param {*} v
 * @param {Array} fallback
 * @returns {Array}
 */
function parse_arr(v, fallback = []) {
    if (Array.isArray(v)) return v;
    if (typeof v === 'string') {
        try {
            const a = JSON.parse(v);
            return Array.isArray(a) ? a : fallback;
        } catch {
            return fallback;
        }
    }
    return fallback;
}

/**
 * 行转响应对象
 * @param {Object} r
 * @returns {Object}
 */
function to_resp(r) {
    return {
        id: Number(r.id),
        kind: 'post',
        content: r.content,
        images: parse_arr(r.images),
        topics: parse_arr(r.topics),
        links: parse_arr(r.links),
        like_count: Number(r.like_count) || 0,
        comment_count: Number(r.comment_count) || 0,
        liked: Number(r.liked) === 1,
        created_at: r.created_at,
        author: {
            id: Number(r.user_id),
            nickname: r.nickname,
            avatar: Number(r.avatar) || 0,
            avatar_object_key: r.avatar_object_key || null,
        },
    };
}

/**
 * 动态列表（推荐=互动/新鲜度加权；最新=严格时间倒序）
 * @param {Object} opt - {tab, page, size, user_id}
 * @returns {Promise<{list:Array,total:number,page:number,size:number}>}
 */
async function list_posts(opt) {
    const where = ['p.status = 0', 'p.deleted_at IS NULL'];
    const params = [];
    const likedExpr = opt.user_id
        ? 'EXISTS(SELECT 1 FROM post_like pl WHERE pl.post_id = p.id AND pl.user_id = ?)'
        : '0';
    const likeParams = opt.user_id ? [opt.user_id] : [];
    const totalRow = await query_one(`SELECT COUNT(*) n FROM post p WHERE ${where.join(' AND ')}`, []);
    const order = opt.tab === 'recommend'
        // 推荐：点赞 3 分 + 评论 2 分 + 24h 内新鲜度，避免与「最新」完全同序
        ? `(p.like_count * 3 + p.comment_count * 2
            + GREATEST(0, 24 - TIMESTAMPDIFF(HOUR, p.created_at, NOW())) / 12) DESC,
           p.created_at DESC, p.id DESC`
        : 'p.created_at DESC, p.id DESC';
    const rows = await query(
        `SELECT p.id, p.user_id, p.content, p.images, p.topics, p.like_count, p.comment_count,
                p.created_at, u.nickname, u.avatar, u.avatar_object_key,
                ${likedExpr} AS liked
         FROM post p JOIN user u ON u.id = p.user_id
         WHERE ${where.join(' AND ')}
         ORDER BY ${order}
         LIMIT ? OFFSET ?`,
        [...likeParams, ...params, opt.size, (opt.page - 1) * opt.size]
    );
    return {
        list: rows.map(to_resp),
        total: Number(totalRow ? totalRow.n : 0),
        page: opt.page,
        size: opt.size,
    };
}

/**
 * 动态详情
 * @param {number} id
 * @param {number|null} userId
 * @returns {Promise<Object>}
 */
async function get_post(id, userId) {
    const rows = await query(
        `SELECT p.*, u.nickname, u.avatar, u.avatar_object_key,
                ${userId ? 'EXISTS(SELECT 1 FROM post_like pl WHERE pl.post_id = p.id AND pl.user_id = ?)' : '0'} AS liked
         FROM post p JOIN user u ON u.id = p.user_id
         WHERE p.id = ? AND p.status = 0 AND p.deleted_at IS NULL`,
        userId ? [userId, id] : [id]
    );
    if (!rows.length) throw err.not_found('动态不存在或已下架');
    return to_resp(rows[0]);
}

/**
 * 话题规范化：统一为 #xxx# 形态、去重、单条 ≤12 字、最多 8 个
 * @param {*} list - 原始话题数组（可为预设或手输的纯文本/#文本#）
 * @returns {string[]}
 */
function normalize_topics(list) {
    if (!Array.isArray(list)) return [];
    const out = [];
    for (const raw of list) {
        const name = String(raw || '').replace(/[#＃]/g, '').trim().slice(0, 12);
        if (!name) continue;
        const tag = `#${name}#`;
        if (!out.includes(tag)) out.push(tag);
        if (out.length >= 8) break;
    }
    return out;
}

/**
 * 发布动态
 * @param {number} userId
 * @param {Object} input - {content, images, topics}
 * @returns {Promise<Object>}
 */
async function create_post(userId, input) {
    const content = String(input.content || '').trim();
    const images = Array.isArray(input.images) ? input.images.filter(Boolean).slice(0, 9) : [];
    // 话题：预设 + 自定义统一规范化（最多 8 个，避免自定义后丢标签）
    const topics = normalize_topics(input.topics);
    const links = Array.isArray(input.links)
        ? input.links.slice(0, 5).map((l) => ({
            kind: String(l.kind || '').slice(0, 8),
            id: String(l.id || '').slice(0, 16),
            name: String(l.name || '').slice(0, 64),
        }))
        : [];
    if (!content && !images.length) throw err.invalid('动态内容和图片至少填一项');
    if (content.length > 1000) throw err.invalid('正文最多 1000 字');
    const r = await query(
        'INSERT INTO post (user_id, content, images, topics, links) VALUES (?, ?, ?, ?, ?)',
        [userId, content, JSON.stringify(images), JSON.stringify(topics), JSON.stringify(links)]
    );
    return get_post(r.insertId, userId);
}

/**
 * 点赞 / 取消点赞（幂等）
 * @param {number} userId
 * @param {number} postId
 * @returns {Promise<{liked:boolean, like_count:number}>}
 */
async function toggle_like(userId, postId) {
    const post = await query_one('SELECT id FROM post WHERE id = ? AND status = 0 AND deleted_at IS NULL', [postId]);
    if (!post) throw err.not_found('动态不存在');
    const existing = await query_one(
        'SELECT 1 x FROM post_like WHERE user_id = ? AND post_id = ?',
        [userId, postId]
    );
    let liked;
    if (existing) {
        await query('DELETE FROM post_like WHERE user_id = ? AND post_id = ?', [userId, postId]);
        liked = false;
    } else {
        await query('INSERT INTO post_like (user_id, post_id) VALUES (?, ?)', [userId, postId]);
        liked = true;
    }
    const countRow = await query_one('SELECT COUNT(*) n FROM post_like WHERE post_id = ?', [postId]);
    const likeCount = Number(countRow.n) || 0;
    await query('UPDATE post SET like_count = ? WHERE id = ?', [likeCount, postId]);
    return { liked, like_count: likeCount };
}

/**
 * 删除自己的动态（软删）
 * @param {number} userId
 * @param {number} postId
 * @returns {Promise<{deleted:boolean, id:number}>}
 */
async function delete_post(userId, postId) {
    const row = await query_one('SELECT user_id FROM post WHERE id = ? AND deleted_at IS NULL', [postId]);
    if (!row) throw err.not_found('动态不存在');
    if (Number(row.user_id) !== Number(userId)) throw err.forbidden('只能删除自己的动态');
    await query('UPDATE post SET deleted_at = NOW() WHERE id = ?', [postId]);
    return { deleted: true, id: postId };
}

module.exports = { list_posts, get_post, create_post, toggle_like, delete_post };
