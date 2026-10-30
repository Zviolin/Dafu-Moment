/**
 * r80 UI 走查：统一身份口令的前端闭环
 * U1 授权页提示统一初始口令 FZU521（并预填）
 * U2 初始口令登录 → 弹「去设置」→ 落到「我的 → 统一身份口令」弹层（顶部提示条存在）
 * U3 两次新口令不一致 → 表单校验拦截；正确填写 → 修改成功、提示条消失
 * U4 设置页「账号与安全」新增「统一身份口令」入口，点击直达该弹层
 * U5 后台「统一身份账号」列表展示口令状态标签 + 搜索 + 重置为初始口令
 * 幂等：学号带时间后缀，收尾清 user / fzu_account 行
 *
 * 运行：node tests/walkthrough-r80-fzu-password-ui.test.mjs（需 docker 全容器 + :8095 + DEBUG=true）
 */
import { createRequire } from 'module';
import { execSync } from 'child_process';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright-core');

const BASE = 'http://localhost:8095';
const EXE = 'C:\\Users\\Zviolin\\AppData\\Local\\ms-playwright\\chromium-1208\\chrome-win64\\chrome.exe';
let passed = 0, failed = 0;

/**
 * 断言工具：全绿打勾，失败计数并继续（收尾统一 exit code）
 * @param {boolean} cond - 断言条件
 * @param {string} name - 用例名
 * @param {string} [extra] - 附加信息
 */
function assert(cond, name, extra = '') {
    const mark = cond ? 'PASS' : 'FAIL';
    cond ? passed++ : failed++;
    console.log(`${mark} ${name}${extra ? ' | ' + extra : ''}`);
}

/**
 * 数据库直连执行（仅收尾清理）
 * @param {string} sql - SQL 语句
 */
function db_exec(sql) {
    return execSync(
        `docker exec dafu-mysql mysql -uroot -pdafu_root_2026 --default-character-set=utf8mb4 -e "${sql}"`,
        { stdio: 'pipe' }
    ).toString();
}

/**
 * 清空限流窗口（连续跑走查会被 SSO/登录 10 次窗口挡住）
 * @param {string} action - 限流动作名
 */
function flush_rl(action) {
    try {
        execSync(`docker exec dafu-redis redis-cli EVAL "local ks=redis.call('keys','rl:${action}:*'); for i,k in ipairs(ks) do redis.call('del',k) end; return #ks" 0`, { stdio: 'pipe' });
    } catch { /* Redis 不可用：限流降级放行 */ }
}

const SUF = String(Date.now()).slice(-7);
const SID = `77${SUF}`;          // 本次专用学号（9 位，符合福大学号口径）
const NEW_PWD = 'Fzu@2026ui';    // 本人新口令

db_exec(`DELETE FROM dafu.fzu_account WHERE uid='${SID}'; DELETE FROM dafu.user WHERE username='${SID}';`);
flush_rl('fzu_sso');
flush_rl('fzu_pwd');
flush_rl('fzu_account_pwd_reset');

const browser = await chromium.launch({ headless: true, executablePath: EXE });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

