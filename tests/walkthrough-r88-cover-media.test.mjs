/**
 * r88 封面对象自愈走查：线上图片全 404 的根因与修复验证
 *
 * 背景（用户反馈）：「https://dafu-moment.zviolin.online/ 这里的图怎么都没有显示出来的，
 *      其怎么还有一些菜品是使用的默认的，其是因为没有对应的图的，对吗？」
 * 根因：种子数据只把 cover_object_key 写进数据库，图片对象本身不在镜像里；
 *      线上 MinIO 是空桶 → /img/<key> 全部 404 NoSuchKey → 页面裂图/占位。
 * 修复：封面图随后端镜像内置（backend/assets/covers），启动时按对象键自愈上传缺的对象。
 *
 * 本脚本覆盖：
 *   A. 数据口径：菜品 158 道全为真实图键；点位仅 18 个无实拍图，按设计使用预设占位
 *   B. 打包完整性：镜像内置封面目录覆盖数据库引用的全部对象键
 *   C. 运行期：MinIO 中这些对象全部存在，/img/ 逐键 200
 *   D. 幂等：镜像内再跑一次自愈只比对不上传（上传 0 / 已存在 147）
 *   E. 浏览器：首页与菜品详情页无裂图
 *
 * 运行：node tests/walkthrough-r88-cover-media.test.mjs
 * 前置：docker 全容器 + http://localhost:8095
 */
import { createRequire } from 'module';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright-core');

const BASE = 'http://localhost:8095';
const EXE = 'C:\\Users\\Zviolin\\AppData\\Local\\ms-playwright\\chromium-1208\\chrome-win64\\chrome.exe';
const COVER_DIR = path.resolve('backend/assets/covers');
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
 * 取接口 JSON
 * @param {string} url - 相对地址
 * @returns {Promise<any>}
 */
async function api(url) {
    const r = await fetch(`${BASE}${url}`);
    return r.json();
}

/**
 * 分页拉取全部菜品
 * @returns {Promise<Array>}
 */
async function all_dishes() {
    const out = [];
    for (let p = 1; p <= 30; p++) {
        const j = await api(`/api/dishes?page=${p}&pageSize=20`);
        const list = j.data?.list || [];
        if (!list.length) break;
        out.push(...list);
    }
    return out;
}

/* ---------------- A. 数据口径 ---------------- */
const dishes = await all_dishes();
const dish_real = dishes.filter((d) => String(d.cover_object_key || '').startsWith('cover/'));
assert(dishes.length === 158, '菜品总数 158 道', `count=${dishes.length}`);
assert(dish_real.length === dishes.length, '每道菜都有真实图键（默认图不是菜品缺图造成的）', `real=${dish_real.length}/${dishes.length}`);

const canteens = (await api('/api/canteens')).data || [];
const canteen_preset = canteens.filter((c) => String(c.cover_object_key || '').startsWith('preset:'));
assert(canteens.length === 60, '点位总数 60 个', `count=${canteens.length}`);
assert(canteen_preset.length === 18, '仅 18 个点位无实拍图（12 食堂 + 3 麦当劳 + 3 门店），按设计用预设占位', `preset=${canteen_preset.length}`);

/* ---------------- B. 打包完整性：镜像内置封面覆盖数据库引用键 ---------------- */
const sql_keys = execSync(
    'docker exec dafu-mysql mysql -uroot -pdafu_root_2026 dafu -N -B -e ' +
    '"SELECT cover_object_key FROM dish WHERE cover_object_key LIKE \'cover/%\' ' +
    'UNION SELECT cover_object_key FROM station WHERE cover_object_key LIKE \'cover/%\' ' +
    'UNION SELECT cover_object_key FROM canteen WHERE cover_object_key LIKE \'cover/%\'"',
    { encoding: 'utf8' }
).split('\n').map((s) => s.trim()).filter(Boolean);
const ref_keys = [...new Set(sql_keys)];
const bundled = fs.existsSync(COVER_DIR)
    ? fs.readdirSync(COVER_DIR, { recursive: true }).filter((f) => String(f).endsWith('.jpg') || String(f).endsWith('.png') || String(f).endsWith('.webp'))
        .map((f) => String(f).split(path.sep).join('/'))
        .map((f) => (f.startsWith('cover/') ? f : 'cover/' + f))
    : [];
