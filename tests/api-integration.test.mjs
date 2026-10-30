/**
 * 大福食刻 DAFU MOMENT API 集成测试（IT 编号用例，node 直跑无框架）
 * 运行：node tests/api-integration.test.mjs
 * 前置：docker compose up -d --build 且服务健康（API http://localhost:3000 / 前端 http://localhost:8095）
 * v2.0 口径：维度化评分（dimensionScores/overall_score/rating_avg）、点位五类型（含外卖 4）、
 *           AI 助手与自配、点位众包提交；排队与榜单用例已随功能删除
 * 幂等：测试用户随机命名注册，评价用例后自删清理，AI 配置用例后清空密钥
 */
const BASE = process.env.LB_BASE || 'http://localhost:8095';
import { cleanup_fixtures } from './_fixture-cleanup.mjs';

/** 测试账号（随机后缀保证可重复执行） */
const TEST_USER = `it_${Date.now().toString(36)}`;
const TEST_PWD = 'it123456';

// 兜底清理：脚本中途抛错（如管理员登录 422）时，末尾的 IT-CLEAN 用例不会执行，
// 临时账号会残留在库内污染线上数据。此处挂 exit 钩子保证任何退出路径都回收。
process.on('exit', () => {
    try {
        cleanup_fixtures({ prefixes: [], usernames: [TEST_USER] });
    } catch { /* 清理失败不掩盖主流程结果 */ }
});

let USER_TOKEN = '';   // 测试学生 token
let ADMIN_TOKEN = '';  // 种子管理员 token
/** 共享样本（用例间按声明顺序复用） */
let CANTEEN0_ID = 0;   // type=0 校内食堂 id
let DISH_ID = 0;       // 样本菜品 id
let STATION_ID = 0;    // 样本档口 id

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

/**
 * GET 并解包 {code,msg,data}
 */
async function get(path, token) {
    const { status, json, data } = await request('GET', path, undefined, token);
    if (status !== 200) throw new Error(`HTTP ${status} ${path}`);
    if (json.code !== 0) throw new Error(`code=${json.code} msg=${json.msg} (${path})`);
    return data;
}

/**
 * POST 并解包
 */
async function post(path, body, token) {
    const { status, json, data } = await request('POST', path, body, token);
    if (status !== 200) throw new Error(`HTTP ${status} ${path}`);
    if (json.code !== 0) throw new Error(`code=${json.code} msg=${json.msg} (${path})`);
    return data;
}

/**
 * PUT 并解包
 */
async function put(path, body, token) {
    const { status, json, data } = await request('PUT', path, body, token);
    if (status !== 200) throw new Error(`HTTP ${status} ${path}`);
    if (json.code !== 0) throw new Error(`code=${json.code} msg=${json.msg} (${path})`);
    return data;
}

/**
 * DELETE 并解包
 */
async function del(path, token) {
    const { status, json, data } = await request('DELETE', path, undefined, token);
    if (status !== 200) throw new Error(`HTTP ${status} ${path}`);
    if (json.code !== 0) throw new Error(`code=${json.code} msg=${json.msg} (${path})`);
    return data;
}

/**
 * 断言请求以 4xx 业务错误失败（维度适用性/参数校验类负路径）
 */
async function expect_4xx(method, path, body, token) {
    const { status, json } = await request(method, path, body, token);
    if (status >= 500) throw new Error(`意外 5xx: HTTP ${status} ${path}`);
    if (status < 400 && json.code === 0) throw new Error(`应失败但成功: ${path}`);
}

/** 断言工具 */
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assert failed'); }

/**
 * 取图形验证码并返回登录/注册 body 追加字段（后端 DEBUG=true 时回显明文 debugCode）
 */
async function captcha_body() {
    const d = await get('/api/auth/captcha');
    assert(d.captchaId && d.debugCode, '验证码返回缺 captchaId/debugCode（后端需 DEBUG=true）');
    return { captchaId: d.captchaId, captchaCode: d.debugCode };
}

