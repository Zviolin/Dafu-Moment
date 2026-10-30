/**
 * r72 走查：共建/举报记录回写（15-差距文档 T-30；AC09）
 * 覆盖：提交点位 → 我的记录可见且 audit_status=0 待审 / 举报 → 我的记录可见且 status=open /
 *       重复举报 409 / 未登录 401 / 空账号空列表
 * 运行：node tests/walkthrough-r72-me-records.test.mjs
 * 前置：docker compose 后端在跑且 DEBUG=true（验证码回显）
 * 幂等：测试用户随机命名注册；末尾 IT-08 统一回收临时账号及其提交/举报记录
 */
const BASE = process.env.LB_BASE || 'http://localhost:8095';
import { cleanup_fixtures } from './_fixture-cleanup.mjs';

const USER_A = `it_${Date.now().toString(36)}`;
const USER_B = `it_${Date.now().toString(36)}b`;
const TEST_PWD = 'it123456';
let TOKEN_A = '';
let TOKEN_B = '';
let SUBMIT_ID = 0;
let CANTEEN_ID = 0;

const cases = [];
let pass = 0, fail = 0;

async function case_it(id, desc, fn) {
    try {
        await fn();
        pass++;
        cases.push({ id, desc, ok: true });
        console.log(`  [PASS] ${id} ${desc}`);
    } catch (e) {
        fail++;
        cases.push({ id, desc, ok: false, msg: String(e.message || e) });
        console.log(`  [FAIL] ${id} ${desc} -> ${String(e.message || e).slice(0, 160)}`);
    }
}

async function request(method, path, body, token) {
    const r = await fetch(`${BASE}${path}`, {
        method,
        headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    const j = await r.json();
    return { status: r.status, json: j, data: j.data };
}

async function get(path, token) {
    const { status, json, data } = await request('GET', path, undefined, token);
    if (status !== 200) throw new Error(`HTTP ${status} ${path}`);
    if (json.code !== 0) throw new Error(`code=${json.code} msg=${json.msg} (${path})`);
    return data;
}

async function post(path, body, token) {
    const { status, json, data } = await request('POST', path, body, token);
    if (status !== 200) throw new Error(`HTTP ${status} ${path}`);
    if (json.code !== 0) throw new Error(`code=${json.code} msg=${json.msg} (${path})`);
    return data;
}

function assert(cond, msg) { if (!cond) throw new Error(msg || 'assert failed'); }

async function captcha_body() {
    const d = await get('/api/auth/captcha');
    assert(d.captchaId && d.debugCode, '验证码返回缺 captchaId/debugCode（后端需 DEBUG=true）');
    return { captchaId: d.captchaId, captchaCode: d.debugCode };
}

console.log('=== r72 共建/举报记录回写走查（T-30 / AC09） ===');

await case_it('IT-00', '准备：注册用户 A/B 并登录，取样本点位', async () => {
    await post('/api/auth/register', { username: USER_A, password: TEST_PWD, nickname: '走查甲', ...(await captcha_body()) });
    await post('/api/auth/register', { username: USER_B, password: TEST_PWD, nickname: '走查乙', ...(await captcha_body()) });
    const la = await post('/api/auth/login', { username: USER_A, password: TEST_PWD, ...(await captcha_body()) });
    const lb = await post('/api/auth/login', { username: USER_B, password: TEST_PWD, ...(await captcha_body()) });
    TOKEN_A = la.token;
    TOKEN_B = lb.token;
    const canteens = await get('/api/canteens');
    assert(Array.isArray(canteens) && canteens.length > 0, '点位列表为空（需先跑种子）');
    CANTEEN_ID = canteens[0].id;
});

await case_it('IT-01', '提交新点位 → 200 + id>0', async () => {
    const d = await post('/api/points-submit', { submitType: 0, payload: { name: `走查点位${Date.now().toString(36)}`, type: 0 } }, TOKEN_A);
    assert(d.id > 0, `id 应 >0，实际 ${d.id}`);
    SUBMIT_ID = d.id;
});

await case_it('IT-02', '我的提交记录 → 含该条且 audit_status=0 待审（AC09 回写）', async () => {
    const d = await get('/api/me/point-submits?page=1&size=10', TOKEN_A);
    assert(d.total >= 1, `total 应 >=1，实际 ${d.total}`);
    const row = (d.list || []).find((x) => x.id === SUBMIT_ID);
    assert(row, '记录中未找到刚提交的条目');
    assert(row.audit_status === 0, `audit_status 应为 0 待审，实际 ${row.audit_status}`);
    assert(row.payload && typeof row.payload === 'object' && row.payload.name, 'payload 应解析为对象且含 name');
});

await case_it('IT-03', '提交举报 → 200', async () => {
    await post('/api/reports', { subjectType: 2, subjectId: CANTEEN_ID, reason: 5, detail: 'r72 走查举报' }, TOKEN_A);
});

await case_it('IT-04', '我的举报记录 → 含该条且 status=open（AC09 回写）', async () => {
    const d = await get('/api/me/reports?page=1&size=10', TOKEN_A);
    assert(d.total >= 1, `total 应 >=1，实际 ${d.total}`);
    const row = (d.list || []).find((x) => x.subject_type === 2 && x.subject_id === CANTEEN_ID);
    assert(row, '记录中未找到刚提交的举报');
    assert(row.status === 'open', `status 应为 open，实际 ${row.status}`);
});

await case_it('IT-05', '重复举报同对象 → 409 + 40402（既有防重口径）', async () => {
    const r = await request('POST', '/api/reports', { subjectType: 2, subjectId: CANTEEN_ID, reason: 5 }, TOKEN_A);
    assert(r.status === 409, `应 409，实际 ${r.status}`);
    assert(r.json.code === 40402, `业务码应 40402，实际 ${r.json.code}`);
});

await case_it('IT-06', '未登录查记录 → 401 + 40101', async () => {
    const r1 = await request('GET', '/api/me/point-submits');
    const r2 = await request('GET', '/api/me/reports');
    assert(r1.status === 401 && r1.json.code === 40101, `point-submits 应 401/40101，实际 ${r1.status}/${r1.json.code}`);
    assert(r2.status === 401 && r2.json.code === 40101, `reports 应 401/40101，实际 ${r2.status}/${r2.json.code}`);
});

await case_it('IT-07', '空账号记录 → 分页四键 + total=0 + 空数组', async () => {
    const d1 = await get('/api/me/point-submits?page=1&size=10', TOKEN_B);
    const d2 = await get('/api/me/reports?page=1&size=10', TOKEN_B);
    assert(d1.total === 0 && Array.isArray(d1.list) && d1.list.length === 0, 'point-submits 应为空列表');
    assert(d2.total === 0 && Array.isArray(d2.list) && d2.list.length === 0, 'reports 应为空列表');
});

await case_it('IT-08', '收尾：删除本走查的临时账号及其提交/举报记录', async () => {
    const r = cleanup_fixtures({ prefixes: [], usernames: [USER_A, USER_B] });
    assert(r.users >= 2, `未清理到临时账号：${JSON.stringify(r)}`);
});

console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
// Windows + undici 直接 process.exit 可能撞 libuv 句柄关闭竞态，先让事件循环排空再退出
await new Promise((r) => setTimeout(r, 300));
process.exit(fail ? 1 : 0);
