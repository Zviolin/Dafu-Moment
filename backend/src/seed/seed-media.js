/**
 * 封面对象自愈（r88）：把随镜像内置的种子封面图补齐到 MinIO
 *
 * 背景：种子数据只把 cover_object_key 写进数据库，图片对象本身不在镜像里。
 * 全新服务器首次部署时 MinIO 是空桶，前端请求 /img/<objectKey> 全部返回
 * 404 NoSuchKey（本次线上 dafu-moment.zviolin.online 即为此问题），页面只剩裂图/占位。
 *
 * 做法：启动时遍历镜像内 backend/assets/covers（按对象键分层存放），逐个 stat，
 * 缺失或大小不一致才上传。对象键是内容哈希，天然幂等，重复启动只比对不上传。
 */
const fs = require('fs');
const path = require('path');
const config = require('../config');
const { minioClient } = require('../db/minio');
const { of } = require('../utils/logger');

const log = of('[minio]');

/** 内置封面目录：backend/assets/covers，目录层级与 MinIO 对象键一一对应 */
const MEDIA_DIR = path.join(__dirname, '../../assets/covers');

/** 扩展名 → Content-Type（与上传接口保持一致） */
const MIME = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    gif: 'image/gif',
};

/**
 * 递归收集目录下所有文件（手工递归，避免依赖 readdirSync recursive 的版本差异）
 * @param {string} dir 当前目录
 * @param {string} root 根目录（用于计算相对路径）
 * @returns {Array<{key: string, abs: string, size: number}>} 对象键 / 绝对路径 / 字节数
 */
function walk_covers(dir, root) {
    const out = [];
    for (const name of fs.readdirSync(dir)) {
        const abs = path.join(dir, name);
        const st = fs.statSync(abs);
        if (st.isDirectory()) {
            out.push(...walk_covers(abs, root));
        } else if (st.isFile()) {
            out.push({
                key: path.relative(root, abs).split(path.sep).join('/'),
                abs,
                size: st.size,
            });
        }
    }
    return out;
}

/**
 * 启动自愈：保证种子数据引用的封面对象都在 MinIO 里
 * 失败只记录日志，不阻断后端启动（图片问题不应让整站不可用）
 * @returns {Promise<{total: number, uploaded: number, skipped: number, failed: number}>}
 */
async function ensure_seed_media() {
    const summary = { total: 0, uploaded: 0, skipped: 0, failed: 0 };
    if (!fs.existsSync(MEDIA_DIR)) {
        log.warn('[minio] 未找到内置封面目录，跳过封面自愈');
        return summary;
    }

    const files = walk_covers(MEDIA_DIR, MEDIA_DIR).filter((f) => f.key.startsWith('cover/'));
    summary.total = files.length;
    const started = Date.now();

    for (const f of files) {
        const ext = f.key.slice(f.key.lastIndexOf('.') + 1).toLowerCase();
        try {
            const stat = await minioClient.statObject(config.minio.bucket, f.key).catch(() => null);
            if (stat && Number(stat.size) === f.size) {
                summary.skipped += 1;
                continue;
            }
            await minioClient.putObject(
                config.minio.bucket,
                f.key,
                fs.createReadStream(f.abs),
                f.size,
                { 'Content-Type': MIME[ext] || 'application/octet-stream' }
            );
            summary.uploaded += 1;
        } catch (e) {
            summary.failed += 1;
            console.warn(`[minio] 封面补齐失败 ${f.key}: ${e.message}`);
        }
    }

    log.info(
        `[minio] 封面对象自愈：内置 ${summary.total}，上传 ${summary.uploaded}，` +
        `已存在 ${summary.skipped}，失败 ${summary.failed}（${Date.now() - started}ms）`
    );
    return summary;
}

module.exports = { ensure_seed_media, MEDIA_DIR };