console.log('=== 大福食刻 API 集成测试（v2.0 口径） ===');

/* 幂等准备：注册测试用户 + 管理员登录 + 取共享样本 */
{
    const d = await post('/api/auth/register', { username: TEST_USER, password: TEST_PWD, nickname: '集成测试员', ...(await captcha_body()) });
    USER_TOKEN = d.token;
    const ad = await post('/api/auth/login', { username: 'admin', password: (process.env.DAFU_ADMIN_PASSWORD || 'admin123'), ...(await captcha_body()) });
    ADMIN_TOKEN = ad.token;
    const canteens = await get('/api/canteens');
    const c0 = canteens.find((c) => Number(c.type) === 0);
    if (c0) CANTEEN0_ID = c0.id;
    const dishes = await get('/api/dishes?pageSize=1');
    if (dishes.list.length > 0) { DISH_ID = dishes.list[0].id; STATION_ID = dishes.list[0].station_id; }
}

console.log('[分组] 基础与认证');

await case_it('IT-B1', 'GET /health 健康检查 status=up', async () => {
    const d = await get('/api/health');
    assert(d.status === 'up', `status=${d.status}`);
});

await case_it('IT-B2', 'POST /auth/register 随机测试用户注册成功并返回 token', async () => {
    assert(USER_TOKEN && USER_TOKEN.length > 20, 'token 缺失');
});

await case_it('IT-B3', 'POST /auth/login 学生账号（本次注册）可登录', async () => {
    const d = await post('/api/auth/login', { username: TEST_USER, password: TEST_PWD, ...(await captcha_body()) });
    assert(d.token && d.token.length > 20, 'token 缺失');
    assert(d.user && d.user.nickname, 'user 昵称缺失');
});

await case_it('IT-B4', 'POST /auth/login 种子管理员登录 role=1', async () => {
    const d = await post('/api/auth/login', { username: 'admin', password: (process.env.DAFU_ADMIN_PASSWORD || 'admin123'), ...(await captcha_body()) });
    assert(d.user.role === 1, `role=${d.user.role}`);
});

console.log('[分组] 浏览域回归（v2.0 契约）');

await case_it('IT-R1', 'GET /canteens 点位列表含五类型 type 字段（0-4，含外卖 AC01）', async () => {
    const list = await get('/api/canteens');
    assert(Array.isArray(list) && list.length >= 1, `点位数=${list && list.length}`);
    for (const c of list) {
        assert([0, 1, 2, 3, 4].includes(Number(c.type)), `type 异常: ${c.name} type=${c.type}`);
    }
    assert(list.some((c) => Number(c.type) === 0), '缺校内食堂（type=0）');
});

await case_it('IT-R2', 'GET /dishes 列表带 rating_avg 数字字段（普通平均聚合口径）', async () => {
    const data = await get('/api/dishes?pageSize=5');
    for (const d of data.list) {
        assert(typeof d.rating_avg === 'number' && !Number.isNaN(d.rating_avg), `rating_avg 异常: ${d.name}`);
    }
});

await case_it('IT-R3', 'GET /canteens/:id 详情含 type 与 avg_price 契约字段', async () => {
    assert(CANTEEN0_ID > 0, '无 type=0 点位样本');
    const s = await get(`/api/canteens/${CANTEEN0_ID}`);
    assert([0, 1, 2, 3].includes(Number(s.canteen ? s.canteen.type : s.type)), 'type 字段缺失');
    const avg = s.canteen ? s.canteen.avg_price : s.avg_price;
    assert(avg === null || avg === undefined || Number(avg) >= 0, `avg_price 异常: ${avg}`);
});

await case_it('IT-R4', 'GET /stations/:id 窗口详情聚合完整', async () => {
    assert(STATION_ID > 0, '无档口样本');
    const s = await get(`/api/stations/${STATION_ID}`);
    assert(s.station && s.station.category, 'station.category 缺失');
    assert(Array.isArray(s.dishes) && s.dishes.length > 0, 'dishes 空');
});

