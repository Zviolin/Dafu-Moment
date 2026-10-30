/**
 * r81 边界 / 移动端 / 缓存审核走查（《测试文档》4 项修复的补充验证）
 *
 * 覆盖：
 * E1-E4 饮食档案：空输入不新增、8 字上限、自定义 chip 取消后保存不含、localStorage 脏数据不崩溃
 * E5-E7 打卡：重复自填菜去重、切换点位清空已选自填菜、自填菜可发布并弹成功层
 * E8 移动端（375×812）：饮食档案 / 打卡 / 宠物三页无横向溢出
 * E9 四个页面无未捕获 JS 异常
 * E10 装扮图响应头 immutable + 实际传输体积（performance entries 汇总 ≤ 1.2MB）
 *
 * 运行：node tests/walkthrough-r81-qa-doc-edge.test.mjs
 * 前置：docker 全容器 + :8095 + 后端 DEBUG=true
 * 幂等：临时账号 + 收尾清理；localStorage 仅存在于本次浏览器上下文
 */
import { createRequire } from 'module';
import { execSync } from 'child_process';
import { cleanup_fixtures } from './_fixture-cleanup.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright-core');

const BASE = 'http://localhost:8095';
const EXE = 'C:\\Users\\Zviolin\\AppData\\Local\\ms-playwright\\chromium-1208\\chrome-win64\\chrome.exe';
let passed = 0;
let failed = 0;

/**
 * 断言工具
 * @param {boolean} cond
 * @param {string} name
 * @param {string} [extra]
 */
function assert(cond, name, extra = '') {
    const mark = cond ? 'PASS' : 'FAIL';
    cond ? passed++ : failed++;
    console.log(`${mark} ${name}${extra ? ' | ' + extra : ''}`);
}

/**
 * 数据库直连执行（收尾清理）
 * @param {string} q
 */
function db_exec(q) {
    return execSync(`docker exec dafu-mysql mysql -uroot -pdafu_root_2026 --default-character-set=utf8mb4 -N -B -e "${q}"`, { stdio: 'pipe' }).toString();
}

/**
 * 清空限流窗口
 * @param {string} action
 */
function flush_rl(action) {
    try {
        execSync(`docker exec dafu-redis redis-cli EVAL "local ks=redis.call('keys','rl:${action}:*'); for i,k in ipairs(ks) do redis.call('del',k) end; return #ks" 0`, { stdio: 'pipe' });
    } catch { /* Redis 不可用 */ }
}

/**
 * 取验证码
 * @returns {Promise<{captchaId:string,captchaCode:string}>}
 */
async function captcha_body() {
    const j = await (await fetch(`${BASE}/api/auth/captcha`)).json();
    if (!j.data || !j.data.debugCode) throw new Error('验证码无 debugCode（需 DEBUG=true）');
    return { captchaId: j.data.captchaId, captchaCode: j.data.debugCode };
}

const USER = `r81edge_${String(Date.now()).slice(-8)}`;
const PWD = 'r81edge123456';
flush_rl('register');
flush_rl('login');

