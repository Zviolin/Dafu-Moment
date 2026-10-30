/**
 * r82 走查：按《测试文档 (1).docx》8 条反馈逐条复验（API + 真实浏览器）
 *
 * 反馈清单：
 * 1 打卡两次后任务中心「每日签到」仍 0/1、按钮仍「去完成」
 * 2 热搜词（麻辣香锅/糖水铺/手打面/夜宵）全部搜不到；「免排队」空态
 * 3 筛选面板只有 食堂/人均/口味/忌口/评分，可选项太少
 * 4 首页「校园口碑榜」与 /rank 榜单页数据不一致
 * 5 发布动态「添加话题」只能选固定 6 个，需支持自定义话题
 * 6 「我的档案」点击无反应；顶部头像与档案页头像不同步
 * 7 福大认证是否已实现
 * 8 图片加载慢
 *
 * 运行：node tests/walkthrough-r82-doc-bugs.test.mjs
 * 前置：docker compose up -d --build（frontend 8095），后端 DEBUG=true（验证码回显 debugCode）
 * 幂等：临时账号随机后缀；打卡 / 动态 / 任务领取记录收尾清理
 */
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { createRequire } from 'module';
import { cleanup_fixtures } from './_fixture-cleanup.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright-core');

const BASE = process.env.LB_BASE || 'http://localhost:8095';
const API = `${BASE}/api`;
const EXE = 'C:\\Users\\Zviolin\\AppData\\Local\\ms-playwright\\chromium-1208\\chrome-win64\\chrome.exe';
const SHOT_DIR = path.resolve('tests/report/r82-shots');

/** 两个临时账号：API 用例 / UI 用例，避免打卡进度互相污染 */
const SUF = String(Date.now()).slice(-8);
const USER_API = `r82api_${SUF}`;
const USER_UI = `r82ui_${SUF}`;
const PWD = 'r82test123';

let passed = 0;
let failed = 0;
const failures = [];

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
        failures.push(name);
        console.log(`FAIL ${name}${extra ? ' | ' + extra : ''}`);
    }
}

/**
 * 数据库直连执行（幂等清理用）
 * @param {string} q
 */
function db_exec(q) {
    return execSync(
        `docker exec dafu-mysql mysql -uroot -pdafu_root_2026 --default-character-set=utf8mb4 -N -B -e "${q}"`,
        { stdio: 'pipe' }
    ).toString();
}

/**
 * 清空限流窗口（连续跑走查会打满 10 次/窗口）
 * @param {string} action
 */
function flush_rl(action) {
    try {
        execSync(`docker exec dafu-redis redis-cli EVAL "local ks=redis.call('keys','rl:${action}:*'); for i,k in ipairs(ks) do redis.call('del',k) end; return #ks" 0`, { stdio: 'pipe' });
    } catch { /* Redis 不可用则跳过 */ }
}

/**
 * 原始请求（保留 HTTP 状态，供 409/201 断言）
 * @param {string} method
 * @param {string} p
 * @param {*} [body]
 * @param {string} [token]
 * @returns {Promise<{status:number,json:Object,data:*}>}
 */