await case_it('IT-C1', 'GET /categories 返回品类聚合且含已知品类', async () => {
    const list = await get('/api/categories');
    assert(Array.isArray(list) && list.length >= 1, `品类数=${list && list.length}`);
    for (const it of list) {
        assert(typeof it.count === 'number' && it.count > 0, `count 异常: ${JSON.stringify(it)}`);
    }
});

await case_it('IT-C2', 'GET /dishes?category=热门品类 全部命中该品类', async () => {
    // 品类由真实数据聚合而来（旧硬编码「汉堡简餐」已不在当前菜单），取 /categories 首个真实品类
    const cats = await get('/api/categories');
    const cat = (cats.find((c) => Number(c.count) > 0) || {}).name;
    assert(cat, '无可用真实品类');
    const data = await get('/api/dishes?category=' + encodeURIComponent(cat) + '&pageSize=50');
    assert(data.total > 0, `category=${cat} total=0`);
    // 品类挂在档口上：按档口列表反查该品类下的合法档口集合，逐条断言不越界
    const st = await get('/api/stations');
    const allowed = new Set(st.filter((s) => String(s.category) === cat).map((s) => Number(s.id)));
    assert(allowed.size > 0, `档口列表未找到品类「${cat}」`);
    for (const d of data.list) {
        assert(allowed.has(Number(d.station_id)), `越界: ${d.name} station_id=${d.station_id}`);
    }
});

await case_it('IT-C3', 'GET /dishes?category=不存在品类 返回空列表', async () => {
    const data = await get('/api/dishes?category=' + encodeURIComponent('不存在的品类'));
    assert(data.total === 0 && data.list.length === 0, `total=${data.total}`);
});

await case_it('IT-C4', 'GET /dishes?canteenId 组合筛选全部命中该点位', async () => {
    assert(CANTEEN0_ID > 0, '无 type=0 点位样本');
    const data = await get(`/api/dishes?canteenId=${CANTEEN0_ID}&pageSize=50`);
    for (const d of data.list) {
        assert(d.canteen_id === CANTEEN0_ID, `canteen_id 不符: ${d.canteen_id}`);
    }
});

await case_it('IT-C5', '不带筛选时默认分页正常（回归）', async () => {
    const data = await get('/api/dishes?pageSize=12');
    assert(data.list.length > 0 && data.list.length <= 12, `list=${data.list.length}`);
});

console.log('[分组] 搜索与推荐');

await case_it('IT-S1', 'GET /search 返回点位/档口/菜品三分组结构', async () => {
    const d = await get('/api/search?q=' + encodeURIComponent('鸡'));
    // 设计文档 §5.3 口径：三分组键为 points/stations/dishes
    for (const key of ['points', 'stations', 'dishes']) {
        assert(Array.isArray(d[key]), `缺 ${key} 分组`);
    }
    assert(d.dishes.length + d.stations.length + d.points.length > 0, '三分组全为空');
});

await case_it('IT-S2', 'GET /recommendations 返回 top 与 forYou 两块', async () => {
    const d = await get('/api/recommendations');
    assert(Array.isArray(d.top), 'top 缺失');
    assert(Array.isArray(d.forYou), 'forYou 缺失');
    assert(d.top.length > 0, 'top 为空');
});

console.log('[分组] 维度与评价（v2.0 动态维度）');

await case_it('IT-D1', 'GET /dimensions?type=0 校内食堂适用维度含口味', async () => {
    const dims = await get('/api/dimensions?type=0');
    assert(Array.isArray(dims) && dims.length >= 2, `维度数=${dims && dims.length}`);
    const keys = dims.map((d) => d.key);
    assert(keys.includes('taste'), '缺 taste 维度');
    for (const d of dims) {
        assert(typeof d.weight === 'number' && d.weight > 0, `weight 异常: ${d.key}`);
    }
});

