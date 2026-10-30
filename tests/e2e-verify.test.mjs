/**
 * 大福食刻 DAFU MOMENT E2E 验收（E2E 编号用例 + 三视口回归，node 直跑）
 * 运行：node tests/e2e-verify.test.mjs
 * 前置：docker compose up -d --build（http://localhost:8095）
 * 产物：C:\Users\Zviolin\AppData\Local\Temp\lb-e2e\*.png
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
 * 登记一个 E2E 用例
 * @param {string} id - E2E-xx
 * @param {string} desc
 * @param {Function} fn
 */
async function case_e2e(id, desc, fn) {
    try {
        await fn();
        pass++;
        results.push({ id, desc, ok: true });
        console.log(`  [PASS] ${id} ${desc}`);
    } catch (e) {
        fail++;
        results.push({ id, desc, ok: false, msg: String(e.message || e).slice(0, 200) });
        console.log(`  [FAIL] ${id} ${desc} -> ${String(e.message || e).slice(0, 200)}`);
    }
}

/**
 * 断言
 */
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assert failed'); }

const browser = await chromium.launch({ executablePath: EXE, headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();
const consoleErrors = [];
page.on('pageerror', (e) => consoleErrors.push(String(e).slice(0, 120)));

/** 取校内食堂（type=0）作为详情页样本；旧种子「美岐食区」已下线，按数据实际取第一个 */
const canteens = await (await fetch(`${BASE}/api/canteens`)).json();
const MQ_ID = (canteens.data.find((c) => c.name.includes('美岐'))
    || canteens.data.find((c) => Number(c.type) === 0)
    || canteens.data[0]).id;
/** 点位总数（v2.0 四类型点位，数量由种子决定，标记数断言据此放宽） */
const POINT_COUNT = canteens.data.length;

console.log('=== DAFU MOMENT E2E 验收（chromium 1280x800） ===');

console.log('[分组] 美食地图');
await case_e2e('E2E-M1', '/map 渲染全部点位标记，点击标记出详情卡', async () => {
    await page.goto(`${BASE}/map`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForSelector('.pin', { timeout: 8000 });
    const pinCount = await page.locator('.pin').count();
    assert(pinCount >= POINT_COUNT, `标记数=${pinCount}（期望 ≥ ${POINT_COUNT}）`);
    // 60 个点位在 1280x800 下密集重叠，AMap 标记互相遮挡：多数标记的中心点
    // 实际命中的是别的标记，硬点「第一个」会点空。改为找一个「中心点命中自身」
    // 的标记（未被遮挡）再点击，验证真实用户的点击路径。
    //
    // 注意：map.setFitView 之后高德仍有一次缩放/平移的视野动画，动画期间标记
    // 的屏幕坐标持续漂移——此处若立刻取坐标再点击，等真正按下鼠标时标记已经
    // 移走，click 落到空白处，表现为「点了标记没反应」。故先等动画结束（连续
    // 两次采样坐标一致即视为已稳定），再取坐标点击。
    const pick_target = () => page.evaluate(() => {
        const pins = Array.from(document.querySelectorAll('.pin'));
        for (const p of pins) {
            const r = p.getBoundingClientRect();
            if (!r.width) continue;
            const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
            const marker = top && top.closest('.amap-marker');
            if (marker && marker.contains(p)) {
                return {
                    x: Math.round(r.left + r.width / 2),
                    y: Math.round(r.top + r.height / 2),
                    title: marker.getAttribute('title') || '',
                };
            }
        }
        return null;
    });
    /**
     * 采样一个「中心点命中自身」的标记，并返回其稳定坐标
     * @returns {Promise<{x: number, y: number, title: string}|null>}
     */
    const pick_stable = async () => {
        let prev = null;
        let stable = null;
        // 连续两次采样坐标一致即视为视野动画已结束；最多等 12 × 300ms
        for (let i = 0; i < 12; i++) {
            const cur = await pick_target();
            if (cur && prev && cur.x === prev.x && cur.y === prev.y) {
                stable = cur;
                break;
            }
            prev = cur;
            await page.waitForTimeout(300);
        }
        return stable || prev;
    };

    /**
     * 按真实用户节奏点击一次标记，检测详情卡是否弹出
     * @returns {Promise<boolean>}
     */
    const click_pin = async () => {
        const target = await pick_stable();
        if (!target) return false;
        // 用真实用户节奏点击：AMap 2.0 的 Marker click 依赖 down/up 之间的时间间隔
        // 区分「点击」与「拖拽」，Playwright 默认 0 延时的 click 会被判定为拖拽而
        // 不派发 click（表现为点击标记无响应），故手动 down → 停顿 → up
        await page.mouse.move(target.x, target.y);
        await page.mouse.down();
        await page.waitForTimeout(120);
        await page.mouse.up();
        try {
            await page.waitForSelector('.pin-card', { timeout: 4000 });
            return true;
        } catch {
            return false;
        }
    };

    // 标记密集重叠 + 视野动画期间坐标漂移，单次点击存在偶发落空的可能；
    // 落空时重新采样坐标再点，最多 3 轮（这是产品行为，重试是测试容错）
    let opened = false;
    for (let attempt = 0; attempt < 3 && !opened; attempt++) {
        opened = await click_pin();
        if (!opened) await page.waitForTimeout(600);
    }
    assert(opened, '连续 3 轮点击标记均未弹出详情卡');
    const cardText = await page.locator('.pin-card').textContent();
    assert(cardText.includes('档口'), `详情卡缺档口数：${cardText.replace(/\s+/g, ' ')}`);
    assert(cardText.includes('查看档口'), '详情卡缺跳转按钮');
    await page.screenshot({ path: `${OUT}\\e2e-m1-map.png` });
});

await case_e2e('E2E-M2', '标记详情卡跳转 /canteen/:id', async () => {
    await page.locator('.pin-card .pc-btn').click();
    await page.waitForURL(/\/canteen\/\d+/, { timeout: 8000 });
    await page.waitForSelector('h1', { timeout: 8000 });
    const h1 = await page.locator('h1').first().textContent();
    assert(h1.trim().length > 0, '食区详情页 h1 为空');
});

await case_e2e('E2E-M3', `/map?focus=${MQ_ID} 直达定位校内食堂详情卡`, async () => {
    await page.goto(`${BASE}/map?focus=${MQ_ID}`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForSelector('.pin-card', { timeout: 8000 });
    const t = await page.locator('.pin-card .pc-title').textContent();
    assert(t.trim().length > 0, `详情卡标题为空`);
    await page.screenshot({ path: `${OUT}\\e2e-m3-focus.png` });
});

await case_e2e('E2E-M4', '食区详情页「在地图上查看」回链', async () => {
    await page.goto(`${BASE}/canteen/${MQ_ID}`, { waitUntil: 'networkidle', timeout: 30000 });
    const link = page.locator('.map-link');
    assert(await link.count() === 1, '缺 map-link');
    await link.click();
    await page.waitForURL(/\/map\?focus=/, { timeout: 8000 });
    await page.waitForSelector('.pin-card', { timeout: 8000 });
});

console.log('[分组] 首页就餐场景与搜索承接');
await case_e2e('E2E-C1', '首页就餐场景四格渲染（校内食堂/学生街/周边/外卖）', async () => {
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForSelector('.scene-item', { timeout: 8000 });
    const n = await page.locator('.scene-item').count();
    assert(n >= 4, `场景格数=${n}`);
    const texts = await page.locator('.scene-item .t').allTextContents();
    assert(texts.some((t) => t.includes('食堂')), `场景文案=${texts.join('/')}`);
    const imgs = await page.locator('.scene-item .simg img').count();
    assert(imgs >= n, `场景配图数=${imgs} < 场景数`);
    await page.screenshot({ path: `${OUT}\\e2e-c1-home.png` });
});

await case_e2e('E2E-C2', '点击「学生街」场景 → /list?type=2 列表有卡片', async () => {
    await page.locator('.scene-item', { hasText: '学生街' }).click();
    await page.waitForURL(/\/list\?type=2/, { timeout: 8000 });
    await page.waitForSelector('.shopcard', { timeout: 8000 });
    const total = await page.locator('.shopcard').count();
    assert(total > 0, '列表为空');
    await page.screenshot({ path: `${OUT}\\e2e-c2-list.png` });
});

await case_e2e('E2E-C3', '顶部搜索框 → /search 且初始无品类筛选', async () => {
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle', timeout: 30000 });
    // 桌面端首页内联搜索条已隐藏（功能收敛到顶栏），统一点顶栏搜索框
    await page.locator('.search-box').click();
    await page.waitForURL(/\/search/, { timeout: 8000 });
    assert(!page.url().includes('category='), `URL 意外带品类: ${page.url()}`);
    await page.waitForSelector('.wordrow', { timeout: 8000 });
});

await case_e2e('E2E-C4', '顶栏「导览图」入口跳转 /map', async () => {
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.locator('.nav-links a', { hasText: '导览图' }).click();
    await page.waitForURL(/\/map$/, { timeout: 8000 });
    await page.waitForSelector('.pin', { timeout: 8000 });
});

console.log('[分组] 三视口响应式回归（375 / 768 / 1280）');
for (const [name, w, h] of [['m375', 375, 812], ['t768', 768, 1024], ['d1280', 1280, 800]]) {
    await case_e2e(`E2E-V-${name}`, `${w}x${h} 首页/地图/搜索无横向溢出且无 JS 报错`, async () => {
        const c2 = await browser.newContext({ viewport: { width: w, height: h } });
        const p2 = await c2.newPage();
        const errs = [];
        p2.on('pageerror', (e) => errs.push(String(e).slice(0, 120)));
        try {
            for (const path of ['/', '/map', `/search?category=${encodeURIComponent('闽菜')}`]) {
                await p2.goto(`${BASE}${path}`, { waitUntil: 'networkidle', timeout: 30000 });
                await p2.waitForTimeout(600);
                const m = await p2.evaluate(() => ({
                    sw: document.documentElement.scrollWidth,
                    cw: document.documentElement.clientWidth,
                }));
                assert(m.sw <= m.cw + 1, `${path} 横向溢出 sw=${m.sw} cw=${m.cw}`);
            }
            await p2.goto(`${BASE}/map`, { waitUntil: 'networkidle' });
            await p2.waitForTimeout(500);
            await p2.screenshot({ path: `${OUT}\\vp-${name}-map.png` });
            assert(errs.length === 0, `JS 报错: ${JSON.stringify(errs)}`);
        } finally {
            await c2.close();
        }
    });
}

await browser.close();

// 汇总
console.log('---');
console.log(`结果: ${pass} passed, ${fail} failed, 共 ${pass + fail} 例`);
console.log(`截图目录: ${OUT}`);
if (consoleErrors.length) console.log(`(主页面 pageerror: ${consoleErrors.length})`);
fs.writeFileSync(`${OUT}\\result.json`, JSON.stringify(results, null, 2));
if (fail > 0) process.exit(1);
