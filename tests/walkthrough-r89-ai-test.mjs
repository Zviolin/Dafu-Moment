/**
 * r89 走查：AI 助手「配了 API 仍降级」修复
 * 运行：node tests/walkthrough-r89-ai-test.mjs
 * 前置：docker compose up -d --build backend frontend（前端 8095 / 后端 3000）
 *
 * 覆盖：
 * - A1 已保存配置连通性测试成功（真实打到 mock，回延迟与模型 ID）
 * - A2 401 配置测试失败：返回 hint「密钥无效或无权限」+ 原始错误片段
 * - A3 ask 降级原因回传：degraded=true 且 degradedReason 含 401 原因（不再是无声降级）
 * - A4 自定义供应商（openai 注册表无默认端点）接口地址必填 → 422
 * - A5 平台引用行不占个人额度：1 条引用 + 6 条自配仍可添加，第 7 条自配才 422
 * - A6 新增配置返回 isSelected（无使用中时 true，已有使用中时 false）
 * - U1 前台模型设置：每行「测试」按钮 → 点击后出现「连接成功」结果块
 * - U2 前台添加表单「测试连接」：坏端点 → 结果块展示「密钥无效」原因
 * - U3 后台平台模型：快速选择按注册表排序、点 DeepSeek 自动带出协议/端点，保留「自定义」
 * - 收尾：删除全部 r89 模型配置与平台模型（幂等）
 */
import { chromium } from 'playwright-core';
import http from 'http';
import fs from 'fs';

const BASE = 'http://localhost:8095';
const API = 'http://localhost:3000';
const EXE = 'C:\\Users\\Zviolin\\AppData\\Local\\ms-playwright\\chromium-1208\\chrome-win64\\chrome.exe';
const OUT = 'C:\\Users\\Zviolin\\AppData\\Local\\Temp\\lb-e2e';
fs.mkdirSync(OUT, { recursive: true });

const MOCK_PORT = 17533;
const MOCK_BASE = `http://host.docker.internal:${MOCK_PORT}/v1`;
const MOCK_BAD = `http://host.docker.internal:${MOCK_PORT}/bad`;

const results = [];
let pass = 0, fail = 0;

/**
 * 登记一个走查用例
 * @param {string} id - A-x / U-x
 * @param {string} desc
 * @param {Function} fn
 */
async function case_r(id, desc, fn) {
    try {
        await fn();
        pass++;
        results.push({ id, desc, ok: true });
        console.log(`  [PASS] ${id} ${desc}`);
    } catch (e) {
        fail++;
        results.push({ id, desc, ok: false, msg: String(e.message || e).slice(0, 300) });
        console.log(`  [FAIL] ${id} ${desc} -> ${String(e.message || e).slice(0, 300)}`);
    }
}

/** 断言 */
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assert failed'); }

/* ---------------- 本地 mock 端点（正常 /v1 与 401 /bad） ---------------- */
let hit_ok = 0;
const mock = http.createServer((req, res) => {
    if (req.url === '/bad/chat/completions') {
        res.statusCode = 401;
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ error: { message: 'invalid api key' } }));
        return;
    }
    if (req.url === '/v1/chat/completions') {
        hit_ok++;
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ choices: [{ message: { content: '可用' } }] }));
        return;
    }
    res.statusCode = 404;
    res.end('{}');
});
await new Promise((r) => mock.listen(MOCK_PORT, r));
console.log(`  mock 端点已启动 :${MOCK_PORT}（/v1 正常、/bad 401）`);

/* ---------------- 登录 ---------------- */
/**
 * 从 SVG 验证码图片里读出字符（DEBUG=false 时后端不下发 debugCode；
 * SVG 文本节点本身是明文，按 x 坐标排序拼接即可，保证走查可独立运行）
 * @param {string} imageBase64 - data:image/svg+xml;base64,...
 * @returns {string} 验证码
 */
