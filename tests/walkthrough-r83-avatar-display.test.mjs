/**
 * r83 头像显示走查：自定义头像在全局各渲染位置的显示正确性
 *
 * 背景：avatar_object_key 存的是 MinIO objectKey 裸串（如 cover/202610/xxx.jpg），
 *      直接当 <img src> 用会被浏览器当相对路径解析到 SPA 路由上 → 裂图。
 *      本脚本覆盖历史缺陷位置：点评圈、点评卡（菜品/档口/食堂详情页）、宠物页、
 *      宠物社区、点评详情页，并核验后端 review 接口是否透传 avatar_object_key。
 *
 * 运行：node tests/walkthrough-r83-avatar-display.test.mjs
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
 * 构造一张随机像素 PNG（用于头像上传，绕过文件选择）
 * 注意：后端按 dHash 判重，同一张图 7 天内重复上传会被判搬运；
 *      随机像素保证每次运行 dHash 完全不同，脚本可重复执行。
 * @returns {Buffer} 16×16 truecolor PNG
 */
function png_random() {
    const zlib = require('zlib');
    const W = 16;
    const H = 16;
    const crc_table = [];
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        crc_table[n] = c >>> 0;
    }
    /**
     * CRC32 计算
     * @param {Buffer} buf - 字节
     * @returns {number}
     */
    const crc32 = (buf) => {
        let c = 0xffffffff;
        for (const b of buf) c = crc_table[(c ^ b) & 0xff] ^ (c >>> 8);
        return (c ^ 0xffffffff) >>> 0;
    };
    /**
     * 组装 PNG chunk（长度 + 类型 + 数据 + CRC）
     * @param {string} type - 四字符类型
     * @param {Buffer} data - 数据
     * @returns {Buffer}
     */
    const chunk = (type, data) => {
        const len = Buffer.alloc(4);
        len.writeUInt32BE(data.length);
        const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
        const crc = Buffer.alloc(4);
        crc.writeUInt32BE(crc32(td));
        return Buffer.concat([len, td, crc]);
    };
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(W, 0);
    ihdr.writeUInt32BE(H, 4);
    ihdr[8] = 8;   // bit depth
    ihdr[9] = 2;   // color type: truecolor
    // 每行：1 字节 filter(0) + W*3 字节 RGB
    const row = 1 + W * 3;
    const raw = Buffer.alloc(row * H);
    for (let y = 0; y < H; y++) {
        const off = y * row;
        raw[off] = 0;
        require('crypto').randomFillSync(raw, off + 1, W * 3);
    }
    return Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        chunk('IHDR', ihdr),
        chunk('IDAT', zlib.deflateSync(raw)),
        chunk('IEND', Buffer.alloc(0)),
    ]);
}

const USER = `r83av_${String(Date.now()).slice(-8)}`;
const PWD = 'r83av123456';
flush_rl('register');
flush_rl('login');
flush_rl('upload');

let browser = null;

