/**
 * r86 走查：校内食堂档口转化 + 「我的主页」重构
 *
 * 背景：
 *   1. 源库 Dafu-Moment（78 表 SQL）没有任何校内食堂档口/菜品插入；档口名只存在于
 *      collection/round2/ffm-qishan.geojson 的 8 个食堂要素 properties.include.name（共 28 个）。
 *      本轮把这 28 个档口按真实名称转化进 station 表（无菜品，不编造菜单）。
 *   2. 他人公开主页 /user/:id 重构：名片 + 数据/头衔侧栏 + 点评流两栏布局（移动端单列），
 *      数据取自 /users/:id/profile 的 stats / title / follow，关注按钮走真实接口。
 *
 * 运行：node tests/walkthrough-r86-user-profile.test.mjs
 * 前置：docker compose up -d --build（frontend 8095）
 */
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright-core');

const BASE = process.env.LB_BASE || 'http://localhost:8095';
const API = `${BASE}/api`;
const EXE = 'C:\\Users\\Zviolin\\AppData\\Local\\ms-playwright\\chromium-1208\\chrome-win64\\chrome.exe';
const SHOT_DIR = path.resolve('tests/report/r82-shots');

/** 有公开点评的种子用户（34 条） */
const PROFILE_UID = 2;

let passed = 0;
let failed = 0;

/**
 * 断言（不中断，收尾统一退出码）
 * @param {boolean} cond
 * @param {string} name
 * @param {string} [extra]
 */
function assert(cond, name, extra = '') {
    if (cond) {
        passed++;
        console.log(`PASS ${name}${extra ? ' | ' + extra : ''}`);
    } else {
        failed++;
        console.log(`FAIL ${name}${extra ? ' | ' + extra : ''}`);
    }
}

/**
 * GET 解包（非 200 抛错）
 * @param {string} p
 */
async function get(p) {
    const r = await fetch(`${API}${p}`);
    const j = await r.json();
    if (r.status !== 200) throw new Error(`HTTP ${r.status} ${p} ${j.msg || ''}`);
    return j.data;
}

/**
 * 页面探针：量取元素矩形与文本，供布局断言使用
 * @param {import('playwright-core').Page} page
 * @param {string} sel
 */
async function rect_of(page, sel) {
    const el = page.locator(sel).first();
    if (!(await el.count())) return null;
    return el.boundingBox();
}

/** 横向溢出检测：文档滚动宽 > 视口宽即为溢出 */
async function overflow_x(page) {
    return page.evaluate(() => ({
        scroll: document.documentElement.scrollWidth,
        client: document.documentElement.clientWidth,
    }));
}

fs.mkdirSync(SHOT_DIR, { recursive: true });

/* ======================= A. 数据层：校内食堂档口转化 ======================= */

const canteens = await get('/canteens');
const campus = canteens.filter((c) => c.type === 0);
assert(campus.length === 12, '校内食堂 12 个（type=0）', `count=${campus.length}`);

const stations_all = await get('/stations');
const campus_stations = stations_all.filter((s) => campus.some((c) => c.id === s.canteenId));
assert(campus_stations.length === 28, '校内食堂档口 28 个（来自 geojson include 清单）', `count=${campus_stations.length}`);

const station_names = new Set(campus_stations.map((s) => s.name));
const samples = ['食惠烧腊', '塔斯汀', '杨国福麻辣烫', '肯德基', '张亮麻辣烫', '隆江猪脚饭'];
assert(samples.every((n) => station_names.has(n)), '抽样档口名与源数据一致', `缺失=${samples.filter((n) => !station_names.has(n)).join(',') || '无'}`);

// 4 个源库无 include 的食堂保持无档口
const no_station_canteens = campus.filter((c) => !campus_stations.some((s) => s.canteenId === c.id)).map((c) => c.name);
assert(no_station_canteens.length === 4 && no_station_canteens.every((n) => /桃李园|佳客来|海棠园|紫竹园/.test(n)),
    '4 个无档口食堂与源数据一致（桃李园/佳客来/海棠园京元/紫竹园到口）', no_station_canteens.join('、'));

// 校内档口无菜品：不编造菜单（源库 78 表 SQL 未插入食堂菜单）
let campus_dish_count = 0;
for (const s of campus_stations) {
    const d = await get(`/stations/${s.id}`);
    campus_dish_count += (d.dishes || []).length;
}
assert(campus_dish_count === 0, '校内食堂档口无菜品（源库无菜单，不编造）', `dishes=${campus_dish_count}`);

// 点位详情能带出档口（玫瑰园 7 个）
const rose = campus.find((c) => c.name.includes('玫瑰园'));
const rose_detail = await get(`/canteens/${rose.id}`);
const rose_station_names = (rose_detail.stations || []).map((s) => s.name);
assert(Array.isArray(rose_detail.stations) && rose_detail.stations.length === 7,
    '玫瑰园食惠餐厅详情返回 7 个档口', rose_station_names.join('、'));

/* ======================= B. 接口层：公开主页返回新字段 ======================= */

const prof = await get(`/users/${PROFILE_UID}/profile`);
assert(!!prof.user && typeof prof.user.fzuVerified === 'boolean', '主页接口返回 fzuVerified（认证标签数据源）', `value=${prof.user && prof.user.fzuVerified}`);
assert(!!prof.stats && Number.isFinite(prof.stats.contribution), '主页接口返回 stats 贡献统计', JSON.stringify(prof.stats));
assert(!!prof.title && prof.title.name && Number.isFinite(prof.title.progress), '主页接口返回 title 头衔进度', `${prof.title.name} Lv.${prof.title.level} ${prof.title.progress}%`);
assert(!!prof.follow && typeof prof.follow.available === 'boolean', '主页接口返回 follow 关注关系', JSON.stringify(prof.follow));
assert(prof.stats.review_count === prof.reviews.total, '点评数统计与评价流总数一致', `${prof.stats.review_count} vs ${prof.reviews.total}`);