function captcha_from_svg(imageBase64) {
    const raw = String(imageBase64 || '').split(',')[1] || '';
    const svg = Buffer.from(raw, 'base64').toString('utf8');
    const items = [...svg.matchAll(/<text[^>]*x="(\d+)"[^>]*>([^<]+)<\/text>/g)]
        .map((m) => ({ x: Number(m[1]), c: m[2] }));
    items.sort((a, b) => a.x - b.x);
    return items.map((i) => i.c).join('');
}

/**
 * API 登录（SVG 验证码解析通道）
 * @param {string} username
 * @param {string} password
 * @returns {Promise<{H:Object, token:string, user:Object}>}
 */
async function login_api(username, password) {
    const cap = await (await fetch(`${BASE}/api/auth/captcha`)).json();
    const code = captcha_from_svg(cap.data.imageBase64);
    const r = await (await fetch(`${BASE}/api/auth/login`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username, password, captchaId: cap.data.captchaId, captchaCode: code }),
    })).json();
    assert(r.data && r.data.token, `${username} 登录失败: ${JSON.stringify(r).slice(0, 100)}`);
    return { H: { authorization: `Bearer ${r.data.token}`, 'content-type': 'application/json' }, token: r.data.token, user: r.data.user };
}
const admin = await login_api('admin', (process.env.DAFU_ADMIN_PASSWORD || 'admin123'));
const user = await login_api('zhangwl', '123456');

/**
 * 清空当前用户的全部模型配置与平台引用（幂等前置）
 * @param {Object} H - 登录头
 */
async function reset_models(H) {
    const r = await (await fetch(`${API}/api/ai/models`, { headers: H })).json();
    for (const m of ((r.data && r.data.list) || [])) {
        await fetch(`${API}/api/ai/models/${m.id}`, { method: 'DELETE', headers: H });
    }
    for (const p of ((r.data && r.data.platform) || [])) {
        if (p.selected) await fetch(`${API}/api/ai/platform-models/${p.id}`, { method: 'DELETE', headers: H });
    }
}
await reset_models(user.H);

/**
 * 新增一条用户自配模型
 * @param {Object} body
 * @returns {Promise<Object>} data
 */
async function add_model(body) {
    const r = await (await fetch(`${API}/api/ai/models`, { method: 'POST', headers: user.H, body: JSON.stringify(body) })).json();
    assert(r.code === 0, `新增模型失败: ${JSON.stringify(r).slice(0, 160)}`);
    return r.data;
}

console.log('=== r89 走查（AI 连通性测试 / 降级原因 / 额度口径） ===');

await case_r('A1', '已保存配置测试成功：POST /ai/models/test 返回 ok + 延迟，mock 收到请求', async () => {
    const d = await add_model({
        provider: 'openai', protocol: 'openai', baseUrl: MOCK_BASE,
        modelId: 'mock-r89-ok', displayName: 'r89 正常模型', apiKey: 'sk-r89-ok-123456',
    });
    assert(d.isSelected === true, `首个配置应自动选中: ${JSON.stringify(d)}`);
    const t = await (await fetch(`${API}/api/ai/models/test`, { method: 'POST', headers: user.H, body: JSON.stringify({ id: d.id }) })).json();
    assert(t.code === 0, `测试接口异常: ${JSON.stringify(t).slice(0, 160)}`);
    assert(t.data.ok === true, `应测试成功: ${JSON.stringify(t.data)}`);
    assert(t.data.model === 'mock-r89-ok', `模型 ID 回传异常: ${t.data.model}`);
    assert(typeof t.data.latencyMs === 'number' && t.data.latencyMs >= 0, `延迟异常: ${t.data.latencyMs}`);
    assert(hit_ok > 0, 'mock 未收到测试请求');
});

