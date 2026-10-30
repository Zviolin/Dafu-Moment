/**
 * r80 走查：福大统一身份认证（演示桩）口令托管闭环
 * 覆盖：统一初始口令 FZU521 → 首次登录建档并标记需改密 → 本人三重输入改密（失败/成功分支）
 *       → 新口令重登 → 后台 SSO 账号管理（列表/搜索/重置为初始口令/指定新口令/非管理员 403）
 *       → 解绑后口令记录与本地账号脱钩
 * 运行：node tests/walkthrough-r80-fzu-initial-password.test.mjs
 * 前置：docker compose 后端在跑且 DEBUG=true（验证码下发 debugCode）；fzu_account 表已建（迁移 008）
 * 幂等：学号/用户名带时间后缀，收尾删除本次建的 user 与 fzu_account 行
 */
import { execSync } from 'child_process';

const BASE = process.env.LB_BASE || 'http://localhost:8095';

let pass = 0, fail = 0;
const cases = [];

/**
 * 用例执行器：单条失败不影响后续用例，收尾统一汇总
 * @param {string} id - 用例编号
 * @param {string} desc - 用例描述
 * @param {Function} fn - 用例体（抛错即失败）
 */
async function case_it(id, desc, fn) {
    try {
        await fn();
        pass++;
        cases.push({ id, desc, ok: true });
        console.log(`  [PASS] ${id} ${desc}`);
    } catch (e) {
        fail++;
        cases.push({ id, desc, ok: false, msg: String(e.message || e) });
        console.log(`  [FAIL] ${id} ${desc} -> ${String(e.message || e).slice(0, 200)}`);
    }
}

/**
 * 原始请求（不校验业务码，供负向用例断言 422/403 等）
 * @param {string} method - HTTP 方法
 * @param {string} path - /api 起始路径
 * @param {*} [body] - 请求体
 * @param {string} [token] - JWT
 * @returns {Promise<{status:number, json:Object, data:*}>}
 */
