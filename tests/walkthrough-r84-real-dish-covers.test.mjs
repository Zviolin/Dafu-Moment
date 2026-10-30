/**
 * r84 真实菜品图接入走查：档口 / 菜品 / 点位三类封面替换为真实菜品图
 *
 * 背景：此前全部封面为 preset:rice 占位插画；r84 把 CodeHub 仓库 dafu-shike
 *      的 150 张真实菜品图灌入 MinIO 并回写 dish / station / canteen 三表。
 *      本脚本覆盖：
 *        1. 三类封面不再停留在 preset 占位（菜品/档口应全为真实图键）
 *        2. /img/ 代理可访问且返回图片类型
 *        3. 裸 objectKey 直连不是图片（证明前端必须经 cover_url 拼 /img/ 前缀）
 *        4. 浏览器渲染：菜品详情 / 档口详情 / 点位详情 / 饮食计划页无裂图
 *        5. 贴纸去重幂等：菜品公共贴纸按确定性键入库，重启不膨胀
 *
 * 运行：node tests/walkthrough-r84-real-dish-covers.test.mjs
 * 前置：docker 全容器 + http://localhost:8095
 */
import { createRequire } from 'module';
import { execSync } from 'child_process';
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
 * 取列表数据（兼容 data 为数组或 { list } 两种形态）
 * @param {string} url - 接口地址
 * @returns {Promise<Array>}
 */
async function list_of(url) {
    const j = await (await fetch(`${BASE}${url}`)).json();
    if (Array.isArray(j.data)) return j.data;
    return j.data?.list || [];
}

/* ---------------- 断言 1：菜品封面已替换为真实图键 ---------------- */
const dishes = await list_of('/api/dishes?page=1&pageSize=200');
assert(dishes.length > 0, '菜品列表接口可访问', `count=${dishes.length}`);
const dish_real = dishes.filter((d) => d.cover_object_key && !String(d.cover_object_key).startsWith('preset:'));
assert(dish_real.length === dishes.length, '菜品封面全部为真实图键（无 preset 占位）', `real=${dish_real.length}/${dishes.length}`);

/* ---------------- 断言 2：档口封面已替换（列表接口不返回封面，取详情） ---------------- */
const stations = await list_of('/api/stations');
const station_details = [];
for (const s of stations) {
    const d = await (await fetch(`${BASE}/api/stations/${s.id}`)).json();
    if (d.data?.station) station_details.push(d.data.station);
}
// r86 起校内食堂档口（28 个）来自 geojson include，源库无菜单 → 无真实菜品图可挂，按设计保留预设图；
// 只有门店档口（有菜品、有真实菜品图）要求全部替换为真实图键
const canteen_meta = await list_of('/api/canteens');
const campus_ids = new Set(canteen_meta.filter((c) => c.type === 0).map((c) => c.id));
const campus_station_num = (s) => campus_ids.has(Number(s.canteen_id ?? s.canteenId));
const store_stations = station_details.filter((s) => !campus_station_num(s));
const campus_stations = station_details.filter(campus_station_num);
const station_real = store_stations.filter((s) => s.cover_object_key && !String(s.cover_object_key).startsWith('preset:'));
assert(store_stations.length === 42 && station_real.length === store_stations.length,
    '门店档口封面全部为真实图键', `real=${station_real.length}/${store_stations.length}`);
assert(campus_stations.length === 28 && campus_stations.every((s) => String(s.cover_object_key).startsWith('preset:')),
    '校内食堂档口封面为预设图（源库无菜单，无真实图可挂）', `preset=${campus_stations.filter((s) => String(s.cover_object_key).startsWith('preset:')).length}/${campus_stations.length}`);

/* ---------------- 断言 3：点位封面已替换（有档口的点位） ---------------- */
const canteens = await list_of('/api/canteens');
const canteen_real = canteens.filter((c) => c.cover_object_key && !String(c.cover_object_key).startsWith('preset:'));
assert(canteen_real.length > 0, '点位封面已替换为真实图键', `real=${canteen_real.length}/${canteens.length}`);

/* ---------------- 断言 4：/img/ 可访问且为图片类型 ---------------- */
const sample = dish_real[0]?.cover_object_key || '';
const img_res = await fetch(`${BASE}/img/${sample}`);
const ct = img_res.headers.get('content-type') || '';
assert(img_res.status === 200 && ct.startsWith('image/'), '菜品真实图经 /img/ 可访问且为图片类型', `status=${img_res.status} ct=${ct} key=${sample}`);

/* ---------------- 断言 5：裸 objectKey 直连不是图片（前端必须补前缀） ---------------- */
const bare = await fetch(`${BASE}/${sample}`);
const bare_ct = bare.headers.get('content-type') || '';
assert(!bare_ct.startsWith('image/'), '裸 objectKey 直连非图片（历史裂图根因）', `ct=${bare_ct}`);