assert(bundled.length > 0, '后端镜像内置封面目录存在', `dir=${COVER_DIR} files=${bundled.length}`);
const missing_in_bundle = ref_keys.filter((k) => !bundled.includes(k));
assert(ref_keys.length === 147, '数据库引用唯一封面键 147 个', `refs=${ref_keys.length}`);
assert(missing_in_bundle.length === 0, '内置封面覆盖全部引用键（部署后自愈可补齐）', `missing=${JSON.stringify(missing_in_bundle.slice(0, 5))}`);

/* ---------------- C. 运行期：MinIO 对象齐全 + /img 逐键 200 ---------------- */
const probe = execSync(
    'docker exec dafu-backend node -e "' +
    'const m=require(\'minio\');const c=new m.Client({endPoint:\'minio\',port:9000,useSSL:false,' +
    'accessKey:process.env.MINIO_USER,secretKey:process.env.MINIO_PASSWORD});' +
    '(async()=>{const keys=process.argv.slice(1);let miss=[];' +
    'for(const k of keys){const s=await c.statObject(\'dafu-images\',k).catch(()=>null);if(!s)miss.push(k);}' +
    'console.log(JSON.stringify({total:keys.length,missing:miss}));})();" ' + ref_keys.join(' '),
    { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }
).trim();
const probe_result = JSON.parse(probe.slice(probe.indexOf('{')));
assert(probe_result.missing.length === 0, 'MinIO 中 147 个封面对象全部存在', `missing=${probe_result.missing.length}`);

const bad = [];
for (const k of ref_keys) {
    const r = await fetch(`${BASE}/img/${k}`, { method: 'HEAD' });
    const ct = r.headers.get('content-type') || '';
    if (r.status !== 200 || !ct.startsWith('image/')) bad.push(`${k}:${r.status}:${ct}`);
}
assert(bad.length === 0, '/img/ 逐键可访问且为图片类型（147/147）', `bad=${JSON.stringify(bad.slice(0, 3))}`);

/* ---------------- D. 幂等：镜像内重复执行自愈不再上传 ---------------- */
const idem = execSync(
    'docker exec dafu-backend node -e "require(\'/app/src/seed/seed-media\').ensure_seed_media().then(()=>process.exit(0))"',
    { encoding: 'utf8' }
);
assert(/已存在 147/.test(idem) && /上传 0/.test(idem) && /失败 0/.test(idem), '自愈幂等：已存在 147 / 上传 0 / 失败 0', idem.trim());

/* ---------------- E. 浏览器：首页与菜品详情无裂图 ---------------- */
const browser = await chromium.launch({ executablePath: EXE, headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

/**
 * 统计页面封面图裂图数量
 * @returns {Promise<{ok: number, broken: number, srcs: string[]}>}
 */
async function cover_state() {
    return page.evaluate(() => {
        const imgs = [...document.querySelectorAll('img')].filter((i) => (i.getAttribute('src') || '').includes('/img/'));
        const broken = imgs.filter((i) => i.complete && i.naturalWidth === 0);
        return { ok: imgs.length - broken.length, broken: broken.length, srcs: imgs.map((i) => i.getAttribute('src')).slice(0, 3) };
    });
}

await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
const home = await cover_state();
assert(home.ok > 0 && home.broken === 0, '首页封面图无裂图', JSON.stringify(home));

await page.goto(`${BASE}/dish/1`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
const detail = await cover_state();
assert(detail.ok > 0 && detail.broken === 0, '菜品详情页封面图无裂图', JSON.stringify(detail));

await browser.close();

console.log(`\n结果：${passed} 通过 / ${failed} 失败`);
process.exit(failed > 0 ? 1 : 0);
