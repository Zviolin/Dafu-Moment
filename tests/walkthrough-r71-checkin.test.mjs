/**
 * r71 走查：打卡接口落地（15-差距文档 T-01；03 §5.9；AC10/AC11/AC12）
 * 覆盖：正常打卡 / 缺参 422 / 未登录 401 / 重复 409+checkinId（AC10）/ 另记一条合并（AC11）/
 *       列表 / 日历 / 统计口径（AC12）/ 越权删除 403 / 不存在 404 / 删除后当天可再打卡
 * 运行：node tests/walkthrough-r71-checkin.test.mjs
 * 前置：docker compose up -d --build 且服务健康（API http://localhost:8095，后端 DEBUG=true 回显验证码）
 * 幂等：两个测试用户随机命名注册；产生的打卡记录在走查末尾全部删除
 */
const BASE = process.env.LB_BASE || 'http://localhost:8095';

/** 测试账号（随机后缀保证可重复执行） */
const USER_A = `it_${Date.now().toString(36)}`;
const USER_B = `it_${Date.now().toString(36)}b`;
const TEST_PWD = 'it123456';
let TOKEN_A = '';
let TOKEN_B = '';
let CANTEEN_ID = 0;  // 样本点位 id
let DISH_ID = 0;     // 样本菜品 id
let CHECKIN_ID = 0;  // 首次打卡记录 id
let LAST_ID = 0;     // 末尾待清理的记录 id

/** 计数器与用例登记 */
const cases = [];
let pass = 0, fail = 0;

/**
 * 登记一个用例
 * @param {string} id - 用例编号 IT-xx
 * @param {string} desc
 * @param {Function} fn - 断言体，throw 即失败
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
        console.log(`  [FAIL] ${id} ${desc} -> ${String(e.message || e).slice(0, 160)}`);
    }
}

/**
 * 原始请求（返回 HTTP 状态与解包体，供 4xx 断言）
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

/** GET 并解包 {code,msg,data} */
async function get(path, token) {
    const { status, json, data } = await request('GET', path, undefined, token);
    if (status !== 200) throw new Error(`HTTP ${status} ${path}`);
    if (json.code !== 0) throw new Error(`code=${json.code} msg=${json.msg} (${path})`);
    return data;
}

/** POST 并解包 */
async function post(path, body, token) {
    const { status, json, data } = await request('POST', path, body, token);
    if (status !== 200) throw new Error(`HTTP ${status} ${path}`);
    if (json.code !== 0) throw new Error(`code=${json.code} msg=${json.msg} (${path})`);
    return data;
}

/** DELETE 并解包 */
async function del(path, token) {
    const { status, json, data } = await request('DELETE', path, undefined, token);
    if (status !== 200) throw new Error(`HTTP ${status} ${path}`);
    if (json.code !== 0) throw new Error(`code=${json.code} msg=${json.msg} (${path})`);
    return data;
}

/** 断言工具 */
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assert failed'); }

