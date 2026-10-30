/**
 * r45 走查：AI 供应商注册表（后台可维护）+ 模型设置改版（模型不自动填 / 协议 chip / 官方文档链接）
 * 运行：node tests/walkthrough-r45.test.mjs
 * 前置：docker compose up -d --build backend frontend（前端 8095 / 后端 3000）
 *
 * 用例：
 * - A1 注册表自愈：GET /api/ai/providers 返回 7 项默认（boot 幂等种子）
 * - A2 注册表驱动协议：后台新增自定义供应商（anthropic → mock）→ 用户保存该 key → ask 走 /messages
 * - A3 注册表白名单：未知 provider 保存被拒（422）
 * - U1 模型设置弹窗：下拉 7 项、选 Anthropic 自动填接口地址、模型保持空、协议 chip、文档链接 href 正确
 * - U2 后台 /admin/ai-providers：表格 7 行、编辑弹窗打开、取消无副作用
 * - 收尾：删除 A2 新增供应商、恢复 zhangwl 原 AI 配置（幂等）
 */
import { chromium } from 'playwright-core';
import http from 'http';
import fs from 'fs';

const BASE = 'http://localhost:8095';
const API = 'http://localhost:3000';
const EXE = 'C:\\Users\\Zviolin\\AppData\\Local\\ms-playwright\\chromium-1208\\chrome-win64\\chrome.exe';
const OUT = 'C:\\Users\\Zviolin\\AppData\\Local\\Temp\\lb-e2e';
fs.mkdirSync(OUT, { recursive: true });

const results = [];
let pass = 0, fail = 0;

/**
 * 登记一个走查用例
 * @param {string} id - R-xx
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

/* ---------------- 本地 mock Anthropic 端点 ---------------- */
const hits = [];
const mock = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
        if (req.url.endsWith('/messages')) {
            hits.push({ ver: req.headers['anthropic-version'], xapikey: req.headers['x-api-key'] });
            res.setHeader('content-type', 'application/json');
            res.end(JSON.stringify({ content: [{ type: 'text', text: '【MOCK-ANTHROPIC-R45】注册表驱动协议连通。' }] }));
        } else { res.statusCode = 404; res.end('{}'); }
    });
});
await new Promise((r) => mock.listen(17522, r));
const MOCK_BASE = 'http://host.docker.internal:17522/v1';
console.log('  mock Anthropic 端点已启动 :17522');

/* ---------------- 登录（管理员 + 普通用户） ---------------- */
/**
 * API 登录（DEBUG 验证码通道）
 * @param {string} username
 * @param {string} password
 */
async function login_api(username, password) {
    const cap = await (await fetch(`${BASE}/api/auth/captcha`)).json();
    const r = await (await fetch(`${BASE}/api/auth/login`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username, password, captchaId: cap.data.captchaId, captchaCode: cap.data.debugCode }),
    })).json();
    assert(r.data && r.data.token, `${username} 登录失败: ${JSON.stringify(r).slice(0, 100)}`);
    return { H: { authorization: `Bearer ${r.data.token}`, 'content-type': 'application/json' }, token: r.data.token, user: r.data.user };
}
const admin = await login_api('admin', (process.env.DAFU_ADMIN_PASSWORD || 'admin123'));
const user = await login_api('zhangwl', '123456');

/* 幂等：记录 zhangwl 原配置 */
const orig_cfg = await (await fetch(`${API}/api/me/ai-config`, { headers: user.H })).json();
const orig = { provider: orig_cfg.data?.provider || 'openai', baseUrl: orig_cfg.data?.baseUrl || '', model: orig_cfg.data?.model || '' };

console.log('=== r45 走查（AI 供应商注册表 + 模型设置改版） ===');

