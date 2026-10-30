/**
 * r42 走查：Leaflet 栅格瓦片 → 高德 JS API 2.0 官方矢量渲染（三处地图组件）
 * 运行：node tests/walkthrough-r42.test.mjs
 * 前置：docker compose up -d --build frontend（前端 http://localhost:8095）
 *
 * 矢量地图走查口径（与 r41 栅格瓦片不同）：
 * - 底图为 canvas 矢量绘制（中文注记在画布里，DOM 查不到文字）——内容正确性靠截图人工复核
 * - DOM 可断言：canvas 图层、自定义 content 的 .pin 标记、setLabel 的 .amap-marker-label、缩放控件
 * - key/安全密钥走 .env，错误凭证会表现为 canvas 不渲染或控制台 INVALID_USER_SCODE——一并捕获
 */
import { chromium } from 'playwright-core';
import fs from 'fs';

const BASE = 'http://localhost:8095';
const EXE = 'C:\\Users\\Zviolin\\AppData\\Local\\ms-playwright\\chromium-1208\\chrome-win64\\chrome.exe';
const OUT = 'C:\\Users\\Zviolin\\AppData\\Local\\Temp\\lb-e2e';
fs.mkdirSync(OUT, { recursive: true });

const results = [];
let pass = 0, fail = 0;

/**
 * 登记一个走查用例
 * @param {string} id - R-xx
 * @param {string} desc
 * @param {Function} fn
 */
async function case_r(id, desc, fn) {
    try {
        await fn();
        pass++;
        results.push({ id, desc, ok: true });
        console.log(`  [PASS] ${id} ${desc}`);
    } catch (e) {
        fail++;
        results.push({ id, desc, ok: false, msg: String(e.message || e).slice(0, 260) });
        console.log(`  [FAIL] ${id} ${desc} -> ${String(e.message || e).slice(0, 260)}`);
    }
}

/** 断言 */
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assert failed'); }

/* 捕获页面控制台错误（AMap 凭证错误会打到 console） */
const console_errors = [];

/* API 登录拿 token（验证码走 DEBUG debugCode 通道），UI 走查用 localStorage 注入免验证码流程 */
const cap = await (await fetch(`${BASE}/api/auth/captcha`)).json();
const login = await (await fetch(`${BASE}/api/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'zhangwl', password: '123456', captchaId: cap.data.captchaId, captchaCode: cap.data.debugCode }),
})).json();
assert(login.data && login.data.token, `API 登录失败: ${JSON.stringify(login).slice(0, 120)}`);

const cap2 = await (await fetch(`${BASE}/api/auth/captcha`)).json();
const admin_login = await (await fetch(`${BASE}/api/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: (process.env.DAFU_ADMIN_PASSWORD || 'admin123'), captchaId: cap2.data.captchaId, captchaCode: cap2.data.debugCode }),
})).json();
assert(admin_login.data && admin_login.data.token, `admin 登录失败: ${JSON.stringify(admin_login).slice(0, 120)}`);

const browser = await chromium.launch({ executablePath: EXE, headless: true });

/* ---- 用户态：前台地图页 ---- */
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
page.on('console', (m) => { if (m.type() === 'error') console_errors.push(m.text().slice(0, 160)); });
await page.addInitScript(([t, u]) => {
    localStorage.setItem('fk_token', t);
    localStorage.setItem('fk_user', JSON.stringify(u));
}, [login.data.token, login.data.user]);

console.log('=== r42 走查（chromium 1280x800 DPR=2 · AMap JS API 2.0 矢量） ===');