await case_it('IT-D2', '维度适用性校验：校内食堂对象提交 delivery 维度应 4xx 失败', async () => {
    assert(CANTEEN0_ID > 0, '无 type=0 点位样本');
    await expect_4xx('POST', '/api/reviews', {
        subjectType: 2, subjectId: CANTEEN0_ID,
        dimensionScores: { taste: 5, delivery: 5 },
        content: '维度适用性负路径测试',
    }, USER_TOKEN);
});

await case_it('IT-D3', 'POST /reviews 新契约发布（dimensions 全 5 → reviewId/status），响应后自删清理', async () => {
    assert(CANTEEN0_ID > 0, '无 type=0 点位样本');
    const dims = await get('/api/dimensions?type=0');
    const dimensionScores = {};
    for (const d of dims) dimensionScores[d.key] = 5;
    const d = await post('/api/reviews', {
        subjectType: 2, subjectId: CANTEEN0_ID, dimensionScores,
        content: '集成测试评价：窗口干净，打菜阿姨手不抖。', isAnonymous: false, tags: ['测试'],
    }, USER_TOKEN);
    assert(Number(d.reviewId) > 0, `reviewId=${d.reviewId}`);
    assert([0, 1, 2, 3].includes(Number(d.status)), `status=${d.status}`);
    assert(Number(d.status) === 0, `干净文本应直接发布，实际 status=${d.status}（${d.reason || ''}）`);
    // 评价列表响应契约：rating_avg 而非 score_wr
    const list = await get(`/api/reviews?subjectType=2&subjectId=${CANTEEN0_ID}`);
    assert(Array.isArray(list.list) && list.list.length > 0, '评价列表为空');
    for (const r of list.list) {
        if (r.score_wr !== undefined) throw new Error('响应仍含旧口径 score_wr');
        assert(r.rating_avg === undefined || typeof r.rating_avg === 'number', `rating_avg 异常: ${JSON.stringify(r.rating_avg)}`);
    }
    // 幂等清理：自删
    await del(`/api/reviews/${d.reviewId}`, USER_TOKEN);
});

console.log('[分组] 用户域（收藏 / 投票 / 通知 / 举报）');

await case_it('IT-U1', 'POST /favorites 想吃收藏 + GET /me/favorites 回显', async () => {
    assert(CANTEEN0_ID > 0, '无点位样本');
    const d = await post('/api/favorites', { subjectType: 2, subjectId: CANTEEN0_ID, listType: 0 }, USER_TOKEN);
    assert(Number(d.listType) === 0, `listType=${d.listType}`);
    const mine = await get('/api/me/favorites', USER_TOKEN);
    assert(Array.isArray(mine) && mine.some((f) => Number(f.subject_type) === 2 && Number(f.subject_id) === CANTEEN0_ID),
        '收藏未回显');
});

await case_it('IT-U2', 'POST /reviews/:id/vote 有用投票', async () => {
    assert(DISH_ID > 0, '无菜品样本');
    const list = await get(`/api/reviews?subjectType=0&subjectId=${DISH_ID}`);
    const visible = (list.list || []).find((r) => Number(r.status) === 0);
    assert(visible, '无已发布评价样本');
    await post(`/api/reviews/${visible.id}/vote`, { value: 1 }, USER_TOKEN);
});

await case_it('IT-U3', 'GET /notifications 通知列表', async () => {
    // 契约：{ list: Array, unread: number }（App.vue 通知面板按 data.list 渲染）
    const d = await get('/api/notifications', USER_TOKEN);
    assert(Array.isArray(d.list), '通知 list 非数组');
    assert(typeof d.unread === 'number', 'unread 非数值');
});

await case_it('IT-U4', 'POST /reports 提交举报', async () => {
    assert(DISH_ID > 0, '无菜品样本');
    await post('/api/reports', { subjectType: 0, subjectId: DISH_ID, reason: 1, detail: '集成测试举报' }, USER_TOKEN);
});

