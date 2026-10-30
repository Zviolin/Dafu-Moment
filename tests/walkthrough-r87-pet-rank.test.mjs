/**
 * r87 福宝投喂榜走查：0 次不上榜 + 新领养福宝不误判「饿肚子」
 *
 * 背景（用户反馈）：「部分投喂福宝的，其出现投喂 0 次也上榜之类的奇怪形式」
 * 根因：`/pet/community` 把 pet 表全部宠物按 feed_total 排序后直接取前 3 当榜单，
 *      从未投喂（feed_total=0）的福宝也会占位；同时 `last_fed_at` 为空时按 999 小时
 *      计算心情，导致刚领养的福宝一进页面就被判成「超过 24 小时没喂食」。
 * 修复口径：
 *      1) 后端新增 `ranking` 字段，只收 feed_total>0 的福宝，名次在榜内从 1 重排；
 *      2) 心情以「最近投喂 → 无则领养时间」为基准，并回传 `fed_never`，前端区分文案。
 *
 * 运行：node tests/walkthrough-r87-pet-rank.test.mjs
 * 前置：docker 全容器 + http://localhost:8095；后端 DEBUG=true（验证码回显 debugCode）
 * 幂等：注册带时间后缀的临时账号，收尾统一走 _fixture-cleanup 回收账号及其派生数据
 */
import { createRequire } from 'module';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { cleanup_fixtures } from './_fixture-cleanup.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright-core');

const BASE = 'http://localhost:8095';
const EXE = 'C:\\Users\\Zviolin\\AppData\\Local\\ms-playwright\\chromium-1208\\chrome-win64\\chrome.exe';
const SHOT_DIR = path.resolve('tests/report/r82-shots');
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
 * 清空限流窗口（注册/登录有次数窗口，连续跑走查会打满）
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

/**
 * 调接口并解包 {code,msg,data}
 * @param {string} method - HTTP 方法
 * @param {string} p - 以 / 开头的接口路径
 * @param {Object|null} body - 请求体
 * @param {string} token - 登录令牌（可空）
 * @returns {Promise<Object>} data
 */