await case_r('A2', '401 配置测试失败：ok=false，hint 含「密钥无效」，error 含 HTTP 401', async () => {
    const d = await add_model({
        provider: 'openai', protocol: 'openai', baseUrl: MOCK_BAD,
        modelId: 'mock-r89-bad', displayName: 'r89 坏密钥', apiKey: 'sk-r89-bad-000000',
    });
    assert(d.isSelected === false, '已有使用中配置时新增不应抢占');
    const t = await (await fetch(`${API}/api/ai/models/test`, { method: 'POST', headers: user.H, body: JSON.stringify({ id: d.id }) })).json();
    assert(t.code === 0, `测试接口异常: ${JSON.stringify(t).slice(0, 160)}`);
    assert(t.data.ok === false, `应测试失败: ${JSON.stringify(t.data)}`);
    assert(String(t.data.hint).includes('密钥无效'), `hint 应含密钥无效: ${t.data.hint}`);
    assert(/HTTP 401/.test(String(t.data.error)), `error 应含 HTTP 401: ${t.data.error}`);
    // 全局变量：后续 ask 降级用这条配置
    globalThis.__r89_bad_id = d.id;
});

await case_r('A3', 'ask 降级原因回传：切到 401 配置后 degraded=true 且 degradedReason 含密钥无效', async () => {
    const id = globalThis.__r89_bad_id;
    const sel = await fetch(`${API}/api/ai/models/${id}/select`, { method: 'PUT', headers: user.H });
    assert(sel.status === 200, `切换使用失败: ${sel.status}`);
    const ask = await (await fetch(`${API}/api/ai/ask`, { method: 'POST', headers: user.H, body: JSON.stringify({ question: '推荐一个好吃的' }) })).json();
    assert(ask.code === 0, `ask 异常: ${JSON.stringify(ask).slice(0, 160)}`);
    assert(ask.data.degraded === true, '应标记降级');
    assert(String(ask.data.degradedReason).includes('密钥无效'), `降级原因缺失: ${JSON.stringify(ask.data.degradedReason)}`);
    assert(String(ask.data.answer).includes('平台真实评价数据'), `应回落规则推荐: ${String(ask.data.answer).slice(0, 80)}`);
});

await case_r('A4', '自定义供应商（openai 无默认端点）接口地址必填 → 422', async () => {
    const r = await fetch(`${API}/api/ai/models`, {
        method: 'POST', headers: user.H,
        body: JSON.stringify({ provider: 'openai', protocol: 'openai', baseUrl: '', modelId: 'm-r89', apiKey: 'k-r89' }),
    });
    const j = await r.json();
    assert(r.status === 422, `应 422: ${r.status} ${JSON.stringify(j).slice(0, 100)}`);
    assert(String(j.msg).includes('接口地址'), `提示应含接口地址: ${j.msg}`);
});

await case_r('A5', '平台引用行不占个人额度：1 引用 + 6 自配可添，第 7 条自配 422', async () => {
    // 后台建一个平台模型（指向 mock）并让用户选用（生成引用行）
    const cr = await (await fetch(`${API}/api/admin/platform-models`, {
        method: 'POST', headers: admin.H,
        body: JSON.stringify({
            name: 'r89 平台模型', protocol: 'openai', baseUrl: MOCK_BASE,
            modelId: 'mock-r89-platform', apiKey: 'sk-r89-platform-key', enabled: 1, sortOrder: 999,
        }),
    })).json();
    assert(cr.code === 0, `新增平台模型失败: ${JSON.stringify(cr).slice(0, 160)}`);
    const pid = cr.data.id;
    globalThis.__r89_platform_id = pid;
    const sel = await fetch(`${API}/api/ai/platform-models/${pid}/select`, { method: 'PUT', headers: user.H });
    assert(sel.status === 200, `选用平台模型失败: ${sel.status}`);
    // 已有 2 条自配，再补 4 条 → 共 6 条（若引用行占额度，第 6 条就会 422）
    for (let i = 0; i < 4; i++) {
        await add_model({
            provider: 'openai', protocol: 'openai', baseUrl: MOCK_BASE,
            modelId: `mock-r89-fill-${i}`, displayName: `r89 填充 ${i}`, apiKey: `sk-r89-fill-${i}-000`,
        });
    }
    const lst = await (await fetch(`${API}/api/ai/models`, { headers: user.H })).json();
    assert(lst.data.list.length === 6, `自配应 6 条: ${lst.data.list.length}`);
    // 第 7 条 → 422
    const r = await fetch(`${API}/api/ai/models`, {
        method: 'POST', headers: user.H,
        body: JSON.stringify({ provider: 'openai', protocol: 'openai', baseUrl: MOCK_BASE, modelId: 'mock-r89-over', apiKey: 'sk-r89-over-000' }),
    });
    const j = await r.json();
    assert(r.status === 422 && String(j.msg).includes('最多添加'), `第 7 条应 422: ${r.status} ${j.msg}`);
});

