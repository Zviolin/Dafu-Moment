/**
 * 社区评论服务（T-18）：帖子 / 评价的单层评论与删除
 * 表口径优先 post_comment（任务分配口径），其次设计文档中的多态 review_reply（parent_type + parent_id）
 * 单层约束：回复二级评论时自动挂到其根评论下；评论写入触发被评论人通知
 * 表未落库时列表返空，写入明确报不可用
 */
const config = require('../config');
const { query, query_one } = require('../db/pool');
const { err } = require('../utils/api-error');
const { assert, assert_str } = require('../utils/validate');
const { has_table, has_column } = require('../utils/schema');
const guard = require('./guard.service');
const notification = require('./notification.service');

const N = config.numbers;

/** parent_type：1 帖子 / 2 评价 */
const PARENT_POST = 1;
const PARENT_REVIEW = 2;

/**
 * 解析实际可用的评论表
 * @returns {Promise<string|null>}
 */
async function resolve_table() {
    if (await has_table('post_comment')) return 'post_comment';
    if (await has_table('review_reply')
        && await has_column('review_reply', 'parent_type')
        && await has_column('review_reply', 'parent_id')) {
        return 'review_reply';
    }
    return null;
}

/**
 * 有效评论条件
 * @param {string} table
 * @param {string} alias
 * @returns {Promise<string>}
 */
async function active_cond(table, alias = '') {
    const prefix = alias ? `${alias}.` : '';
    const conds = [];
    if (await has_column(table, 'deleted_at')) conds.push(`${prefix}deleted_at IS NULL`);
    if (await has_column(table, 'status')) conds.push(`${prefix}status = 0`);
    return conds.length ? ` AND ${conds.join(' AND ')}` : '';
}

/**
 * 校验父对象存在，并返回其作者（通知用）
 * @param {number} parentType
 * @param {number} parentId
 * @returns {Promise<{user_id: number, available: boolean}>}
 */
async function load_parent(parentType, parentId) {
    assert(parentType === PARENT_POST || parentType === PARENT_REVIEW, 'parentType 不合法');
    assert(Number.isInteger(parentId) && parentId > 0, '父对象 ID 不合法');
    if (parentType === PARENT_REVIEW) {
        const row = await query_one('SELECT id, user_id FROM review WHERE id = ?', [parentId]);
        if (!row) throw err.not_found('评价不存在');
        return { user_id: Number(row.user_id), available: true };
    }
    if (!(await has_table('post'))) return { user_id: 0, available: false };
    const deleted = (await has_column('post', 'deleted_at')) ? ' AND deleted_at IS NULL' : '';
    const row = await query_one(`SELECT id, user_id FROM post WHERE id = ?${deleted}`, [parentId]);
    if (!row) throw err.not_found('帖子不存在');
    return { user_id: Number(row.user_id), available: true };
}

/**
 * 评论列表（按时间正序；含作者信息与是否本人）
 * @param {number} parentType
 * @param {number} parentId
 * @param {number|null} viewerId
 * @returns {Promise<Object>}
 */
async function list_comments(parentType, parentId, viewerId = null) {
    assert(Number.isInteger(parentId) && parentId > 0, '父对象 ID 不合法');
    assert(parentType === PARENT_POST || parentType === PARENT_REVIEW, 'parentType 不合法');
    const table = await resolve_table();
    if (!table) return { available: false, list: [], total: 0 };
    const parent = await load_parent(parentType, parentId);
    if (!parent.available) return { available: false, list: [], total: 0 };

    const hasReplyTo = await has_column(table, 'reply_to_comment_id');
    const replySelect = hasReplyTo ? 'c.reply_to_comment_id' : 'NULL AS reply_to_comment_id';
    const cond = await active_cond(table, 'c');
    const list = await query(
        `SELECT c.id, c.user_id, c.content, ${replySelect}, c.created_at,
                u.nickname, u.avatar, u.avatar_object_key
         FROM \`${table}\` c JOIN \`user\` u ON u.id = c.user_id
         WHERE c.parent_type = ? AND c.parent_id = ?${cond}
         ORDER BY c.created_at ASC, c.id ASC LIMIT ?`,
        [parentType, parentId, N.COMMENT_LIST_MAX]
    );
    const rows = list.map((r) => ({
        id: Number(r.id),
        user_id: Number(r.user_id),
        nickname: r.nickname,
        avatar: Number(r.avatar) || 0,
        avatar_object_key: r.avatar_object_key || null,
        content: r.content,
        reply_to_comment_id: r.reply_to_comment_id ? Number(r.reply_to_comment_id) : null,
        is_mine: viewerId ? Number(r.user_id) === Number(viewerId) : false,
        created_at: r.created_at,
    }));
    return { available: true, list: rows, total: rows.length };
}

/**
 * 发表评论（机审掩码后发布；单层化处理回复关系；写通知）
 * @param {number} userId
 * @param {number} parentType
 * @param {number} parentId
 * @param {Object} input - {content, replyToCommentId}
 * @returns {Promise<{id: number, status: number}>}
 */
