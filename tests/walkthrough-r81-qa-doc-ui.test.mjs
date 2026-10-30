/**
 * r81 UI 走查：按《测试文档》4 条 QA 截图逐条复验（真实浏览器操作）
 *
 * 图 1 /ai/profile：严重过敏、一般不喜欢两组可自定义添加「腰果」「苦瓜」，去重、保存、刷新回显
 * 图 2 /checkin：选「福州麦当劳国宾大道DT餐厅」→ 空态提示 + 手动填写「牛肉面」→「仅记录」入库
 *                 再切到有菜点位 → 在售 chips 可点、占位文案切换（回归）
 * 图 3 /pet、/pet-community：宠物名显示「小福宝」，全页无 mojibake
 * 图 4 /pet 装扮弹层：贴纸 ?v=r81 缓存键 + loading=lazy + 实际解码宽度 ≤ 320
 *
 * 运行：node tests/walkthrough-r81-qa-doc-ui.test.mjs
 * 前置：docker 全容器 + http://localhost:8095；后端 DEBUG=true（验证码回显 debugCode）
 * 幂等：注册带时间后缀的临时账号，收尾统一走 _fixture-cleanup 回收账号及其派生数据
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
 * 数据库直连执行（准备 / 收尾清理）
 * @param {string} q - SQL 语句
 */
function db_exec(q) {
    return execSync(
        `docker exec dafu-mysql mysql -uroot -pdafu_root_2026 --default-character-set=utf8mb4 -N -B -e "${q}"`,
        { stdio: 'pipe' }
    ).toString();
}

/**
 * 清空限流窗口（注册/登录有 10 次窗口，连续跑走查会打满）
 * @param {string} action - 限流动作名
 */
function flush_rl(action) {
    try {
        execSync(`docker exec dafu-redis redis-cli EVAL "local ks=redis.call('keys','rl:${action}:*'); for i,k in ipairs(ks) do redis.call('del',k) end; return #ks" 0`, { stdio: 'pipe' });
    } catch { /* Redis 不可用：限流降级放行 */ }
}

/**
 * 取验证码（DEBUG=true 时回显 debugCode）
 * @returns {Promise<{captchaId:string, captchaCode:string}>}
 */
async function captcha_body() {
    const j = await (await fetch(`${BASE}/api/auth/captcha`)).json();
    if (!j.data || !j.data.debugCode) throw new Error('验证码无 debugCode（需后端 DEBUG=true）');
    return { captchaId: j.data.captchaId, captchaCode: j.data.debugCode };
}

const USER = `r81ui_${String(Date.now()).slice(-8)}`;
const PWD = 'r81ui123456';
flush_rl('register');
flush_rl('login');

