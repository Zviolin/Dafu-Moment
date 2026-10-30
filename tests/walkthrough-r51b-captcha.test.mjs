/**
 * r51b 走查（r51c 增补防重入回归）：验证码一次性消费的换图兜底 + 并发双提交修复
 * A1 API 复现矛盾链路：错密码 + 对验证码 → 消费后报「用户名或密码错误」；同验证码重提 → 「验证码错误或已过期」
 * U1 UI 错密码提交后自动换图 + 清空验证码输入
 * U2 换新图后输对密码与验证码 → 直接登录成功（不再出现二次验证码报错）
 * U3/U4 防重入（r51c）：回车提交 / 快速双击错密码 → 仅弹一条「用户名或密码错误」，
 *      不再同弹「验证码错误或已过期」矛盾提示
 * 幂等：仅登录尝试，无数据残留（错密码共 4 次，低于登录限流 10 次/10 分钟）
 *
 * 运行：node tests/walkthrough-r51b-captcha.test.mjs（需 dafu 全容器运行中，:8095）
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

/* ---------- A1 API 层复现矛盾链路 ---------- */
const cap = await (await fetch(`${BASE}/api/auth/captcha`)).json();
const bad = await (await fetch(`${BASE}/api/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'zhangwl', password: 'wrong-pwd', captchaId: cap.data.captchaId, captchaCode: cap.data.debugCode }),
})).json();
assert(bad.code === 40001 && /用户名或密码错误/.test(bad.msg), 'A1a 错密码+对验证码 → 密码错误（验证码已被消费）', bad.msg);

const replay = await (await fetch(`${BASE}/api/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'zhangwl', password: '123456', captchaId: cap.data.captchaId, captchaCode: cap.data.debugCode }),
})).json();
assert(replay.code === 40001 && /验证码错误或已过期/.test(replay.msg), 'A1b 同验证码重提 → 验证码报错（用户矛盾感知的根源）', replay.msg);

/* ---------- UI 层验证修复 ---------- */
const browser = await chromium.launch({ headless: true, executablePath: EXE });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

/** 从验证码 img 的 SVG data URL 中解码出 4 位验证码文本 */
async function read_captcha_text() {
    return page.evaluate(() => {
        const src = document.querySelector('.captcha-img').src;
        const svg = decodeURIComponent(escape(atob(src.split(',')[1])));
        return [...svg.matchAll(/<text[^>]*>([^<]+)<\/text>/g)].map(m => m[1]).join('');
    });
}

await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.captcha-img img, img.captcha-img', { timeout: 8000 }).catch(() => {});
await page.waitForSelector('.login-page .captcha-row img', { timeout: 8000 });

const src0 = await page.evaluate(() => document.querySelector('.captcha-row img').src);
const code0 = await read_captcha_text();

// U1：错密码 + 页面验证码 → 弹密码错误 → 自动换图 + 清空输入
await page.fill('.el-tab-pane:nth-child(1) input[placeholder="用户名"]', 'zhangwl');
await page.fill('.el-tab-pane:nth-child(1) input[placeholder="密码"]', 'wrong-pwd');
await page.fill('.el-tab-pane:nth-child(1) input[placeholder="验证码"]', code0);
await page.click('.submit-btn');
await page.waitForSelector('.el-message:visible', { timeout: 5000 });
const msg1 = (await page.locator('.el-message:visible').first().textContent()).trim();
assert(/用户名或密码错误/.test(msg1), 'U1a 错密码提交 → 密码错误提示', msg1);

await page.waitForFunction(
    (prev) => document.querySelector('.captcha-row img')?.src !== prev,
    src0, { timeout: 8000 }
).catch(() => {});
const src1 = await page.evaluate(() => document.querySelector('.captcha-row img')?.src || '');
const cleared = await page.evaluate(() => document.querySelector('.captcha-row input')?.value || '');
assert(src1 && src1 !== src0, 'U1b 失败后验证码图自动刷新', `src${src1 ? '已变化' : '未变'}`);
assert(cleared === '', 'U1c 验证码输入已清空', cleared);

// U2：新图验证码 + 正确密码 → 直接成功
const code1 = await read_captcha_text();
await page.fill('.el-tab-pane:nth-child(1) input[placeholder="密码"]', '123456');
await page.fill('.el-tab-pane:nth-child(1) input[placeholder="验证码"]', code1);
await page.click('.submit-btn');
await page.waitForURL(`${BASE}/`, { timeout: 8000 });
assert(true, 'U2 新图验证码 + 对密码 → 登录成功（无二次验证码报错）');

/* ---------- U3/U4 防重入回归（r51c）：并发双提交只弹一条提示 ----------
 * 原 bug：验证码框回车触发 keyup.enter + form 隐式提交双请求——请求 A 消费验证码报
 * 「用户名或密码错误」、请求 B 报「验证码错误或已过期」，两条矛盾提示同弹。
 * 修复：删 @keyup.enter + loading 锁先于 await 置位。回归验证两条触发路径。
 */
await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.login-page .captcha-row img', { timeout: 8000 });

/** 填错密码提交并收集 1.8s 内弹出的全部提示（el-message 展示 3s，并发第二条必然可见） */
async function submit_wrong_and_collect(trigger) {
    const code = await read_captcha_text();
    await page.fill('.el-tab-pane:nth-child(1) input[placeholder="用户名"]', 'zhangwl');
    await page.fill('.el-tab-pane:nth-child(1) input[placeholder="密码"]', 'wrong-pwd');
    await page.fill('.el-tab-pane:nth-child(1) input[placeholder="验证码"]', code);
    if (trigger === 'enter') await page.press('.el-tab-pane:nth-child(1) input[placeholder="验证码"]', 'Enter');
    else await page.click('.submit-btn', { clickCount: 2 });
    await page.waitForSelector('.el-message:visible', { timeout: 5000 });
    await page.waitForTimeout(1800);
    const msgs = (await page.locator('.el-message:visible').allTextContents()).map((s) => s.trim());
    // 等待失败自动换图（r51b 兜底），为下一次触发备好新验证码
    const cur = await page.evaluate(() => document.querySelector('.captcha-row img')?.src);
    await page.waitForFunction(
        (prev) => document.querySelector('.captcha-row img')?.src !== prev,
        cur, { timeout: 8000 }
    ).catch(() => {});
    return msgs;
}

const msgsEnter = await submit_wrong_and_collect('enter');
assert(msgsEnter.length === 1 && /用户名或密码错误/.test(msgsEnter[0]),
    'U3 回车提交错密码 → 仅一条密码错误提示（无验证码矛盾提示）', msgsEnter.join(' || ') || '(无提示)');

const msgsDbl = await submit_wrong_and_collect('dbl');
assert(msgsDbl.length === 1 && /用户名或密码错误/.test(msgsDbl[0]),
    'U4 快速双击提交 → 仅一条密码错误提示', msgsDbl.join(' || ') || '(无提示)');

await browser.close();
console.log(`\n结果：${passed} 通过 / ${failed} 失败`);
process.exit(failed ? 1 : 0);