async function create_comment(userId, parentType, parentId, input) {
    assert(parentType === PARENT_POST || parentType === PARENT_REVIEW, 'parentType 不合法');
    assert(Number.isInteger(parentId) && parentId > 0, '父对象 ID 不合法');
    const table = await resolve_table();
    if (!table) throw err.unavailable('评论功能暂未开放（数据表待建）');
    const parent = await load_parent(parentType, parentId);
    if (!parent.available) throw err.unavailable('社区帖子暂未开放（数据表待建）');
    const content = assert_str(input.content, '评论内容', N.COMMENT_MAX_LEN);

    let replyToId = null;
    if (input.replyToCommentId !== undefined && input.replyToCommentId !== null && input.replyToCommentId !== '') {
        const targetId = Number(input.replyToCommentId);
        assert(Number.isInteger(targetId) && targetId > 0, 'replyToCommentId 不合法');
        const target = await query_one(
            `SELECT id, user_id, parent_type, parent_id${(await has_column(table, 'reply_to_comment_id')) ? ', reply_to_comment_id' : ''}
             FROM \`${table}\` WHERE id = ?${await active_cond(table)}`,
            [targetId]
        );
        if (!target || Number(target.parent_type) !== parentType || Number(target.parent_id) !== parentId) {
            throw err.not_found('被回复的评论不存在');
        }
        // 单层评论：回复二级评论时挂到根评论
        replyToId = target.reply_to_comment_id ? Number(target.reply_to_comment_id) : targetId;
    }

    // DFA 掩码后发布（评论无独立人工队列；命中敏感词仅替换原词，不阻断阅读）
    const verdict = guard.moderate({ content });
    const names = ['user_id', 'content', 'parent_type', 'parent_id', 'status'];
    const values = [userId, verdict.maskedContent, parentType, parentId, 0];
    if (await has_column(table, 'reply_to_comment_id')) { names.push('reply_to_comment_id'); values.push(replyToId); }
    const r = await query(
        `INSERT INTO \`${table}\` (${names.join(', ')}) VALUES (${names.map(() => '?').join(', ')})`,
        values
    );
    const commentId = r.insertId;
    // 同步帖子评论数（列表/推荐排序直接读冗余计数）
    if (parentType === PARENT_POST && await has_table('post')) {
        await query(
            `UPDATE post SET comment_count = (
                SELECT COUNT(*) FROM \`${table}\`
                WHERE parent_type = 1 AND parent_id = ? AND (status = 0 OR status IS NULL)
                  AND deleted_at IS NULL
             ) WHERE id = ?`,
            [parentId, parentId]
        );
    }

    // 被评论人通知：父对象作者 + 被回复评论作者（去重、跳过本人）
    const recipients = new Set();
    if (parent.user_id && Number(parent.user_id) !== Number(userId)) recipients.add(Number(parent.user_id));
    if (replyToId) {
        const target = await query_one(`SELECT user_id FROM \`${table}\` WHERE id = ?`, [replyToId]);
        if (target && Number(target.user_id) !== Number(userId)) recipients.add(Number(target.user_id));
    }
    if (recipients.size > 0) {
        const me = await query_one('SELECT nickname FROM `user` WHERE id = ?', [userId]);
        const name = me ? me.nickname : '有同学';
        for (const to of recipients) {
            await notification.create(
                to, 'interaction', '收到新评论',
                `${name} 评论了你：${verdict.maskedContent.slice(0, 60)}`,
                parentType === PARENT_REVIEW ? 'review' : 'post', parentId
            );
        }
    }
    return { id: Number(commentId), status: 0 };
}

/**
 * 删除自己的评论（软删除优先）
 * @param {number} userId
 * @param {number} commentId
 * @returns {Promise<{id: number}>}
 */
async function delete_comment(userId, commentId) {
    assert(Number.isInteger(commentId) && commentId > 0, '评论 ID 不合法');
    const table = await resolve_table();
    if (!table) throw err.unavailable('评论功能暂未开放（数据表待建）');
    const row = await query_one(
        `SELECT id, user_id FROM \`${table}\` WHERE id = ?${await active_cond(table)}`,
        [commentId]
    );
    if (!row) throw err.not_found('评论不存在');
    if (Number(row.user_id) !== Number(userId)) throw err.forbidden('只能删除自己的评论');
    if (await has_column(table, 'deleted_at')) {
        const sets = (await has_column(table, 'status')) ? 'deleted_at = NOW(), status = 1' : 'deleted_at = NOW()';
        await query(`UPDATE \`${table}\` SET ${sets} WHERE id = ?`, [commentId]);
    } else {
        await query(`DELETE FROM \`${table}\` WHERE id = ?`, [commentId]);
    }
    // 同步帖子评论数
    if (await has_table('post')) {
        const parent = await query_one(`SELECT parent_type, parent_id FROM \`${table}\` WHERE id = ?`, [commentId]);
        if (parent && Number(parent.parent_type) === PARENT_POST) {
            await query(
                `UPDATE post SET comment_count = (
                    SELECT COUNT(*) FROM \`${table}\`
                    WHERE parent_type = 1 AND parent_id = ? AND (status = 0 OR status IS NULL)
                      AND deleted_at IS NULL
                 ) WHERE id = ?`,
                [parent.parent_id, parent.parent_id]
            );
        }
    }
    return { id: commentId };
}

module.exports = {
    list_comments, create_comment, delete_comment,
    PARENT_POST, PARENT_REVIEW,
};
