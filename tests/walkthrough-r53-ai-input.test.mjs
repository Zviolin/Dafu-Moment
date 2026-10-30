/**
 * r53 走查：AI 助手输入区两行式改版（自动增高 textarea + 图标发送钮）
 *   C1 两行结构：input-bar 纵向布局，textarea 在上 / 操作条（模型 chip + 发送钮）在下
 *   C2 发送钮纯图标：无「发送」文字，含 SVG 图标，aria-label=发送
 *   C3 自动增高：1 行 → 多行文本后高度明显增长
 *   C4 封顶滚动不显轴：超 4 行后高度封顶（内部溢出滚动），滚动条隐藏不占宽
 *   C5 Enter 发送：清空输入并出现用户气泡（Shift+Enter 之外的主键路径）
 *   C6 Shift+Enter 换行：值插入换行且不触发发送
 * 登录态：API 登录（zhangwl）+ localStorage 注入；验证码从 SVG data URL 解码（无需 DEBUG 通道）
 * 幂等：本走查会经 /ai/ask 留一条问答回显历史（无历史清理端点，演示库可接受）；登录 1 次低于限流
 *
 * 运行：node tests/walkthrough-r53-ai-input.test.mjs（需 dafu 全容器运行中，:8095）
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url) /* 解析到 tests/node_modules，避免依赖已被清理的临时目录 */;
const { chromium } = require('playwright-core');

const BASE = 'http://localhost:8095';
const API = 'http://localhost:3000/api';
const EXE = 'C:\\Users\\Zviolin\\AppData\\Local\\ms-playwright\\chromium-1208\\chrome-win64\\chrome.exe';
let passed = 0, failed = 0;

function assert(cond, name, extra = '') {
    cond ? passed++ : failed++;
    console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${extra ? ' | ' + extra : ''}`);
}

/* ---------- 登录态：验证码 SVG 解码 + API 登录 + localStorage 注入 ---------- */
const cap = await (await fetch(`${API}/auth/captcha`)).json();
const svg = Buffer.from(cap.data.imageBase64.split(',')[1], 'base64').toString('utf8');
const code = [...svg.matchAll(/<text[^>]*>([^<]+)<\/text>/g)].map((m) => m[1]).join('');
const login = await (await fetch(`${API}/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'zhangwl', password: '123456', captchaId: cap.data.captchaId, captchaCode: code }),
})).json();
assert(login.code === 0 && !!login.data?.token, 'C0 API 登录（SVG 解码验证码）', login.msg || '');

const browser = await chromium.launch({ headless: true, executablePath: EXE });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
await page.addInitScript(([t, u]) => {
    localStorage.setItem('fk_token', t);
    localStorage.setItem('fk_user', u);
}, [login.data.token, JSON.stringify(login.data.user)]);

await page.goto(`${BASE}/ai`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.ask-input textarea', { timeout: 8000 });
const ta = page.locator('.ask-input textarea');

/* ---------- C1 两行结构 ---------- */
const layout = await page.evaluate(() => {
    const bar = document.querySelector('.input-bar');
    const st = getComputedStyle(bar);
    return {
        col: st.flexDirection === 'column',
        hasTa: !!bar.querySelector('.ask-input textarea'),
        hasOps: !!bar.querySelector('.input-ops'),
        chipInOps: !!bar.querySelector('.input-ops .model-chip'),
        btnInOps: !!bar.querySelector('.input-ops .send-btn'),
    };
});
assert(layout.col && layout.hasTa && layout.hasOps && layout.chipInOps && layout.btnInOps,
    'C1 两行结构（上 textarea / 下 chip+发送）', JSON.stringify(layout));

/* ---------- C2 发送钮纯图标 ---------- */
const btn = await page.evaluate(() => {
    const b = document.querySelector('.input-ops .send-btn');
    return { text: b.textContent.trim(), hasSvg: !!b.querySelector('svg'), label: b.getAttribute('aria-label') };
});
assert(btn.text === '' && btn.hasSvg && btn.label === '发送', 'C2 发送钮纯图标（无文字）', JSON.stringify(btn));

/* ---------- C3 自动增高 ---------- */
const h0 = await ta.evaluate((el) => el.clientHeight);
await ta.fill('第一行测自动增高\n第二行\n第三行');
await page.waitForTimeout(250);
const h3 = await ta.evaluate((el) => el.clientHeight);
assert(h3 > h0 + 20, 'C3 多行文本高度自动增长', `${h0} -> ${h3}`);

/* ---------- C4 封顶 + 隐藏滚动条 ---------- */
await ta.fill('1\n2\n3\n4\n5\n6\n7\n8\n9\n10');
await page.waitForTimeout(250);
const cap4 = await ta.evaluate((el) => ({
    h: el.clientHeight,
    overflows: el.scrollHeight > el.clientHeight,   // 内容封顶后内部溢出滚动
    axisWidth: el.offsetWidth - el.clientWidth,      // 滚动条占宽 = 可见滚动轴
    sbStyle: getComputedStyle(el).scrollbarWidth,
}));
assert(cap4.h < h3 + 24 && cap4.overflows && cap4.axisWidth === 0 && cap4.sbStyle === 'none',
    'C4 高度封顶内部滚动且滚动条不显轴', JSON.stringify(cap4));

/* ---------- C6 Shift+Enter 换行不发送 ---------- */
// 历史问答回显会让页面自带旧用户气泡 → 计数断言一律用「基线差值」而非绝对数
const baseUser = await page.locator('.msg.user').count();
await ta.fill('');
await ta.pressSequentially('换行测试');
await page.keyboard.press('Shift+Enter');
await ta.pressSequentially('第二行');
await page.waitForTimeout(200);
const c6 = await ta.evaluate((el) => el.value);
const userCount6 = await page.locator('.msg.user').count();
assert(c6.includes('\n') && userCount6 === baseUser, 'C6 Shift+Enter 换行且不发送', JSON.stringify({ c6, baseUser, userCount6 }));

/* ---------- C5 Enter 发送 ---------- */
await ta.fill('r53 走查：福宝一句话推荐');
await page.keyboard.press('Enter');
await page.waitForTimeout(600);
const c5 = { cleared: (await ta.inputValue()) === '', sent: (await page.locator('.msg.user').count()) > baseUser };
assert(c5.cleared && c5.sent, 'C5 Enter 发送（清空 + 新增用户气泡）', JSON.stringify(c5));

await browser.close();
console.log(`\n结果: ${passed} passed, ${failed} failed, 共 ${passed + failed} 例`);
process.exit(failed > 0 ? 1 : 0);