async function request(method, path, body, token) {
    const r = await fetch(`${BASE}${path}`, {
        method,
        headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    const j = await r.json();
    return { status: r.status, json: j, data: j.data };
}

/** GET 成功断言（HTTP 200 + code 0） */
async function get(path, token) {
    const { status, json, data } = await request('GET', path, undefined, token);
    if (status !== 200) throw new Error(`HTTP ${status} ${path}`);
    if (json.code !== 0) throw new Error(`code=${json.code} msg=${json.msg} (${path})`);
    return data;
}

/** POST 成功断言 */
async function post(path, body, token) {
    const { status, json, data } = await request('POST', path, body, token);
    if (status !== 200) throw new Error(`HTTP ${status} ${path}`);
    if (json.code !== 0) throw new Error(`code=${json.code} msg=${json.msg} (${path})`);
    return data;
}

/** PUT 成功断言 */
async function put(path, body, token) {
    const { status, json, data } = await request('PUT', path, body, token);
    if (status !== 200) throw new Error(`HTTP ${status} ${path}`);
    if (json.code !== 0) throw new Error(`code=${json.code} msg=${json.msg} (${path})`);
    return data;
}

/** 断言 */
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assert failed'); }

/** 图形验证码（DEBUG=true 才有 debugCode） */
async function captcha_body() {
    const d = await get('/api/auth/captcha');
    assert(d.captchaId && d.debugCode, '验证码缺 debugCode（后端需 DEBUG=true）');
    return { captchaId: d.captchaId, captchaCode: d.debugCode };
}

/** 数据库直连执行（仅用于收尾清理，避免测试残留） */
function db_exec(sql) {
    return execSync(
        `docker exec dafu-mysql mysql -uroot -pdafu_root_2026 --default-character-set=utf8mb4 -e "${sql}"`,
        { stdio: 'pipe' }
    ).toString();
}

/**
 * 清空限流计数（rl:{action}:{uid}:{bucket}）：本走查单轮会打满 SSO 的 10 次/10 分钟窗口，
 * 连续跑两轮必然 429；仅清本走查涉及的 action，Redis 不可用时静默跳过（限流本就降级放行）
 * @param {string} action - 动作名（fzu_sso / fzu_pwd / login）
 */
function flush_rate_limit(action) {
    try {
        execSync(`docker exec dafu-redis redis-cli EVAL "local ks=redis.call('keys','rl:${action}:*'); for i,k in ipairs(ks) do redis.call('del',k) end; return #ks" 0`, { stdio: 'pipe' });
    } catch { /* Redis 不可用：跳过 */ }
}

/* ---------- 测试主体：本次专用学号（9 位纯数字，符合福州大学学号口径且与种子数据隔离） ---------- */
const SUF = String(Date.now()).slice(-7);
const SID = `88${SUF}`;          // 学号（9 位）
const SID_ALT = `86${SUF}`;      // 仅用于格式校验的 9 位学号（不建档）
const INITIAL = 'FZU521';        // 统一初始口令
const NEW_PWD = 'Fzu@2026x';     // 本人新口令
// 管理员口令：默认种子库 admin123；本机已轮换时用 $env:DAFU_ADMIN_PASSWORD 注入（明文不入库）
const ADMIN_PWD = process.env.DAFU_ADMIN_PASSWORD || 'admin123';

let TOKEN_USER = '';
let TOKEN_ADMIN = '';
let MODE = null;

/* 幂等前置清理：上次异常中断可能残留同名账号 + 清空限流窗口 */
db_exec(`DELETE FROM dafu.fzu_account WHERE uid='${SID}'; DELETE FROM dafu.user WHERE username='${SID}';`);
flush_rate_limit('fzu_sso');
flush_rate_limit('fzu_pwd');
flush_rate_limit('login');

console.log('=== r80 统一身份初始口令 / 本人改密 / 后台 SSO 账号管理 走查 ===');

await case_it('R80-01', 'CAS 模式探测：demo 模式公开统一初始口令 FZU521 与改密引导', async () => {
    MODE = await get('/api/auth/fzu/cas/mode');
    assert(MODE.mode === 'demo', `当前模式应为 demo，实际 ${MODE.mode}`);
    assert(MODE.initialPassword === INITIAL, `initialPassword 应为 ${INITIAL}，实际 ${MODE.initialPassword}`);
    assert(typeof MODE.initialPasswordHint === 'string' && MODE.initialPasswordHint.includes('统一初始口令'), '缺少 initialPasswordHint');
    assert(MODE.loginUrl === undefined, 'demo 模式不应下发 loginUrl');
});

await case_it('R80-02', '首次登录错误口令 → 422 + 40001，且不得建档', async () => {
    const r = await request('POST', '/api/auth/fzu/sso', { studentId: SID, password: 'wrongpwd123' });
    assert(r.status === 422, `HTTP 应 422，实际 ${r.status}`);
    assert(r.json.code === 40001, `业务码应 40001，实际 ${r.json.code}`);
    assert(String(r.json.msg).includes(INITIAL), `报错文案应指明初始口令，实际「${r.json.msg}」`);
    const n = db_exec(`SELECT COUNT(*) n FROM dafu.fzu_account WHERE uid='${SID}';`).match(/\d+/g);
    assert(n && Number(n[n.length - 1]) === 0, '错误口令不应建档 fzu_account');
});

await case_it('R80-03', '首次登录 FZU521 → 自动建号并标记需改密', async () => {
    const d = await post('/api/auth/fzu/sso', { studentId: SID, password: INITIAL });
    assert(d.token && d.user, '应返回 token/user');
    assert(d.user.fzu_uid === SID, `fzu_uid 应为 ${SID}`);
    assert(d.user.fzu_must_change_password === true, 'user.fzu_must_change_password 应为 true');
    assert(d.must_change_password === true, '顶层 must_change_password 应为 true（兼容旧前端）');
    assert(d.user.username === SID, 'SSO 建号登录名应为学号');
    TOKEN_USER = d.token;
});

await case_it('R80-04', '/auth/me 下发 fzu_must_change_password=true（前端据此提示改密）', async () => {
    const me = await get('/api/auth/me', TOKEN_USER);
    assert(me.fzu_verified === true && me.fzu_uid === SID, '认证身份缺失');
    assert(me.fzu_must_change_password === true, '仍用初始口令时该标记应为 true');
});

await case_it('R80-05', '两次新口令不一致 → 422 且口令不变', async () => {
    const r = await request('PUT', '/api/me/fzu/password',
        { oldPassword: INITIAL, newPassword: NEW_PWD, confirmPassword: `${NEW_PWD}x` }, TOKEN_USER);
    assert(r.status === 422 && r.json.code === 40001, `应 422/40001，实际 ${r.status}/${r.json.code}`);
    assert(String(r.json.msg).includes('不一致'), `文案应提示不一致，实际「${r.json.msg}」`);
    const re = await request('POST', '/api/auth/fzu/sso', { studentId: SID, password: INITIAL });
    assert(re.status === 200, '口令应保持为初始口令（旧口令仍可登录）');
});

await case_it('R80-06', '当前口令错误 → 422 且不改密', async () => {
    const r = await request('PUT', '/api/me/fzu/password',
        { oldPassword: 'not-the-pwd', newPassword: NEW_PWD, confirmPassword: NEW_PWD }, TOKEN_USER);
    assert(r.status === 422 && r.json.code === 40001, `应 422/40001，实际 ${r.status}/${r.json.code}`);
    assert(String(r.json.msg).includes('当前统一身份口令不正确'), `文案不符：${r.json.msg}`);
});

await case_it('R80-07', '新口令等于统一初始口令 → 422（禁止原地踏步）', async () => {
    const r = await request('PUT', '/api/me/fzu/password',
        { oldPassword: INITIAL, newPassword: INITIAL, confirmPassword: INITIAL }, TOKEN_USER);
    assert(r.status === 422 && r.json.code === 40001, `应 422/40001，实际 ${r.status}/${r.json.code}`);
    assert(String(r.json.msg).includes('不能与统一初始口令相同'), `文案不符：${r.json.msg}`);
});

await case_it('R80-08', '新口令长度不足 → 422', async () => {
    const r = await request('PUT', '/api/me/fzu/password',
        { oldPassword: INITIAL, newPassword: 'abc', confirmPassword: 'abc' }, TOKEN_USER);
    assert(r.status === 422 && r.json.code === 40001, `应 422/40001，实际 ${r.status}/${r.json.code}`);
});

await case_it('R80-09', '本人改密成功（旧 + 新 + 确认三重输入）→ must_change=false', async () => {
    const d = await put('/api/me/fzu/password',
        { oldPassword: INITIAL, newPassword: NEW_PWD, confirmPassword: NEW_PWD }, TOKEN_USER);
    assert(d.uid === SID, `uid 应为 ${SID}`);
    assert(d.must_change === false, '改密后 must_change 应为 false');
    const me = await get('/api/auth/me', TOKEN_USER);
    assert(me.fzu_must_change_password === false, '/auth/me 的改密提示应消失');
});

await case_it('R80-10', '改密后旧口令失效 → 422；新口令可登录且标记已改密', async () => {
    const old = await request('POST', '/api/auth/fzu/sso', { studentId: SID, password: INITIAL });
    assert(old.status === 422 && old.json.code === 40001, `旧口令应失效 422，实际 ${old.status}`);
    const d = await post('/api/auth/fzu/sso', { studentId: SID, password: NEW_PWD });
    assert(d.user.fzu_must_change_password === false, '已改密用户不应再提示改密');
});

await case_it('R80-11', '非管理员访问后台 SSO 账号管理 → 403', async () => {
    const r = await request('GET', '/api/admin/fzu-accounts', undefined, TOKEN_USER);
    assert(r.status === 403, `应 403，实际 ${r.status}`);
    const w = await request('PUT', `/api/admin/fzu-accounts/${SID}/password`, { newPassword: 'hack123456' }, TOKEN_USER);
    assert(w.status === 403, `写接口应 403，实际 ${w.status}`);
});

await case_it('R80-12', '管理员列表：按学号搜索命中，状态为已自行改密', async () => {
    const lm = await post('/api/auth/login', { username: 'admin', password: ADMIN_PWD, ...(await captcha_body()) });
    TOKEN_ADMIN = lm.token;
    const d = await get(`/api/admin/fzu-accounts?keyword=${SID}&page=1&size=20`, TOKEN_ADMIN);
    assert(Array.isArray(d.list) && d.list.length === 1, `应命中 1 条，实际 ${d.list.length}`);
    const row = d.list[0];
    assert(row.uid === SID && row.must_change === false, `行状态不符：${JSON.stringify(row)}`);
    assert(typeof d.must_change_total === 'number', '缺 must_change_total 汇总');
    assert(row.user_id > 0 && row.username === SID, '应关联到 SSO 自动建的本地账号');
    assert(row.password === undefined, '响应不得回传口令字段');
});

await case_it('R80-13', '管理员重置为统一初始口令（留空）→ reset_to_initial 且重新强制改密', async () => {
    const d = await put(`/api/admin/fzu-accounts/${SID}/password`, { newPassword: '' }, TOKEN_ADMIN);
    assert(d.reset_to_initial === true && d.must_change === true, `重置结果不符：${JSON.stringify(d)}`);
    const sso = await post('/api/auth/fzu/sso', { studentId: SID, password: INITIAL });
    assert(sso.user.fzu_must_change_password === true, '重置后应重新标记需改密');
});

await case_it('R80-14', '管理员指定新口令 → 本人可用该口令登录', async () => {
    const d = await put(`/api/admin/fzu-accounts/${SID}/password`, { newPassword: 'AdminSet88' }, TOKEN_ADMIN);
    assert(d.reset_to_initial === false, '指定新口令不应标记为初始口令');
    const sso = await post('/api/auth/fzu/sso', { studentId: SID, password: 'AdminSet88' });
    assert(sso.user.fzu_uid === SID, '指定口令应可登录');
});

await case_it('R80-15', '管理员指定口令过短 → 422', async () => {
    const r = await request('PUT', `/api/admin/fzu-accounts/${SID}/password`, { newPassword: '12' }, TOKEN_ADMIN);
    assert(r.status === 422 && r.json.code === 40001, `应 422/40001，实际 ${r.status}/${r.json.code}`);
});

await case_it('R80-16', '学号格式非法（非 9 位数字）→ 422，并提示福大学号口径', async () => {
    // 连续 4 次 SSO 会打满 10 次/10 分钟窗口，先清本动作限流，保证断言看到的是格式校验而非 429
    flush_rate_limit('fzu_sso');
    // 非数字、8 位、10 位、11 位均应被拒（福大学号固定 9 位）
    for (const sid of ['abc123', '10240020', '1024002070', '10240020711']) {
        const r = await request('POST', '/api/auth/fzu/sso', { studentId: sid, password: INITIAL });
        assert(r.status === 422 && r.json.code === 40001, `${sid} 应 422/40001，实际 ${r.status}/${r.json.code}`);
        assert(String(r.json.msg).includes('9 位'), `${sid} 报错应提示「9 位」，实际「${r.json.msg}」`);
    }
});

await case_it('R80-16b', '9 位学号通过格式校验（错误口令只报口令错误，不报格式）', async () => {
    flush_rate_limit('fzu_sso');
    const r = await request('POST', '/api/auth/fzu/sso', { studentId: SID_ALT, password: 'wrongpwd123' });
    assert(r.status === 422 && r.json.code === 40001, `应 422/40001，实际 ${r.status}/${r.json.code}`);
    // 格式已通过才会走到「首次登录口令」分支，报错文案应指初始口令
    assert(String(r.json.msg).includes(INITIAL), `应提示统一初始口令，实际「${r.json.msg}」`);
});

await case_it('R80-17', '解绑后口令记录与本地账号脱钩（user_id 置空，学号仍存在）', async () => {
    flush_rate_limit('fzu_sso');
    const tok = (await post('/api/auth/fzu/sso', { studentId: SID, password: 'AdminSet88' })).token;
    const d = await request('DELETE', '/api/auth/fzu/bind', undefined, tok);
    assert(d.status === 200 && d.json.code === 0, `解绑应成功，实际 ${d.status}`);
    const list = await get(`/api/admin/fzu-accounts?keyword=${SID}`, TOKEN_ADMIN);
    assert(list.list.length === 1 && list.list[0].user_id === null, '解绑后 user_id 应为 null');
    // 解绑只断开关联，口令仍可用（学号本体不消失）
    const re = await post('/api/auth/fzu/sso', { studentId: SID, password: 'AdminSet88' });
    assert(re.user.fzu_uid === SID, '解绑后仍可用统一身份口令登录');
});

await case_it('R80-18', '表结构：fzu_account 存在主键 uid 与唯一键 user_id', async () => {
    const ddl = db_exec(`SHOW CREATE TABLE dafu.fzu_account;`);
    assert(ddl.includes('PRIMARY KEY (`uid`)'), '缺主键 uid');
    assert(ddl.includes('UNIQUE KEY `uk_fzu_user`'), '缺 user_id 唯一键');
    assert(ddl.includes('must_change'), '缺 must_change 标记');
    assert(ddl.includes('bcrypt') || ddl.includes('password'), '缺口令列');
    const n = db_exec(`SELECT COUNT(*) n FROM information_schema.tables WHERE table_schema='dafu' AND table_name='fzu_account';`);
    assert(/1\b/.test(n), '迁移 008 未生效（fzu_account 缺失）');
});

/* ---------- 收尾：清理本次建的账号（幂等） ---------- */
db_exec(`DELETE FROM dafu.fzu_account WHERE uid='${SID}'; DELETE FROM dafu.user WHERE username='${SID}';`);

console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
