/**
 * r77 走查：档口级横向对比（15-差距文档 AC07）
 * 覆盖：未登录可用 / ids 空·非法·超4·仅1个·重复 → 422+40001 / 不存在档口 → 404+40401 /
 *       返回顺序与入参一致 / ratingAvg·reviewCount·dimScores 均分数值正确（两条已知分评价）/
 *       无评价档口 ratingAvg=0 且 dimScores={} / GET /stations 轻量列表含新建档口且字段齐全
 * 运行：node tests/walkthrough-r77-station-compare.test.mjs
 * 前置：docker compose 后端在跑且 DEBUG=true；种子已导入
 * 幂等：点位/档口/用户名带随机后缀，评价只增不改
 */
const BASE = process.env.LB_BASE || 'http://localhost:8095';

const SUF = Date.now().toString(36);
let TOKEN_ADMIN = '';
let CID = 0;                    // 本走查建的点位（type 0 校内食堂 → 维度含 queue）
let STA = 0, STB = 0, STC = 0;  // A/B 造评价，C 保持无评价
let DIMS0 = [];                 // type 0 适用维度 [{key,name,weight}]

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

/** 注册随机账号（只增不改保幂等），返回 token */
async function register_user() {
    const username = `it_${SUF}_${Math.random().toString(36).slice(2, 6)}`;
    const d = await post('/api/auth/register', { username, password: 'test123456', ...(await captcha_body()) });
    return d.token;
}

/** 与后端 dimension.validate_and_score 同口径：加权总分（0.1 精度，clamp 1-5） */
function overall_of(scores) {
    let sw = 0, w = 0;
    for (const d of DIMS0) { sw += scores[d.key] * Number(d.weight); w += Number(d.weight); }
    return Math.min(5, Math.max(1, Number((sw / w).toFixed(1))));
}

/** 按维度配置顺序套打分模式，产出 dimensionScores 对象 */
function scores_of(pattern) {
    const o = {};
    DIMS0.forEach((d, i) => { o[d.key] = pattern[i % pattern.length]; });
    return o;
}

console.log('=== r77 档口级横向对比走查（AC07） ===');

await case_it('IT-00', '准备：管理员建点位（type 0）+ 档口×3；取 type 0 维度配置（应含 queue）', async () => {
    const lm = await post('/api/auth/login', { username: 'admin', password: 'admin123', ...(await captcha_body()) });
    TOKEN_ADMIN = lm.token;
    const c = await post('/api/admin/canteens', { name: `r77点位${SUF}`, type: 0 }, TOKEN_ADMIN);
    CID = c.id;
    const a = await post('/api/admin/stations', { canteenId: CID, name: `r77档口A${SUF}`, category: '便当' }, TOKEN_ADMIN);
    const b = await post('/api/admin/stations', { canteenId: CID, name: `r77档口B${SUF}`, category: '面食' }, TOKEN_ADMIN);
    const t = await post('/api/admin/stations', { canteenId: CID, name: `r77档口C${SUF}`, category: '饮品' }, TOKEN_ADMIN);
    STA = a.id; STB = b.id; STC = t.id;
    assert(STA > 0 && STB > 0 && STC > 0, '建档位失败');
    DIMS0 = await get('/api/dimensions?type=0');
    assert(Array.isArray(DIMS0) && DIMS0.length > 0, 'type 0 维度配置为空');
    assert(DIMS0.some((d) => d.key === 'queue'), '校内食堂（type 0）维度应含 queue 排队');
});

await case_it('IT-01', '未登录 200：返回数组、顺序与入参一致、字段齐全', async () => {
    const rows = await get(`/api/stations/compare?ids=${STA},${STB}`);
    assert(Array.isArray(rows) && rows.length === 2, '应返回 2 行');
    assert(rows[0].id === STA && rows[1].id === STB, '返回顺序应与入参一致');
    for (const r of rows) {
        assert(r.name && r.canteenId === CID && typeof r.canteenName === 'string' && r.canteenName.length > 0, '档口行字段缺失');
        assert(r.canteenType === 0 && typeof r.category === 'string', 'canteenType/category 缺失');
        assert(typeof r.ratingAvg === 'number' && typeof r.reviewCount === 'number', '聚合字段应为数字');
        assert(r.dimScores && typeof r.dimScores === 'object', 'dimScores 应为对象');
    }
    const rev = await get(`/api/stations/compare?ids=${STB},${STA}`);
    assert(rev[0].id === STB && rev[1].id === STA, '逆序入参应逆序返回');
});

await case_it('IT-02', '参数非法：空/缺参/非数字/仅1个/重复/超4个 → 全部 422 + 40001', async () => {
    const bads = ['', 'abc', `${STA}`, `${STA},${STA}`, `${STA},${STB},${STC},1,2`];
    for (const bad of bads) {
        const r = await request('GET', `/api/stations/compare?ids=${encodeURIComponent(bad)}`);
        assert(r.status === 422, `ids="${bad}" 应 422，实际 ${r.status}`);
        assert(r.json.code === 40001, `ids="${bad}" 业务码应 40001，实际 ${r.json.code}`);
    }
    const r = await request('GET', '/api/stations/compare');
    assert(r.status === 422 && r.json.code === 40001, '缺 ids 参应 422 + 40001');
});

