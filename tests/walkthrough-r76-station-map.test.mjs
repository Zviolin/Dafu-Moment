/**
 * r76 走查：导览图档口级标记（15-差距文档 T-31；AC08/G10）
 * 覆盖：/points/map 标记带 kind（canteen/station）/ 档口级标记存在且字段完整（canteenId、继承 type）/
 *       档口坐标落在所属点位 ±0.001° 内（回填偏移口径）/ 无坐标点位与档口均不出标记
 * 运行：node tests/walkthrough-r76-station-map.test.mjs
 * 前置：docker compose 后端在跑且 DEBUG=true；005 迁移已执行（station.lat/lng + 存量回填）；种子含坐标点位
 * 幂等：管理端建的点位/档口名带随机后缀，只增不改
 */
const BASE = process.env.LB_BASE || 'http://localhost:8095';

const SUF = Date.now().toString(36);
let TOKEN_ADMIN = '';
let NEW_CID = 0;  // 本走查建的无坐标点位

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

function all_points(areas) { return areas.flatMap((a) => a.points); }

console.log('=== r76 导览图档口级标记走查（T-31 / AC08） ===');

await case_it('IT-00', '准备：管理员登录；/points/map 结构合法且 kind 值域正确', async () => {
    const lm = await post('/api/auth/login', { username: 'admin', password: 'admin123', ...(await captcha_body()) });
    TOKEN_ADMIN = lm.token;
    const areas = await get('/api/points/map');
    assert(Array.isArray(areas) && areas.length > 0, 'areas 为空');
    for (const p of all_points(areas)) {
        assert(p.kind === 'canteen' || p.kind === 'station', `kind 值域错误：${p.kind}`);
        assert(Number.isFinite(p.lat) && Number.isFinite(p.lng), `标记缺坐标：${p.name}`);
    }
});

await case_it('IT-01', '点位级标记（kind=canteen）存在且字段完整', async () => {
    const pts = all_points(await get('/api/points/map')).filter((p) => p.kind === 'canteen');
    assert(pts.length > 0, '无点位级标记');
    for (const p of pts) {
        assert(p.id > 0 && p.name && [0, 1, 2, 3, 4].includes(Number(p.type)), `点位标记字段缺失：${JSON.stringify(p)}`);
        assert(p.canteenId === undefined, '点位级标记不应带 canteenId');
    }
});

await case_it('IT-02', '档口级标记（kind=station）存在：带 canteenId、继承点位 type、坐标在所属点位 ±0.001° 内', async () => {
    const pts = all_points(await get('/api/points/map'));
    const canteens = new Map(pts.filter((p) => p.kind === 'canteen').map((p) => [p.id, p]));
    const stations = pts.filter((p) => p.kind === 'station');
    assert(stations.length > 0, '无档口级标记（005 回填未生效？）');
    for (const s of stations.slice(0, 50)) {
        const c = canteens.get(s.canteenId);
        assert(c, `档口 ${s.name} 的所属点位 ${s.canteenId} 不在标记中（应在架且有坐标）`);
        assert(Number(s.type) === Number(c.type), `档口 ${s.name} type=${s.type} 未继承点位 type=${c.type}`);
        assert(Math.abs(s.lat - c.lat) <= 0.001 && Math.abs(s.lng - c.lng) <= 0.001,
            `档口 ${s.name} 坐标偏离所属点位超 0.001°：dLat=${(s.lat - c.lat).toFixed(6)} dLng=${(s.lng - c.lng).toFixed(6)}`);
    }
});

await case_it('IT-03', '新建点位（服务端默认坐标）出点位级标记；其下无坐标档口不出档口级标记', async () => {
    // 口径：管理端建点位不带坐标时服务端给默认坐标（CANTEEN_DEFAULT_POS），故「无坐标点位」只能由数据层产生；
    // 这里验证档口级闸门——station.lat 为 NULL 即不出档口标记
    const d = await post('/api/admin/canteens', { name: `r76新点位${SUF}`, type: 0 }, TOKEN_ADMIN);
    NEW_CID = d.id;
    const st = await post('/api/admin/stations', { canteenId: NEW_CID, name: `r76无坐标档口${SUF}`, category: '便当' }, TOKEN_ADMIN);
    const pts = all_points(await get('/api/points/map'));
    assert(pts.some((p) => p.kind === 'canteen' && p.id === NEW_CID), '新点位（默认坐标）应出点位级标记');
    assert(!pts.some((p) => p.kind === 'station' && p.id === st.id), '无坐标档口不应出档口级标记');
});

console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
// Windows + undici 直接 process.exit 可能撞 libuv 句柄关闭竞态，先让事件循环排空再退出
await new Promise((r) => setTimeout(r, 300));
process.exit(fail ? 1 : 0);
