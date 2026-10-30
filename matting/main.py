# -*- coding: utf-8 -*-
"""
大福食刻 · 自动抠图微服务（手账贴纸生产线）
rembg(U2Net) 分割：只加载一个 170MB 模型，输入任意图片，输出透明底贴纸 PNG
贴纸质感：均匀白描边（多层放大剪影「倒影」自动成边）+ 轻投影，方形画布居中
被后端 Node 服务调用：POST /extract (multipart: file) → image/png
"""
import io
import os

import cv2
import numpy as np
from fastapi import FastAPI, File, UploadFile
from fastapi.responses import JSONResponse, Response
from PIL import Image, ImageFilter
from rembg import new_session, remove

# 只加载一个模型：u2net（权重约 170MB，实测待机 841MB、批量峰值 1.39GB）
# 质量优先；不再加载 isnet / birefnet 兜底。内存不足时可用 MATTING_MODEL=u2netp 切换
MODEL_NAME = os.getenv("MATTING_MODEL", "u2net")
session = new_session(MODEL_NAME)

app = FastAPI(title="dafu-matting")

# 输出画布与呼吸边；输入限边（控制距离变换内存）
CANVAS = 512
PAD = 12
MAX_SIDE = 2000
STROKE_RATIO = 0.10        # 描边厚度 = 主体短边 10%（贴纸风粗白边）
# 主体占原图比例阈值（实测：坏素材 0.5~0.6%，正常菜品 9%~64%，最低 9.25%）
MIN_FG_RATIO = 0.05        # 剔除线：主体占原图低于 5% 判失败，拒绝出图


def refine_alpha(cut: Image.Image, src: Image.Image, radius: int = 8, eps: float = 1e-3) -> Image.Image:
    """引导滤波精修 alpha：以原图灰度为引导，把分割 mask 的粗糙边缘对齐到图像真实边缘

    分割模型输出在低分辨率上推理后放大，边缘常有锯齿/模糊；引导滤波利用局部线性
    模型让 alpha 在图像梯度处突变——发丝、器皿轮廓等真实边缘处贴合更紧，成本 ~几十毫秒

    @param {Image.Image} cut 透明底抠图
    @param {Image.Image} src 原图（引导图）
    @param {int} radius 滤波窗口半径
    @param {float} eps 正则项（越大越平滑）
    @returns {Image.Image} 边缘精修后的抠图
    """
    g = np.asarray(src.convert("L")).astype(np.float32) / 255.0
    a = np.asarray(cut.getchannel("A")).astype(np.float32) / 255.0
    if g.shape != a.shape:
        return cut

    def box(x: np.ndarray) -> np.ndarray:
        """局部均值（box filter）"""
        return cv2.blur(x, (2 * radius + 1, 2 * radius + 1))

    m_i, m_a = box(g), box(a)
    var_i = box(g * g) - m_i * m_i
    cov_ia = box(g * a) - m_i * m_a
    c_a = cov_ia / (var_i + eps)
    c_b = m_a - c_a * m_i
    q = box(c_a) * g + box(c_b)
    # 限制在原 mask 支撑域内（避免光晕外溢），实心区保持
    q = np.clip(q, 0.0, 1.0) * (a > 0.02)
    cut.putalpha(Image.fromarray((q * 255).astype(np.uint8), "L"))
    return cut


def keep_main_subject(cut: Image.Image) -> Image.Image:
    """多主体过滤：只保留画面中央的主物体，剔除旁边的小物件

    分割模型会把画面里所有显著物体都抠出来（如主菜旁的小碟）；
    此处对前景做连通域分析，按「域内中心高斯权重之和」（面积 × 中心度）评分，
    仅保留得分最高的主物体。主体唯一或占比过小时不干预，避免误杀。

    @param {Image.Image} cut 透明底抠图
    @returns {Image.Image} 过滤后的抠图
    """
    a = np.asarray(cut.getchannel("A"))
    solid = (a > 127).astype(np.uint8)
    n, labels, stats, _ = cv2.connectedComponentsWithStats(solid, connectivity=8)
    total = int((solid > 0).sum())
    if n <= 2 or total == 0:
        return cut   # 主体唯一，无小物件可剔
    h, w = solid.shape
    sigma = 0.35 * min(h, w)
    ys, xs = np.mgrid[0:h, 0:w]
    center_w = np.exp(-((ys - h / 2) ** 2 + (xs - w / 2) ** 2) / (2 * sigma ** 2))
    best_label, best_score, best_area = 0, 0.0, 0
    for i in range(1, n):
        area = int(stats[i, cv2.CC_STAT_AREA])
        if area < total * 0.02:
            continue   # 噪点级碎块直接忽略
        score = float((center_w * (labels == i)).sum())
        if score > best_score:
            best_label, best_score, best_area = i, score, area
    if best_label == 0 or best_area >= total:
        return cut
    new_a = np.where(labels == best_label, a, 0).astype(np.uint8)
    cut.putalpha(Image.fromarray(new_a, "L"))
    return cut