await case_it('IT-03', '不存在档口 → 404 + 40401', async () => {
    const r = await request('GET', `/api/stations/compare?ids=${STA},99999999`);
    assert(r.status === 404, `应 404，实际 ${r.status}`);
    assert(r.json.code === 40401, `业务码应 40401，实际 ${r.json.code}`);
});

await case_it('IT-04', '无评价档口口径：ratingAvg=0、reviewCount=0、dimScores 为空对象', async () => {
    const rows = await get(`/api/stations/compare?ids=${STA},${STC}`);
    const c = rows.find((x) => x.id === STC);
    assert(c, '应含档口 C 行');
    assert(c.ratingAvg === 0 && c.reviewCount === 0, `无评价档口聚合应为 0，实际 ${c.ratingAvg}/${c.reviewCount}`);
    assert(Object.keys(c.dimScores).length === 0, '无评价档口 dimScores 应为空对象');
});

await case_it('IT-05', '数值正确性：两条已知分评价 → ratingAvg / reviewCount / 各维度均分精确匹配', async () => {
    const t1 = await register_user();
    const t2 = await register_user();
    const S1 = scores_of([5, 4, 3, 2, 5]);
    const S2 = scores_of([3, 2, 4, 4, 1]);
    const S3 = scores_of([4, 4, 4, 4, 4]);
    const r1 = await post('/api/reviews', { subjectType: 1, subjectId: STA, dimensionScores: S1, content: 'r77 走查评价甲：口味不错', isAnonymous: false, tags: [], imageKeys: [] }, t1);
    const r2 = await post('/api/reviews', { subjectType: 1, subjectId: STA, dimensionScores: S2, content: 'r77 走查评价乙：份量一般', isAnonymous: false, tags: [], imageKeys: [] }, t2);
    const r3 = await post('/api/reviews', { subjectType: 1, subjectId: STB, dimensionScores: S3, content: 'r77 走查评价丙：整体可以', isAnonymous: false, tags: [], imageKeys: [] }, t1);
    assert(r1.status === 0 && r2.status === 0 && r3.status === 0, '走查评价应直接发布（DFA 无命中）');

    const rows = await get(`/api/stations/compare?ids=${STA},${STB}`);
    const [a, b] = rows;
    assert(a.reviewCount === 2, `A 评价数应 2，实际 ${a.reviewCount}`);
    assert(b.reviewCount === 1, `B 评价数应 1，实际 ${b.reviewCount}`);
    const expAvgA = Number(((overall_of(S1) + overall_of(S2)) / 2).toFixed(2));
    assert(Math.abs(a.ratingAvg - expAvgA) < 1e-9, `A ratingAvg 应 ${expAvgA}，实际 ${a.ratingAvg}`);
    const expAvgB = overall_of(S3);
    assert(Math.abs(b.ratingAvg - expAvgB) < 1e-9, `B ratingAvg 应 ${expAvgB}，实际 ${b.ratingAvg}`);
    // 各维度分项均分 = dim_sums[k]/review_count（两位小数）
    for (const d of DIMS0) {
        const expA = Number(((S1[d.key] + S2[d.key]) / 2).toFixed(2));
        assert(Math.abs(a.dimScores[d.key] - expA) < 1e-9, `A 维度 ${d.key} 应 ${expA}，实际 ${a.dimScores[d.key]}`);
        assert(Math.abs(b.dimScores[d.key] - S3[d.key]) < 1e-9, `B 维度 ${d.key} 应 ${S3[d.key]}，实际 ${b.dimScores[d.key]}`);
    }
    assert(a.dimScores.queue !== undefined, '校内档口 dimScores 应含 queue 排队分项');
});

await case_it('IT-06', 'GET /stations 轻量列表：含新建档口且字段齐全、聚合分同步', async () => {
    const list = await get('/api/stations');
    assert(Array.isArray(list) && list.length > 0, '档口列表为空');
    const a = list.find((x) => x.id === STA);
    assert(a, '列表应含新建档口 A');
    assert(a.canteenId === CID && typeof a.canteenName === 'string' && a.canteenName.length > 0, '所属点位字段缺失');
    assert(a.category === '便当' && a.status === 0, 'category/status 不符');
    assert(a.reviewCount === 2 && typeof a.ratingAvg === 'number' && a.ratingAvg > 0, '聚合分未同步');
});

console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
// Windows + undici 直接 process.exit 可能撞 libuv 句柄关闭竞态，先让事件循环排空再退出
await new Promise((r) => setTimeout(r, 300));
process.exit(fail ? 1 : 0);
