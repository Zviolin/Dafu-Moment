/**
 * 福大统一身份认证账号服务（r80）
 *
 * 背景：demo 模式原先只校验「学号格式 + 口令 ≥6 位」，任意口令都能通过，
 * 无法体现真实统一身份认证「初始口令 → 本人改密 → 后台可重置」的闭环。
 * 现改为托管式口令，数据落在 fzu_account 表：
 *   1. 任一学号首次登录只认统一初始口令（默认 FZU521，可由 FZU_CAS_INITIAL_PASSWORD 覆盖）；
 *   2. 首次校验通过即建档（bcrypt 存口令）并标记 must_change=1，提示本人尽快改密；
 *   3. 本人可在「我的 → 统一身份口令」修改：当前口令 + 新口令 + 确认新口令（双重输入）；
 *   4. 管理员可在后台「SSO 账号管理」按学号查询、重置为初始口令或指定新口令（重置后 must_change 重新置 1）。
 * real 模式（已接校方 CAS）的凭据仍由校方校验，本服务只做本地镜像与口令托管。
 */
const bcrypt = require('bcryptjs');
const config = require('../config');
const { query, query_one } = require('../db/pool');
const { err } = require('../utils/api-error');

/** 统一初始口令（演示桩默认 FZU521） */
const INITIAL_PASSWORD = config.fzu_cas.initial_password;
/** 口令最小长度（本人改密与后台重置共用口径） */
const MIN_LEN = config.fzu_cas.password_min;
/** 福州大学学号/工号口径：9 位纯数字（与 db3 identity3.service 同口径，如 102400207） */
const UID_PATTERN = /^\d{9}$/;

/** 姓氏池（演示桩确定性映射用，与 fzu-cas 的姓名口径一致） */
const SURNAMES = ['王', '李', '张', '刘', '陈', '杨', '黄', '赵', '吴', '周'];
/** 名字池 */
const GIVEN = ['志强', '晓明', '佳怡', '俊杰', '雨桐', '浩然', '欣然', '子轩', '思远', '梦琪'];

/**
 * 演示桩姓名：同学号恒同名（真实 CAS 由学校人员库返回）
 * @param {string} uid - 学号
 * @returns {string} 姓名
 */
function demo_name_of(uid) {
    const h = Number(String(uid).slice(-4)) || 0;
    return SURNAMES[h % 10] + GIVEN[Math.floor(h / 10) % 10];
}

/**
 * 校验并规整学号
 * 口径：福州大学学号为 9 位纯数字（如 102400207），不再接受 6-12 位的宽松区间
 * @param {*} v - 输入值
 * @returns {string} 9 位纯数字学号
 * @throws {Error} 40001：格式不合法
 */
function assert_uid(v) {
    const uid = String(v || '').trim();
    if (!UID_PATTERN.test(uid)) {
        throw err.invalid('学号格式不正确（福州大学学号为 9 位数字，如 102400207）');
    }
    return uid;
}

/**
 * 校验口令长度
 * @param {*} v - 输入值
 * @param {string} label - 字段名（用于报错文案）
 * @returns {string} 口令原文
 * @throws {Error} 40001：长度不合法
 */
function assert_password(v, label = '统一身份口令') {
    const pwd = typeof v === 'string' ? v : '';
    if (pwd.length < MIN_LEN) throw err.invalid(`${label}至少 ${MIN_LEN} 位`);
    if (pwd.length > 64) throw err.invalid(`${label}最多 64 位`);
    return pwd;
}

/**
 * 读取账号行
 * @param {string} uid - 学号
 * @returns {Promise<Object|null>}
 */
async function find_account(uid) {
    return query_one('SELECT uid, name, password, must_change, user_id, last_login_at FROM fzu_account WHERE uid = ?', [uid]);
}

/**
 * 保证账号行存在：不存在时用统一初始口令建档（bcrypt 10 轮，与本地账号一致）
 * @param {string} uid - 学号
 * @returns {Promise<Object>} 账号行
 */
async function ensure_account(uid) {
    const row = await find_account(uid);
    if (row) return row;
    const hash = await bcrypt.hash(INITIAL_PASSWORD, 10);
    await query(
        'INSERT INTO fzu_account (uid, name, password, must_change) VALUES (?, ?, ?, 1)',
        [uid, demo_name_of(uid), hash]
    );
    return find_account(uid);
}

/**
 * 校验 SSO 凭据（demo 模式）
 * - 未建档：只认统一初始口令，通过后建档并强制改密
 * - 已建档：bcrypt 比对托管口令
 * @param {string} student_id - 学号
 * @param {string} password - 统一身份口令
 * @returns {Promise<{uid:string, name:string, must_change:boolean}>}
 * @throws {Error} 40001：学号格式/口令长度/口令不正确
 */
async function verify_credential(student_id, password) {
    const uid = assert_uid(student_id);
    const pwd = assert_password(password);
    let row = await find_account(uid);
    if (!row) {
        // 首次登录：仅接受统一初始口令，避免「任意 ≥6 位口令都能过」的演示桩漏洞
        if (pwd !== INITIAL_PASSWORD) {
            throw err.invalid(`首次登录请使用统一初始口令 ${INITIAL_PASSWORD}`);
        }
        row = await ensure_account(uid);
    } else {
        const matched = await bcrypt.compare(pwd, row.password);
        if (!matched) throw err.invalid('统一身份口令不正确');
    }
    return { uid, name: row.name, must_change: Number(row.must_change) === 1 };
}