console.log('[分组] AI 助手与自配');

await case_it('IT-A1', 'POST /ai/models 新增 + GET 回显（掩码/选中）+ DELETE 清理（r46 模型列表口径）', async () => {
    // 幂等清理：先删本用例历史残留
    const pre = await get('/api/ai/models', USER_TOKEN);
    for (const m of (pre.list || [])) {
        if (m.modelId === 'it-test-model') await del(`/api/ai/models/${m.id}`, USER_TOKEN);
    }
    const created = await post('/api/ai/models', {
        provider: 'openai', protocol: 'openai', baseUrl: 'https://api.example.com/v1',
        modelId: 'it-test-model', displayName: '集成测试', apiKey: 'sk-test-1234567890abcdef',
    }, USER_TOKEN);
    assert(created.id > 0, `新增失败: ${JSON.stringify(created)}`);
    const back = await get('/api/ai/models', USER_TOKEN);
    const row = (back.list || []).find((m) => m.id === created.id);
    assert(row, '列表缺新增行');
    assert(row.apiKeyMasked.includes('****') && !row.apiKeyMasked.includes('1234567890'), `掩码异常: ${row.apiKeyMasked}`);
    assert(row.isSelected === true, '首个配置应自动选中');
    // 幂等清理：删除测试配置
    await del(`/api/ai/models/${created.id}`, USER_TOKEN);
    const after = await get('/api/ai/models', USER_TOKEN);
    assert(!(after.list || []).some((m) => m.id === created.id), '删除失败');
});

await case_it('IT-A2', 'POST /ai/ask 未配置密钥走降级规则推荐（degraded=true 且有推荐/回答）', async () => {
    const d = await post('/api/ai/ask', { question: '推荐一个 10 元以内的麻辣烫' }, USER_TOKEN);
    assert(d.degraded === true, `degraded=${d.degraded}（平台 env 若配置了 LLM 则不降级）`);
    assert((d.answer && d.answer.length > 0) || (Array.isArray(d.recommendations) && d.recommendations.length > 0),
        'answer 与 recommendations 均为空');
});

console.log('[分组] 点位众包提交');

await case_it('IT-P1', 'POST /points-submit 提交 → admin 列表可见 → 驳回闭环', async () => {
    assert(STATION_ID > 0, '无档口样本');
    const name = `测试菜品${Date.now().toString(36)}`;
    await post('/api/points-submit', {
        submitType: 2, targetId: STATION_ID,
        payload: { name, price: 9.9, tasteTags: ['偏辣'], tabooTags: [] },
    }, USER_TOKEN);
    // admin 待审列表可见
    const pending = await get('/api/admin/point-submits?status=0', ADMIN_TOKEN);
    const rows = Array.isArray(pending) ? pending : (pending.list || []);
    const mine = rows.find((r) => JSON.stringify(r.payload || {}).includes(name));
    assert(mine, 'admin 待审列表未见本次提交');
    assert(Number(mine.submit_type) === 2, `submit_type=${mine.submit_type}`);
    // 驳回（意见必填）→ 闭环：待审列表不再出现
    await post(`/api/admin/point-submits/${mine.id}/reject`, { comment: '集成测试驳回' }, ADMIN_TOKEN);
    const after = await get('/api/admin/point-submits?status=0', ADMIN_TOKEN);
    const afterRows = Array.isArray(after) ? after : (after.list || []);
    assert(!afterRows.some((r) => r.id === mine.id), '驳回后仍在待审列表');
});

console.log('[分组] 管理端');

await case_it('IT-M1', 'GET /admin/audit/pending 待人工队列结构（list/total）', async () => {
    const d = await get('/api/admin/audit/pending?page=1', ADMIN_TOKEN);
    assert(Array.isArray(d.list), 'list 非数组');
    assert(typeof d.total === 'number', 'total 非数字');
});

