/**
 * 个人贴图库服务（r52 手账贴纸 / r53 菜品公共贴纸）
 *  - 自动抠图：调用 matting 服务（rembg U2Net）把商家菜品图 / 用户上传图抠除背景成透明贴纸
 *  - 存储与权限：贴纸 PNG 入 MinIO（sticker/{yyyymm}/{uuid}.png），表 sticker 按 user_id 归属
 *  - 内置公共贴纸：source=2 虚拟条目（负数 id，前端直接用静态资源），人人可用不可删
 *  - 菜品公共贴纸：source=3 系统条目（user_id=0），后端启动时对全量有图菜品幂等补抠，人人可用不可删
 */
const crypto = require('crypto');
const config = require('../config');
const { query, query_one } = require('../db/pool');
const { minioClient } = require('../db/minio');
const { err } = require('../utils/api-error');

/** 内置公共贴纸（food-stickers 静态资源，负数 id 与库内自增 id 隔离）
 *  注：food-01（UI 碎片混入）、food-09（与主体同色相连的残缺晕涂，算法不可分）为坏素材，已剔除 */
const BUILTIN = Array.from({ length: 7 }, (_, i) => ({
    id: -1 - i,
    name: `内置贴纸 ${i + 1}`,
    object_key: `__builtin__/food-0${i + 2}.png`,
    source: 2,
}));

/** 静态贴纸资源版本号：工艺变更时递增，强制浏览器拉新（URL 固定时强缓存会显示旧图） */
const STICKER_ASSET_VER = 'r73';

/**
 * 贴纸对象键 → 可访问 URL
 *  - preset: 伪键 → /assets/food-stickers/preset-<品类>.png（预抠透明贴纸，随前端静态资源分发）
 *  - 内置贴纸 → /assets/food-stickers/food-0N.png（同上）
 *  - 真实键 → /img/<objectKey>（MinIO 图片代理）
 * @param {string} objectKey 贴纸对象键
 * @returns {string}
 */
function sticker_url(objectKey) {
    const key = String(objectKey);
    if (key.startsWith('preset:')) return `/assets/food-stickers/preset-${key.slice(7)}.png?v=${STICKER_ASSET_VER}`;
    // 内置贴纸：随前端静态资源分发（MinIO 中无对应对象，历史版本曾误走 /img 导致旧图残留）
    if (key.startsWith('__builtin__/')) return `/assets/food-stickers/${key.split('/').pop()}?v=${STICKER_ASSET_VER}`;
    return `/img/${key}`;
}

/**
 * 调用抠图微服务：原图字节 → 透明底贴纸 PNG 字节
 * @param {Buffer} buf 原图（jpeg/png/webp）
 * @returns {Promise<Buffer>}
 */
