/**
 * r75 走查：外卖第五类（15-差距文档 AC01；canteen.type 扩值 4）
 * 覆盖：管理端建/改 type=4 点位 / type=5 仍 422 / 列表 ?type=4 过滤 /
 *       维度配置对 type=4 适用（含配送/包装，不含排队/环境）/ 外卖点位菜品评价全链路 /
 *       不适用维度 422 / 点位提交 payload.type=4 放行、type=5 拒
 * 运行：node tests/walkthrough-r75-takeout-type.test.mjs
 * 前置：docker compose 后端在跑且 DEBUG=true；004 迁移已执行；种子含 admin/admin123
 * 幂等：点位/档口/菜品名带随机后缀，末尾 IT-08 统一回收夹具与临时账号
 */
const BASE = process.env.LB_BASE || 'http://localhost:8095';
import { cleanup_fixtures } from './_fixture-cleanup.mjs';

const SUF = Date.now().toString(36);
const USER_A = `it_${SUF}`;
const TEST_PWD = 'it123456';
let TOKEN_A = '';
let TOKEN_ADMIN = '';
let CID = 0;    // 外卖点位 id
let DISH_ID = 0;

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

console.log('=== r75 外卖第五类走查（AC01） ===');

await case_it('IT-00', '准备：注册用户 A + 管理员登录', async () => {
    await post('/api/auth/register', { username: USER_A, password: TEST_PWD, nickname: '走查甲', ...(await captcha_body()) });
    const la = await post('/api/auth/login', { username: USER_A, password: TEST_PWD, ...(await captcha_body()) });
    TOKEN_A = la.token;
    // 管理员口令已轮换，统一由环境变量注入，缺省保留旧演示口令
    const lm = await post('/api/auth/login', { username: 'admin', password: (process.env.DAFU_ADMIN_PASSWORD || 'admin123'), ...(await captcha_body()) });
    TOKEN_ADMIN = lm.token;
});

await case_it('IT-01', '管理端建 type=4 外卖点位 → 200 + id>0', async () => {
    const d = await post('/api/admin/canteens', { name: `r75外卖小站${SUF}`, type: 4, avgPrice: 20 }, TOKEN_ADMIN);
    assert(d.id > 0, `id 应 >0，实际 ${d.id}`);
    CID = d.id;
});

await case_it('IT-02', '点位列表 ?type=4 → 命中新点位；?type=5 → 200 空数组（透传不过滤）', async () => {
    const list4 = await get('/api/canteens?type=4');
    const hit = list4.find((c) => c.id === CID);
    assert(hit, 'type=4 过滤未命中新点位');
    assert(Number(hit.type) === 4, `命中行 type 应为 4，实际 ${hit.type}`);
    const list5 = await get('/api/canteens?type=5');
    assert(Array.isArray(list5) && list5.length === 0, `type=5 应为空数组，实际 ${list5.length} 条`);
});

await case_it('IT-03', '维度配置 ?type=4 → 含口味/份量/价格/配送/包装，不含排队/环境', async () => {
    const dims = await get('/api/dimensions?type=4');
    const keys = dims.map((d) => d.key).sort();
    assert(keys.includes('taste') && keys.includes('portion') && keys.includes('price'), `缺基础三维：${keys}`);
    assert(keys.includes('delivery') && keys.includes('package'), `缺配送/包装：${keys}`);
    assert(!keys.includes('queue') && !keys.includes('env'), `外卖不应含排队/环境：${keys}`);
});

await case_it('IT-04', '外卖点位档口+菜品 → 用户 A 按 5 维分项评价 → 200', async () => {
    const st = await post('/api/admin/stations', { canteenId: CID, name: `r75外卖档口${SUF}`, category: '便当' }, TOKEN_ADMIN);
    assert(st.id > 0, '档口创建失败');
    const di = await post('/api/admin/dishes', { stationId: st.id, name: `r75招牌便当${SUF}`, price: 18 }, TOKEN_ADMIN);
    assert(di.id > 0, '菜品创建失败');
    DISH_ID = di.id;
    const r = await post('/api/reviews', {
        subjectType: 0, subjectId: DISH_ID,
        dimensionScores: { taste: 5, portion: 4, price: 4, delivery: 5, package: 4 },
        content: 'r75 走查：配送很快，包装严实，便当分量足。',
    }, TOKEN_A);
    assert(r, '评价响应为空');
});

await case_it('IT-05', '外卖点位评价带 queue（不适用维度）→ 422 + 40001', async () => {
    const r = await request('POST', '/api/reviews', {
        subjectType: 0, subjectId: DISH_ID,
        dimensionScores: { taste: 5, portion: 4, price: 4, delivery: 5, package: 4, queue: 3 },
        content: 'r75 走查：不适用维度应被拒。',
    }, TOKEN_A);
    assert(r.status === 422, `应 422，实际 ${r.status}`);
    assert(r.json.code === 40001, `业务码应 40001，实际 ${r.json.code}`);
});

await case_it('IT-06', '点位提交 payload.type=4 → 200；type=5 → 422 + 40001', async () => {
    const d = await post('/api/points-submit', { submitType: 0, payload: { name: `r75提交外卖${SUF}`, type: 4 } }, TOKEN_A);
    assert(d.id > 0, `提交 id 应 >0，实际 ${d.id}`);
    const r = await request('POST', '/api/points-submit', { submitType: 0, payload: { name: `r75非法${SUF}`, type: 5 } }, TOKEN_A);
    assert(r.status === 422, `应 422，实际 ${r.status}`);
    assert(r.json.code === 40001, `业务码应 40001，实际 ${r.json.code}`);
});

await case_it('IT-07', '管理端建 type=5 点位 → 422；改型 type=4 合法、type=5 仍 422', async () => {
    const r5 = await request('POST', '/api/admin/canteens', { name: `r75非法点位${SUF}`, type: 5 }, TOKEN_ADMIN);
    assert(r5.status === 422 && r5.json.code === 40001, `建 type=5 应 422/40001，实际 ${r5.status}/${r5.json.code}`);
    const put4 = await request('PUT', `/api/admin/canteens/${CID}`, { name: `r75外卖小站${SUF}`, type: 4 }, TOKEN_ADMIN);
    assert(put4.status === 200 && put4.json.code === 0, `改 type=4 应 200，实际 ${put4.status}/${put4.json.code}`);
    const put5 = await request('PUT', `/api/admin/canteens/${CID}`, { name: `r75外卖小站${SUF}`, type: 5 }, TOKEN_ADMIN);
    assert(put5.status === 422 && put5.json.code === 40001, `改 type=5 应 422/40001，实际 ${put5.status}/${put5.json.code}`);
});

await case_it('IT-08', '收尾：删除本走查建的点位/档口/菜品与临时账号', async () => {
    const r = cleanup_fixtures({ prefixes: ['r75'], usernames: [USER_A] });
    assert(r.canteens >= 1, `未清理到点位：${JSON.stringify(r)}`);
});

console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
// Windows + undici 直接 process.exit 可能撞 libuv 句柄关闭竞态，先让事件循环排空再退出
await new Promise((r) => setTimeout(r, 300));
process.exit(fail ? 1 : 0);