/* 准备：注册临时账号（宠物由 /me/pet 首次访问自动创建，正好验证 DB 默认值） */
await fetch(`${BASE}/api/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: USER, password: PWD, nickname: 'r81走查', ...(await captcha_body()) }),
});
const lr = await (await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: USER, password: PWD, ...(await captcha_body()) }),
})).json();
if (!lr.data || !lr.data.token) {
    console.error('临时账号登录失败', JSON.stringify(lr).slice(0, 300));
    process.exit(1);
}
const TOKEN = lr.data.token;
const USER_JSON = JSON.stringify(lr.data.user);
const UID = lr.data.user.id;

/* 图 3 接口层：新宠物默认名必须是正确中文（列默认值已修） */
const pet_api = await (await fetch(`${BASE}/api/me/pet`, { headers: { authorization: `Bearer ${TOKEN}` } })).json();
assert(pet_api.data && pet_api.data.name === '小福宝', '图3-API 新宠物默认名 = 小福宝', pet_api.data && pet_api.data.name);

const browser = await chromium.launch({ headless: true, executablePath: EXE });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
await page.evaluate(([t, u]) => {
    localStorage.setItem('fk_token', t);
    localStorage.setItem('fk_user', u);
}, [TOKEN, USER_JSON]);

/* ---------------- 图 1：饮食档案两组自定义添加 ---------------- */
await page.goto(`${BASE}/ai/profile`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.profile-page', { timeout: 10000 });

const addRows = await page.locator('.add-row').count();
assert(addRows === 3, '图1.1 忌口 / 严重过敏 / 一般不喜欢 三组均有自定义入口', `add-row=${addRows}`);

const severe_grp = page.locator('.card.group', { hasText: '严重过敏' }).first();
const mild_grp = page.locator('.card.group', { hasText: '一般不喜欢' }).first();

await severe_grp.locator('.add-row input').fill('腰果');
await severe_grp.locator('.add-row .add-btn').click();
await page.waitForSelector('.el-message', { timeout: 5000 });
const severe_chip = severe_grp.locator('.pchip', { hasText: '腰果' });
const severe_n = await severe_chip.count();
const severe_on = severe_n ? await severe_chip.first().evaluate((el) => el.classList.contains('on')) : false;
assert(severe_n === 1 && severe_on, '图1.2 严重过敏添加「腰果」后出现且自动选中', `count=${severe_n} on=${severe_on}`);

await mild_grp.locator('.add-row input').fill('苦瓜');
await mild_grp.locator('.add-row .add-btn').click();
await page.waitForTimeout(400);
const mild_chip = mild_grp.locator('.pchip', { hasText: '苦瓜' });
const mild_n = await mild_chip.count();
const mild_on = mild_n ? await mild_chip.first().evaluate((el) => el.classList.contains('on')) : false;
assert(mild_n === 1 && mild_on, '图1.3 一般不喜欢添加「苦瓜」后出现且自动选中', `count=${mild_n} on=${mild_on}`);

/* 去重：重复添加同一项应提示已存在且不新增 */
await severe_grp.locator('.add-row input').fill('腰果');
await severe_grp.locator('.add-row .add-btn').click();
await page.waitForTimeout(400);
const dup_msg = await page.locator('.el-message:visible').last().textContent().catch(() => '');
assert(dup_msg.includes('已经在列表里了'), '图1.4 重复添加被去重并提示', String(dup_msg).trim());
assert((await severe_grp.locator('.pchip', { hasText: '腰果' }).count()) === 1, '图1.5 去重后「腰果」仍只 1 个 chip');

/* 保存 → localStorage */
await page.click('.save-btn');
await page.waitForSelector('.el-message:has-text("档案已保存")', { timeout: 8000 });
const prof = await page.evaluate(() => JSON.parse(localStorage.getItem('dafu_diet_profile') || 'null'));
assert(Array.isArray(prof.severe_allergy) && prof.severe_allergy.includes('腰果'), '图1.6 保存档案含严重过敏「腰果」', JSON.stringify(prof.severe_allergy));
assert(Array.isArray(prof.mild_dislike) && prof.mild_dislike.includes('苦瓜'), '图1.7 保存档案含一般不喜欢「苦瓜」', JSON.stringify(prof.mild_dislike));

/* 刷新回显 */
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForSelector('.profile-page', { timeout: 10000 });
const echo = await page.locator('.card.group', { hasText: '严重过敏' }).first().locator('.pchip', { hasText: '腰果' }).count();
assert(echo === 1, '图1.8 刷新后自定义过敏原「腰果」回显', `count=${echo}`);

/* ---------------- 图 2：打卡页点位无菜品时可自填 ---------------- */
await page.goto(`${BASE}/checkin`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.f-row .el-select', { timeout: 10000 });
await page.click('.f-row .el-select');
await page.waitForSelector('.el-select-dropdown:visible .el-select-dropdown__item', { timeout: 10000 });
await page.locator('.el-select-dropdown:visible .el-select-dropdown__item', { hasText: '福州麦当劳国宾大道DT餐厅' }).first().click();

await page.waitForSelector('.f-hint:has-text("这个点位暂时没有在售菜品，可在下方手动填写")', { timeout: 10000 });
assert(true, '图2.1 选中麦当劳后出现「暂时没有在售菜品，可在下方手动填写」提示');
const preset_chips = await page.locator('.dish-chips .dish-chip:not(.custom)').count();
assert(preset_chips === 0, '图2.2 该点位确实没有在售菜品 chip（复现原问题场景）', `chips=${preset_chips}`);
const ph = await page.locator('.add-row input').getAttribute('placeholder');
assert(ph.includes('手动填写你吃到的'), '图2.3 无菜时自填输入框给出明确占位', ph);

await page.fill('.add-row input', '牛肉面');
await page.click('.add-row .add-btn');
await page.waitForTimeout(400);
const custom_chip = page.locator('.dish-chip.custom', { hasText: '牛肉面' });
assert((await custom_chip.count()) === 1, '图2.4 手动填写「牛肉面」生成自填 chip');
assert(await custom_chip.first().evaluate((el) => el.classList.contains('on')), '图2.5 自填 chip 默认选中');

await page.click('.ghost-btn');
await page.waitForSelector('.el-message:has-text("已记到本机手账")', { timeout: 8000 });
const recs = await page.evaluate(() => JSON.parse(localStorage.getItem('dafu_checkins') || '[]'));
const rec = recs[0] || {};
const dish = (rec.dishes || [])[0] || {};
assert(rec.canteenName === '福州麦当劳国宾大道DT餐厅', '图2.6 打卡记录点位正确', rec.canteenName);
assert(dish.name === '牛肉面' && dish.price === 0 && dish.id === null, '图2.7 打卡记录保留自填菜「牛肉面」', JSON.stringify(dish));

/* 回归：有菜点位仍可点 chip，占位文案随场景切换 */
await page.click('.f-row .el-select');
await page.waitForSelector('.el-select-dropdown:visible .el-select-dropdown__item', { timeout: 10000 });
await page.locator('.el-select-dropdown:visible .el-select-dropdown__item', { hasText: '江一福·按时吃饭·啫啫煲' }).first().click();
await page.waitForFunction(() => document.querySelectorAll('.dish-chips .dish-chip:not(.custom)').length > 0, null, { timeout: 15000 });
const first_chip = page.locator('.dish-chips .dish-chip:not(.custom)').first();
const first_name = (await first_chip.textContent()).trim();
await first_chip.click();
assert(await first_chip.evaluate((el) => el.classList.contains('on')), '图2.8 有菜点位 chips 仍可点选（回归）', first_name);
const ph2 = await page.locator('.add-row input').getAttribute('placeholder');
assert(ph2 === '没找到？手动添加你吃到的', '图2.9 有菜时占位切换为「没找到？手动添加你吃到的」', ph2);

/* ---------------- 图 4：宠物装扮弹层加载 ---------------- */
await page.goto(`${BASE}/pet`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.pet-name', { timeout: 10000 });
const pet_name = (await page.locator('.pet-name').textContent()).trim();
assert(pet_name === '小福宝', '图3.1 宠物页名称显示「小福宝」（不再乱码）', pet_name);

await page.click('.tri-cell:has-text("形象")');
await page.waitForSelector('.skin-panel', { timeout: 8000 });
const dress_imgs = page.locator('.skin-panel .face-grid').first().locator('img');
const img_n = await dress_imgs.count();
assert(img_n >= 9, '图4.1 装扮橱窗渲染全部贴纸', `imgs=${img_n}`);
const attrs = await dress_imgs.evaluateAll((els) => els.map((e) => ({
    lazy: e.getAttribute('loading'),
    async: e.getAttribute('decoding'),
    src: e.getAttribute('src'),
    w: e.naturalWidth,
})));
assert(attrs.every((a) => a.lazy === 'lazy'), '图4.2 装扮贴纸全部 loading="lazy"');
assert(attrs.every((a) => a.async === 'async'), '图4.3 装扮贴纸全部 decoding="async"');
assert(attrs.every((a) => a.src.includes('?v=r82')), '图4.4 装扮贴纸全部带 ?v=r82 缓存键', attrs[0].src);
await page.waitForFunction(() => {
    const img = document.querySelector('.skin-panel .face-grid img');
    return img && img.naturalWidth > 0;
}, null, { timeout: 20000 });
const w0 = await dress_imgs.first().evaluate((e) => e.naturalWidth);
assert(w0 > 0 && w0 <= 520, '图4.5 首张贴纸实际解码成功且宽度 ≤ 520px（r82 压缩后 512px 长边）', `naturalWidth=${w0}`);

/* 图 3 跨页交叉验证：宠物页 / 社区页正文无 mojibake */
const pet_body = await page.locator('body').textContent();
assert(!/å°|ç¦|å®/.test(pet_body), '图3.2 宠物页全页无 mojibake 字符');

await page.goto(`${BASE}/pet-community`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.mine-info b', { timeout: 10000 });
const mine_name = (await page.locator('.mine-info b').first().textContent()).trim();
assert(mine_name === '小福宝', '图3.3 社区宠物中心「我的福宝」名称正确', mine_name);
const comm_body = await page.locator('body').textContent();
assert(!/å°|ç¦|å®/.test(comm_body), '图3.4 社区宠物页全页无 mojibake 字符');
const comm_lazy = await page.locator('img.p-dress').evaluateAll((els) => els.every((e) => e.getAttribute('loading') === 'lazy' && (e.getAttribute('src') || '').includes('?v=r82')));
assert(comm_lazy, '图4.6 社区页装扮图 lazy + 版本号（无装扮时为空真值）');

await browser.close();

/* ---------------- 收尾：清理临时账号及其派生数据（幂等） ---------------- */
cleanup_fixtures({ prefixes: [], usernames: [USER] });

console.log(`\n结果：${passed} 通过 / ${failed} 失败`);
process.exit(failed ? 1 : 0);