await case_r('R1', '前台 /map 矢量地图加载：canvas 图层 + 标记数对齐 API + 无 Leaflet 残留', async () => {
    // 期望标记数以公开食区 API 为准（种子库 v2.0 为 10 点位，勿硬编码 7）
    const cj = await (await fetch(`${BASE}/api/canteens`)).json();
    const expected = (cj.data || cj).length;
    assert(expected >= 7, `API 食区数异常: ${expected}`);
    await page.goto(`${BASE}/map`, { waitUntil: 'domcontentloaded' });
    // AMap 脚本异步加载（webapi.amap.com），canvas 出现即矢量渲染成功（凭证错误会渲染失败）
    await page.waitForSelector('.map-canvas canvas', { timeout: 25000 });
    await page.waitForSelector('.map-canvas .pin', { timeout: 15000 });
    const counts = await page.evaluate(() => ({
        canvas: document.querySelectorAll('.map-canvas canvas').length,
        pins: document.querySelectorAll('.map-canvas .pin').length,
        leaflet: document.querySelectorAll('.leaflet-container, .leaflet-tile').length,
    }));
    assert(counts.canvas > 0, '地图容器内无 canvas（矢量图层未渲染）');
    assert(counts.pins === expected, `.pin 标记应为 ${expected} 个，实际 ${counts.pins}`);
    assert(counts.leaflet === 0, `仍有 ${counts.leaflet} 个 Leaflet 残留元素`);
    // 凭证/密钥错误检查
    const bad = console_errors.filter((t) => /INVALID|USERKEY|SCODE/i.test(t));
    assert(bad.length === 0, `AMap 凭证错误: ${bad[0] || ''}`);
});

await case_r('R2', '点击标记弹出食区详情卡 + 选中态加深橙 pin', async () => {
    await page.click('.map-canvas .amap-marker .pin >> nth=0');
    await page.waitForSelector('.pin-card', { timeout: 5000 });
    const card = await page.evaluate(() => ({
        open: !!document.querySelector('.pin-card'),
        title: document.querySelector('.pin-card .pc-title')?.textContent || '',
        on_pin: document.querySelectorAll('.map-canvas .pin.on').length,
    }));
    assert(card.open, '详情卡未弹出');
    assert(card.title.length > 0, '详情卡标题为空');
    assert(card.on_pin === 1, `选中态 .pin.on 应 1 个，实际 ${card.on_pin}`);
    await page.click('.pin-card .pc-close');
    await page.waitForSelector('.pin-card', { state: 'detached', timeout: 5000 });
});

await case_r('R3', 'ToolBar 缩放控件存在且可交互（实测类名 .amap-ctrl-zoomin/out）+ 截图人工复核中文注记', async () => {
    // r42 实测 ToolBar 真实类名：.amap-toolbar 容器 + .amap-ctrl-zoomin / .amap-ctrl-zoomout 按钮
    const zoom_info = await page.evaluate(() => {
        const zin = document.querySelector('.map-canvas .amap-ctrl-zoomin');
        const zout = document.querySelector('.map-canvas .amap-ctrl-zoomout');
        return { zin: !!zin, zout: !!zout, toolbar: !!document.querySelector('.map-canvas .amap-toolbar') };
    });
    console.log(`    ToolBar 实测: ${JSON.stringify(zoom_info)}`);
    assert(zoom_info.toolbar && zoom_info.zin && zoom_info.zout, `缩放控件缺失: ${JSON.stringify(zoom_info)}`);
    // 点一次放大确认控件可交互，再截图
    await page.click('.map-canvas .amap-ctrl-zoomin');
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${OUT}/r42-map-zoomed.png` });
    await page.click('.map-canvas .amap-ctrl-zoomout');
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${OUT}/r42-map-default.png` });
    assert(fs.existsSync(`${OUT}/r42-map-default.png`), '截图未生成');
});

/* ---- 管理态：校位图 + 迷你选点图 ---- */
const actx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const apage = await actx.newPage();
apage.on('console', (m) => { if (m.type() === 'error') console_errors.push(m.text().slice(0, 160)); });
await apage.addInitScript(([t, u]) => {
    localStorage.setItem('fk_token', t);
    localStorage.setItem('fk_user', JSON.stringify(u));
}, [admin_login.data.token, admin_login.data.user]);

