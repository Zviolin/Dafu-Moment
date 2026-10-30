// 交互原型 10 页跳转探针
const { createRequire } = require('module');
const { chromium } = createRequire(__filename)('playwright-core');
const EXE = 'C:\\Users\\Zviolin\\AppData\\Local\\ms-playwright\\chromium-1208\\chrome-win64\\chrome.exe';
const URL = 'http://localhost:8899/%E5%A4%A7%E7%A6%8F%E9%A3%9F%E5%88%BB-%E4%BA%A4%E4%BA%92%E5%8E%9F%E5%9E%8B.html';

(async () => {
  const b = await chromium.launch({ executablePath: EXE, headless: true });
  const pg = await b.newPage({ viewport: { width: 375, height: 812 } });
  const errs = [];
  pg.on('pageerror', e => errs.push(e.message));
  await pg.goto(URL, { waitUntil: 'load' });
  const vis = async () => pg.evaluate(() => [...document.querySelectorAll('.page')].find(p => p.style.display !== 'none' && getComputedStyle(p).display === 'block')?.className.split('page-')[1] || '?');
  const T = [];
  const ok = (n, c) => T.push(`${c ? 'PASS' : 'FAIL'} ${n}`);

  ok('默认首页', (await vis()) === 'home');
  // 首页搜索框 -> 找菜
  await pg.click('.page-home label[for="r-search"]');
  ok('搜索框->找菜', (await vis()) === 'search');
  // 筛选 chips 多选
  await pg.click('.page-search [data-f]');
  ok('筛选 chip 切换', await pg.evaluate(() => document.querySelector('.page-search [data-f]').classList.contains('on')));
  // 结果卡 -> 详情
  await pg.click('.page-search label[for="r-detail"]');
  ok('找菜结果->详情', (await vis()) === 'detail');
  // 详情写评价 -> 发布
  await pg.click('#writebtn');
  ok('写评价->发布页', (await vis()) === 'publish');
  // 发布 <- 回首页，再进 AI
  await pg.click('.page-publish label[for="r-home"]');
  ok('发布返回首页', (await vis()) === 'home');
  await pg.click('label[for="r-ai"].card');
  ok('插画卡->福宝AI', (await vis()) === 'ai');
  // AI 推荐卡 -> 详情
  await pg.click('.page-ai label[for="r-detail"]');
  ok('AI推荐->详情', (await vis()) === 'detail');
  // tabbar 我的 -> 退出登录 -> 登录页 -> 登录回首页
  await pg.click('.tabbar label[for="r-mine"]');
  ok('tabbar->我的', (await vis()) === 'mine');
  await pg.click('.page-mine label[for="r-login"]');
  ok('退出登录->登录页', (await vis()) === 'login');
  await pg.click('.page-login label[for="r-home"]');
  ok('登录->首页', (await vis()) === 'home');
  // 定位圆钮 -> 地图 -> 查看详情
  await pg.click('.page-home label[for="r-map"].icircle');
  ok('定位->美食地图', (await vis()) === 'map');
  await pg.click('.page-map label[for="r-detail"].ptag');
  ok('地图->详情', (await vis()) === 'detail');
  // 铃铛 -> 通知
  await pg.click('.tabbar label[for="r-home"]');
  await pg.click('.page-home label[for="r-notify"].icircle');
  ok('铃铛->消息通知', (await vis()) === 'notify');
  ok('无 JS 报错', errs.length === 0);
  console.log(T.join('\n'));
  console.log(`\n${T.filter(x => x.startsWith('PASS')).length}/${T.length}`);
  await b.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