await case_it('IT-M2', '机审 2 级敏感词转人工 → admin 处置驳回闭环（pass/fold/ban）', async () => {
    assert(CANTEEN0_ID > 0, '无 type=0 点位样本');
    const dims = await get('/api/dimensions?type=0');
    const dimensionScores = {};
    for (const d of dims) dimensionScores[d.key] = 3;
    // 含 2 级词「垃圾窗口」→ 应转人工（status=1）而非直接发布
    const d = await post('/api/reviews', {
        subjectType: 2, subjectId: CANTEEN0_ID, dimensionScores,
        content: '这家窗口真是垃圾窗口，态度差。', isAnonymous: false, tags: [],
    }, USER_TOKEN);
    assert(Number(d.status) === 1, `敏感词应转人工，实际 status=${d.status}`);
    // 待人工队列可见
    const pending = await get('/api/admin/audit/pending?page=1', ADMIN_TOKEN);
    const row = pending.list.find((r) => Number(r.id) === Number(d.reviewId));
    assert(row, '待人工队列未见该评价');
    assert(row.overall_score !== undefined && row.dimension_scores !== undefined, '队列行缺 overall_score/dimension_scores');
    // 处置驳回（ban → status 3）
    const res = await post(`/api/admin/audit/${d.reviewId}`, { action: 'ban', reason: '集成测试驳回' }, ADMIN_TOKEN);
    assert(Number(res.status) === 3, `处置后 status=${res.status}`);
});

await case_it('IT-M3', 'GET /admin/dashboard 看板 v2.0 契约（totals 六指标 + 三图表数据）', async () => {
    const d = await get('/api/admin/dashboard', ADMIN_TOKEN);
    const t = d.totals || {};
    for (const k of ['totalReviews', 'pendingReviews', 'openReports', 'pendingSubmits', 'totalUsers', 'totalPoints']) {
        assert(t[k] !== undefined, `totals 缺 ${k}`);
    }
    assert(Array.isArray(d.reviewsDaily), 'reviewsDaily 缺失');
    assert(Array.isArray(d.reportsDaily), 'reportsDaily 缺失');
    assert(Array.isArray(d.ratingDist), 'ratingDist 缺失');
    for (const r of d.ratingDist) {
        assert(r.score !== undefined && r.c !== undefined, `ratingDist 行契约异常: ${JSON.stringify(r)}`);
    }
    assert(Array.isArray(d.auditDaily), 'auditDaily 缺失');
    for (const r of d.auditDaily) {
        assert(r.offline !== undefined && r.rejected !== undefined && r.passed !== undefined,
            `auditDaily 行契约异常: ${JSON.stringify(r)}`);
    }
});

console.log('[分组] r39 文档补齐功能');

await case_it('IT-X1', 'GET /auth/captcha 验证码结构 + 一次性校验', async () => {
    const d = await get('/api/auth/captcha');
    assert(d.captchaId && d.captchaId.length >= 8, 'captchaId 缺失');
    assert(String(d.imageBase64).startsWith('data:image/svg+xml'), 'imageBase64 非 SVG data URI');
    // 用 debugCode 登录成功后该验证码即被删除 → 同码重放必须失败
    const body = { username: TEST_USER, password: TEST_PWD, captchaId: d.captchaId, captchaCode: d.debugCode };
    await post('/api/auth/login', body);
    await expect_4xx('POST', '/api/auth/login', body, undefined);
});

await case_it('IT-X2', 'POST /auth/login 缺验证码被拒', async () => {
    await expect_4xx('POST', '/api/auth/login', { username: TEST_USER, password: TEST_PWD }, undefined);
});

await case_it('IT-X3', 'GET /users/:id/profile 他人个人主页（公开）', async () => {
    const me = await get('/api/auth/me', USER_TOKEN);
    const d = await get(`/api/users/${me.id}/profile`);
    assert(d.user && d.user.nickname, '主页 user 缺失');
    assert(Array.isArray(d.reviews.list) && typeof d.reviews.total === 'number', 'reviews 分页契约异常');
});