await case_r('R4', '后台「地图点位」懒初始化：校位图标记 + 常显食区名标签（setLabel）', async () => {
    await apage.goto(`${BASE}/admin/content`, { waitUntil: 'domcontentloaded' });
    await apage.click('.el-tabs__item:has-text("地图点位")');
    await apage.waitForSelector('.pos-canvas canvas', { timeout: 25000 });
    await apage.waitForSelector('.pos-canvas .amap-marker .pin', { timeout: 15000 });
    const info = await apage.evaluate(() => ({
        pins: document.querySelectorAll('.pos-canvas .pin').length,
        labels: document.querySelectorAll('.pos-canvas .amap-marker-label .pos-tip').length,
        gray: document.querySelectorAll('.pos-canvas .pin').length - document.querySelectorAll('.pos-canvas .pin:not(:has(.pulse))').length,
    }));
    assert(info.pins >= 7, `校位图 .pin 应 ≥7，实际 ${info.pins}`);
    assert(info.labels >= 7, `常显标签应 ≥7，实际 ${info.labels}`);
    console.log(`    校位图: ${info.pins} 个标记 / ${info.labels} 个常显标签`);
    // headless SwiftShader 软渲染下矢量底图首帧较慢，等 3s 再截图（真实浏览器硬件 WebGL 无此问题）
    await apage.waitForTimeout(3000);
    await apage.screenshot({ path: `${OUT}/r42-admin-pos.png` });
});

await case_r('R5', '食堂编辑弹窗迷你选点图：手输提交生效 + 拖拽标记 → 坐标回填（dragend）', async () => {
    // R4 切走后 #pane-canteen 处于隐藏态（el-tab-pane 非懒渲染），先切回「食堂」tab
    await apage.click('.el-tabs__item:has-text("食堂")');
    await apage.waitForSelector('#pane-canteen .el-table__row', { timeout: 10000 });
    // 弹窗 DOM 常驻，必须 .el-dialog:visible 限定（历史教训）
    await apage.click('#pane-canteen .el-table__row:has-text("京元") button:has-text("编辑")');
    await apage.waitForSelector('.el-dialog:visible .ct-map canvas', { timeout: 25000 });
    await apage.waitForSelector('.el-dialog:visible .ct-map .amap-marker', { timeout: 15000 });
    const lat_input = apage.locator('.el-dialog:visible .ct-pos-item:nth-child(1) input');
    const lng_input = apage.locator('.el-dialog:visible .ct-pos-item:nth-child(2) input');
    // ① 手输坐标提交（美岐火星坐标）：ct_sync_marker 会把视图重定位到新点，标记恒在画布中心
    //    ——视口 rect 不变是预期行为，故只断言输入值提交成功，跟随链路以拖拽反向链路覆盖
    await lat_input.fill('26.059497');
    await lat_input.press('Tab');
    await lng_input.fill('119.191987');
    await lng_input.press('Tab');
    await apage.waitForTimeout(1200);
    assert((await lat_input.inputValue()) === '26.059497', `纬度手输未提交: ${await lat_input.inputValue()}`);
    assert((await lng_input.inputValue()) === '119.191987', `经度手输未提交: ${await lng_input.inputValue()}`);
    // ② 拖拽标记松手 → dragend 回填新坐标（选点核心工作流）
    const box = await apage.locator('.el-dialog:visible .ct-map .pin').boundingBox();
    const cx = box.x + box.width / 2, tip_y = box.y + box.height - 4; // 锚点 bottom-center：捏水滴尖端拖
    await apage.mouse.move(cx, tip_y);
    await apage.mouse.down();
    await apage.mouse.move(cx + 55, tip_y + 35, { steps: 10 });
    await apage.mouse.up();
    await apage.waitForTimeout(1200);
    const lat_after = await lat_input.inputValue();
    const lng_after = await lng_input.inputValue();
    assert(lat_after !== '26.059497' && lng_after !== '119.191987', `拖拽后坐标未回填: ${lat_after},${lng_after}`);
    console.log(`    拖拽回填: ${lat_after}, ${lng_after}（原手输 26.059497,119.191987）`);
    await apage.screenshot({ path: `${OUT}/r42-admin-ctmap.png` });
    await apage.click('.el-dialog:visible .el-dialog__headerbtn'); // 不保存退出
});

console.log(`\n=== 结果: ${pass} 过 / ${fail} 挂 ===`);
for (const r of results) console.log(`  ${r.ok ? 'PASS' : 'FAIL'} ${r.id} ${r.desc}${r.ok ? '' : ' -> ' + r.msg}`);
if (console_errors.length) console.log(`\nconsole error 汇总（前 5 条）:\n  ${console_errors.slice(0, 5).join('\n  ')}`);
await browser.close();
process.exit(fail === 0 ? 0 : 1);
