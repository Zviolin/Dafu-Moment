/**
 * r69 走查：大福食刻交互原型（大福食刻-交互原型.html 响应式手机网页版）
 *   P1 首页可见：品牌栏/搜索框/按食堂逛/口碑榜/大家都在吃
 *   P2 五个 tabbar 全部可点，对应页面可见（首页/逛档口/写点评/想吃/我的）
 *   P3 发布页：星级可点选（paint 生效）
 *   P4 发布页：标签 chip 可切换选中
 *   P5 空内容点发布 → 提示「先写点什么再发布哦」
 *   P6 填内容点发布 → toast「已提交，机审通过后展示」且字数统计生效
 *   P7 想吃页：心形可切换（空心↔红心）
 *   P8 详情页：评价筛选 tabs 可切换、点赞心形可切换
 * 幂等：纯前端静态原型，无数据残留
 * 运行：node tests/walkthrough-r69-proto.test.mjs（本地静态服务 :8899 需开启）
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url) /* 解析到 tests/node_modules，避免依赖已被清理的临时目录 */;
const { chromium } = require('playwright-core');

const BASE = 'http://localhost:8899';
const FILE = encodeURIComponent('大福食刻-交互原型.html');
const EXE = 'C:\\Users\\Zviolin\\AppData\\Local\\ms-playwright\\chromium-1208\\chrome-win64\\chrome.exe';
let passed = 0, failed = 0;

function assert(cond, name, extra = '') {
  cond ? passed++ : failed++;
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${extra ? ' | ' + extra : ''}`);
}

const browser = await chromium.launch({ headless: true, executablePath: EXE });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();

await page.goto(`${BASE}/${FILE}`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.page-home', { timeout: 8000 });

/* P1 首页可见 */
const p1 = await page.evaluate(() => ({
  brand: document.body.innerText.includes('大福食刻'),
  rank: document.body.innerText.includes('热门口碑榜'),
  food: !!document.querySelector('img[src*="home_food1"]'),
  homeVisible: getComputedStyle(document.querySelector('.page-home')).display !== 'none'
}));
assert(p1.brand && p1.rank && p1.food && p1.homeVisible, 'P1 首页可见且内容齐', JSON.stringify(p1));

/* P2 五个 tabbar 全部可点 */
const ids = ['r-home', 'r-detail', 'r-publish', 'r-fav', 'r-mine'];
const pages = ['page-home', 'page-detail', 'page-publish', 'page-fav', 'page-mine'];
const names = ['首页', '逛档口', '写点评', '想吃', '我的'];
let allOk = true;
const detail = {};
for (let i = 0; i < ids.length; i++) {
  await page.evaluate((id) => {
    const el = document.getElementById(id);
    el.checked = true;
    el.dispatchEvent(new Event('change'));
  }, ids[i]);
  const vis = await page.evaluate((cls) => getComputedStyle(document.querySelector('.' + cls)).display !== 'none', pages[i]);
  detail[names[i]] = vis;
  if (!vis) allOk = false;
}
assert(allOk, 'P2 五个 tabbar 全部可点且页面可见', JSON.stringify(detail));

/* 回到发布页 */
await page.evaluate(() => { document.getElementById('r-publish').checked = true; document.getElementById('r-publish').dispatchEvent(new Event('change')); });

/* P3 星级点选 */
const star = page.locator('.page-publish .pstars').nth(1).locator('s').nth(2);
await star.click();
const starState = await page.evaluate(() => {
  const g = document.querySelectorAll('.page-publish .pstars')[1];
  return g.querySelectorAll('s.on').length;
});
assert(starState === 3, 'P3 星级点选生效（口味 3 星）', 'on=' + starState);

/* P4 标签 chip 切换 */
await page.locator('#ptags .ptag').nth(1).click();
const tagSel = await page.evaluate(() => document.querySelectorAll('#ptags .ptag.sel').length);
assert(tagSel === 1, 'P4 标签 chip 选中切换', 'sel=' + tagSel);

/* P5 空内容发布提示 */
await page.locator('#pubbtn').click();
await page.waitForTimeout(300);
const toast1 = await page.evaluate(() => document.querySelector('#toast') ? document.getElementById('toast').textContent : document.body.innerText.includes('先写点什么'));
const emptyToast = await page.evaluate(() => [...document.querySelectorAll('div')].some(d => d.style.zIndex === '60' && /先写点什么/.test(d.textContent)));
assert(emptyToast, 'P5 空内容发布 → 提示先写内容', String(toast1).slice(0, 30));

/* P6 填内容发布 */
await page.evaluate(() => { const t = document.getElementById('txt'); t.textContent = '锅巴很香，强烈推荐！'; t.dispatchEvent(new Event('input')); });
const cnt = await page.evaluate(() => document.getElementById('cnt').textContent);
await page.locator('#pubbtn').click();
await page.waitForTimeout(300);
const okToast = await page.evaluate(() => [...document.querySelectorAll('div')].some(d => d.style.zIndex === '60' && /已提交/.test(d.textContent)));
assert(okToast && cnt === '10/500', 'P6 填内容发布 → 已提交 toast + 字数统计', 'cnt=' + cnt);

/* P7 想吃页心形切换 */
await page.evaluate(() => { document.getElementById('r-fav').checked = true; document.getElementById('r-fav').dispatchEvent(new Event('change')); });
const favHeart = page.locator('.page-fav .heart').nth(1);
const before = await favHeart.evaluate(el => el.classList.contains('on'));
await favHeart.click();
const after = await favHeart.evaluate(el => el.classList.contains('on'));
assert(before !== after, 'P7 想吃页心形可切换', before + '->' + after);

/* P8 详情页 tabs + 点赞 */
await page.evaluate(() => { document.getElementById('r-detail').checked = true; document.getElementById('r-detail').dispatchEvent(new Event('change')); });
await page.locator('.page-detail [data-t="good"]').click();
const goodOn = await page.evaluate(() => document.querySelector('.page-detail [data-t="good"]').classList.contains('on'));
const dHeart = page.locator('.page-detail .heart').first();
const hb = await dHeart.evaluate(el => el.classList.contains('on'));
await dHeart.click();
const ha = await dHeart.evaluate(el => el.classList.contains('on'));
assert(goodOn && hb !== ha, 'P8 详情页筛选 tab + 点赞切换', `tab=${goodOn} like=${hb}->${ha}`);

await browser.close();
console.log(`\n结果: ${passed} passed, ${failed} failed, 共 ${passed + failed} 例`);
process.exit(failed > 0 ? 1 : 0);