async function matting_extract(buf) {
    const fd = new FormData();
    fd.append('file', new Blob([buf], { type: 'application/octet-stream' }), 'img.png');
    const res = await fetch(`${config.matting.url}/extract`, {
        method: 'POST',
        body: fd,
        signal: AbortSignal.timeout(config.matting.timeout_ms),
    });
    if (res.status === 422) {
        // 抠图服务判定无有效主体（结果占原图比例过小）→ 交由上层按「换图」提示
        const e = new Error('matting: no valid subject');
        e.matting_no_subject = true;
        throw e;
    }
    if (!res.ok) throw new Error(`matting HTTP ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
}

/**
 * 菜品公共贴纸的对象键：由源图片键确定性派生（内容寻址）
 * 同一张菜品图无论同步多少次都落到同一个键 → 重复同步只覆盖对象，不新增记录、不留孤儿对象
 * @param {string} srcKey 源图片 objectKey
 * @returns {string}
 */
function dish_sticker_key(srcKey) {
    const h = crypto.createHash('sha256').update(String(srcKey)).digest('hex').slice(0, 16);
    return `sticker/dish/${h}.png`;
}

/**
 * 抠图并入库：原图 → matting → MinIO → sticker 表
 * @param {Buffer} buf 原图字节
 * @param {number} userId 归属用户
 * @param {string} name 贴纸名
 * @param {number} source 0 上传抠图 / 1 收藏自动抠图 / 3 菜品公共贴纸
 * @param {string} [fixedKey] 指定对象键（菜品公共贴纸用确定性键，保证同步幂等）
 * @returns {Promise<{id: number, object_key: string, url: string}>}
 */
async function extract_and_save(buf, userId, name, source = 0, fixedKey = '') {
    let png;
    try {
        png = await matting_extract(buf);
    } catch (e) {
        if (e.matting_no_subject) throw err.invalid('没能识别出足够的菜品主体，请换一张主体更大更清晰的图');
        throw err.unavailable('抠图服务暂不可用，请稍后再试');
    }
    // 空结果兜底：全透明图（未识别出主体）拒绝入库
    if (png.length < 2000) throw err.invalid('没有识别出可抠的主体，请换一张清晰的菜品图');
    const yyyymm = new Date().toISOString().slice(0, 7).replace('-', '');
    const objectKey = fixedKey || `sticker/${yyyymm}/${crypto.randomUUID()}.png`;
    await minioClient.putObject(config.minio.bucket, objectKey, png, png.length, { 'Content-Type': 'image/png' });
    const r = await query(
        'INSERT INTO sticker (user_id, name, object_key, source) VALUES (?, ?, ?, ?)',
        [userId, String(name || '我的贴纸').slice(0, 64), objectKey, source]
    );
    return { id: r.insertId, object_key: objectKey, url: `/img/${objectKey}` };
}

/**
 * 从 MinIO 已有图片（菜品主图）抠图入库——收藏联动自动收录
 * @param {string} srcKey 菜品图 objectKey
 * @param {number} userId 归属用户
 * @param {string} name 贴纸名（默认菜名）
 * @returns {Promise<{id: number}|null} 已有同源贴纸或失败返回 null（fire-and-forget 不抛错）
 */
async function extract_from_object_key(srcKey, userId, name) {
    try {
        // 同源去重：同名 + source=1 已存在则跳过
        const dup = await query_one(
            'SELECT id FROM sticker WHERE user_id = ? AND name = ? AND source = 1 LIMIT 1',
            [userId, String(name || '').slice(0, 64)]
        );
        if (dup) return { id: dup.id };
        const chunks = [];
        const stream = await minioClient.getObject(config.minio.bucket, srcKey);
        for await (const chunk of stream) chunks.push(chunk);
        return await extract_and_save(Buffer.concat(chunks), userId, name, 1);
    } catch (e) {
        // 收藏是主流程，抠图失败静默（不影响收藏成功）
        console.error('[sticker] auto-extract failed:', e.message);
        return null;
    }
}

/**
 * 我的贴图库：个人贴纸（正 id）+ 菜品公共贴纸（source=3，正 id）+ 内置公共贴纸（负 id）
 * 排序：个人在前、菜品公共居中、内置兜底
 * @param {number} userId
 * @returns {Promise<Array<{id, name, object_key, url, source}>>}
 */
async function list_user(userId) {
    const rows = await query(
        'SELECT id, name, object_key, source, created_at FROM sticker WHERE user_id = ? OR source = 3 ORDER BY id DESC LIMIT 200',
        [userId]
    );
    rows.sort((a, b) => (a.source === 3 ? 1 : 0) - (b.source === 3 ? 1 : 0));
    // preset: 伪键 → 前端静态插画（与 format.js cover_url 同口径）；真实 MinIO 键 → /img/
    return rows.map((r) => ({ ...r, url: sticker_url(r.object_key) })).concat(
        BUILTIN.map((b) => ({ ...b, url: sticker_url(b.object_key) }))
    );
}

/**
 * 删除个人贴纸（内置贴纸不可删）
 * @param {number} userId
 * @param {number} id
 */
async function delete_item(userId, id) {
    const row = await query_one('SELECT id, object_key FROM sticker WHERE id = ? AND user_id = ?', [id, userId]);
    if (!row) throw err.not_found('贴纸不存在');
    await minioClient.removeObject(config.minio.bucket, row.object_key).catch(() => {});
    await query('DELETE FROM sticker WHERE id = ? AND user_id = ?', [id, userId]);
}

/**
 * 贴纸归属校验（手账 layout 中引用时确认本人可用；内置恒可用）
 * @param {number} userId
 * @param {number} id
 * @returns {Promise<boolean>}
 */
async function own_sticker(userId, id) {
    if (Number(id) < 0) return true; // 内置贴纸
    return !!(await query_one('SELECT id FROM sticker WHERE id = ? AND (user_id = ? OR source = 3)', [id, userId]));
}

/**
 * 全量菜品贴纸同步：所有有图菜品 → 系统公共贴纸（source=3，user_id=0，人人可用不可删）
 *  - preset: 伪键（种子预设插画）：不入 MinIO 不抠图，直接入库指向 /preset-cover/ 静态插画
 *  - 真实图片键（管理端上传 / 真实菜品图）：MinIO 拉图 → matting 抠图 → 透明 PNG 入库
 * 幂等：真实图按源图键派生确定性对象键（sticker/dish/{hash}.png），
 *      已有同键记录则跳过抠图——避免每次后端重启都对全量菜品重新抠图
 * @returns {Promise<{total: number, made: number, skip: number, fail: number}>}
 */
async function sync_dish_stickers() {
    const dishes = await query(
        "SELECT id, name, cover_object_key AS img FROM dish WHERE cover_object_key IS NOT NULL AND cover_object_key <> ''"
    );
    let made = 0, skip = 0, fail = 0;
    for (const d of dishes) {
        try {
            if (String(d.img).startsWith('preset:')) {
                // 预设插画菜品：贴纸已预抠为前端静态资源（preset-<品类>.png），虚拟入库即可
                const dup = await query_one('SELECT id FROM sticker WHERE source = 3 AND object_key = ? LIMIT 1', [d.img]);
                if (dup) { skip += 1; continue; }
                await query('INSERT INTO sticker (user_id, name, object_key, source) VALUES (0, ?, ?, 3)', [String(d.name || '菜品贴纸').slice(0, 64), d.img]);
            } else {
                // 真实菜品图：对象键由源图键确定性派生 → 同源只抠一次，重启不再重复
                const key = dish_sticker_key(d.img);
                const dup = await query_one('SELECT id FROM sticker WHERE source = 3 AND object_key = ? LIMIT 1', [key]);
                if (dup) { skip += 1; continue; }
                const chunks = [];
                const stream = await minioClient.getObject(config.minio.bucket, d.img);
                for await (const chunk of stream) chunks.push(chunk);
                await extract_and_save(Buffer.concat(chunks), 0, d.name, 3, key);
            }
            made += 1;
        } catch (e) {
            fail += 1;
            console.error(`[sticker] dish sync failed (#${d.id} ${d.name}):`, e.message);
        }
    }
    return { total: dishes.length, made, skip, fail };
}

module.exports = { extract_and_save, extract_from_object_key, list_user, delete_item, own_sticker, sync_dish_stickers, dish_sticker_key, BUILTIN };