await case_r('A6', '新增配置返回 isSelected：无使用中时 true、已有使用中时 false（A1/A2 已断言）', async () => {
    assert(true, 'A1/A2 已覆盖');
});

/* ---- UI 层：前台模型设置测试按钮 ---- */
const browser = await chromium.launch({ executablePath: EXE, headless: true });
const ctx = await browser.newContext({ viewport: { width: 420, height: 860 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
await page.addInitScript(([t, u]) => {
    localStorage.setItem('fk_token', t);
    localStorage.setItem('fk_user', JSON.stringify(u));
}, [user.token, user.user]);
await page.goto(`${BASE}/ai`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.chat-card', { timeout: 15000 });

await case_r('U1', '模型设置列表：每行有「测试」按钮，点正常配置后出现「连接成功」结果块', async () => {
    await page.locator('.head-btn.icon-only').click();
    const dlg = page.locator('.el-dialog:visible');
    await dlg.waitFor({ state: 'visible', timeout: 5000 });
    await dlg.locator('.model-item').first().waitFor({ state: 'visible', timeout: 5000 });
    // 自配 6 条 + 平台 1 条，全部带测试钮
    assert(await dlg.locator('.model-item').count() === 7, `列表应 7 行: ${await dlg.locator('.model-item').count()}`);
    assert(await dlg.locator('.mi-test').count() === 6, `自配应 6 个测试钮: ${await dlg.locator('.mi-test').count()}`);
    const ok_row = dlg.locator('.model-item:has-text("mock-r89-ok")').first();
    await ok_row.locator('.mi-test').click();
    await dlg.locator('.test-box.ok').waitFor({ state: 'visible', timeout: 20000 });
    const txt = await dlg.locator('.test-box.ok').innerText();
    assert(txt.includes('连接成功') && txt.includes('mock-r89-ok'), `结果块异常: ${txt}`);
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${OUT}\\r89-model-test-ok.png` });
});

await case_r('U2', '添加表单「测试连接」：坏端点 → 结果块展示密钥无效原因（不保存）', async () => {
    const dlg = page.locator('.el-dialog:visible');
    await dlg.locator('.add-model-btn').click();
    await dlg.locator('.prov-grid').waitFor({ state: 'visible', timeout: 5000 });
    await dlg.locator('.prov-item:has-text("自定义")').first().click();
    await dlg.locator('.el-form').waitFor({ state: 'visible', timeout: 5000 });
    const inputs = dlg.locator('.el-form-item .el-input__inner');
    // 接口地址 / 模型 ID / API Key（展示名称第 3 个输入框可跳过）
    await inputs.nth(0).fill(MOCK_BAD);
    await inputs.nth(1).fill('mock-r89-ui-bad');
    await inputs.nth(3).fill('sk-r89-ui-bad-111');
    await dlg.locator('button:has-text("测试连接")').click();
    await dlg.locator('.test-box.bad').waitFor({ state: 'visible', timeout: 20000 });
    const txt = await dlg.locator('.test-box.bad').innerText();
    assert(txt.includes('连接失败') && txt.includes('密钥无效'), `失败结果块异常: ${txt}`);
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${OUT}\\r89-model-test-bad.png` });
    // 取消：不落库（自配仍是 6 条）
    await dlg.locator('.el-dialog__footer button:has-text("取消")').click();
});

/* ---- UI 层：后台平台模型快速选择 ---- */
const actx = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });
const apage = await actx.newPage();
await apage.addInitScript(([t, u]) => {
    localStorage.setItem('fk_token', t);
    localStorage.setItem('fk_user', JSON.stringify(u));
}, [admin.token, admin.user]);
await apage.goto(`${BASE}/admin/ai-providers`, { waitUntil: 'domcontentloaded' });
await apage.waitForSelector('.prov-mgr .el-table__row', { timeout: 15000 });