/* ======================= C. 浏览器：桌面两栏 ======================= */

const browser = await chromium.launch({ executablePath: EXE });

const errors = [];
const ctx_desktop = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const page_desktop = await ctx_desktop.newPage();
page_desktop.on('pageerror', (e) => errors.push(`desktop: ${e.message}`));
await page_desktop.goto(`${BASE}/user/${PROFILE_UID}`, { waitUntil: 'networkidle' });
await page_desktop.waitForSelector('.hero', { timeout: 15000 });

const hero = await rect_of(page_desktop, '.hero');
const side = await rect_of(page_desktop, '.side');
const main = await rect_of(page_desktop, '.main');
assert(!!hero && hero.width > 900, '桌面名片区宽度铺满（≥900px）', `w=${hero && Math.round(hero.width)}`);
assert(!!side && !!main && side.x < main.x && Math.abs(side.width - 268) < 2,
    '桌面为侧栏 + 正文两栏（侧栏 268px 在左）', `side=${side && Math.round(side.width)} x=${side && Math.round(side.x)} main.x=${main && Math.round(main.x)}`);

const stat_cells = await page_desktop.locator('.stat').count();
assert(stat_cells === 6, '桌面统计六宫格完整（关注/粉丝/获赞/点评/打卡/足迹）', `cells=${stat_cells}`);

const hero_ops = await rect_of(page_desktop, '.hero-ops');
assert(!!hero_ops && hero_ops.y < hero.y + hero.height, '桌面操作按钮位于名片右侧同一行', `y=${hero_ops && Math.round(hero_ops.y)} heroBottom=${Math.round(hero.y + hero.height)}`);

const rev_cards = await page_desktop.locator('.review-row').count();
assert(rev_cards > 0, '桌面渲染公开点评卡', `cards=${rev_cards}`);

const ov_desktop = await overflow_x(page_desktop);
assert(ov_desktop.scroll <= ov_desktop.client + 1, '桌面无横向溢出', `${ov_desktop.scroll}/${ov_desktop.client}`);

await page_desktop.screenshot({ path: path.join(SHOT_DIR, 'r86-user-profile-desktop.png'), fullPage: true });

/* ======================= D. 浏览器：移动端单列 ======================= */

const ctx_mobile = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
const page_mobile = await ctx_mobile.newPage();
page_mobile.on('pageerror', (e) => errors.push(`mobile: ${e.message}`));
await page_mobile.goto(`${BASE}/user/${PROFILE_UID}`, { waitUntil: 'networkidle' });
await page_mobile.waitForSelector('.hero', { timeout: 15000 });

const m_side = await rect_of(page_mobile, '.side');
const m_main = await rect_of(page_mobile, '.main');
assert(!!m_side && !!m_main && Math.abs(m_side.x - m_main.x) < 1 && Math.abs(m_side.width - m_main.width) < 1,
    '移动端为单列（侧栏与正文同列同宽）', `side=${m_side && Math.round(m_side.x)}/${m_side && Math.round(m_side.width)} main=${m_main && Math.round(m_main.x)}/${m_main && Math.round(m_main.width)}`);

const m_hero = await rect_of(page_mobile, '.hero');
const m_ops = await rect_of(page_mobile, '.hero-ops');
assert(!!m_ops && !!m_hero && m_ops.width >= m_hero.width - 46, '移动端操作按钮整行铺满', `ops=${m_ops && Math.round(m_ops.width)} hero=${m_hero && Math.round(m_hero.width)}`);

const m_stat = await rect_of(page_mobile, '.stat-grid');
assert(!!m_stat && m_stat.width > 300, '移动端统计栅格铺满卡片', `w=${m_stat && Math.round(m_stat.width)}`);

const ov_mobile = await overflow_x(page_mobile);
assert(ov_mobile.scroll <= ov_mobile.client + 1, '移动端无横向溢出', `${ov_mobile.scroll}/${ov_mobile.client}`);

await page_mobile.screenshot({ path: path.join(SHOT_DIR, 'r86-user-profile-mobile.png'), fullPage: true });

/* ======================= E. 浏览器：平板（769–1024 两栏不挤压） ======================= */

const ctx_tablet = await browser.newContext({ viewport: { width: 820, height: 1180 }, deviceScaleFactor: 1 });
const page_tablet = await ctx_tablet.newPage();
page_tablet.on('pageerror', (e) => errors.push(`tablet: ${e.message}`));
await page_tablet.goto(`${BASE}/user/${PROFILE_UID}`, { waitUntil: 'networkidle' });
await page_tablet.waitForSelector('.hero', { timeout: 15000 });

const t_side = await rect_of(page_tablet, '.side');
const t_main = await rect_of(page_tablet, '.main');
assert(!!t_side && !!t_main && t_main.width >= 400, '平板宽度下正文仍有 ≥400px 可用宽度', `main=${t_main && Math.round(t_main.width)}`);
const ov_tablet = await overflow_x(page_tablet);
assert(ov_tablet.scroll <= ov_tablet.client + 1, '平板无横向溢出', `${ov_tablet.scroll}/${ov_tablet.client}`);

/* ======================= F. 无 JS 报错 + 收尾 ======================= */

assert(errors.length === 0, '三视口均无 JS 运行错误', errors.join(' | ') || '无');

await browser.close();

console.log(`\n结果：PASS=${passed} FAIL=${failed}`);
process.exit(failed === 0 ? 0 : 1);