/* ---------------- 准备：注册 + 登录临时账号 ---------------- */
await fetch(`${BASE}/api/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: USER, password: PWD, nickname: 'r83头像走查', ...(await captcha_body()) }),
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
const AUTH = { authorization: `Bearer ${TOKEN}` };

/* ---------------- 上传自定义头像 → 保存资料 ---------------- */
const fd = new FormData();
fd.append('file', new Blob([png_random()], { type: 'image/png' }), 'avatar.png');
fd.append('scene', 'cover');
const up = await (await fetch(`${BASE}/api/uploads`, { method: 'POST', headers: AUTH, body: fd })).json();
if (!up.data || !up.data.objectKey) {
    console.error('头像上传失败', JSON.stringify(up).slice(0, 300));
    process.exit(1);
}
const OBJ_KEY = up.data.objectKey;
console.log(`准备：临时账号 ${USER}（id=${UID}）上传头像 objectKey=${OBJ_KEY}`);

const sv = await (await fetch(`${BASE}/api/me/profile`, {
    method: 'PUT',
    headers: { ...AUTH, 'content-type': 'application/json' },
    body: JSON.stringify({ nickname: 'r83头像走查', avatar: 0, avatarObjectKey: OBJ_KEY }),
})).json();
assert(sv.code === 0 && sv.data?.avatar_object_key === OBJ_KEY, '保存资料写入自定义头像', JSON.stringify(sv).slice(0, 160));

/* ---------------- 断言 1：/img/ 路径可访问且为真实图片 ---------------- */
const img_res = await fetch(`${BASE}/img/${OBJ_KEY}`);
const ct = img_res.headers.get('content-type') || '';
assert(img_res.status === 200 && ct.startsWith('image/'), '自定义头像经 /img/ 可访问且为图片类型', `status=${img_res.status} ct=${ct}`);

/* ---------------- 断言 2：裸 key 直连会落到 SPA（说明前端必须补前缀） ---------------- */
const bare = await fetch(`${BASE}/${OBJ_KEY}`);
const bare_ct = bare.headers.get('content-type') || '';
assert(!bare_ct.startsWith('image/'), '裸 objectKey 直连非图片（历史裂图根因）', `ct=${bare_ct}`);

/* ---------------- 断言 3：/auth/me 透传 avatar_object_key ---------------- */
const me = await (await fetch(`${BASE}/api/auth/me`, { headers: AUTH })).json();
assert(me.data?.avatar_object_key === OBJ_KEY, '/auth/me 返回 avatar_object_key');

/* ---------------- 断言 4：点评列表接口透传 avatar_object_key ---------------- */
const rv = await (await fetch(`${BASE}/api/reviews?page=1&size=5`)).json();
const rows = Array.isArray(rv.data) ? rv.data : (rv.data?.list || []);
assert(Array.isArray(rows), '点评列表接口可访问', `rows=${rows.length}`);

/* ---------------- 断言 5：发一条点评，验证各渲染位置 ---------------- */
// 选一个真实在售菜品作为点评对象
const dishes = await (await fetch(`${BASE}/api/dishes?page=1&size=1`)).json();
const dish_list = Array.isArray(dishes.data) ? dishes.data : (dishes.data?.list || []);
const DISH_ID = dish_list[0]?.id;
const mk = await (await fetch(`${BASE}/api/reviews`, {
    method: 'POST',
    headers: { ...AUTH, 'content-type': 'application/json' },
    body: JSON.stringify({
        subjectType: 0, subjectId: DISH_ID, overallScore: 4.5,
        dimensionScores: { taste: 5, price: 4, package: 4, portion: 4, delivery: 4 },
        content: 'r83头像走查评测', tags: ['好吃'],
    }),
})).json();
const REVIEW_ID = mk.data?.reviewId || mk.data?.id;
assert(mk.code === 0 && !!REVIEW_ID, '发布带自定义头像作者的点评', JSON.stringify(mk).slice(0, 160));

const rl2 = await (await fetch(`${BASE}/api/reviews?page=1&size=20`)).json();
const rows2 = Array.isArray(rl2.data) ? rl2.data : (rl2.data?.list || []);
const mine_row = rows2.find((r) => Number(r.id) === Number(REVIEW_ID));
assert(mine_row?.avatar_object_key === OBJ_KEY, '点评列表行透传 avatar_object_key', `got=${mine_row?.avatar_object_key}`);

/* ---------------- 断言 6：浏览器渲染 —— 各位置头像图片实际加载成功 ---------------- */
browser = await chromium.launch({ executablePath: EXE, headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await ctx.addInitScript(
    ([tk, u]) => {
        localStorage.setItem('fk_token', tk);
        localStorage.setItem('fk_user', JSON.stringify(u));
    },
    [TOKEN, lr.data.user]
);
const page = await ctx.newPage();

/**
 * 采集页面内所有头像图片的加载状态
 * @returns {Promise<{broken: number, ok: number, srcs: string[]}>}
 */
async function avatar_images_state() {
    return page.evaluate(() => {
        const imgs = [...document.querySelectorAll('img')].filter((i) => {
            const src = i.getAttribute('src') || '';
            return src.includes('/img/') || src.includes('avatar-user');
        });
        const broken = imgs.filter((i) => i.complete && i.naturalWidth === 0);
        return {
            broken: broken.length,
            ok: imgs.length - broken.length,
            srcs: imgs.map((i) => i.getAttribute('src')).slice(0, 8),
        };
    });
}

/* 6.1 菜品详情页（点评卡头像） */
await page.goto(`${BASE}/dish/${DISH_ID}`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
let st = await avatar_images_state();
assert(st.broken === 0, '菜品详情页点评卡头像无裂图', `ok=${st.ok} broken=${st.broken} srcs=${JSON.stringify(st.srcs)}`);

/* 6.2 点评圈（点评流头像） */
await page.goto(`${BASE}/circle`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
st = await avatar_images_state();
assert(st.broken === 0, '点评圈头像无裂图', `ok=${st.ok} broken=${st.broken} srcs=${JSON.stringify(st.srcs)}`);
const circle_src = await page.evaluate(() => {
    const el = [...document.querySelectorAll('img.avatar-fix.av')].map((i) => i.getAttribute('src'));
    return el.find((s) => s && s.includes('/img/')) || '';
});
assert(circle_src.startsWith('/img/'), '点评圈头像使用 /img/ 绝对路径', `src=${circle_src}`);

/* 6.3 点评详情页（作者头像 + 评论者头像） */
await page.goto(`${BASE}/post/${REVIEW_ID}`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
st = await avatar_images_state();
assert(st.broken === 0, '点评详情页头像无裂图', `ok=${st.ok} broken=${st.broken} srcs=${JSON.stringify(st.srcs)}`);

/* 6.4 宠物社区（投喂榜 + 宠物广场主人头像） */
await page.goto(`${BASE}/pet-community`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
st = await avatar_images_state();
assert(st.broken === 0, '宠物社区头像无裂图', `ok=${st.ok} broken=${st.broken} srcs=${JSON.stringify(st.srcs)}`);

/* 6.5 我的福宝页（我的头像） */
await page.goto(`${BASE}/pet`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
st = await avatar_images_state();
assert(st.broken === 0, '我的福宝页头像无裂图', `ok=${st.ok} broken=${st.broken} srcs=${JSON.stringify(st.srcs)}`);

/* 6.6 顶栏 / 我的页（UserAvatar 组件路径） */
await page.goto(`${BASE}/me`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
const bar_src = await page.evaluate(() => {
    const el = document.querySelector('.uav-img');
    return el ? el.getAttribute('src') : '';
});
assert(bar_src.startsWith('/img/'), '顶栏头像使用 /img/ 绝对路径', `src=${bar_src}`);

/* ---------------- 收尾：清理临时账号及其派生数据（幂等） ---------------- */
if (browser) await browser.close();
cleanup_fixtures({ prefixes: [], usernames: [USER] });

// 回收本次上传的头像对象：账号删除后 DB 不再引用该 objectKey，
// 若不从 MinIO 删除就会残留孤儿对象（每跑一次留一个），最终污染存储桶
try {
    execSync(
        `docker exec dafu-backend node -e "const {minioClient}=require('/app/src/db/minio');const c=require('/app/src/config');minioClient.removeObject(c.minio.bucket,'${OBJ_KEY}').then(()=>console.log('DEL OK')).catch(()=>{})"`,
        { stdio: 'pipe' }
    );
    console.log('收尾：已回收本次上传的头像对象 ' + OBJ_KEY);
} catch {
    console.log('收尾：头像对象回收失败（可忽略，MinIO 不可用）');
}

console.log(`\n结果：${passed} 通过 / ${failed} 失败`);
process.exit(failed > 0 ? 1 : 0);