def tighten_alpha(cut: Image.Image, keep: int = 2, fade: int = 2) -> Image.Image:
    """清除主体外缘的半透明白雾/旧描边晕（部分素材自带的脏边）

    以「实心区（alpha≥200）」为基准做距离场：距实心区 ≤keep 的像素保留原 alpha，
    keep → keep+fade 线性衰减到 0——大面积雾状低 alpha 残留被清除，
    仅保留紧贴主体的自然过渡带，避免描边沿雾晕外缘加边导致糊成一团

    @param {Image.Image} cut 透明底抠图
    @param {int} keep 保留主体边缘原 alpha 的距离（px）
    @param {int} fade 衰减带宽度（px）
    @returns {Image.Image} 收紧后的抠图
    """
    a = np.asarray(cut.getchannel("A"))
    solid = (a >= 200).astype(np.uint8)
    if solid.sum() == 0:
        return cut   # 无实心区（整图半透明），不处理
    inv = (1 - solid).astype(np.uint8)
    dist = cv2.distanceTransform(inv, cv2.DIST_L2, cv2.DIST_MASK_PRECISE)
    factor = np.clip(1.0 - (dist - keep) / float(max(fade, 1)), 0.0, 1.0)
    cut.putalpha(Image.fromarray((a * factor).astype(np.uint8), "L"))
    return cut


def sticker_backing(cut: Image.Image, stroke_ratio: float = STROKE_RATIO) -> Image.Image:
    """给透明底抠图加均匀描边外框（距离变换等距描边，行业标配贴纸工艺）

    对 alpha 轮廓做 L2 距离变换，描边带 = 距轮廓 ≤ stroke 的区域：
    内 60% 实白（硬边、视觉粗度足，对齐内置卡通贴纸观感）+ 外 40% 线性羽化（外缘柔和）
    ——凹形轮廓、凹角、细枝杈处都严格等距贴合
    分层结构（自下而上）：轻投影 → 白描边（实白+羽化分段）→ 主体

    @param {Image.Image} cut 透明底主体（已收紧裁边、缩放到最终尺度）
    @param {float} stroke_ratio 描边厚度占短边比例（照片卡可加大更醒目）
    @returns {Image.Image} 带均匀描边的成品（尺寸 = 主体 + 四向扩边）
    """
    w, h = cut.size
    stroke = max(6, round(min(w, h) * stroke_ratio))
    drop = max(4, round(stroke * 0.4))           # 阴影露出量（底部额外空间）
    W, H = w + 2 * stroke, h + 2 * stroke + drop

    # alpha 垫入扩边画布（四向各留 stroke 描边空间）
    a = np.asarray(cut.getchannel("A"))
    pad = np.zeros((H, W), dtype=np.uint8)
    pad[stroke:stroke + h, stroke:stroke + w] = a

    # 距离场：每个背景像素到主体轮廓的精确欧氏距离
    inv = (pad < 128).astype(np.uint8)   # 主体=0，背景=1
    dist = cv2.distanceTransform(inv, cv2.DIST_L2, cv2.DIST_MASK_PRECISE)

    # 描边带 alpha：内 90% 实色 255，外 10% 快速衰减（边缘锐利，仅留抗锯齿级微羽化）
    solid_end = stroke * 0.9
    band = np.where(
        dist <= solid_end,
        1.0,
        np.clip(1.0 - (dist - solid_end) / float(max(stroke - solid_end, 1.0)), 0.0, 1.0),
    )
    band_a = (band * 255).astype(np.uint8)
    band_a = np.maximum(band_a, pad)     # 主体半透明边缘下垫白，融合无断缝

    # 纸张材质：描边带 = 米白纸色底 + 六边形规则网点（印刷网点式规律排布，细点稀疏）
    # 点径/点距按图片短边百分比计算，随图自适应缩放
    pitch = max(11.0, min(w, h) * 0.075)         # 点距 = 短边 7.5%（稀疏）
    row_h = pitch * 0.87                          # 行距（六边形密排系数）
    r = pitch * 0.16                              # 点半径 = 点距 16%（细点）
    ys, xs = np.mgrid[0:H, 0:W].astype(np.float32)
    row = np.floor(ys / row_h)
    offx = (row % 2) * pitch * 0.5                # 奇数行偏移半格 → 六边形排布
    gx = (xs + offx) % pitch - pitch * 0.5
    gy = ys % row_h - row_h * 0.5
    grain = ((gx * gx + gy * gy) < r * r)[..., None].astype(np.float32)
    paper = np.full((H, W, 3), (249, 245, 236), np.float32)   # 米白纸底
    fiber = np.array((210, 200, 182), np.float32)              # 暖灰网点
    stroke_rgb = (paper * (1.0 - grain) + fiber * grain).astype(np.uint8)

    backing = Image.new("RGBA", (W, H))
    backing = Image.fromarray(np.dstack([stroke_rgb, band_a]), "RGBA")

    out = Image.new("RGBA", (W, H), (0, 0, 0, 0))

    # 轻投影：描边形状模糊后下移**超出描边厚度**（旧实现下移量小于描边被完全盖住看不见），
    # 暖黑低透明度——阴影从贴纸底部露出，呈现贴纸浮贴的立体感
    sh_alpha = backing.getchannel("A").filter(ImageFilter.GaussianBlur(max(3.0, stroke * 0.45)))
    shadow = Image.new("RGBA", (W, H), (86, 64, 38, 0))
    shadow.putalpha(sh_alpha.point(lambda v: int(v * 0.32)))
    out.alpha_composite(shadow, (0, stroke + drop))

    # 白描边垫底 → 主体压上（居中）
    out.alpha_composite(backing)
    out.alpha_composite(cut, (stroke, stroke))
    return out