/* ---------------- 断言 6：全部真实图键抽样可访问（抽 20 张） ---------------- */
const keys = [...new Set(dishes.map((d) => d.cover_object_key).filter((k) => k && !String(k).startsWith('preset:')))];
const picks = keys.filter((_, i) => i % Math.max(1, Math.ceil(keys.length / 20)) === 0).slice(0, 20);
const bad = [];
for (const k of picks) {
    const r = await fetch(`${BASE}/img/${k}`, { method: 'HEAD' });
    if (r.status !== 200) bad.push(`${k}:${r.status}`);
}
assert(bad.length === 0, '抽样 20 张真实菜品图全部 200', `checked=${picks.length} bad=${JSON.stringify(bad)}`);

/* ---------------- 断言 7：浏览器渲染无裂图 ---------------- */
const browser = await chromium.launch({ executablePath: EXE, headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

/**
 * 采集页面内封面图片的加载状态
 * @returns {Promise<{broken: number, ok: number, srcs: string[]}>}
 */
async function cover_images_state() {
    return page.evaluate(() => {
        const imgs = [...document.querySelectorAll('img')].filter((i) => {
            const src = i.getAttribute('src') || '';
            return src.includes('/img/') || src.includes('/preset-cover/');
        });
        const broken = imgs.filter((i) => i.complete && i.naturalWidth === 0);
        return {
            broken: broken.length,
            ok: imgs.length - broken.length,
            srcs: imgs.map((i) => i.getAttribute('src')).slice(0, 6),
        };
    });
}

const DISH_ID = dishes[0]?.id;
const STATION_ID = stations[0]?.id;
// 点位取有真实封面的（无档口点位按设计保留 preset 占位）
const CANTEEN_ID = canteen_real[0]?.id || canteens[0]?.id;

/* 7.1 菜品详情页 */
await page.goto(`${BASE}/dish/${DISH_ID}`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
let st = await cover_images_state();
assert(st.broken === 0 && st.ok > 0, '菜品详情页封面无裂图', `ok=${st.ok} broken=${st.broken} srcs=${JSON.stringify(st.srcs)}`);

/* 7.2 档口详情页 */
await page.goto(`${BASE}/station/${STATION_ID}`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
st = await cover_images_state();
assert(st.broken === 0 && st.ok > 0, '档口详情页封面无裂图', `ok=${st.ok} broken=${st.broken} srcs=${JSON.stringify(st.srcs)}`);

/* 7.3 点位详情页 */
await page.goto(`${BASE}/canteen/${CANTEEN_ID}`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
st = await cover_images_state();
assert(st.broken === 0 && st.ok > 0, '点位详情页封面无裂图', `ok=${st.ok} broken=${st.broken} srcs=${JSON.stringify(st.srcs)}`);

/* 7.4 饮食计划页（r84 修复的裸键裂图点） */
await page.goto(`${BASE}/ai/plan`, { waitUntil: 'networkidle' });
await page.waitForTimeout(800);
// 计划需点「生成计划」才渲染菜品行
await page.click('.gen-btn');
await page.waitForTimeout(1500);
const plan_srcs = await page.evaluate(() => {
    const imgs = [...document.querySelectorAll('img.dish-img')].map((i) => i.getAttribute('src') || '');
    return {
        total: imgs.length,
        raw: imgs.filter((s) => s && !s.startsWith('/') && !s.startsWith('http')).length,
        broken: [...document.querySelectorAll('img.dish-img')].filter((i) => i.complete && i.naturalWidth === 0).length,
        sample: imgs.slice(0, 3),
    };
});
assert(plan_srcs.total > 0, '饮食计划页已渲染菜品图', JSON.stringify(plan_srcs));
assert(plan_srcs.raw === 0, '饮食计划页菜品图 URL 已补全（无裸 objectKey）', JSON.stringify(plan_srcs));
assert(plan_srcs.broken === 0, '饮食计划页菜品图无裂图', JSON.stringify(plan_srcs));

await browser.close();

/* ---------------- 断言 8：菜品公共贴纸按确定性键入库（去重幂等） ----------------
 * 直接查库：/api/stickers 需登录且 list_user 有 LIMIT 200，查库可覆盖全量 */
const sql_out = execSync(
    `docker exec dafu-mysql mysql -uroot -pdafu_root_2026 dafu -N -B -e "SELECT object_key FROM sticker WHERE source = 3"`,
    { encoding: 'utf8' }
);
const dish_stickers = sql_out.split('\n').map((s) => s.trim()).filter(Boolean);
assert(dish_stickers.length > 0, '菜品公共贴纸已生成', `count=${dish_stickers.length}`);
// 真实图贴纸的对象键必须是 sticker/dish/{hash}.png 形态（由源图键确定性派生）
const real_stickers = dish_stickers.filter((k) => k.startsWith('sticker/dish/'));
assert(real_stickers.length > 0, '真实菜品贴纸采用确定性对象键（重启不重复抠图）', `count=${real_stickers.length}`);
// 同一 objectKey 不得重复入库
const key_count = new Map();
for (const k of dish_stickers) key_count.set(k, (key_count.get(k) || 0) + 1);
const dup_keys = [...key_count.entries()].filter(([, n]) => n > 1);
assert(dup_keys.length === 0, '菜品公共贴纸对象键无重复', `dup=${JSON.stringify(dup_keys.slice(0, 3))}`);

console.log(`\n结果：${passed} 通过 / ${failed} 失败`);
process.exit(failed > 0 ? 1 : 0);
