/**
 * r55 走查（r56 增补移动端）：AI 推荐卡唯一「地图」图标钮
 *   M1 推荐卡右侧恰好一个图标钮，title=「在地图上查看它所属餐厅的位置」
 *   M2 点击 → /map?focus=<canteenId>（锁定菜品/档口所属餐厅位置）
 *   M3 整卡点击仍进详情页（/dish|station|canteen/:id）
 *   M4 移动端(375 真触摸)：按钮放大 34px、button 元素、touch-action=manipulation，触摸导航成功
 * 登录态：API 登录（zhangwl，SVG 验证码解码）+ localStorage 注入
 * 幂等：一次 AI 提问（低于限流）；发问口径用规则推荐降级（未配模型必带推荐卡）
 *
 * 运行：node tests/walkthrough-r55-ai-rec-map.test.mjs（需 dafu 全容器运行中，:8095）
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

/* ---------- 登录态 ---------- */
const cap = await (await fetch(`${API}/auth/captcha`)).json();
const svg = Buffer.from(cap.data.imageBase64.split(',')[1], 'base64').toString('utf8');
const code = [...svg.matchAll(/<text[^>]*>([^<]+)<\/text>/g)].map((m) => m[1]).join('');
const login = await (await fetch(`${API}/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'zhangwl', password: '123456', captchaId: cap.data.captchaId, captchaCode: code }),
})).json();
assert(login.code === 0, 'C0 API 登录', login.msg || '');

const browser = await chromium.launch({ headless: true, executablePath: EXE });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
await page.addInitScript(([t, u]) => {
    localStorage.setItem('fk_token', t);
    localStorage.setItem('fk_user', u);
}, [login.data.token, JSON.stringify(login.data.user)]);

await page.goto(`${BASE}/ai`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.ask-input textarea', { timeout: 8000 });

/* ---------- 发问取最新推荐卡 ---------- */
await page.fill('.ask-input textarea', 'r55 走查：推荐个吃的');
await page.keyboard.press('Enter');
await page.waitForSelector('.msg .rec-card', { timeout: 15000 });
await page.waitForTimeout(400);
const card = page.locator('.msg').last().locator('.rec-card').first();
await card.waitFor({ state: 'visible' });

/* ---------- M1 唯一地图钮 ---------- */
const btns = await card.locator('.rec-ico').count();
const title = await card.locator('.rec-ico').first().getAttribute('title');
assert(btns === 1 && title === '在地图上查看它所属餐厅的位置', 'M1 恰好一个地图图标钮（无详情/写点评）', `count=${btns} title=${title}`);

/* ---------- M2 地图钮锁定所属餐厅 ---------- */
await card.locator('.rec-ico').click();
await page.waitForTimeout(500);
const q = new URL(page.url());
const focus = q.searchParams.get('focus');
assert(q.pathname === '/map' && /^\d+$/.test(focus || ''), 'M2 地图钮 → /map?focus=<餐厅id>', page.url());

/* ---------- M3 整卡点击进详情 ---------- */
await page.goto(`${BASE}/ai`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.msg .rec-card', { timeout: 8000 });
const card3 = page.locator('.msg').last().locator('.rec-card').first();
await card3.click({ position: { x: 10, y: 10 } }); // 点卡片左上角（避开右上图标钮）
await page.waitForTimeout(500);
const path3 = new URL(page.url()).pathname;
assert(/^\/(dish|station|canteen)\/\d+$/.test(path3), 'M3 整卡点击 → 详情页', path3);

/* ---------- M4 移动端（375 真触摸）：按钮 34px 放大 + touch-action + 触摸导航 ---------- */
const mctx = await browser.newContext({
    viewport: { width: 375, height: 812 }, hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
});
const mpage = await mctx.newPage();
await mpage.addInitScript(([t, u]) => {
    localStorage.setItem('fk_token', t);
    localStorage.setItem('fk_user', u);
}, [login.data.token, JSON.stringify(login.data.user)]);
await mpage.goto(`${BASE}/ai`, { waitUntil: 'domcontentloaded' });
await mpage.waitForSelector('.msg .rec-card', { timeout: 8000 });
const mcard = mpage.locator('.msg').last().locator('.rec-card').first();
await mcard.scrollIntoViewIfNeeded();
await mpage.waitForTimeout(300);
const mBtn = await mcard.locator('.rec-ico').evaluate((el) => ({
    tag: el.tagName, w: el.getBoundingClientRect().width,
    touchAction: getComputedStyle(el).touchAction,
}));
assert(mBtn.tag === 'BUTTON' && Math.round(mBtn.w) >= 33 && mBtn.touchAction === 'manipulation',
    'M4 移动端按钮放大 34px + button 元素 + touch-action', JSON.stringify(mBtn));
const mb = await mcard.locator('.rec-ico').boundingBox();
await mpage.touchscreen.tap(mb.x + mb.width / 2, mb.y + mb.height / 2);
await mpage.waitForTimeout(1000);
const mq = new URL(mpage.url());
assert(mq.pathname === '/map' && /^\d+$/.test(mq.searchParams.get('focus') || ''), 'M4b 移动端真触摸导航成功', mpage.url());
await mctx.close();

await browser.close();
console.log(`\n结果: ${passed} passed, ${failed} failed, 共 ${passed + failed} 例`);
process.exit(failed > 0 ? 1 : 0);