@app.get("/health")
def health():
    """存活探针"""
    return {"status": "up"}


@app.post("/extract")
async def extract(file: UploadFile = File(...)):
    """抠图：上传原图（jpeg/png/webp）→ 返回均匀描边贴纸 PNG（512 画布）"""
    raw = await file.read()
    if not raw:
        return JSONResponse({"error": "empty file"}, status_code=400)
    try:
        img = Image.open(io.BytesIO(raw)).convert("RGBA")
    except Exception:
        return JSONResponse({"error": "invalid image"}, status_code=400)
    img.thumbnail((MAX_SIDE, MAX_SIDE), Image.LANCZOS)   # 超大图限边

    # 分割去背景（只用一个 u2netp 会话）
    cut = remove(img, session=session)

    # 引导滤波精修：mask 边缘对齐图像真实边缘（低分辨率推理放大的锯齿/模糊消除）
    cut = refine_alpha(cut, img)

    # 多主体过滤：画面中央主物体之外的旁侧小物件剔除
    cut = keep_main_subject(cut)

    # 半透明噪点清理：极低置信 alpha 直接归零，边缘干净不发灰
    a = np.asarray(cut.getchannel("A"))
    a = np.where(a < 16, 0, a).astype(np.uint8)
    cut.putalpha(Image.fromarray(a, "L"))

    # 雾晕收紧：清除素材/分割残留的半透明白雾，描边只沿干净轮廓加
    cut = tighten_alpha(cut)

    # 主体占比兜底：抠图后占原图比例过小（误抠 UI 碎片/噪点、无有效主体）→ 拒绝出图，
    # 由调用方按失败处理（不落库、不展示），避免生成一张空白或极小的坏贴纸
    solid_ratio = float((np.asarray(cut.getchannel("A")) > 127).sum()) / float(img.width * img.height)
    if solid_ratio < MIN_FG_RATIO:
        return JSONResponse({"error": "subject too small", "ratio": round(solid_ratio, 4)}, status_code=422)

    # 收紧裁边 → 预缩主体（为 20% 描边预留空间，保证描边+主体整体占满画布、描边比例不缩水）
    # → 在图片自身分辨率上加描边 → 整体适配画布居中
    bbox = cut.getbbox()
    if bbox:
        cut = cut.crop(bbox)
    inner = CANVAS - PAD * 2
    target = int(inner / (1 + 2 * STROKE_RATIO))
    cut.thumbnail((target, target), Image.LANCZOS)
    cut = sticker_backing(cut)
    cut.thumbnail((inner, inner), Image.LANCZOS)
    if max(cut.size) < inner:
        f = inner / max(cut.size)
        cut = cut.resize((max(1, round(cut.width * f)), max(1, round(cut.height * f))), Image.LANCZOS)
    canvas = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    canvas.paste(cut, ((CANVAS - cut.width) // 2, (CANVAS - cut.height) // 2), cut)
    buf = io.BytesIO()
    canvas.save(buf, "PNG")
    return Response(content=buf.getvalue(), media_type="image/png")