await case_it('IT-X4', 'POST /reviews/:id/like 点赞 toggle（likeCount 1↔0）', async () => {
    // 按样本菜品所属点位类型动态取全量适用维度（validate_and_score 要求必填齐+禁填拒，不可硬编码子集）
    const st = await get(`/api/stations/${STATION_ID}`);
    const dims = await get(`/api/dimensions?type=${Number(st.station.canteen_type)}`);
    const dimensionScores = {};
    for (const d of dims) dimensionScores[d.key] = 5;
    const pub = await post('/api/reviews', {
        subjectType: 0, subjectId: DISH_ID,
        dimensionScores,
        content: '集成测试点赞用例：味道不错，分量扎实。', isAnonymous: false, tags: ['测试'], imageKeys: [],
    }, USER_TOKEN);
    const rid = pub.id || pub.reviewId || pub.review?.id;
    assert(rid, `发布响应缺评价 id: ${JSON.stringify(pub).slice(0, 120)}`);
    const first = await post(`/api/reviews/${rid}/like`, {}, ADMIN_TOKEN);
    assert(first.liked === true && Number(first.likeCount) === 1, `首次赞异常: ${JSON.stringify(first)}`);
    const second = await post(`/api/reviews/${rid}/like`, {}, ADMIN_TOKEN);
    assert(second.liked === false && Number(second.likeCount) === 0, `取消赞异常: ${JSON.stringify(second)}`);
    await del(`/api/reviews/${rid}`, USER_TOKEN); // 清理测试数据
});

await case_it('IT-X5', '收藏 status 查询 + 显式 DELETE 取消', async () => {
    const s0 = await get(`/api/favorites/status?targetType=0&targetId=${DISH_ID}`, USER_TOKEN);
    if (s0.favored) await del(`/api/favorites/0/${DISH_ID}`, USER_TOKEN); // 幂等复位
    // 契约：listType 仅 0（想吃），缺省/null 语义为「取消收藏」——加入必须显式带 listType: 0
    const added = await post('/api/favorites', { subjectType: 0, subjectId: DISH_ID, listType: 0 }, USER_TOKEN);
    assert(Number(added.listType) === 0, `加入响应异常: ${JSON.stringify(added)}`);
    const s1 = await get(`/api/favorites/status?targetType=0&targetId=${DISH_ID}`, USER_TOKEN);
    assert(s1.favored === true, '加入后 status 应为 true');
    await del(`/api/favorites/0/${DISH_ID}`, USER_TOKEN);
    const s2 = await get(`/api/favorites/status?targetType=0&targetId=${DISH_ID}`, USER_TOKEN);
    assert(s2.favored === false, '删除后 status 应为 false');
});

await case_it('IT-X6', 'GET /points 文档口径分页 + sort 校验 + /points/map 分组', async () => {
    const p = await get('/api/points?sort=queue');
    assert(Array.isArray(p.list) && typeof p.total === 'number', '/points 分页契约异常');
    await expect_4xx('GET', '/api/points?sort=not_a_dim', undefined, undefined);
    const map = await get('/api/points/map');
    assert(Array.isArray(map) && map.length >= 1, '/points/map 非数组');
    const g = map[0];
    assert(g.area && Array.isArray(g.points) && g.points[0].name !== undefined, `map 分组契约异常: ${JSON.stringify(g).slice(0, 120)}`);
});

await case_it('IT-CLEAN', '收尾：删除本次注册的临时账号及其派生数据', async () => {
    cleanup_fixtures({ prefixes: [], usernames: [TEST_USER] });
});

// 汇总
console.log('---');
console.log(`结果: ${pass} passed, ${fail} failed, 共 ${pass + fail} 例`);
if (fail > 0) process.exit(1);