async function api(method, p, body, token = '') {
    const r = await fetch(`${BASE}/api${p}`, {
        method,
        headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    const j = await r.json();
    if (j.code !== 0) throw new Error(`${method} ${p} -> ${r.status} ${j.code} ${j.msg}`);
    return j.data;
}

/**
 * 用 SQL 读取单个数值（容器内 mysql 客户端）
 * @param {string} sql - 单值查询
 * @returns {number}
 */
function sql_num(sql) {
    const out = execSync(
        `docker exec dafu-mysql mysql -uroot -pdafu_root_2026 -N -e "${sql.replace(/"/g, '\\"')}" --default-character-set=utf8mb4`,
        { stdio: 'pipe' }
    ).toString().trim();
    return Number(out.split('\n')[0]) || 0;
}

const USER = `r87pet_${String(Date.now()).slice(-8)}`;
const PWD = 'r87pet123456';
flush_rl('register');
flush_rl('login');

/* ---------------- 准备：注册临时账号（首次进宠物页懒创建福宝，从未投喂） ---------------- */
await fetch(`${BASE}/api/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: USER, password: PWD, nickname: 'r87投喂榜走查', ...(await captcha_body()) }),
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
const UID = lr.data.user.id;

/* ---------------- A. 接口层：未投喂的新福宝 ---------------- */
const pet0 = await api('GET', '/me/pet', undefined, TOKEN);
assert(pet0.fed_never === true, 'A1 新领养福宝 fed_never=true');
assert(pet0.mood === 'normal', 'A2 新领养福宝心情为待机（不误判饿肚子）', `mood=${pet0.mood}`);

const c0 = await api('GET', '/pet/community', undefined, TOKEN);
assert(Array.isArray(c0.ranking), 'A3 投喂榜字段 ranking 存在');
assert(c0.ranking.every((x) => Number(x.feed_total) > 0), 'A4 投喂榜不含 0 次福宝',
    `feed=${JSON.stringify(c0.ranking.map((x) => x.feed_total))}`);
assert(c0.ranking.every((x, i) => Number(x.rank) === i + 1), 'A5 榜单名次从 1 连续排列',
    `ranks=${JSON.stringify(c0.ranking.map((x) => x.rank))}`);
assert(!c0.ranking.some((x) => Number(x.user_id) === Number(UID)), 'A6 未投喂的自己不上榜');
assert(c0.my_rank === null, 'A7 未投喂时 my_rank 为空', JSON.stringify(c0.my_rank));
const my_row = c0.list.find((x) => Number(x.user_id) === Number(UID));
assert(!!my_row && Number(my_row.feed_total) === 0, 'A8 广场仍展示自己（0 次但不进榜）');
assert(my_row.mood === 'normal' && my_row.fed_never === true, 'A9 广场中未投喂福宝为待机态',
    `mood=${my_row.mood} fed_never=${my_row.fed_never}`);
const db_fed = sql_num('SELECT COUNT(*) FROM dafu.pet WHERE feed_total > 0;');
assert(db_fed >= c0.ranking.length, 'A10 榜单人数不超过库里真实已投喂人数', `db=${db_fed} rank=${c0.ranking.length}`);

/* ---------------- B. 浏览器：未投喂时 /pet 不出现「超过 24 小时没喂食」 ---------------- */
fs.mkdirSync(SHOT_DIR, { recursive: true });
const browser = await chromium.launch({ executablePath: EXE, headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await ctx.addInitScript(
    ([tk, u]) => {
        localStorage.setItem('fk_token', tk);
        localStorage.setItem('fk_user', JSON.stringify(u));
    },
    [TOKEN, lr.data.user]
);
const page = await ctx.newPage();

await page.goto(`${BASE}/pet`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1000);
const pet_text = await page.evaluate(() => document.body.innerText);
assert(!/超过 24 小时没喂食/.test(pet_text), 'B1 未投喂的新福宝不提示「超过 24 小时没喂食」');
assert(!(await page.locator('.hungry').count()), 'B2 未投喂的新福宝不展示饥饿引导卡');

/* ---------------- C. 浏览器：宠物社区榜不含 0 次 ---------------- */
await page.goto(`${BASE}/pet-community`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
const rank_cards = await page.locator('.top3 .t-card').count();
const rank_texts = await page.locator('.top3 .t-count').allInnerTexts();
assert(rank_cards === c0.ranking.length, 'C1 榜单卡数量与接口 ranking 一致', `dom=${rank_cards} api=${c0.ranking.length}`);
assert(rank_texts.every((t) => /喂了 ([1-9]\d*) 次/.test(t.trim())), 'C2 榜单文案不存在「喂了 0 次」', JSON.stringify(rank_texts));
const community_text = await page.evaluate(() => document.body.innerText);
assert(!/喂了 0 次/.test(community_text), 'C3 页面文本不存在「喂了 0 次」');
assert(!/累计投喂 0 次/.test(community_text), 'C4 广场卡不再出现「累计投喂 0 次」');
assert(/还没投喂过/.test(community_text), 'C5 未投喂福宝在广场显示「还没投喂过」');
assert(/还没投喂过 · 喂第一口就能上榜/.test(community_text), 'C6 我的投喂榜文案给出未投喂引导');
await page.screenshot({ path: path.join(SHOT_DIR, 'r87-pet-community-unfed.png') });

/* ---------------- D. 打卡领道具 → 投喂 → 真实上榜 ---------------- */
await api('POST', '/checkin', { canteenId: 1, visibility: 1, note: 'r87 投喂榜走查打卡', photos: [], dishIds: [] }, TOKEN);
const fed = await api('POST', '/me/pet/feed', undefined, TOKEN);
assert(fed.fed_never === false && Number(fed.feed_total) === 1, 'D1 投喂后 fed_never=false 且累计 1 次',
    `fed_never=${fed.fed_never} feed_total=${fed.feed_total}`);
const c1 = await api('GET', '/pet/community', undefined, TOKEN);
const me_rank = c1.ranking.find((x) => Number(x.user_id) === Number(UID));
assert(!!me_rank && Number(me_rank.feed_total) === 1, 'D2 投喂 1 次后进入累计投喂榜');
assert(c1.my_rank && Number(c1.my_rank.rank) === Number(me_rank.rank), 'D3 my_rank 与榜内名次一致',
    `my=${JSON.stringify(c1.my_rank && c1.my_rank.rank)} rank=${me_rank && me_rank.rank}`);
assert(c1.ranking.every((x) => Number(x.feed_total) > 0), 'D4 投喂后榜单仍不含 0 次');
// 榜单数据与 feed_record 真实记录一致（防止 feed_total 与流水脱节）
for (const x of c1.ranking) {
    const real = sql_num(`SELECT COUNT(*) FROM dafu.feed_record WHERE user_id = ${Number(x.user_id)};`);
    assert(Number(x.feed_total) === real, `D5 用户 ${x.user_id} 的 feed_total 与喂食流水一致`, `feed_total=${x.feed_total} rows=${real}`);
}

/* ---------------- E. 浏览器：投喂后榜卡与我的名次文案 ---------------- */
await page.goto(`${BASE}/pet-community`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
const rank_texts2 = await page.locator('.top3 .t-count').allInnerTexts();
assert(rank_texts2.every((t) => /喂了 ([1-9]\d*) 次/.test(t.trim())), 'E1 投喂后榜卡仍无 0 次', JSON.stringify(rank_texts2));
const mine_rank_text = (await page.locator('.mine-rank').innerText()).trim();
assert(/累计投喂榜第 \d+ 名 · 已喂 1 次/.test(mine_rank_text), 'E2 我的卡展示真实榜内名次', mine_rank_text);
assert(!/喂了 0 次/.test(await page.evaluate(() => document.body.innerText)), 'E3 投喂后页面无「喂了 0 次」');
await page.screenshot({ path: path.join(SHOT_DIR, 'r87-pet-community-fed.png') });

/* ---------------- F. 移动端 375：榜卡不溢出、无 0 次 ---------------- */
await page.setViewportSize({ width: 375, height: 812 });
await page.goto(`${BASE}/pet-community`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1000);
const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
assert(overflow <= 1, 'F1 移动端 375 宠物社区无横向溢出', `overflow=${overflow}`);
assert(!/喂了 0 次/.test(await page.evaluate(() => document.body.innerText)), 'F2 移动端无「喂了 0 次」');
await page.screenshot({ path: path.join(SHOT_DIR, 'r87-pet-community-mobile.png') });

/* ---------------- 收尾 ---------------- */
await browser.close();
cleanup_fixtures({ prefixes: [], usernames: [USER] });
console.log(`\n结果：${passed} 通过 / ${failed} 失败`);
process.exit(failed === 0 ? 0 : 1);
