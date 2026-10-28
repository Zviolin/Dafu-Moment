/**
 * r74 走查：收藏分组（15-差距文档 T-09；AC06）
 * 覆盖：分组 CRUD（重名 409 / 空名与内置名 422 / 越权 404）/ listType 0·1·2 收藏与撞键改组 /
 *       groupId 过滤与 group_name 回显 / 缺 groupId 422 / 他人分组 403 / fav_count /
 *       删组后组内收藏回落「想吃」/ 未登录 401
 * 运行：node tests/walkthrough-r74-favorite-groups.test.mjs
 * 前置：docker compose 后端在跑且 DEBUG=true（验证码回显）；003 迁移已执行（favorite_group 表 + favorite.group_id）
 * 幂等：测试用户随机命名注册；分组/收藏只增不改（删组用例只清自己的数据，属预期留痕）
 */
const BASE = process.env.LB_BASE || 'http://localhost:8095';

const USER_A = `it_${Date.now().toString(36)}`;
const USER_B = `it_${Date.now().toString(36)}b`;
const TEST_PWD = 'it123456';
let TOKEN_A = '';
let TOKEN_B = '';
let G1 = 0;   // A 的分组「深夜食堂」
let GB = 0;   // B 的分组（越权用例用）
let C1 = 0, C2 = 0, C3 = 0; // 三个样本点位

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

console.log('=== r74 收藏分组走查（T-09 / AC06） ===');

await case_it('IT-00', '准备：注册用户 A/B 并登录，取三个样本点位', async () => {
    await post('/api/auth/register', { username: USER_A, password: TEST_PWD, nickname: '走查甲', ...(await captcha_body()) });
    await post('/api/auth/register', { username: USER_B, password: TEST_PWD, nickname: '走查乙', ...(await captcha_body()) });
    const la = await post('/api/auth/login', { username: USER_A, password: TEST_PWD, ...(await captcha_body()) });
    const lb = await post('/api/auth/login', { username: USER_B, password: TEST_PWD, ...(await captcha_body()) });
    TOKEN_A = la.token;
    TOKEN_B = lb.token;
    const canteens = await get('/api/canteens');
    assert(Array.isArray(canteens) && canteens.length >= 3, '点位不足 3 个（需先跑种子）');
    [C1, C2, C3] = canteens.slice(0, 3).map((c) => c.id);
});

await case_it('IT-01', 'A 创建分组「深夜食堂」→ 200 + id>0', async () => {
    const d = await post('/api/me/favorite-groups', { name: '深夜食堂' }, TOKEN_A);
    assert(d.id > 0, `id 应 >0，实际 ${d.id}`);
    assert(d.groupName === '深夜食堂', `groupName 回显不符：${d.groupName}`);
    G1 = d.id;
});

await case_it('IT-02', '重名创建 → 409 + 40402', async () => {
    const r = await request('POST', '/api/me/favorite-groups', { name: '深夜食堂' }, TOKEN_A);
    assert(r.status === 409, `应 409，实际 ${r.status}`);
    assert(r.json.code === 40402, `业务码应 40402，实际 ${r.json.code}`);
});

await case_it('IT-03', '空名 / 内置名「想吃」「常吃」→ 422 + 40001', async () => {
    for (const name of ['', '   ', '想吃', '常吃']) {
        const r = await request('POST', '/api/me/favorite-groups', { name }, TOKEN_A);
        assert(r.status === 422, `name=${JSON.stringify(name)} 应 422，实际 ${r.status}`);
        assert(r.json.code === 40001, `name=${JSON.stringify(name)} 业务码应 40001，实际 ${r.json.code}`);
    }
});

await case_it('IT-04', 'A 收藏点位 C1 listType=1（常吃）→ 200 + listType=1', async () => {
    const d = await post('/api/favorites', { subjectType: 2, subjectId: C1, listType: 1 }, TOKEN_A);
    assert(d.listType === 1, `listType 应为 1，实际 ${d.listType}`);
    assert(d.groupId === null, `内置分组 groupId 应为 null，实际 ${d.groupId}`);
});

await case_it('IT-05', 'A 收藏点位 C2 listType=2 + groupId=G1 → 200 + groupId 回显', async () => {
    const d = await post('/api/favorites', { subjectType: 2, subjectId: C2, listType: 2, groupId: G1 }, TOKEN_A);
    assert(d.listType === 2 && Number(d.groupId) === G1, `应 listType=2/groupId=${G1}，实际 ${d.listType}/${d.groupId}`);
});

await case_it('IT-06', '?groupId=G1 过滤 → 含 C2 且 group_name 回显；?listType=1 → 含 C1 不含 C2', async () => {
    const byGroup = await get(`/api/me/favorites?groupId=${G1}`, TOKEN_A);
    const row2 = byGroup.find((x) => x.subject_type === 2 && x.subject_id === C2);
    assert(row2, '按 groupId 过滤未找到 C2');
    assert(Number(row2.list_type) === 2 && Number(row2.group_id) === G1, `C2 分组字段不符：list_type=${row2.list_type} group_id=${row2.group_id}`);
    assert(row2.group_name === '深夜食堂', `group_name 应回显「深夜食堂」，实际 ${row2.group_name}`);
    assert(!byGroup.some((x) => x.subject_id === C1 && x.subject_type === 2), 'groupId 过滤混入了 C1');
    const byType = await get('/api/me/favorites?listType=1', TOKEN_A);
    assert(byType.some((x) => x.subject_type === 2 && x.subject_id === C1), 'listType=1 过滤未找到 C1');
    assert(!byType.some((x) => x.subject_type === 2 && x.subject_id === C2), 'listType=1 过滤混入了 C2');
});