await case_r('A1', '注册表自愈：GET /api/ai/providers 返回 7 项默认（协议/端点/双文档链接齐全）', async () => {
    const r = await (await fetch(`${API}/api/ai/providers`, { headers: user.H })).json();
    assert(r.code === 0 && Array.isArray(r.data), `列表异常: ${JSON.stringify(r).slice(0, 120)}`);
    assert(r.data.length === 7, `应 7 项默认供应商: ${r.data.length}`);
    const keys = r.data.map((p) => p.providerKey);
    for (const k of ['openai', 'deepseek', 'qwen', 'kimi', 'zhipu', 'anthropic', 'openai_official']) {
        assert(keys.includes(k), `缺供应商 ${k}: ${keys}`);
    }
    const ant = r.data.find((p) => p.providerKey === 'anthropic');
    assert(ant.protocol === 'anthropic' && ant.consoleUrl.startsWith('https://docs.anthropic.com'), `anthropic 项异常: ${JSON.stringify(ant)}`);
    const ds = r.data.find((p) => p.providerKey === 'deepseek');
    assert(ds.protocol === 'openai' && ds.baseUrl === 'https://api.deepseek.com/v1' && ds.modelDocUrl, `deepseek 项异常: ${JSON.stringify(ds)}`);
});

await case_r('A2', '注册表驱动协议：后台新增自定义 anthropic 供应商 → ask 走 /messages 命中 mock', async () => {
    // 幂等前置：清理上轮可能残留的 mock_lab
    const pre = await (await fetch(`${API}/api/admin/ai-providers`, { headers: admin.H })).json();
    const stale = (pre.data || []).find((p) => p.providerKey === 'mock_lab');
    if (stale) await fetch(`${API}/api/admin/ai-providers/${stale.id}`, { method: 'DELETE', headers: admin.H });
    // 后台新增自定义供应商（协议 anthropic，端点指向 mock）
    const cr = await (await fetch(`${API}/api/admin/ai-providers`, {
        method: 'POST', headers: admin.H,
        body: JSON.stringify({ providerKey: 'mock_lab', name: '实验室 Claude', protocol: 'anthropic', baseUrl: MOCK_BASE, consoleUrl: 'https://example.com/console', modelDocUrl: 'https://example.com/models', enabled: 1, sortOrder: 50 }),
    })).json();
    assert(cr.code === 0, `新增供应商失败: ${JSON.stringify(cr).slice(0, 120)}`);
    // 用户保存该供应商自配
    const sv = await (await fetch(`${API}/api/me/ai-config`, {
        method: 'PUT', headers: user.H,
        body: JSON.stringify({ provider: 'mock_lab', baseUrl: MOCK_BASE, model: 'mock-lab-model', apiKey: 'sk-lab-mock-key-0001' }),
    })).json();
    assert(sv.code === 0, `保存自配失败: ${JSON.stringify(sv).slice(0, 120)}`);
    // 提问 → mock /messages 命中
    const ask = await (await fetch(`${API}/api/ai/ask`, { method: 'POST', headers: user.H, body: JSON.stringify({ question: '推荐一个好吃的' }) })).json();
    assert(ask.code === 0 && ask.data.degraded === false, `ask 异常: ${JSON.stringify(ask).slice(0, 140)}`);
    assert(String(ask.data.answer).includes('MOCK-ANTHROPIC-R45'), `回答未命中 mock: ${String(ask.data.answer).slice(0, 80)}`);
    assert(hits.length > 0 && hits[hits.length - 1].ver === '2023-06-01', 'anthropic-version 头缺失');
});

await case_r('A3', '注册表白名单：未知 provider 保存被拒（HTTP 422）', async () => {
    const resp = await fetch(`${API}/api/me/ai-config`, {
        method: 'PUT', headers: user.H,
        body: JSON.stringify({ provider: 'ghost_provider', baseUrl: 'https://x.com/v1', model: 'm', apiKey: 'k' }),
    });
    const r = await resp.json();
    assert(resp.status === 422, `未知供应商应 HTTP 422: ${resp.status} ${JSON.stringify(r).slice(0, 120)}`);
    assert(String(r.msg).includes('未知供应商'), `错误文案异常: ${r.msg}`);
});