/* ---------- U1 授权页：统一初始口令提示 + 预填 ---------- */
await page.goto(`${BASE}/auth/fzu/authorize?intent=login`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.authz-head', { timeout: 10000 });
const initTip = (await page.locator('.authz-init').textContent()).trim();
assert(initTip.includes('FZU521') && initTip.includes('统一初始口令'), 'U1.1 授权页展示统一初始口令 FZU521');
const prePwd = await page.locator('.authz-card input[type="password"]').inputValue();
assert(prePwd === 'FZU521', 'U1.2 授权页默认预填统一初始口令', `value=${prePwd}`);

/* ---------- U2 初始口令登录 → 去设置 → 我的 · 统一身份口令弹层 ---------- */
await page.fill('.authz-card input[placeholder="学号"]', SID);
await page.click('.authz-card button:has-text("同意并授权")');
await page.waitForSelector('.el-message-box:visible', { timeout: 10000 });
const boxText = (await page.locator('.el-message-box:visible').textContent()).trim();
assert(boxText.includes('统一初始口令'), 'U2.1 首次登录后弹出改密引导');
await page.click('.el-message-box:visible button:has-text("去设置")');
await page.waitForURL('**/me?dialog=fzu-pwd*', { timeout: 10000 });
await page.waitForSelector('.el-dialog:visible', { timeout: 10000 });
const dlgTitle = (await page.locator('.el-dialog:visible .el-dialog__title').textContent()).trim();
assert(dlgTitle.includes('统一身份口令'), 'U2.2 直达「修改统一身份口令」弹层', dlgTitle);
const tipBar = await page.locator('.pwd-tip').count();
assert(tipBar === 1, 'U2.3 我的页顶部出现初始口令提示条');

/* ---------- U3 双重输入：不一致拦截 → 正确提交成功 ---------- */
const inputs = page.locator('.el-dialog:visible input[type="password"]');
await inputs.nth(0).fill('FZU521');
await inputs.nth(1).fill(NEW_PWD);
await inputs.nth(2).fill(`${NEW_PWD}x`);
await page.click('.el-dialog:visible button:has-text("确认修改")');
await page.waitForSelector('.el-dialog:visible .el-form-item__error', { timeout: 5000 });
const errText = (await page.locator('.el-dialog:visible .el-form-item__error').first().textContent()).trim();
assert(errText.includes('不一致'), 'U3.1 两次新口令不一致被前端拦截', errText);

await inputs.nth(2).fill(NEW_PWD);
await page.click('.el-dialog:visible button:has-text("确认修改")');
await page.waitForSelector('.el-dialog:visible', { state: 'hidden', timeout: 10000 });
// 按文本定位目标提示：前面「统一身份认证成功」的 message 可能仍在屏上，取 first() 会误判
const OK_TEXT = '统一身份口令已更新';
await page.waitForSelector(`.el-message:has-text("${OK_TEXT}")`, { timeout: 8000 });
const okMsg = await page.locator(`.el-message:has-text("${OK_TEXT}")`).first().textContent().catch(() => '');
assert(String(okMsg).includes(OK_TEXT), 'U3.2 改密成功后弹层关闭并提示', String(okMsg).trim());
await page.waitForSelector('.pwd-tip', { state: 'detached', timeout: 8000 });
assert(true, 'U3.3 改密后初始口令提示条消失');

/* ---------- U4 设置页「账号与安全」入口 ---------- */
await page.goto(`${BASE}/settings`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.row:has-text("账号与安全")', { timeout: 8000 });
await page.click('.row:has-text("账号与安全")');
await page.waitForSelector('.el-dialog:visible .acct-row', { timeout: 5000 });
const acctRows = (await page.locator('.el-dialog:visible .acct-row').allTextContents()).join('|');
assert(acctRows.includes('统一身份口令'), 'U4.1 账号与安全弹层展示「统一身份口令」入口', acctRows);
await page.click('.el-dialog:visible .acct-row:has-text("统一身份口令")');
await page.waitForURL('**/me?dialog=fzu-pwd*', { timeout: 8000 });
await page.waitForSelector('.el-dialog:visible', { timeout: 8000 });
assert((await page.locator('.el-dialog:visible .el-dialog__title').textContent()).includes('统一身份口令'), 'U4.2 点击后直达统一身份口令弹层');
await page.locator('.el-dialog:visible .el-dialog__headerbtn').click();

/* ---------- U5 后台「统一身份账号」：列表 / 搜索 / 重置 ---------- */
const cap = await (await fetch(`${BASE}/api/auth/captcha`)).json();
const lr = await (await fetch(`${BASE}/api/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: process.env.DAFU_ADMIN_PASSWORD || 'admin123', captchaId: cap.data.captchaId, captchaCode: cap.data.debugCode }),
})).json();
if (!lr.data || !lr.data.token) { console.error('管理员登录失败', lr); process.exit(1); }
await page.evaluate(([t, u]) => {
    localStorage.setItem('fk_token', t);
    localStorage.setItem('fk_user', u);
}, [lr.data.token, JSON.stringify(lr.data.user)]);
await page.goto(`${BASE}/admin/fzu-accounts`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.el-table__row', { timeout: 10000 });
assert(true, 'U5.1 后台统一身份账号页渲染列表');

await page.fill('.kw input', SID);
await page.click('.bar button:has-text("查询")');
await page.waitForTimeout(800);
const rows = await page.locator('.el-table__row').count();
assert(rows === 1, 'U5.2 按学号搜索命中 1 条', `rows=${rows}`);
const rowText = (await page.locator('.el-table__row').first().textContent()).trim();
assert(rowText.includes(SID) && rowText.includes('已自行改密'), 'U5.3 行内状态为「已自行改密」', rowText.slice(0, 60));

await page.click('.el-table__row button:has-text("重置")');
await page.waitForSelector('.el-message-box:visible', { timeout: 5000 });
const resetText = (await page.locator('.el-message-box:visible').textContent()).trim();
assert(resetText.includes('统一初始口令'), 'U5.4 重置前二次确认说明将恢复初始口令');
await page.click('.el-message-box:visible button:has-text("确定重置")');
await page.waitForSelector('.el-message', { timeout: 8000 });
await page.waitForTimeout(800);
const rowText2 = (await page.locator('.el-table__row').first().textContent()).trim();
assert(rowText2.includes('初始口令'), 'U5.5 重置后状态回到「初始口令」', rowText2.slice(0, 60));

await browser.close();

/* ---------- 收尾：清理本次账号（幂等） ---------- */
db_exec(`DELETE FROM dafu.fzu_account WHERE uid='${SID}'; DELETE FROM dafu.user WHERE username='${SID}';`);

console.log(`\n结果：${passed} 通过 / ${failed} 失败`);
process.exit(failed ? 1 : 0);