await fetch(`${BASE}/api/auth/register`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: USER, password: PWD, nickname: 'r81边界', ...(await captcha_body()) }),
});
const lr = await (await fetch(`${BASE}/api/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: USER, password: PWD, ...(await captcha_body()) }),
})).json();
if (!lr.data || !lr.data.token) {
    console.error('临时账号登录失败', JSON.stringify(lr).slice(0, 300));
    process.exit(1);
}
const TOKEN = lr.data.token;
const USER_JSON = JSON.stringify(lr.data.user);
const UID = lr.data.user.id;

const browser = await chromium.launch({ headless: true, executablePath: EXE });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

/** 收集未捕获 JS 异常（按页面路径记录） */
const js_errors = [];
page.on('pageerror', (e) => js_errors.push(String(e.message || e)));

await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
await page.evaluate(([t, u]) => {
    localStorage.setItem('fk_token', t);
    localStorage.setItem('fk_user', u);
}, [TOKEN, USER_JSON]);

/* ---------------- E1-E4 饮食档案边界 ---------------- */
await page.goto(`${BASE}/ai/profile`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.profile-page', { timeout: 10000 });
const severe_grp = page.locator('.card.group', { hasText: '严重过敏' }).first();

const before = await severe_grp.locator('.pchip').count();
await severe_grp.locator('.add-row .add-btn').click();          // 空输入直接点添加
await page.waitForTimeout(300);
assert((await severe_grp.locator('.pchip').count()) === before, 'E1.1 空输入点击「添加」不新增 chip');

await severe_grp.locator('.add-row input').fill('一二三四五六七八');
await severe_grp.locator('.add-row .add-btn').click();
await page.waitForTimeout(300);
assert((await severe_grp.locator('.pchip', { hasText: '一二三四五六七八' }).count()) === 1, 'E1.2 8 字自定义项可添加');

const input = severe_grp.locator('.add-row input');
await input.fill('');
await input.pressSequentially('一二三四五六七八九');
const typed = await input.inputValue();
assert(typed.length === 8, 'E1.3 maxlength=8 截断超长输入', `len=${typed.length}`);

const custom_chip = severe_grp.locator('.pchip', { hasText: '一二三四五六七八' });
await custom_chip.click();                                      // 取消选中
await page.click('.save-btn');
await page.waitForSelector('.el-message:has-text("档案已保存")', { timeout: 8000 });
const prof = await page.evaluate(() => JSON.parse(localStorage.getItem('dafu_diet_profile') || 'null'));
assert(!(prof.severe_allergy || []).includes('一二三四五六七八'), 'E1.4 取消选中的自定义项不写入档案', JSON.stringify(prof.severe_allergy));

/* E4：脏数据兜底（旧版本把数组存成字符串/null） */
await page.evaluate(() => localStorage.setItem('dafu_diet_profile', JSON.stringify({ severe_allergy: '花生', avoids: null, mild_dislike: 42, tastes: '微辣' })));
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForSelector('.profile-page', { timeout: 10000 });
const severe_grp2 = page.locator('.card.group', { hasText: '严重过敏' }).first();
await severe_grp2.locator('.add-row input').fill('腰果');
await severe_grp2.locator('.add-row .add-btn').click();
await page.waitForTimeout(300);
assert((await severe_grp2.locator('.pchip', { hasText: '腰果' }).count()) === 1, 'E1.5 localStorage 脏数据下页面不崩溃且可继续添加');
const err_after_dirty = js_errors.length;
assert(err_after_dirty === 0, 'E1.6 脏数据回显无未捕获 JS 异常', `errors=${err_after_dirty}`);

/* ---------------- E5-E7 打卡边界 ---------------- */
await page.goto(`${BASE}/checkin`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.f-row .el-select', { timeout: 10000 });

/** 选中点位下拉中的指定门店 */
async function pick_canteen(name) {
    await page.click('.f-row .el-select');
    await page.waitForSelector('.el-select-dropdown:visible .el-select-dropdown__item', { timeout: 10000 });
    await page.locator('.el-select-dropdown:visible .el-select-dropdown__item', { hasText: name }).first().click();
    await page.waitForTimeout(600);
}

await pick_canteen('福州麦当劳国宾大道DT餐厅');
await page.waitForSelector('.f-hint:has-text("这个点位暂时没有在售菜品")', { timeout: 10000 });

await page.fill('.add-row input', '牛肉面');
await page.click('.add-row .add-btn');
await page.waitForTimeout(300);
await page.fill('.add-row input', '牛肉面');
await page.click('.add-row .add-btn');
await page.waitForSelector('.el-message:has-text("这道菜已经选上了")', { timeout: 5000 });
assert((await page.locator('.dish-chip.custom', { hasText: '牛肉面' }).count()) === 1, 'E2.1 重复自填同一道菜只保留一个 chip');

await pick_canteen('江一福·按时吃饭·啫啫煲');
assert((await page.locator('.dish-chip.custom').count()) === 0, 'E2.2 切换点位后已选自填菜被清空（不会串点位）');
assert((await page.locator('.dish-chips .dish-chip:not(.custom)').count()) > 0, 'E2.3 切换后正常加载在售菜品 chips');

await pick_canteen('福州麦当劳国宾大道DT餐厅');
await page.fill('.add-row input', '烧麦');
await page.click('.add-row .add-btn');
await page.waitForTimeout(300);
await page.click('.btn-primary.main-btn');
await page.waitForSelector('.success-card', { timeout: 8000 });
const recs = await page.evaluate(() => JSON.parse(localStorage.getItem('dafu_checkins') || '[]'));
assert(recs.length === 1 && (recs[0].dishes || [])[0].name === '烧麦', 'E2.4 自填菜可发布打卡并写入流水', JSON.stringify(recs[0] && recs[0].dishes));
assert((await page.locator('.success-card').isVisible()), 'E2.5 发布后展示打卡成功联动弹层');

/* ---------------- E10 装扮图响应头与传输体积 ---------------- */
const resp = await page.request.get(`${BASE}/assets/pet-dress/d1.png?v=r81`);
const cc = resp.headers()['cache-control'] || '';
const cl = Number(resp.headers()['content-length'] || 0);
assert(/immutable/.test(cc), 'E3.1 装扮图响应头含 immutable（长缓存 + 版本号换键）', cc);
assert(cl > 0 && cl <= 200 * 1024, 'E3.2 单张贴纸 content-length ≤ 200KB', `${cl}B`);

await page.goto(`${BASE}/pet`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.pet-name', { timeout: 10000 });
await page.click('.tri-cell:has-text("形象")');
await page.waitForSelector('.skin-panel', { timeout: 8000 });
await page.waitForFunction(() => {
    const img = document.querySelector('.skin-panel .face-grid img');
    return img && img.naturalWidth > 0;
}, null, { timeout: 20000 });
await page.waitForTimeout(800);
const dress_bytes = await page.evaluate(() => {
    return performance.getEntriesByType('resource')
        .filter((e) => e.name.includes('/assets/pet-dress/'))
        .reduce((s, e) => s + (e.transferSize || e.encodedBodySize || 0), 0);
});
assert(dress_bytes > 0 && dress_bytes <= 1.2 * 1024 * 1024, 'E3.3 装扮图实际传输合计 ≤ 1.2MB', `${(dress_bytes / 1024).toFixed(0)}KB`);

/* ---------------- E8 移动端无横向溢出 ---------------- */
const m = await browser.newPage({ viewport: { width: 375, height: 812 } });
m.on('pageerror', (e) => js_errors.push(`mobile ${e.message}`));
await m.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
await m.evaluate(([t, u]) => {
    localStorage.setItem('fk_token', t);
    localStorage.setItem('fk_user', u);
}, [TOKEN, USER_JSON]);
for (const [path, sel] of [['/ai/profile', '.profile-page'], ['/checkin', '.checkin'], ['/pet', '.pet']]) {
    await m.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
    await m.waitForSelector(sel, { timeout: 10000 });
    const over = await m.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert(over <= 1, `E4 移动端 ${path} 无横向溢出`, `overflow=${over}px`);
}
await m.close();

assert(js_errors.length === 0, 'E5 饮食档案 / 打卡 / 宠物页全程无未捕获 JS 异常', js_errors.join(' | ').slice(0, 200));

await browser.close();

/* 收尾：清理临时账号及其派生数据（含本走查在 UI 里发布的打卡 check_in） */
cleanup_fixtures({ prefixes: [], usernames: [USER] });

console.log(`\n结果：${passed} 通过 / ${failed} 失败`);
process.exit(failed ? 1 : 0);