await case_r('U3', '平台模型新增弹窗：快速选择按供应商排序（首个=自定义），点 DeepSeek 自动带出协议与端点', async () => {
    await apage.locator('.plat-head button:has-text("新增平台模型")').click();
    const dlg = apage.locator('.el-dialog:visible');
    await dlg.waitFor({ state: 'visible', timeout: 5000 });
    await dlg.locator('.quick-pick').waitFor({ state: 'visible', timeout: 5000 });
    const qps = dlg.locator('.qp-item');
    assert(await qps.count() >= 10, `快速选择项过少（应按供应商注册表）: ${await qps.count()}`);
    // 排序：sort_order=1 的「自定义」在前，DeepSeek（sort 2）紧随其后
    assert((await qps.nth(0).innerText()).includes('自定义'), `首项应为自定义: ${await qps.nth(0).innerText()}`);
    assert((await qps.nth(1).innerText()).includes('DeepSeek'), `第二项应为 DeepSeek: ${await qps.nth(1).innerText()}`);
    await qps.nth(1).click();
    // 按标签精确定位输入框（Element Plus 的 el-select 也占 .el-input__inner，不能用下标猜测）
    const name_input = dlg.locator('.el-form-item:has-text("名称") .el-input__inner').first();
    const base_input = dlg.locator('.el-form-item:has-text("接口地址") .el-input__inner').first();
    const model_input = dlg.locator('.el-form-item:has-text("模型 ID") .el-input__inner').first();
    const key_input = dlg.locator('.el-form-item:has-text("API Key") .el-input__inner').first();
    assert((await name_input.inputValue()).includes('DeepSeek'), `名称未自动填充: ${await name_input.inputValue()}`);
    assert((await base_input.inputValue()) === 'https://api.deepseek.com', `端点未自动带出: ${await base_input.inputValue()}`);
    // 自定义项仍在（保留手填能力）：注册表里的「自定义（openai）」是供应商项，
    // 末尾的手填入入口径命名为「手动填写」，避免两个同名按钮混淆
    assert(await dlg.locator('.qp-item.custom').count() === 1, '手填入口缺失');
    assert((await dlg.locator('.qp-item.custom .qp-name').innerText()) === '手动填写', '手填入口文案异常');
    await apage.waitForTimeout(400);
    await apage.screenshot({ path: `${OUT}\\r89-admin-quick-pick.png` });
    // 测试连接：改回 mock 端点 + 填模型 ID/密钥 → 成功
    await base_input.fill(MOCK_BASE);
    await model_input.fill('mock-r89-admin');
    await key_input.fill('sk-r89-admin-key-0001');
    await dlg.locator('button:has-text("测试连接")').click();
    await dlg.locator('.test-box.ok').waitFor({ state: 'visible', timeout: 20000 });
    assert((await dlg.locator('.test-box.ok').innerText()).includes('连接成功'), '后台测试连接未成功');
    await apage.screenshot({ path: `${OUT}\\r89-admin-test-ok.png` });
    await dlg.locator('button:has-text("取消")').click();
    await actx.close();
});

/* ---- 收尾：清理 r89 数据（幂等） ---- */
try {
    await reset_models(user.H);
    const pid = globalThis.__r89_platform_id;
    if (pid) await fetch(`${API}/api/admin/platform-models/${pid}`, { method: 'DELETE', headers: admin.H });
    const pl = await (await fetch(`${API}/api/ai/models`, { headers: user.H })).json();
    for (const m of (pl.data?.list || [])) {
        await fetch(`${API}/api/ai/models/${m.id}`, { method: 'DELETE', headers: user.H });
    }
    console.log('  已清理 r89 用户模型配置与平台模型');
} catch { /* 收尾失败不影响结论 */ }

await browser.close();
mock.close();
console.log(`\n=== 结果：${pass} 通过 / ${fail} 失败 ===`);
process.exit(fail ? 1 : 0);