await case_it('IT-07', 'listType=2 缺 groupId / listType=1 带 groupId → 422 + 40001', async () => {
    const r1 = await request('POST', '/api/favorites', { subjectType: 2, subjectId: C1, listType: 2 }, TOKEN_A);
    assert(r1.status === 422 && r1.json.code === 40001, `缺 groupId 应 422/40001，实际 ${r1.status}/${r1.json.code}`);
    const r2 = await request('POST', '/api/favorites', { subjectType: 2, subjectId: C1, listType: 1, groupId: G1 }, TOKEN_A);
    assert(r2.status === 422 && r2.json.code === 40001, `内置组带 groupId 应 422/40001，实际 ${r2.status}/${r2.json.code}`);
});

await case_it('IT-08', 'A 带 B 的 groupId 收藏 → 403 + 40301', async () => {
    const d = await post('/api/me/favorite-groups', { name: '乙的组' }, TOKEN_B);
    GB = d.id;
    const r = await request('POST', '/api/favorites', { subjectType: 2, subjectId: C1, listType: 2, groupId: GB }, TOKEN_A);
    assert(r.status === 403, `应 403，实际 ${r.status}`);
    assert(r.json.code === 40301, `业务码应 40301，实际 ${r.json.code}`);
});

await case_it('IT-09', '同对象 C3 先 listType=0 后 listType=2+G1 → 撞键改组不新增', async () => {
    await post('/api/favorites', { subjectType: 2, subjectId: C3, listType: 0 }, TOKEN_A);
    await post('/api/favorites', { subjectType: 2, subjectId: C3, listType: 2, groupId: G1 }, TOKEN_A);
    const all = await get('/api/me/favorites', TOKEN_A);
    const rows = all.filter((x) => x.subject_type === 2 && x.subject_id === C3);
    assert(rows.length === 1, `C3 应仅一条收藏，实际 ${rows.length} 条`);
    assert(Number(rows[0].list_type) === 2 && Number(rows[0].group_id) === G1, `C3 应改组到 G1，实际 list_type=${rows[0].list_type} group_id=${rows[0].group_id}`);
});

await case_it('IT-10', '分组列表 → G1 fav_count=2（C2、C3）', async () => {
    const groups = await get('/api/me/favorite-groups', TOKEN_A);
    const g1 = groups.find((g) => Number(g.id) === G1);
    assert(g1, '分组列表未找到 G1');
    assert(Number(g1.fav_count) === 2, `G1 fav_count 应为 2，实际 ${g1.fav_count}`);
});

await case_it('IT-11', 'G1 改名「加班续命」→ 200 + 列表回显', async () => {
    const r = await request('PUT', `/api/me/favorite-groups/${G1}`, { name: '加班续命' }, TOKEN_A);
    assert(r.status === 200 && r.json.code === 0, `改名失败：${r.status}/${r.json.code}`);
    assert(r.json.data.groupName === '加班续命', `回显不符：${r.json.data.groupName}`);
    const groups = await get('/api/me/favorite-groups', TOKEN_A);
    assert(groups.find((g) => Number(g.id) === G1).group_name === '加班续命', '列表未回显新名');
});

await case_it('IT-12', '改名与自己另一组重名 → 409 + 40402', async () => {
    await post('/api/me/favorite-groups', { name: '周末探店' }, TOKEN_A);
    const r = await request('PUT', `/api/me/favorite-groups/${G1}`, { name: '周末探店' }, TOKEN_A);
    assert(r.status === 409, `应 409，实际 ${r.status}`);
    assert(r.json.code === 40402, `业务码应 40402，实际 ${r.json.code}`);
});

await case_it('IT-13', 'B 删 A 的 G1 → 404 + 40401（越权不暴露存在性）', async () => {
    const r = await request('DELETE', `/api/me/favorite-groups/${G1}`, undefined, TOKEN_B);
    assert(r.status === 404, `应 404，实际 ${r.status}`);
    assert(r.json.code === 40401, `业务码应 40401，实际 ${r.json.code}`);
});

await case_it('IT-14', 'A 删 G1 → 200；组内 C2/C3 回落「想吃」（list_type=0、group_id 为空）', async () => {
    const r = await request('DELETE', `/api/me/favorite-groups/${G1}`, undefined, TOKEN_A);
    assert(r.status === 200 && r.json.code === 0, `删组失败：${r.status}/${r.json.code}`);
    const all = await get('/api/me/favorites', TOKEN_A);
    for (const cid of [C2, C3]) {
        const row = all.find((x) => x.subject_type === 2 && x.subject_id === cid);
        assert(row, `C${cid} 收藏不应被删`);
        assert(Number(row.list_type) === 0 && row.group_id === null, `C${cid} 应回落「想吃」，实际 list_type=${row.list_type} group_id=${row.group_id}`);
    }
    const groups = await get('/api/me/favorite-groups', TOKEN_A);
    assert(!groups.some((g) => Number(g.id) === G1), '删组后列表仍见 G1');
    assert(groups.some((g) => g.group_name === '周末探店'), '另一组「周末探店」不应受影响');
});

await case_it('IT-15', '未登录访问分组 4 端点 → 401 + 40101', async () => {
    const rs = [
        await request('GET', '/api/me/favorite-groups'),
        await request('POST', '/api/me/favorite-groups', { name: 'x' }),
        await request('PUT', '/api/me/favorite-groups/1', { name: 'x' }),
        await request('DELETE', '/api/me/favorite-groups/1'),
    ];
    for (const r of rs) {
        assert(r.status === 401 && r.json.code === 40101, `应 401/40101，实际 ${r.status}/${r.json.code}`);
    }
});

console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
// Windows + undici 直接 process.exit 可能撞 libuv 句柄关闭竞态，先让事件循环排空再退出
await new Promise((r) => setTimeout(r, 300));
process.exit(fail ? 1 : 0);