/** 今日日期串（+08:00，YYYY-MM-DD，与服务端 today_str 同口径） */
function today_str() {
    return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

/**
 * 取图形验证码并返回登录/注册 body 追加字段（后端 DEBUG=true 时回显明文 debugCode）
 */
async function captcha_body() {
    const d = await get('/api/auth/captcha');
    assert(d.captchaId && d.debugCode, '验证码返回缺 captchaId/debugCode（后端需 DEBUG=true）');
    return { captchaId: d.captchaId, captchaCode: d.debugCode };
}

console.log('=== r71 打卡接口走查（T-01 / AC10/AC11/AC12） ===');

/* 幂等准备：注册两个测试用户 + 取样本点位与菜品 */
await case_it('IT-00a', '准备：注册用户 A/B 并登录', async () => {
    await post('/api/auth/register', { username: USER_A, password: TEST_PWD, nickname: '走查甲', ...(await captcha_body()) });
    await post('/api/auth/register', { username: USER_B, password: TEST_PWD, nickname: '走查乙', ...(await captcha_body()) });
    const la = await post('/api/auth/login', { username: USER_A, password: TEST_PWD, ...(await captcha_body()) });
    const lb = await post('/api/auth/login', { username: USER_B, password: TEST_PWD, ...(await captcha_body()) });
    assert(la.token && lb.token, '登录未返回 token');
    TOKEN_A = la.token;
    TOKEN_B = lb.token;
});

await case_it('IT-00b', '准备：取样本点位与菜品', async () => {
    const canteens = await get('/api/canteens');
    assert(Array.isArray(canteens) && canteens.length > 0, '点位列表为空（需先跑种子）');
    CANTEEN_ID = canteens[0].id;
    const dishes = await get(`/api/dishes?page=1&size=1`);
    DISH_ID = dishes.list && dishes.list.length ? dishes.list[0].id : 0;
});

await case_it('IT-01', '正常打卡 → 200 + checkinId>0 + checkinDate 为今天', async () => {
    const d = await post('/api/checkin', { canteenId: CANTEEN_ID, note: '走查打卡', dishIds: DISH_ID ? [DISH_ID] : [] }, TOKEN_A);
    assert(d.checkinId > 0, `checkinId 应 >0，实际 ${d.checkinId}`);
    assert(d.checkinDate === today_str(), `checkinDate 应为今天 ${today_str()}，实际 ${d.checkinDate}`);
    CHECKIN_ID = d.checkinId;
});

await case_it('IT-02', '缺 canteenId → 422 + 40001', async () => {
    const r = await request('POST', '/api/checkin', { note: '缺参' }, TOKEN_A);
    assert(r.status === 422, `应 422，实际 ${r.status}`);
    assert(r.json.code === 40001, `业务码应 40001，实际 ${r.json.code}`);
});

await case_it('IT-03', '未登录打卡 → 401 + 40101', async () => {
    const r = await request('POST', '/api/checkin', { canteenId: CANTEEN_ID });
    assert(r.status === 401, `应 401，实际 ${r.status}`);
    assert(r.json.code === 40101, `业务码应 40101，实际 ${r.json.code}`);
});

await case_it('IT-04', '重复打卡 → 409 + 40402 + data.checkinId 等于首次记录（AC10）', async () => {
    const r = await request('POST', '/api/checkin', { canteenId: CANTEEN_ID }, TOKEN_A);
    assert(r.status === 409, `应 409，实际 ${r.status}`);
    assert(r.json.code === 40402, `业务码应 40402，实际 ${r.json.code}`);
    assert(r.data && r.data.checkinId === CHECKIN_ID, `data.checkinId 应为 ${CHECKIN_ID}，实际 ${r.data && r.data.checkinId}`);
});

await case_it('IT-05', '另记一条 again:true → 200 + dishIds 合并不新建（AC11）', async () => {
    const d = await post('/api/checkin', { canteenId: CANTEEN_ID, again: true, dishIds: [DISH_ID ? DISH_ID + 1 : 999], note: '补记' }, TOKEN_A);
    assert(d.checkinId === CHECKIN_ID, `应并入既有记录 ${CHECKIN_ID}，实际 ${d.checkinId}`);
    const expect_dish = DISH_ID ? DISH_ID + 1 : 999;
    assert(Array.isArray(d.dishIds) && d.dishIds.includes(expect_dish), `dishIds 应含 ${expect_dish}，实际 ${JSON.stringify(d.dishIds)}`);
    if (DISH_ID) assert(d.dishIds.includes(DISH_ID), `dishIds 应保留首次的 ${DISH_ID}，实际 ${JSON.stringify(d.dishIds)}`);
});

await case_it('IT-06', '打卡列表 → 分页四键 + 首条为今天', async () => {
    const d = await get('/api/checkin?page=1&size=10', TOKEN_A);
    assert(d.total >= 1, `total 应 >=1，实际 ${d.total}`);
    assert(d.page === 1 && d.size === 10, '分页键 page/size 回显不对');
    assert(d.list[0].checkinDate === today_str(), `首条 checkinDate 应为今天，实际 ${d.list[0].checkinDate}`);
    assert(typeof d.list[0].canteenName === 'string' && d.list[0].canteenName.length > 0, '缺少 canteenName');
});

await case_it('IT-07', '打卡日历 → 当月 days 含今天且 count>=1（AC12）', async () => {
    const d = await get(`/api/checkin/calendar?month=${today_str().slice(0, 7)}`, TOKEN_A);
    const day = (d.days || []).find((x) => x.checkinDate === today_str());
    assert(day, 'days 中未找到今天');
    assert(day.count >= 1, `今天 count 应 >=1，实际 ${day.count}`);
    assert(Array.isArray(day.dishIds), 'dishIds 应为数组');
});

await case_it('IT-08', '打卡统计 → 四项为数字且与事实一致（AC12）', async () => {
    const d = await get('/api/checkin/stats', TOKEN_A);
    for (const k of ['totalDays', 'monthDays', 'continuousDays', 'monthCanteens']) {
        assert(typeof d[k] === 'number', `${k} 应为数字，实际 ${typeof d[k]}`);
    }
    assert(d.totalDays >= 1 && d.monthDays >= 1, `累计/本月应 >=1，实际 ${d.totalDays}/${d.monthDays}`);
    assert(d.continuousDays >= 1, `今天已打卡连续天数应 >=1，实际 ${d.continuousDays}`);
    assert(d.monthCanteens >= 1, `本月点位数应 >=1，实际 ${d.monthCanteens}`);
});

await case_it('IT-08b', '空账号统计 → 全 0 而非 null（AC12 口径）', async () => {
    const d = await get('/api/checkin/stats', TOKEN_B);
    assert(d.totalDays === 0 && d.monthDays === 0 && d.continuousDays === 0 && d.monthCanteens === 0,
        `空账号应全 0，实际 ${JSON.stringify(d)}`);
});

await case_it('IT-09', '越权删除他人打卡 → 403 + 40301', async () => {
    const r = await request('DELETE', `/api/checkin/${CHECKIN_ID}`, undefined, TOKEN_B);
    assert(r.status === 403, `应 403，实际 ${r.status}`);
    assert(r.json.code === 40301, `业务码应 40301，实际 ${r.json.code}`);
});

await case_it('IT-10', '删除不存在的记录 → 404 + 40401', async () => {
    const r = await request('DELETE', '/api/checkin/99999999', undefined, TOKEN_A);
    assert(r.status === 404, `应 404，实际 ${r.status}`);
    assert(r.json.code === 40401, `业务码应 40401，实际 ${r.json.code}`);
});

await case_it('IT-11', '删除本人打卡 → 200，当天同点位可再打卡（物理删口径）', async () => {
    const d = await del(`/api/checkin/${CHECKIN_ID}`, TOKEN_A);
    assert(d.deleted === true, '应返回 deleted:true');
    const again = await post('/api/checkin', { canteenId: CANTEEN_ID, note: '删后再打' }, TOKEN_A);
    assert(again.checkinId > 0 && again.checkinId !== CHECKIN_ID, '删后应能再打卡且为新记录');
    LAST_ID = again.checkinId;
});

await case_it('IT-12', '不存在的 canteenId 打卡 → 404 + 40401', async () => {
    const r = await request('POST', '/api/checkin', { canteenId: 99999999 }, TOKEN_A);
    assert(r.status === 404, `应 404，实际 ${r.status}`);
    assert(r.json.code === 40401, `业务码应 40401，实际 ${r.json.code}`);
});

/* 自清理：删掉走查残留的打卡记录 */
if (LAST_ID) {
    try { await del(`/api/checkin/${LAST_ID}`, TOKEN_A); } catch { /* 清理失败不影响结果 */ }
}

console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