/**
 * 关联本地账号并刷新最近登录时间
 * @param {string} uid - 学号
 * @param {number} user_id - 本地账号 id
 * @returns {Promise<void>}
 */
async function link_user(uid, user_id) {
    await query('UPDATE fzu_account SET user_id = ?, last_login_at = NOW() WHERE uid = ?', [user_id, uid]);
}

/**
 * 本人修改统一身份口令（双重输入：新口令 + 确认新口令）
 * @param {number} user_id - 当前登录账号 id
 * @param {string} old_password - 当前统一身份口令
 * @param {string} new_password - 新口令
 * @param {string} confirm_password - 确认新口令
 * @returns {Promise<{uid:string, must_change:boolean}>}
 * @throws {Error} 40001：未绑定/旧口令错误/两次不一致/新口令等于初始口令
 */
async function change_password(user_id, old_password, new_password, confirm_password) {
    const user = await query_one('SELECT id, fzu_uid FROM `user` WHERE id = ?', [user_id]);
    if (!user || !user.fzu_uid) throw err.invalid('当前账号尚未绑定福大统一身份认证');
    const uid = String(user.fzu_uid);
    const row = await ensure_account(uid);

    const old_pwd = assert_password(old_password, '当前统一身份口令');
    const next_pwd = assert_password(new_password, '新统一身份口令');
    if (next_pwd !== String(confirm_password == null ? '' : confirm_password)) {
        throw err.invalid('两次输入的新口令不一致');
    }
    if (next_pwd === INITIAL_PASSWORD) {
        throw err.invalid('新口令不能与统一初始口令相同');
    }
    const matched = await bcrypt.compare(old_pwd, row.password);
    if (!matched) throw err.invalid('当前统一身份口令不正确');

    const hash = await bcrypt.hash(next_pwd, 10);
    await query('UPDATE fzu_account SET password = ?, must_change = 0, user_id = ? WHERE uid = ?', [hash, user_id, uid]);
    return { uid, must_change: false };
}

/**
 * 本人是否仍在使用初始口令（/auth/me 用于前端提示）
 * @param {string} uid - 学号
 * @returns {Promise<boolean>}
 */
async function must_change_of(uid) {
    if (!uid) return false;
    const row = await query_one('SELECT must_change FROM fzu_account WHERE uid = ?', [String(uid)]);
    return !!row && Number(row.must_change) === 1;
}

/**
 * 后台分页查询统一身份账号
 * @param {string} keyword - 学号/姓名/昵称模糊词
 * @param {number} page - 页码（从 1 开始）
 * @param {number} size - 每页条数
 * @returns {Promise<{list:Array,total:number,must_change_total:number,page:number,size:number}>}
 */
async function list_accounts(keyword, page, size) {
    const kw = String(keyword || '').trim();
    const like = `%${kw}%`;
    const where = kw ? 'WHERE a.uid LIKE ? OR a.name LIKE ? OR u.nickname LIKE ?' : '';
    const params = kw ? [like, like, like] : [];
    const total_row = await query_one(
        `SELECT COUNT(*) n, SUM(a.must_change = 1) m FROM fzu_account a
         LEFT JOIN \`user\` u ON u.id = a.user_id ${where}`,
        params
    );
    const rows = await query(
        `SELECT a.uid, a.name, a.must_change, a.user_id, a.last_login_at, a.created_at,
                u.username, u.nickname
         FROM fzu_account a LEFT JOIN \`user\` u ON u.id = a.user_id
         ${where}
         ORDER BY a.created_at DESC, a.uid DESC
         LIMIT ? OFFSET ?`,
        [...params, size, (page - 1) * size]
    );
    return {
        list: rows.map((r) => ({
            uid: r.uid,
            name: r.name,
            must_change: Number(r.must_change) === 1,
            user_id: r.user_id == null ? null : Number(r.user_id),
            username: r.username || null,
            nickname: r.nickname || null,
            last_login_at: r.last_login_at,
            created_at: r.created_at,
        })),
        total: Number(total_row ? total_row.n : 0),
        must_change_total: Number(total_row && total_row.m ? total_row.m : 0),
        page,
        size,
    };
}

/**
 * 后台重置统一身份口令（留空则重置为统一初始口令）
 * 重置后 must_change=1，强制本人下次登录后修改
 * @param {string} uid - 学号
 * @param {string} [new_password] - 指定新口令；为空则用初始口令
 * @returns {Promise<{uid:string, reset_to_initial:boolean, must_change:boolean}>}
 */
async function reset_password(uid, new_password) {
    const sid = assert_uid(uid);
    await ensure_account(sid);
    const raw = new_password == null ? '' : String(new_password).trim();
    const pwd = raw === '' ? INITIAL_PASSWORD : assert_password(raw, '新统一身份口令');
    const hash = await bcrypt.hash(pwd, 10);
    await query('UPDATE fzu_account SET password = ?, must_change = 1 WHERE uid = ?', [hash, sid]);
    return { uid: sid, reset_to_initial: pwd === INITIAL_PASSWORD, must_change: true };
}

module.exports = {
    INITIAL_PASSWORD,
    MIN_LEN,
    demo_name_of,
    find_account,
    ensure_account,
    verify_credential,
    link_user,
    change_password,
    must_change_of,
    list_accounts,
    reset_password,
};
