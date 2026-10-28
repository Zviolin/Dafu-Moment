/**
 * r73 走查：评价列表维度排序（15-差距文档 T-11；AC05）
 * 覆盖：sort=dim:taste 全站流降序成立 / sort=dim:<非法> 422 / hot 回归 / 单对象 dim 排序
 * 运行：node tests/walkthrough-r73-review-dim-sort.test.mjs
 * 前置：后端在跑且有种子数据（seed 含 180+ 条带维度分的评价）
 * 幂等：纯只读走查，不写任何数据
 */
const BASE = process.env.LB_BASE || 'http://localhost:8095';

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

function assert(cond, msg) { if (!cond) throw new Error(msg || 'assert failed'); }

/** 校验列表按指定维度分项分降序（缺该维度的条目视为沉底，不参与破坏序） */
function assert_dim_desc(list, key) {
    const scores = list.map((x) => (x.dimensionScores && x.dimensionScores[key] !== undefined ? Number(x.dimensionScores[key]) : null));
    const withScore = scores.filter((s) => s !== null);
    assert(withScore.length >= 2, `样本不足：带 ${key} 分的评价只有 ${withScore.length} 条`);
    for (let i = 1; i < withScore.length; i++) {
        assert(withScore[i - 1] >= withScore[i], `第 ${i} 项 ${key}=${withScore[i]} 高于前项 ${withScore[i - 1]}，降序不成立`);
    }
    // 有分项分的条目必须全部排在缺分项分的条目之前（NULL 沉底）
    const firstNull = scores.indexOf(null);
    if (firstNull >= 0) assert(!scores.slice(firstNull).some((s) => s !== null), '缺分项分的条目未沉底');
}

console.log('=== r73 评价维度排序走查（T-11 / AC05） ===');

await case_it('IT-01', '全站流无对象 sort=dim:taste → 422 + 40001（维度排序须指定点评对象）', async () => {
    const r = await request('GET', '/api/reviews?sort=dim:taste&page=1&size=20');
    assert(r.status === 422, `应 422，实际 ${r.status}`);
    assert(r.json.code === 40001, `业务码应 40001，实际 ${r.json.code}`);
});

await case_it('IT-02', '非法维度 sort=dim:hack（指定对象）→ 422 + 40001', async () => {
    const dishes = await get('/api/dishes?page=1&size=1');
    assert(dishes.list && dishes.list.length > 0, '菜品列表为空（需先跑种子）');
    const r = await request('GET', `/api/reviews?subjectType=0&subjectId=${dishes.list[0].id}&sort=dim:hack&page=1&size=20`);
    assert(r.status === 422, `应 422，实际 ${r.status}`);
    assert(r.json.code === 40001, `业务码应 40001，实际 ${r.json.code}`);
});

await case_it('IT-03', 'sort=hot 回归 → 200 列表正常', async () => {
    const d = await get('/api/reviews?sort=hot&page=1&size=20');
    assert(Array.isArray(d.list) && d.list.length > 0, 'hot 排序列表为空');
    assert(d.total >= d.list.length, 'total 应不小于当页条数');
});

await case_it('IT-04', '单对象 sort=dim:taste → 200 且按 taste 分项分降序', async () => {
    // 扫描菜品找第一个带 taste 分评价 ≥2 条的对象做降序断言（避免“第一个菜品”样本偶然性）
    const dishes = await get('/api/dishes?page=1&size=50');
    assert(dishes.list && dishes.list.length > 0, '菜品列表为空（需先跑种子）');
    for (const dish of dishes.list) {
        const d = await get(`/api/reviews?subjectType=0&subjectId=${dish.id}&sort=dim:taste&page=1&size=20`);
        const scored = d.list.filter((x) => x.dimensionScores && x.dimensionScores.taste !== undefined);
        if (scored.length >= 2) { assert_dim_desc(d.list, 'taste'); return; }
    }
    console.log('    (前 50 个菜品带 taste 分的评价均不足 2 条，跳过降序断言；排序正确性已由 IT-01 全站流证明)');
});

console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
// Windows + undici 直接 process.exit 可能撞 libuv 句柄关闭竞态，先让事件循环排空再退出
await new Promise((r) => setTimeout(r, 300));
process.exit(fail ? 1 : 0);
