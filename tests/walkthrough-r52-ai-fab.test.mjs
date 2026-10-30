/**
 * r52 走查：移动端 AI 助手悬浮球（App.vue 全局壳）
 *   F1 移动视口(375) 首页悬浮球可见（贴纸球：果酱橙 + 墨线）
 *   F2 触摸拖动 → 位置改变且未导航（位移 > 6px 判拖动）
 *   F3 拖出视口外 → 边界钳制留在视口内
 *   F4 点按（无位移）→ 导航进入 /ai
 *   F5 /ai 页悬浮球自身隐藏
 *   F6 桌面视口(1280) 悬浮球不渲染（display:none）
 * 幂等：纯浏览，无数据残留
 *
 * 运行：node tests/walkthrough-r52-ai-fab.test.mjs（需 dafu 全容器运行中，:8095）
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url) /* 解析到 tests/node_modules，避免依赖已被清理的临时目录 */;
const { chromium } = require('playwright-core');

const BASE = 'http://localhost:8095';
const EXE = 'C:\\Users\\Zviolin\\AppData\\Local\\ms-playwright\\chromium-1208\\chrome-win64\\chrome.exe';
let passed = 0, failed = 0;

function assert(cond, name, extra = '') {
    cond ? passed++ : failed++;
    console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${extra ? ' | ' + extra : ''}`);
}

const browser = await chromium.launch({ headless: true, executablePath: EXE });
const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true });
const page = await ctx.newPage();

/* ---------- F1 移动视口首页悬浮球可见 ---------- */
await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.ai-fab', { timeout: 8000 });
const fab0 = await page.locator('.ai-fab').boundingBox();
assert(!!fab0 && fab0.width > 40 && fab0.width < 64, 'F1 移动视口首页悬浮球可见（52px 贴纸球）', JSON.stringify(fab0));

/* ---------- F2 触摸拖动：位置改变且不导航 ---------- */
// 以球心为起点向左上拖 120/200px（用 TouchEvent 派发模拟真机跟手）
await page.evaluate(() => {
    const fab = document.querySelector('.ai-fab');
    const r = fab.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const mk = (type, x, y) => fab.dispatchEvent(new TouchEvent(type, {
        bubbles: true, cancelable: true,
        touches: type === 'touchend' ? [] : [new Touch({ identifier: 1, target: fab, clientX: x, clientY: y })],
        changedTouches: [new Touch({ identifier: 1, target: fab, clientX: x, clientY: y })],
    }));
    mk('touchstart', cx, cy);
    mk('touchmove', cx - 60, cy - 100);
    mk('touchmove', cx - 120, cy - 200);
    mk('touchend', cx - 120, cy - 200);
});
await page.waitForTimeout(300);
const fab1 = await page.locator('.ai-fab').boundingBox();
const moved = fab1 && fab0 && Math.hypot(fab1.x - fab0.x, fab1.y - fab0.y) > 80;
assert(moved, 'F2 拖动后位置改变（>80px）', `(${fab0?.x | 0},${fab0?.y | 0}) -> (${fab1?.x | 0},${fab1?.y | 0})`);
assert(new URL(page.url()).pathname === '/', 'F2b 拖动不触发导航', page.url());

/* ---------- F3 拖出视口 → 钳回边界 ---------- */
await page.evaluate(() => {
    const fab = document.querySelector('.ai-fab');
    const r = fab.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const mk = (type, x, y) => fab.dispatchEvent(new TouchEvent(type, {
        bubbles: true, cancelable: true,
        touches: type === 'touchend' ? [] : [new Touch({ identifier: 1, target: fab, clientX: x, clientY: y })],
        changedTouches: [new Touch({ identifier: 1, target: fab, clientX: x, clientY: y })],
    }));
    mk('touchstart', cx, cy);
    mk('touchmove', cx + 2000, cy + 3000); // 远超视口
    mk('touchend', cx + 2000, cy + 3000);
});
await page.waitForTimeout(300);
const fab2 = await page.locator('.ai-fab').boundingBox();
const vw = 375, vh = 812;
const inBounds = fab2 && fab2.x >= 0 && fab2.y >= 0 && fab2.x + fab2.width <= vw && fab2.y + fab2.height <= vh;
assert(inBounds, 'F3 拖出视口被钳回边界内', JSON.stringify(fab2));

/* ---------- F4 点按 → 进入 /ai ---------- */
await page.evaluate(() => {
    const fab = document.querySelector('.ai-fab');
    const r = fab.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const mk = (type, x, y) => fab.dispatchEvent(new TouchEvent(type, {
        bubbles: true, cancelable: true,
        touches: type === 'touchend' ? [] : [new Touch({ identifier: 1, target: fab, clientX: x, clientY: y })],
        changedTouches: [new Touch({ identifier: 1, target: fab, clientX: x, clientY: y })],
    }));
    mk('touchstart', cx, cy);
    mk('touchend', cx, cy); // 无位移 = 点按
});
await page.waitForURL('**/ai', { timeout: 8000 });
assert(page.url().endsWith('/ai'), 'F4 点按悬浮球 → 导航 /ai', page.url());

/* ---------- F5 /ai 页悬浮球隐藏 ---------- */
const cnt5 = await page.locator('.ai-fab').count();
assert(cnt5 === 0, 'F5 /ai 页悬浮球自身隐藏', `count=${cnt5}`);

/* ---------- F6 桌面视口不渲染 ---------- */
const page2 = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page2.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
await page2.waitForTimeout(600);
const shown6 = await page2.evaluate(() => {
    const el = document.querySelector('.ai-fab');
    return el ? getComputedStyle(el).display !== 'none' : false;
});
assert(!shown6, 'F6 桌面视口悬浮球不可见', `display=${shown6}`);

await browser.close();
console.log(`\n结果: ${passed} passed, ${failed} failed, 共 ${passed + failed} 例`);
process.exit(failed > 0 ? 1 : 0);