async function request(method, p, body, token) {
    const r = await fetch(`${API}${p}`, {
        method,
        headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    const j = await r.json().catch(() => ({}));
    return { status: r.status, json: j, data: j.data };
}

/**
 * GET 解包（非 200 直接抛错）
 * @param {string} p
 * @param {string} [token]
 */
async function get(p, token) {
    const { status, json, data } = await request('GET', p, undefined, token);
    if (status !== 200) throw new Error(`HTTP ${status} ${p} ${json.msg || ''}`);
    return data;
}

/**
 * 取验证码（需 DEBUG=true 回显 debugCode）
 */
async function captcha_body() {
    const j = await (await fetch(`${API}/auth/captcha`)).json();
    if (!j.data || !j.data.debugCode) throw new Error('验证码无 debugCode（需后端 DEBUG=true）');
    return { captchaId: j.data.captchaId, captchaCode: j.data.debugCode };
}

/**
 * 注册并登录一个临时账号
 * @param {string} username
 * @param {string} nickname
 * @returns {Promise<{token:string,user:Object}>}
 */
async function new_account(username, nickname) {
    flush_rl('register');
    flush_rl('login');
    const reg = await request('POST', '/auth/register', {
        username, password: PWD, nickname, ...(await captcha_body()),
    });
    if (reg.status !== 200 && reg.status !== 201) throw new Error(`注册失败 ${reg.status} ${reg.json.msg || ''}`);
    const lr = await request('POST', '/auth/login', { username, password: PWD, ...(await captcha_body()) });
    if (lr.status !== 200 || !lr.data || !lr.data.token) throw new Error(`登录失败 ${lr.status} ${lr.json.msg || ''}`);
    return { token: lr.data.token, user: lr.data.user };
}

/** 今天（+08:00）YYYY-MM-DD，与后端 checkinDate 同口径 */
function today_str() {
    return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

/**
 * 找一个「有在售菜品」的点位及其菜品
 * @param {number|null} [excludeId] 需要排除的点位 id（找第二家时用）
 * @returns {Promise<{canteenId:number,canteenName:string,dishId:number,dishName:string}>}
 */
async function pick_canteen_with_dish(excludeId = null) {
    const canteens = await get('/canteens');
    for (const c of canteens) {
        if (excludeId && c.id === excludeId) continue;
        const d = await get(`/dishes?canteenId=${c.id}&pageSize=1`);
        if (d && d.list && d.list.length) {
            return { canteenId: c.id, canteenName: c.name, dishId: d.list[0].id, dishName: d.list[0].name };
        }
    }
    throw new Error('数据中找不到有菜品的点位');
}

fs.mkdirSync(SHOT_DIR, { recursive: true });

/* ======================= A. API 层 ======================= */

const acc_api = await new_account(USER_API, 'r82接口走查');
const TOKEN_API = acc_api.token;
const UID_API = acc_api.user.id;
const sample = await pick_canteen_with_dish();

// R82-01 注册登录
assert(!!TOKEN_API, 'R82-01 临时账号注册并登录成功', USER_API);

// R82-02 热搜词全部来自真实数据且每个词都能搜到结果
const hot = await get('/search/hot');
const hot_ok = Array.isArray(hot) && hot.length >= 5;
assert(hot_ok, 'R82-02a 热搜词返回 ≥5 个真实词条', JSON.stringify(hot));
assert(!hot.includes('免排队') && !hot.includes('糖水铺') && !hot.includes('麻辣香锅'),
    'R82-02b 热搜词不再包含数据里不存在的词（免排队/糖水铺/麻辣香锅）', JSON.stringify(hot));
let hot_all_hit = true;
const hot_detail = [];
for (const w of hot) {
    const s = await get(`/search?q=${encodeURIComponent(w)}`);
    const n = s.points.length + s.stations.length + s.dishes.length;
    hot_detail.push(`${w}:${n}`);
    if (n === 0) hot_all_hit = false;
}
assert(hot_all_hit, 'R82-02c 每个热搜词点开都有结果', hot_detail.join(' '));

// R82-03 文档点名的场景词「夜宵」不再空结果
const night = await get(`/search?q=${encodeURIComponent('夜宵')}`);
assert(night.points.length > 0, 'R82-03 搜索「夜宵」命中点位（按营业时段兜底）', `points=${night.points.length}`);

// R82-04 关键词覆盖品类/档口
const cat = await get(`/search?q=${encodeURIComponent('川菜')}`);
assert(cat.stations.length + cat.dishes.length > 0, 'R82-04 搜索「川菜」命中档口或菜品',
    `stations=${cat.stations.length} dishes=${cat.dishes.length}`);

// R82-05 筛选项按真实数据生成
const opt = await get('/filters/options');
assert(Array.isArray(opt.canteenTypes) && opt.canteenTypes.length >= 2
    && opt.canteenTypes.every((t) => t.count > 0),
'R82-05a 点位类型筛选项均有真实菜品', JSON.stringify(opt.canteenTypes));
assert(opt.business.open > 0, 'R82-05b 营业状态统计返回真实数量', JSON.stringify(opt.business));
assert(Array.isArray(opt.categories) && opt.categories.length >= 5,
    'R82-05c 品类筛选项 ≥5 个', `categories=${opt.categories.length}`);
assert(Array.isArray(opt.ratings) && opt.ratings.some((r) => r.count > 0),
    'R82-05d 评分档位按真实达标菜品数返回', JSON.stringify(opt.ratings));

// R82-06 点位类型过滤生效
const t2 = opt.canteenTypes.find((t) => t.type === 2);
const d2 = await get(`/dishes?canteenType=2&pageSize=1`);
assert(t2 && d2.total === t2.count, 'R82-06 点位类型=学生街的菜品总数与统计一致', `api=${d2.total} meta=${t2 && t2.count}`);

// R82-07 关键词筛选覆盖档口/品类（不再只匹配菜名）
const kw_dishes = await get(`/dishes?q=${encodeURIComponent('川菜')}&pageSize=5`);
assert(kw_dishes.total > 0, 'R82-07 菜品筛选关键词命中品类', `total=${kw_dishes.total}`);

// R82-08 评分筛选生效（≥4 星有真实达标菜品；≥4.5 当前无达标菜品，前端已按统计隐藏该档位）
const rate = await get('/dishes?ratingMin=4&pageSize=8');
assert(rate.total > 0 && rate.list.every((d) => Number(d.rating_avg) >= 4),
    'R82-08 评分 ≥4 星筛选结果全部达标', `total=${rate.total}`);
const rate45 = await get('/dishes?ratingMin=4.5&pageSize=8');
assert(rate45.total === (opt.ratings.find((r) => r.min === 4.5)?.count ?? 0),
    'R82-08b ≥4.5 档位结果数与筛选项统计一致（0 时前端隐藏，不再给出必空选项）',
    `api=${rate45.total} meta=${opt.ratings.find((r) => r.min === 4.5)?.count}`);

// R82-09/10/11 榜单口径
const score6 = await get('/rankings?period=week&dim=score&limit=6');
const score10 = await get('/rankings?period=week&dim=score&limit=10');
const hot10 = await get('/rankings?period=week&dim=hot&limit=10');
const desc = (arr, key) => arr.every((x, i) => i === 0 || Number(arr[i - 1][key]) >= Number(x[key]));
assert(score10.length >= 3 && desc(score10, 'ratingAvg'), 'R82-09 口碑榜按均分严格倒序',
    score10.map((r) => `${r.name}:${r.ratingAvg}`).slice(0, 4).join(' '));
assert(desc(hot10, 'reviewCount'), 'R82-10 人气榜按评价数严格倒序',
    hot10.map((r) => `${r.name}:${r.reviewCount}`).slice(0, 3).join(' '));
assert(JSON.stringify(score6.map((r) => [r.name, r.ratingAvg]))
    === JSON.stringify(score10.slice(0, 6).map((r) => [r.name, r.ratingAvg])),
'R82-11 首页口碑榜（6 条）与榜单页口碑榜（前 6 条）完全一致（bug 4 根因已修）');

// R82-12 打卡落库
const ck1 = await request('POST', '/checkin', {
    canteenId: sample.canteenId,
    visibility: 2,
    note: 'r82 自动化打卡',
    photos: [],
    dishIds: [sample.dishId],
}, TOKEN_API);
assert(ck1.status === 200 && ck1.data && ck1.data.checkinId > 0, 'R82-12 发布打卡写入后端',
    `status=${ck1.status} id=${ck1.data && ck1.data.checkinId}`);
assert(ck1.data.checkinDate === today_str(), 'R82-12b 打卡日期为今天', String(ck1.data.checkinDate));

// R82-13 任务中心「每日签到」进度 = 1/1（bug 1）
const tasks = await get('/me/tasks', TOKEN_API);
const daily = (tasks.daily || []).find((t) => t.name.includes('签到'));
assert(!!daily && daily.current === 1 && daily.target === 1 && daily.claimable,
    'R82-13 打卡后「每日签到」进度为 1/1 且可领取（bug 1 已修）',
    daily ? `current=${daily.current}/${daily.target} status=${daily.status}` : 'no daily task');

// R82-14/15 重复打卡 409 + 另记一条
const dup = await request('POST', '/checkin', {
    canteenId: sample.canteenId, visibility: 2, note: '重复', photos: [], dishIds: [sample.dishId],
}, TOKEN_API);
assert(dup.status === 409 && dup.data && dup.data.checkinId > 0,
    'R82-14 同点位当日重复打卡返回 409 并带已有打卡 id', `status=${dup.status}`);
const again = await request('POST', '/checkin', {
    canteenId: sample.canteenId, visibility: 2, note: '另记一条', photos: [], dishIds: [], again: true,
}, TOKEN_API);
assert(again.status === 200 && again.data && again.data.checkinId > 0,
    'R82-15 again=true 允许另记一条', `status=${again.status}`);
const ck_list = await get('/checkin?page=1', TOKEN_API);
assert(ck_list.total === 1, 'R82-15b 同点位重复打卡走「追加」口径，不新建重复行', `total=${ck_list.total}`);
// 换一个点位再打一次 → 产生第 2 条（对应「已打卡两次」仍应计入任务）
const sample2 = await pick_canteen_with_dish(sample.canteenId);
const ck2 = await request('POST', '/checkin', {
    canteenId: sample2.canteenId, visibility: 2, note: '第二家', photos: [], dishIds: [sample2.dishId],
}, TOKEN_API);
assert(ck2.status === 200, 'R82-15c 第二个点位打卡成功', `status=${ck2.status}`);
const ck_list2 = await get('/checkin?page=1', TOKEN_API);
assert(ck_list2.total === 2, 'R82-15d 打卡两次后列表累计 2 条', `total=${ck_list2.total}`);
const tasks2 = await get('/me/tasks', TOKEN_API);
const daily2 = (tasks2.daily || []).find((t) => t.name.includes('签到'));
assert(!!daily2 && daily2.current === 1 && daily2.claimable,
    'R82-15e 两次打卡后「每日签到」仍为 1/1 可领取（daily 按完成态封顶 1）',
    daily2 ? `current=${daily2.current}/${daily2.target}` : 'no daily');

// R82-16 自定义话题规范化（后端）
const TOPICS_INPUT = ['#干饭日常#', '宿舍夜宵', '#深夜食堂#', '#一周打卡#', '#便宜好吃#', '#福大美食#', '#夜宵搭子#', '#甜点控#', '#第九个话题#'];
const post = await request('POST', '/posts', { content: 'r82 自动化：自定义话题校验', topics: TOPICS_INPUT }, TOKEN_API);
assert(post.status === 200 && post.data && post.data.id > 0, 'R82-16a 动态发布成功', `status=${post.status}`);
const topics_out = post.data.topics || [];
assert(topics_out.length === 8 && topics_out.every((t) => /^#.+#$/.test(t)),
'R82-16b 话题规范为 #xxx# 且上限 8 个', JSON.stringify(topics_out));
assert(topics_out.includes('#宿舍夜宵#'), 'R82-16c 手输「宿舍夜宵」被规范化收录', JSON.stringify(topics_out));
assert(!topics_out.some((t) => t.includes('第九个话题')), 'R82-16d 超出上限的第 9 个话题被丢弃');

// R82-17 福大认证入口
const fzu = await get('/auth/fzu/cas/mode');
assert(fzu && fzu.mode === 'demo', 'R82-17a 福大统一认证已实现（demo 演示模式可切换）', JSON.stringify(fzu).slice(0, 120));
assert(String(fzu.initialPassword || '') === 'FZU521', 'R82-17b 演示初始口令 FZU521 已下发', String(fzu.initialPassword));

// R82-18 图片资产压缩
const dress_resp = await fetch(`${BASE}/assets/pet-dress/${encodeURIComponent('05_装扮_汉堡.png')}`);
const dress_len = Number(dress_resp.headers.get('content-length') || 0);
assert(dress_resp.status === 200 && dress_len > 0 && dress_len < 700 * 1024,
    'R82-18 装扮大图已压缩到 700KB 以内（bug 8）', `bytes=${dress_len}`);

/* ======================= B. UI 层 ======================= */

const acc_ui = await new_account(USER_UI, 'r82界面走查');
const TOKEN_UI = acc_ui.token;
const UID_UI = acc_ui.user.id;

const browser = await chromium.launch({ headless: true, executablePath: EXE });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
await page.evaluate(([t, u]) => {
    localStorage.setItem('fk_token', t);
    localStorage.setItem('fk_user', u);
}, [TOKEN_UI, JSON.stringify(acc_ui.user)]);
// Pinia auth store 在首屏创建时已读取 localStorage，注入后需重载一次让登录态生效
await page.reload({ waitUntil: 'domcontentloaded' });

try {
    /* ---- bug 2：搜索页热搜 / 结果 / 空态 ---- */
    await page.goto(`${BASE}/search`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.search-page', { timeout: 10000 });
    await page.waitForFunction(() => document.querySelectorAll('.wordrow .word').length >= 5, { timeout: 10000 });
    const words_ui = await page.locator('.wordrow .word').allInnerTexts();
    assert(words_ui.length >= 5, 'R82-19a 搜索首页展示 ≥5 个热搜词', words_ui.join('、'));
    assert(words_ui[0] === hot[0], 'R82-19b 热搜词与 /search/hot 接口一致', `${words_ui[0]} vs ${hot[0]}`);
    assert(!words_ui.includes('免排队'), 'R82-19c 热搜词不再出现「免排队」空词条');

    await page.locator('.wordrow .word').first().click();
    await page.waitForTimeout(1200);
    const uni_count = await page.locator('.uni-item').count();
    const card_count = await page.locator('.result-grid .dish-card, .result-grid > *').count();
    assert(uni_count > 0 || card_count > 0, 'R82-19d 点击热搜词后出现真实结果',
        `uni=${uni_count} cards=${card_count}`);
    await page.screenshot({ path: path.join(SHOT_DIR, 'r82-search-hot.png'), fullPage: false });

    // 无数据词 → 明确空态 + 数据收录状态说明（r86 起文案改为「已收录…仍在完善」口径）
    await page.locator('.search-input input').fill('麻辣香锅');
    await page.locator('.search-input input').press('Enter');
    await page.waitForTimeout(1200);
    const empty_visible = await page.locator('.empty-block').isVisible().catch(() => false);
    const empty_text = empty_visible ? await page.locator('.empty-block').innerText() : '';
    assert(empty_visible && empty_text.includes('已收录') && empty_text.includes('仍在完善'),
        'R82-20 无结果时明确说明数据收录状态', empty_text.replace(/\n/g, ' ').slice(0, 80));
    await page.screenshot({ path: path.join(SHOT_DIR, 'r82-search-empty.png') });

    /* ---- bug 3：筛选面板可选项 ---- */
    await page.locator('.search-input input').fill('川菜');
    await page.locator('.search-input input').press('Enter');
    await page.waitForTimeout(1200);
    await page.locator('.filter-toggle').click();
    await page.waitForSelector('.filter-panel', { timeout: 5000 });
    const groups = await page.locator('.filter-panel .f-group').allInnerTexts();
    assert(groups.length >= 7, 'R82-21a 筛选面板分组 ≥7（原 5 组）', `groups=${groups.length}`);
    assert(groups.some((g) => g.includes('点位类型')) && groups.some((g) => g.includes('品类')),
        'R82-21b 新增「点位类型」「品类」筛选项');
    const type_chip = page.locator('.f-group', { hasText: '点位类型' }).locator('.chip').nth(1);
    await type_chip.click();
    await page.waitForTimeout(1200);
    const n_after_type = await page.locator('.result-grid > *').count();
    assert(n_after_type > 0, 'R82-21c 选择点位类型后结果非空', `cards=${n_after_type}`);
    // 先还原为「全部」，再单独验证品类筛选（品类来自首页分类导航，关键词为空也应出结果）
    await page.goto(`${BASE}/search?category=${encodeURIComponent('闽菜')}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1200);
    const n_cat_only = await page.locator('.result-grid > *').count();
    assert(n_cat_only > 0, 'R82-21d 品类单筛选（无关键词）也能出结果', `cards=${n_cat_only}`);
    await page.locator('.filter-toggle').click();
    await page.waitForSelector('.filter-panel', { timeout: 5000 });
    const cat_chip = page.locator('.f-group', { hasText: '品类' }).locator('.chip').nth(1);
    await cat_chip.click();
    await page.waitForTimeout(1200);
    const n_after_cat = await page.locator('.result-grid > *').count();
    assert(n_after_cat > 0, 'R82-21e 切换品类后结果非空', `cards=${n_after_cat}`);
    await page.screenshot({ path: path.join(SHOT_DIR, 'r82-search-filter.png') });

    /* ---- bug 4：首页与榜单页口碑榜一致 ---- */
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.rankcard', { timeout: 10000 });
    await page.waitForTimeout(800);
    const home_names = (await page.locator('.rankcard .rankrow .rinfo b').allInnerTexts()).slice(0, 3);
    const home_scores = (await page.locator('.rankcard .rankrow .rscore').allInnerTexts()).slice(0, 3);
    const api_top3 = score6.slice(0, 3);
    assert(home_names.length === 3 && api_top3.every((r, i) => home_names[i] === r.name),
        'R82-22a 首页口碑榜名称与 API 口碑榜一致', `${home_names.join('、')} vs ${api_top3.map((r) => r.name).join('、')}`);
    assert(api_top3.every((r, i) => Number(home_scores[i]) === Math.round(Number(r.ratingAvg) * 10) / 10),
        'R82-22b 首页口碑榜分数与 API 一致（同口径保留 1 位小数）', `${home_scores.join('、')}`);
    await page.screenshot({ path: path.join(SHOT_DIR, 'r82-home-rank.png') });

    await page.goto(`${BASE}/rank`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.rank-page, .page-wrap', { timeout: 10000 });
    await page.locator('.tab-item', { hasText: '口碑榜' }).first().click();
    await page.waitForTimeout(1200);
    const rank_names = (await page.locator('.card.first .finfo-main b, .rankrow .rinfo b').allInnerTexts()).slice(0, 3);
    assert(api_top3.every((r, i) => rank_names[i] === r.name),
        'R82-22c 榜单页「口碑榜」与首页顺序一致（bug 4 已修）', rank_names.join('、'));
    await page.screenshot({ path: path.join(SHOT_DIR, 'r82-rank-score.png') });

    /* ---- bug 1：界面打卡 → 任务中心进度 ---- */
    await page.goto(`${BASE}/checkin`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.checkin', { timeout: 10000 });
    await page.waitForTimeout(800);
    await page.locator('.f-row', { hasText: '今天在哪吃' }).locator('.el-select').click();
    await page.waitForSelector('.el-select-dropdown__item', { timeout: 5000 });
    await page.locator('.el-select-dropdown__item', { hasText: sample.canteenName }).first().click();
    await page.waitForTimeout(1000);
    await page.locator('.dish-chip').first().click();
    await page.locator('.main-btn').click();
    await page.waitForSelector('.success-card', { timeout: 15000 });
    const suc_text = await page.locator('.success-card').innerText();
    assert(suc_text.includes('打卡成功') && suc_text.includes('每日签到'),
        'R82-23a 前端发布打卡成功并提示计入任务', suc_text.replace(/\n/g, ' ').slice(0, 90));
    await page.screenshot({ path: path.join(SHOT_DIR, 'r82-checkin-success.png') });
    await page.locator('.suc-later').click();

    await page.goto(`${BASE}/tasks`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.page-wrap', { timeout: 10000 });
    await page.waitForTimeout(800);
    const task_card = page.locator('.card.task, .task', { hasText: '每日签到' }).first();
    const task_text = await task_card.innerText();
    assert(/今日\s*1\/1/.test(task_text), 'R82-23b 任务中心「每日签到」显示今日 1/1（bug 1 已修）',
        task_text.replace(/\n/g, ' ').slice(0, 80));
    await page.screenshot({ path: path.join(SHOT_DIR, 'r82-tasks.png') });

    /* ---- bug 5：自定义话题 ---- */
    await page.goto(`${BASE}/post-publish`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.topic-add', { timeout: 10000 });
    await page.locator('.topic-input').fill('宿舍夜宵');
    await page.locator('.topic-add-btn').click();
    await page.waitForTimeout(600);
    const custom_chips = await page.locator('.topic-chip.custom').allInnerTexts();
    assert(custom_chips.includes('#宿舍夜宵#'), 'R82-24a 手动添加自定义话题生成 chip', custom_chips.join('、'));
    await page.locator('.topic-input').fill('打包带走');
    await page.locator('.topic-add-btn').click();
    await page.waitForTimeout(500);
    assert((await page.locator('.topic-chip.custom').count()) >= 2,
        'R82-24b 支持连续添加多个自定义话题');
    await page.locator('textarea').first().fill('r82 自动化：自定义话题 UI 校验');
    await page.locator('.pub-btn').click();
    await page.waitForTimeout(2500);
    const ui_post_topics = db_exec(`SELECT topics FROM dafu.post WHERE user_id=${UID_UI} ORDER BY id DESC LIMIT 1`);
    assert(ui_post_topics.includes('宿舍夜宵') && ui_post_topics.includes('打包带走'),
        'R82-24c 自定义话题随动态落库', ui_post_topics.trim().slice(0, 120));
    await page.screenshot({ path: path.join(SHOT_DIR, 'r82-post-topics.png') });

    /* ---- bug 6：头像同步 + 我的档案跳转 ---- */
    await page.goto(`${BASE}/me`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.me-head', { timeout: 10000 });
    const bg_nav = await page.locator('.user-chip .uav').first().evaluate((el) => getComputedStyle(el).backgroundColor);
    const bg_me = await page.locator('.me-head .head-av').first().evaluate((el) => getComputedStyle(el).backgroundColor);
    assert(bg_nav === bg_me, 'R82-25a 导航头像与「我的」页头像样式一致（同源 UserAvatar）', `${bg_nav} vs ${bg_me}`);
    const head_icon = await page.locator('.me-head .head-av .el-icon svg').count();
    assert(head_icon === 1, 'R82-25b 「我的」页头像为真实用户头像组件而非静态图');
    await page.screenshot({ path: path.join(SHOT_DIR, 'r82-me-avatar.png') });

    await page.locator('.user-chip').hover();
    await page.waitForTimeout(500);
    await page.locator('.el-dropdown-menu__item', { hasText: '我的档案' }).first().click();
    await page.waitForTimeout(1200);
    assert(/\/me(\?|$)/.test(page.url()), 'R82-25c 「我的档案」跳转到个人中心 /me（不再是关注那边的公开主页）', page.url());
    await page.waitForSelector('.me-head', { timeout: 10000 });

    /* ---- 桌面端「我的」入口 + 视觉对齐（r84）---- */
    // 桌面端顶栏必须有「我的」入口（移动端底部 Tab 才有，桌面端此前缺失）
    const nav_me = await page.locator('.nav-links .me-link').count();
    assert(nav_me === 1, 'R84-28a 桌面端顶栏存在「我的」入口', `count=${nav_me}`);
    // 先离开 /me，再从顶栏点「我的」，确保是真的跳转而非原地不动
    await page.goto(`${BASE}/map`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(600);
    await page.locator('.nav-links .me-link').click();
    await page.waitForTimeout(900);
    assert(/\/me(\?|$)/.test(page.url()), 'R84-28b 桌面端点击「我的」进入个人中心', page.url());

    // 「我的主页」保留公开主页可达性
    await page.locator('.user-chip').hover();
    await page.waitForTimeout(500);
    await page.locator('.el-dropdown-menu__item', { hasText: '我的主页' }).first().click();
    await page.waitForTimeout(1200);
    assert(page.url().includes(`/user/${UID_UI}`), 'R84-28c 下拉「我的主页」跳转到本人公开主页', page.url());
    await page.waitForSelector('.user-page', { timeout: 10000 });
    await page.screenshot({ path: path.join(SHOT_DIR, 'r82-user-profile.png') });

    /* ---- /me 桌面端视觉对齐：关注/粉丝行 与 三功能宫格、列表入口组 逐列对齐 ---- */
    await page.goto(`${BASE}/me`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.me-head', { timeout: 10000 });
    await page.waitForTimeout(600);
    const col_boxes = await page.evaluate(() => {
        const pick = (sel) => Array.from(document.querySelectorAll(sel)).map((el) => {
            const r = el.getBoundingClientRect();
            return { l: Math.round(r.left), r: Math.round(r.right), c: Math.round(r.left + r.width / 2) };
        });
        return {
            stat: pick('.statrow .stat'),
            fn: pick('.fnrow .fn-item'),
            row: pick('.rowlist .row'),
        };
    });
    // 关注 / 粉丝 两项须落在 3 列栅格的前两列（与「收藏」「足迹」同列）
    const col_of = (c) => {
        const fn = col_boxes.fn;
        if (!fn.length) return -1;
        for (let i = 0; i < fn.length; i++) {
            if (fn[i].l <= c && c <= fn[i].r) return i;
        }
        return -1;
    };
    assert(col_of(col_boxes.stat[0]?.c) === 0 && col_of(col_boxes.stat[1]?.c) === 1,
        'R84-29a /me 桌面端「关注/粉丝」与三功能宫格逐列对齐',
        `stat=[${col_boxes.stat.map((s) => s.c)}] fn=[${col_boxes.fn.map((s) => s.c)}]`);
    assert(col_boxes.fn.length === 3 && col_boxes.row.length >= 3,
        'R84-29b /me 桌面端三功能宫格与列表入口组均为 3 列栅格',
        `fn=${col_boxes.fn.length} row=${col_boxes.row.length}`);
    // 关注行与下方宫格之间留白不得过小（用户反馈：间隔太小不好看）
    const gap_me = await page.evaluate(() => {
        const stat = document.querySelector('.statrow');
        const fn = document.querySelector('.fnrow');
        if (!stat || !fn) return -1;
        return Math.round(fn.getBoundingClientRect().top - stat.getBoundingClientRect().bottom);
    });
    assert(gap_me >= 16, 'R84-29c /me 关注行与功能宫格间距 ≥16px', `gap=${gap_me}`);
    await page.screenshot({ path: path.join(SHOT_DIR, 'r84-me-desktop.png') });

    /* ---- /follows 桌面端：卡片与上方 Tab 间距、昵称不竖排 ---- */
    await page.goto(`${BASE}/follows`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.user-list', { timeout: 10000 });
    await page.waitForTimeout(600);
    const gap_fs = await page.evaluate(() => {
        const tabs = document.querySelector('.utabs');
        const list = document.querySelector('.user-list');
        if (!tabs || !list) return -1;
        return Math.round(list.getBoundingClientRect().top - tabs.getBoundingClientRect().bottom);
    });
    assert(gap_fs >= 20, 'R84-30a /follows 用户卡片与上方 Tab 间距 ≥20px', `gap=${gap_fs}`);
    // 昵称不得竖排（一字一行）：单行渲染时元素高度 ≈ 1 行行高，宽远大于高
    const name_ratio = await page.evaluate(() => {
        const list = Array.from(document.querySelectorAll('.uname-txt'));
        if (!list.length) return 0;
        return list.map((el) => {
            const r = el.getBoundingClientRect();
            const fs = parseFloat(getComputedStyle(el).fontSize) || 14;
            return { ratio: r.width / Math.max(r.height, 1), lines: r.height / fs };
        });
    });
    assert(name_ratio.length > 0 && name_ratio.every((v) => v.lines <= 1.6),
        'R84-30b /follows 昵称单行横向显示（未被认证签挤成竖排）',
        `lines=${name_ratio.map((v) => v.lines.toFixed(2)).join(',')}`);
    await page.screenshot({ path: path.join(SHOT_DIR, 'r84-follows-desktop.png') });

    /* ---- r84 回归护栏：桌面栅格改动不得波及移动端（375px）---- */
    await page.setViewportSize({ width: 375, height: 780 });
    await page.goto(`${BASE}/me`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.me-head', { timeout: 10000 });
    await page.waitForTimeout(600);
    const mob_me = await page.evaluate(() => {
        const disp = (sel) => {
            const el = document.querySelector(sel);
            return el ? getComputedStyle(el).display : null;
        };
        return {
            overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
            statrow: disp('.statrow'),
            fnrow: disp('.fnrow'),
            rowlist: disp('.rowlist'),
        };
    });
    assert(mob_me.overflow === 0, 'R84-31a 移动端 /me 无横向溢出', `overflow=${mob_me.overflow}`);
    assert(mob_me.statrow === 'flex' && mob_me.fnrow === 'flex' && mob_me.rowlist === 'block',
        'R84-31b 移动端 /me 保持纵向流式布局（桌面栅格未生效）',
        JSON.stringify(mob_me));

    await page.goto(`${BASE}/follows`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.user-list', { timeout: 10000 });
    await page.waitForTimeout(600);
    const mob_fs = await page.evaluate(() => ({
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        userlist: (() => {
            const el = document.querySelector('.user-list');
            return el ? getComputedStyle(el).display : null;
        })(),
        lines: Array.from(document.querySelectorAll('.uname-txt')).map((el) => {
            const r = el.getBoundingClientRect();
            const fs = parseFloat(getComputedStyle(el).fontSize) || 14;
            return +(r.height / fs).toFixed(2);
        }),
    }));
    assert(mob_fs.overflow === 0, 'R84-31c 移动端 /follows 无横向溢出', `overflow=${mob_fs.overflow}`);
    assert(mob_fs.userlist === 'block', 'R84-31d 移动端 /follows 保持单列列表（桌面 3 列栅格未生效）', `display=${mob_fs.userlist}`);
    assert(mob_fs.lines.length > 0 && mob_fs.lines.every((v) => v <= 1.6),
        'R84-31e 移动端 /follows 昵称单行显示', `lines=${mob_fs.lines.join(',')}`);
    await page.screenshot({ path: path.join(SHOT_DIR, 'r84-follows-mobile.png'), fullPage: true });
    await page.setViewportSize({ width: 1280, height: 900 });

    /* ---- bug 8：图片压缩 + 懒加载 ---- */
    await page.goto(`${BASE}/pet`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1200);
    // 打开「形象」弹层：装扮橱窗在第一组 face-grid 中，贴纸图才真正被请求
    await page.locator('.tri-cell', { hasText: '形象' }).first().click();
    await page.waitForSelector('.skin-panel', { timeout: 5000 });
    await page.waitForTimeout(1000);
    const dress_imgs = page.locator('.skin-panel .sg-img img');
    const n_dress = await dress_imgs.count();
    if (n_dress > 0) {
        const meta = await dress_imgs.first().evaluate((el) => ({ w: el.naturalWidth, src: el.getAttribute('src'), lazy: el.getAttribute('loading') }));
        assert(meta.w > 0 && meta.w <= 520, 'R82-26a 装扮图解码宽度 ≤520px（2048→512）', `naturalWidth=${meta.w}`);
        assert(String(meta.src).includes('?v=r82'), 'R82-26b 装扮图带 r82 缓存键', String(meta.src).slice(-12));
        assert(meta.lazy === 'lazy', 'R82-26c 装扮图懒加载');
    } else {
        assert(false, 'R82-26 未找到装扮贴纸元素（选择器需更新）');
    }
    await page.screenshot({ path: path.join(SHOT_DIR, 'r82-pet-dress.png') });

    /* ---- bug 7：福大认证入口在登录页可见 ---- */
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(800);
    const fzu_btn = await page.locator('text=福大').count();
    assert(fzu_btn > 0, 'R82-27 登录页存在福大统一认证入口', `matches=${fzu_btn}`);
    await page.screenshot({ path: path.join(SHOT_DIR, 'r82-login-fzu.png') });
} catch (e) {
    failed++;
    failures.push('UI 执行异常');
    console.log(`FAIL UI 执行异常 -> ${String(e.message || e).slice(0, 200)}`);
} finally {
    await browser.close();
}

/* ======================= C. 收尾清理 ======================= */

try {
    // 统一夹具回收：打卡/动态/任务/福宝/评价/收藏分组/提交/举报等派生数据一并清理
    const r = cleanup_fixtures({ prefixes: [], usernames: [USER_API, USER_UI] });
    console.log(`CLEAN 临时账号及其派生数据已清理（users=${r.users}）`);
} catch (e) {
    console.log(`CLEAN 清理失败（需手工处理）：${String(e.message || e).slice(0, 120)}`);
    db_exec(`DELETE FROM dafu.post WHERE user_id IN (${UID_API},${UID_UI});`);
    db_exec(`DELETE FROM dafu.check_in WHERE user_id IN (${UID_API},${UID_UI});`);
    db_exec(`DELETE FROM dafu.task_claim WHERE user_id IN (${UID_API},${UID_UI});`);
    db_exec(`DELETE FROM dafu.pet WHERE user_id IN (${UID_API},${UID_UI});`);
    db_exec(`DELETE FROM dafu.user_dress WHERE user_id IN (${UID_API},${UID_UI});`);
    db_exec(`DELETE FROM dafu.favorite WHERE user_id IN (${UID_API},${UID_UI});`);
    db_exec(`DELETE FROM dafu.user WHERE id IN (${UID_API},${UID_UI});`);
}

console.log(`\n==== r82 结果：PASS ${passed} / FAIL ${failed} ====`);
if (failed) console.log(`失败项：${failures.join(' | ')}`);
process.exit(failed ? 1 : 0);