/* ---- UI 层 ---- */
const browser = await chromium.launch({ executablePath: EXE, headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
await page.addInitScript(([t, u]) => {
    localStorage.setItem('fk_token', t);
    localStorage.setItem('fk_user', JSON.stringify(u));
}, [user.token, user.user]);

await page.goto(`${BASE}/ai`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.ai-head', { timeout: 15000 });

await case_r('U1', '模型设置弹窗：下拉 7+1 项、选 Anthropic 仅自动填接口地址、模型保持空、协议 chip、文档链接正确', async () => {
    await page.click('.ai-head .cfg-btn');
    const dlg = page.locator('.el-dialog:visible');
    await dlg.waitFor({ state: 'visible', timeout: 5000 });
    // 下拉项 = 7 默认 + 1 A2 新增
    await dlg.locator('.provider-select').click();
    const panel = page.locator('.el-select-dropdown:visible');
    await panel.waitFor({ state: 'visible', timeout: 5000 });
    const labels = await panel.locator('.el-select-dropdown__item').allInnerTexts();
    assert(labels.length === 8, `下拉应 8 项（7 默认+1 自定义）: ${labels.length}`);
    // 选 Anthropic
    await panel.locator('.el-select-dropdown__item:has-text("Anthropic")').click();
    await page.waitForTimeout(300);
    const inputs = dlg.locator('.el-form-item .el-input__inner');
    const baseVal = await inputs.nth(0).inputValue();
    const modelVal = await inputs.nth(1).inputValue();
    assert(baseVal === 'https://api.anthropic.com/v1', `接口地址未自动更新: ${baseVal}`);
    assert(modelVal === '', `模型不应自动填写，实际: ${modelVal}`);
    // 协议 chip
    const chip = await dlg.locator('.proto-chip').innerText();
    assert(chip.includes('Anthropic 原生') && chip.includes('/messages'), `协议 chip 异常: ${chip}`);
    // 文档链接
    const hrefs = await dlg.locator('.doc-link').evaluateAll((els) => els.map((e) => e.getAttribute('href')));
    assert(hrefs.some((h) => h && h.includes('docs.anthropic.com')), `文档链接缺失: ${hrefs}`);
    assert(await dlg.locator('.doc-link:has-text("模型接入文档")').count() === 1, '模型接入文档链接缺失');
    await page.screenshot({ path: `${OUT}\\r45-dialog-anthropic.png` });
    await page.locator('.el-dialog:visible .el-dialog__headerbtn').click();
    await page.waitForTimeout(400);
});

await case_r('U2', '后台 AI 供应商管理页：表格含默认+自定义、编辑弹窗可开、标识禁改', async () => {
    // 管理页需管理员身份：另开 admin 上下文（前台走查上下文是 zhangwl，会被 admin 守卫拦截）
    const actx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });
    const apage = await actx.newPage();
    await apage.addInitScript(([t, u]) => {
        localStorage.setItem('fk_token', t);
        localStorage.setItem('fk_user', JSON.stringify(u));
    }, [admin.token, admin.user]);
    await apage.goto(`${BASE}/admin/ai-providers`, { waitUntil: 'domcontentloaded' });
    await apage.waitForSelector('.prov-mgr .el-table__row', { timeout: 15000 });
    const rows = await apage.locator('.prov-mgr .el-table__row').count();
    assert(rows === 8, `表格应 8 行（7 默认+1 自定义）: ${rows}`);
    // 编辑弹窗：打开 → 标识输入框禁改 → 取消
    await apage.locator('.prov-mgr .el-table__row:has-text("Anthropic") button:has-text("编辑")').first().click();
    const dlg = apage.locator('.el-dialog:visible');
    await dlg.waitFor({ state: 'visible', timeout: 5000 });
    const keyDisabled = await dlg.locator('.el-form-item:has-text("标识") .el-input__inner').isDisabled();
    assert(keyDisabled === true, '编辑态标识应禁改');
    await apage.screenshot({ path: `${OUT}\\r45-admin-providers.png` });
    await dlg.locator('button:has-text("取消")').click();
    await actx.close();
});

/* ---- 收尾：删除自定义供应商 + 恢复原配置 ---- */
try {
    const lst = await (await fetch(`${API}/api/admin/ai-providers`, { headers: admin.H })).json();
    const lab = (lst.data || []).find((p) => p.providerKey === 'mock_lab');
    if (lab) await fetch(`${API}/api/admin/ai-providers/${lab.id}`, { method: 'DELETE', headers: admin.H });
    await fetch(`${API}/api/me/ai-config`, {
        method: 'PUT', headers: user.H,
        body: JSON.stringify({ provider: orig.provider, baseUrl: orig.baseUrl, model: orig.model, apiKey: '' }),
    });
    console.log('  已删除自定义供应商并恢复原 AI 配置');
} catch { /* 收尾失败不影响走查结论 */ }

await browser.close();
mock.close();
console.log(`\n=== 结果：${pass} 通过 / ${fail} 失败 ===`);
process.exit(fail ? 1 : 0);
