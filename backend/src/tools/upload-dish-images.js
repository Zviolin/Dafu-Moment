/**
 * 菜品实拍图导入工具（r84）：把 CodeHub 仓库的 150 张真实菜品图灌入 MinIO，并回写三类封面
 *
 * 用途：
 *   1. 按 backend/src/seed/dish-image-map.json 的确定性 objectKey 上传图片到 MinIO（幂等，可重复执行）
 *   2. 备份 dish / station / canteen 三表原 cover_object_key 到 JSON
 *   3. 回写 dish（按档口名+菜名）、station（按档口名）、canteen（按点位名）的真实封面
 *
 * 运行方式（须在能访问 MySQL 与 MinIO 的环境内，后端容器内即可）：
 *   node src/tools/upload-dish-images.js --dir=/tmp/dish-images --backup=/tmp/cover-backup.json
 * 参数：
 *   --dir=<目录>    图片所在目录（含 菜名图片对应.json 旁边的图片文件）
 *   --backup=<文件> 备份输出路径（JSON）
 *   --dry-run       只上传不写库
 */
const fs = require('fs');
const path = require('path');
const config = require('../config');
const { query } = require('../db/pool');
const { minioClient } = require('../db/minio');

/** 扩展名 → Content-Type */
const MIME = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    gif: 'image/gif',
};

/**
 * 解析命令行参数
 * @returns {Object}
 */
function parse_args() {
    const out = { dir: '', backup: '', dry_run: false };
    for (const a of process.argv.slice(2)) {
        if (a.startsWith('--dir=')) out.dir = a.slice(6);
        else if (a.startsWith('--backup=')) out.backup = a.slice(9);
        else if (a === '--dry-run') out.dry_run = true;
    }
    return out;
}

/**
 * 主流程
 * @returns {Promise<void>}
 */
async function main() {
    const args = parse_args();
    if (!args.dir) throw new Error('缺少 --dir=<图片目录>');
    const map = JSON.parse(fs.readFileSync(path.join(__dirname, '../seed/dish-image-map.json'), 'utf8'));

    /* 1. 上传图片（按唯一 objectKey 去重，内容哈希键天然幂等） */
    const uniq = new Map();
    for (const d of map.dishes) if (!uniq.has(d.object_key)) uniq.set(d.object_key, d.file);
    let uploaded = 0, skipped = 0, failed = 0;
    for (const [object_key, file] of uniq) {
        const abs = path.join(args.dir, file);
        const buf = fs.readFileSync(abs);
        const ext = object_key.slice(object_key.lastIndexOf('.') + 1).toLowerCase();
        try {
            const exists = await minioClient.statObject(config.minio.bucket, object_key).catch(() => null);
            if (exists && Number(exists.size) === buf.length) { skipped += 1; continue; }
            await minioClient.putObject(config.minio.bucket, object_key, buf, buf.length, {
                'Content-Type': MIME[ext] || 'application/octet-stream',
            });
            uploaded += 1;
        } catch (e) {
            failed += 1;
            console.error(`[upload] 失败 ${file} -> ${object_key}:`, e.message);
        }
    }
    console.log(`[upload] 对象 ${uniq.size} 个：上传 ${uploaded}，跳过 ${skipped}，失败 ${failed}`);

    /* 2. 备份三类封面原值 */
    const [dishes, stations, canteens] = await Promise.all([
        query('SELECT id, name, cover_object_key FROM dish'),
        query('SELECT id, name, cover_object_key FROM station'),
        query('SELECT id, name, cover_object_key FROM canteen'),
    ]);
    if (args.backup) {
        fs.writeFileSync(args.backup, JSON.stringify({
            generated_at: new Date().toISOString(),
            dish: dishes,
            station: stations,
            canteen: canteens,
        }, null, 1), 'utf8');
        console.log(`[backup] 已备份 dish=${dishes.length} station=${stations.length} canteen=${canteens.length} -> ${args.backup}`);
    }
    if (args.dry_run) {
        console.log('[dry-run] 未写库');
        return;
    }

    /* 3. 回写 dish 封面（档口名 + 菜名 双条件，避免重名串图） */
    let dish_hit = 0;
    for (const d of map.dishes) {
        const r = await query(
            `UPDATE dish d JOIN station s ON s.id = d.station_id
             SET d.cover_object_key = ?
             WHERE s.name = ? AND d.name = ?`,
            [d.object_key, d.station, d.dish]
        );
        dish_hit += r.affectedRows;
    }
    console.log(`[db] dish 封面更新 ${dish_hit} / ${map.dishes.length}`);

    /* 4. 回写 station 封面（按档口名） */
    let st_hit = 0;
    for (const [name, object_key] of Object.entries(map.stations)) {
        const r = await query('UPDATE station SET cover_object_key = ? WHERE name = ?', [object_key, name]);
        st_hit += r.affectedRows;
    }
    console.log(`[db] station 封面更新 ${st_hit} / ${Object.keys(map.stations).length}`);

    /* 5. 回写 canteen 封面（按点位名） */
    let ct_hit = 0;
    for (const [name, object_key] of Object.entries(map.canteens)) {
        const r = await query('UPDATE canteen SET cover_object_key = ? WHERE name = ?', [object_key, name]);
        ct_hit += r.affectedRows;
    }
    console.log(`[db] canteen 封面更新 ${ct_hit} / ${Object.keys(map.canteens).length}`);
}

main().then(() => process.exit(0)).catch((e) => {
    console.error('[upload] 执行失败:', e);
    process.exit(1);
});
