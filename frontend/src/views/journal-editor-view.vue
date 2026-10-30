<template>
    <div class="page-wrap je-page">
        <!-- 顶部：返回 + 标题/日期 + 保存/导出（桌面端横排工具栏） -->
        <div class="je-top">
            <a class="back" @click="$router.back()">‹</a>
            <div class="je-meta">
                <input v-model="title" class="je-title" placeholder="给这篇手账起个名" maxlength="24" />
                <div class="je-date-row">
                    <i class="date-ic" aria-label="选择日期" @click="pick_date">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M8 3v4M16 3v4M3 10h18" /></svg>
                    </i>
                    <input ref="date_inp" v-model="date" type="date" class="je-date" />
                </div>
            </div>
            <div class="je-acts">
                <button type="button" class="act ghost" @click="export_png" :disabled="exporting">
                    {{ exporting ? '生成中…' : '保存为图片' }}
                </button>
                <button type="button" class="act" @click="save" :disabled="saving">
                    {{ saving ? '保存中…' : (edit_id ? '保存修改' : '保存手账') }}
                </button>
            </div>
        </div>

        <div class="je-body">
            <!-- 画布区：750×1000 纸面，贴纸/文字块自由排版；
                 height 取缩放后的真实高度，避免 transform 不改变布局高度而留下大段空白（r90） -->
            <div class="je-stage" :class="{ editing: !!sel }" :style="{ height: stage_h }">
                <div
                    ref="paper" class="paper" :class="`bg-${bg}`"
                    :style="[bg === 3 && bg_src ? { background: `#FFFDF5 url(${bg_src}) center / cover no-repeat` } : {}, { transform: `scale(${scale})` }]"
                    @pointerdown.self="sel = null"
                >
                    <!-- 日期章（右下角，随背景） -->
                    <span class="date-stamp">{{ date }}<i>大福食刻 · 手账</i></span>
                    <!-- 排版块 -->
                    <div
                        v-for="(b, i) in blocks" :key="b.uid"
                        class="blk" :class="[`k-${b.kind}`, { sel: sel === b.uid }]"
                        :style="blk_style(b)"
                        @pointerdown.stop.prevent="down_block($event, b)"
                    >
                        <img v-if="b.kind === 'sticker'" :src="b.src" draggable="false" alt="" />
                        <span v-else class="txt">{{ b.text }}</span>
                        <!-- 选中控制环：删除 / 旋转 / 缩放 / 层级 -->
                        <template v-if="sel === b.uid">
                            <i class="hd del" title="删除" @pointerdown.stop.prevent="del_block(b)">×</i>
                            <i class="hd rot" title="拖动旋转" @pointerdown.stop.prevent="down_rot($event, b, i)">
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.9-6.6" /><path d="M21 3v5h-5" /></svg>
                            </i>
                            <i class="hd scl" title="拖动缩放" @pointerdown.stop.prevent="down_scale($event, b)">
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6" /><path d="M9 21H3v-6" /><path d="M21 3l-7 7" /><path d="M3 21l7-7" /></svg>
                            </i>
                            <i class="hd up" title="置顶一层" @pointerdown.stop.prevent="z_up(b)">▲</i>
                            <i class="hd dn" title="下移一层" @pointerdown.stop.prevent="z_down(b)">▼</i>
                        </template>
                    </div>
                </div>
            </div>

            <!-- 工具区：移动端在画布下方；桌面端右侧竖排面板 -->
            <div class="je-tools">
                <div class="tool-sec">
                    <b>贴纸</b>
                    <span class="tool-desc">从贴图库选贴纸，可拖动、缩放、旋转</span>
                    <div class="tool-row">
                        <button type="button" class="tool-btn main" @click="lib_open = true">打开贴图库</button>
                        <label class="tool-btn file">
                            上传抠图
                            <input type="file" accept="image/*" hidden @change="upload_extract" />
                        </label>
                    </div>
                </div>
                <div class="tool-sec">
                    <b>文字贴</b>
                    <div class="tool-row">
                        <input v-model="new_text" class="text-in" placeholder="写一句打卡心得…" maxlength="24" />
                        <button type="button" class="tool-btn" @click="add_text">添加</button>
                    </div>
                    <div class="color-row">
                        <i
                            v-for="c in TEXT_COLORS" :key="c" :style="{ background: `#${c}` }"
                            :class="{ on: text_color === c }" @click="text_color = c"
                        ></i>
                    </div>
                </div>
                <div class="tool-sec">
                    <b>纸面背景</b>
                    <div class="bg-row">
                        <button
                            v-for="(g, i) in BG_NAMES" :key="i" type="button"
                            class="tool-btn" :class="{ on: bg === i }" @click="bg = i"
                        >{{ g }}</button>
                        <label class="tool-btn file bg-up" :class="{ on: bg === 3 }">
                            {{ bg === 3 ? '我的图片' : '传图片' }}
                            <input type="file" accept="image/*" hidden @change="upload_bg" />
                        </label>
                    </div>
                </div>
                <div class="tool-sec">
                    <b>随笔</b>
                    <textarea v-model="text" class="note-in" rows="3" maxlength="300" placeholder="这一餐的故事…（可选）"></textarea>
                </div>
            </div>
        </div>

        <!-- 贴图库抽屉：我的抠图贴纸 + 内置贴纸 -->
        <el-drawer v-model="lib_open" title="贴图库" size="78%" class="lib-drawer">
            <div class="lib-body">
                <div class="lib-sec">
                    <b>上传菜品图，自动抠成贴纸</b>
                    <span class="tool-desc">商家菜品图 / 自己拍的照片都行，AI 自动抠除背景</span>
                    <label class="tool-btn main file up-big">
                        {{ extracting ? 'AI 抠图中…' : '选图自动抠图' }}
                        <input type="file" accept="image/*" hidden :disabled="extracting" @change="upload_extract" />
                    </label>
                </div>
                <div class="lib-sec">
                    <b>我的贴纸</b>
                    <div v-if="stickers.length" class="lib-grid">
                        <div v-for="s in stickers" :key="s.id" class="lib-cell" @click="add_sticker(s)">
                            <img :src="s.url" :alt="s.name" loading="lazy" />
                            <span class="lib-name">{{ s.name }}</span>
                            <i
                                v-if="s.source === 0 || s.source === 1" class="lib-del" title="删除贴纸"
                                @click.stop="del_sticker(s)"
                            >×</i>
                            <em v-if="s.source === 1" class="lib-tag">收藏收录</em>
                            <em v-else-if="s.source === 3" class="lib-tag sys">菜品贴纸</em>
                        </div>
                    </div>
                    <div v-else class="lib-empty">还没有贴纸，收藏菜品或上传图片自动抠图进来～</div>
                </div>
            </div>
        </el-drawer>
    </div>
</template>

<script setup>
/**
 * 手账编辑器（r52）：贴纸手账排版画布
 *  - 画布 750×1000 逻辑像素，视口等比缩放；块支持拖动 / 缩放 / 旋转 / 层级
 *  - 贴纸来源：个人贴图库（收藏自动抠图 + 上传抠图）+ 内置公共贴纸
 *  - 导出：canvas 按同口径重绘 → PNG 下载（与屏幕渲染 1:1）
 */
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { api_sticker, api_journal } from '../api';

const route = useRoute();
const router = useRouter();

/* ---------------- 状态 ---------------- */
const edit_id = ref(route.params.id ? Number(route.params.id) : null);
const title = ref('');
const date = ref(new Date().toISOString().slice(0, 10));
const text = ref('');
const bg = ref(0);
const blocks = ref([]);        // 画布块：{uid, kind, src/sticker, text, color, size, x, y, w, rot, z}
const sel = ref(null);         // 当前选中块 uid
const stickers = ref([]);      // 贴图库
const lib_open = ref(false);
const extracting = ref(false);
const saving = ref(false);
const exporting = ref(false);
const new_text = ref('');
const text_color = ref('3a2e1a');
const scale = ref(1);
const date_inp = ref(null);    // 日期原生 input（自定义日历图标用）
const bg_src = ref('');        // 自定义纸面背景图 URL（bg=3 时生效）

/** 文字贴可选颜色（贴纸风手写色板） */
const TEXT_COLORS = ['3a2e1a', 'c98a1e', 'c0533e', '4a7c59', '46618c', '8a5a9e'];
/** 纸面背景名 */
const BG_NAMES = ['米纸网格', '点阵', '牛皮纸'];
const CANVAS = { w: 750, h: 1000 };
let uid_seed = 1;

/**
 * 画布区占位高度：transform: scale 只影响绘制、不改变布局尺寸，
 * 若不显式收起，缩放后的纸面下方会留下一大段空白，移动端要滚很久才见到工具面板（r90）
 * @returns {string} 形如 "457px" 的真实高度
 */
const stage_h = computed(() => `${Math.round(CANVAS.h * scale.value)}px`);

/* ---------------- 贴图库 ---------------- */

/** 拉取贴图库（个人 + 内置公共贴纸） */
async function load_stickers() {
    const list = await api_sticker.list();
    stickers.value = list || [];
}

/**
 * 上传图片自动抠图（表单直传，进度文案 + 完成后自动选中新贴纸加入画布）
 * @param {Event} e input change 事件
 */
async function upload_extract(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    extracting.value = true;
    try {
        const fd = new FormData();
        fd.append('image', file);
        fd.append('name', file.name.replace(/\.[^.]+$/, '').slice(0, 24) || '我的贴纸');
        const r = await api_sticker.extract(fd);
        ElMessage.success('抠图完成，已加入贴图库');
        await load_stickers();
        const made = (stickers.value || []).find((s) => s.id === r.id);
        if (made) add_sticker(made);
    } catch (err) {
        ElMessage.error(err.response && err.response.data && err.response.data.msg || '抠图失败，请稍后再试');
    } finally {
        extracting.value = false;
    }
}

/**
 * 删除个人贴纸（内置贴纸不可删，接口侧同样校验）
 * @param {object} s 贴纸
 */
async function del_sticker(s) {
    try {
        await ElMessageBox.confirm(`删除贴纸「${s.name}」？`, '提示', { type: 'warning' });
    } catch { return; }
    await api_sticker.remove(s.id);
    stickers.value = stickers.value.filter((x) => x.id !== s.id);
    ElMessage.success('已删除');
}

/** 打开日期选择器（原生指示器已隐藏，由左侧日历图标触发） */
function pick_date() {
    const el = date_inp.value;
    if (!el) return;
    if (el.showPicker) el.showPicker();
    else el.focus();
}

/**
 * 上传自定义纸面背景图：存 MinIO → 切到 bg=3 并铺满纸面
 * @param {Event} e input change 事件
 */
async function upload_bg(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
        const fd = new FormData();
        fd.append('image', file);
        const r = await api_journal.save_bg(fd);
        bg_src.value = r.url;
        bg.value = 3;
        ElMessage.success('背景已设置');
    } catch (err) {
        ElMessage.error(err.response && err.response.data && err.response.data.msg || '背景上传失败');
    }
}

/* ---------------- 画布块操作 ---------------- */

/**
 * 从贴图库添加贴纸块：初始居中 + 随机微旋转（手账随手贴的感觉）
 * @param {object} s 贴纸
 */
function add_sticker(s) {
    blocks.value.push({
        uid: `s${uid_seed++}`,
        kind: 'sticker',
        src: s.url,
        sticker: s.id,
        x: CANVAS.w / 2 - 90 + Math.random() * 80 - 40,
        y: CANVAS.h / 2 - 90 + Math.random() * 80 - 40,
        w: 180,
        rot: Math.round(Math.random() * 16 - 8),
        z: next_z(),
    });
    sel.value = blocks.value[blocks.value.length - 1].uid;
    lib_open.value = false;
}

/** 添加文字贴（便签纸片） */
function add_text() {
    const t = new_text.value.trim();
    if (!t) { ElMessage.info('先写一句要贴上去的话'); return; }
    blocks.value.push({
        uid: `t${uid_seed++}`,
        kind: 'text',
        text: t,
        color: text_color.value,
        size: 24,
        x: CANVAS.w / 2 - 110,
        y: CANVAS.h / 2 - 40,
        w: 220,
        rot: Math.round(Math.random() * 10 - 5),
        z: next_z(),
    });
    new_text.value = '';
    sel.value = blocks.value[blocks.value.length - 1].uid;
}

/** 当前最大层级 + 1（新块置顶） */
function next_z() {
    return blocks.value.reduce((m, b) => Math.max(m, b.z), 0) + 1;
}

/** 删除块 */
function del_block(b) {
    blocks.value = blocks.value.filter((x) => x.uid !== b.uid);
    sel.value = null;
}

/** 置顶一层 */
function z_up(b) { b.z += 1; }

/** 下移一层 */
function z_down(b) { b.z = Math.max(1, b.z - 1); }

/**
 * 块定位样式（缩放补偿：画布被 scale 缩小，块坐标仍按画布逻辑像素）
 * @param {object} b 块
 */
function blk_style(b) {
    return {
        left: `${b.x}px`,
        top: `${b.y}px`,
        width: `${b.w}px`,
        zIndex: b.z,
        transform: `rotate(${b.rot}deg)`,
    };
}

/* ---------------- 指针交互：拖动 / 缩放 / 旋转 ---------------- */

let drag = null; // {mode, block, start_x, start_y, orig}
const paper = ref(null);

/**
 * 按下块：进入移动模式（记录起点与原位）
 * @param {PointerEvent} e
 * @param {object} b
 */
function down_block(e, b) {
    sel.value = b.uid;
    drag = { mode: 'move', block: b, start_x: e.clientX, start_y: e.clientY, orig: { x: b.x, y: b.y } };
    bind_move();
}

/**
 * 按下缩放柄：进入缩放模式
 */
function down_scale(e, b) {
    drag = { mode: 'scale', block: b, start_x: e.clientX, orig: { w: b.w } };
    bind_move();
}

/**
 * 按下旋转柄：进入旋转模式（以块中心为轴，按指针角度差计算）
 */
function down_rot(e, b) {
    drag = { mode: 'rot', block: b, start_x: e.clientX, start_y: e.clientY, orig: { rot: b.rot } };
    bind_move();
}

/** 全局 move/up 绑定（pointer capture 简化：document 级监听，up 后解绑） */
function bind_move() {
    window.addEventListener('pointermove', on_move);
    window.addEventListener('pointerup', on_up, { once: true });
}

/**
 * 移动：按模式换算（坐标 ÷ scale 还原到画布逻辑像素）
 * @param {PointerEvent} e
 */
function on_move(e) {
    if (!drag) return;
    const k = 1 / (scale.value || 1);
    if (drag.mode === 'move') {
        const dx = (e.clientX - drag.start_x) * k;
        const dy = (e.clientY - drag.start_y) * k;
        // 允许半出画布（手账贴纸可以贴边），但不出纸面太远
        drag.block.x = Math.max(-60, Math.min(drag.orig.x + dx, CANVAS.w - 60));
        drag.block.y = Math.max(-60, Math.min(drag.orig.y + dy, CANVAS.h - 60));
    } else if (drag.mode === 'scale') {
        const dx = (e.clientX - drag.start_x) * k;
        drag.block.w = Math.max(48, Math.min(drag.orig.w + dx * 1.6, 480));
    } else if (drag.mode === 'rot') {
        const rect = paper.value.getBoundingClientRect();
        const cx = rect.left + (drag.block.x + drag.block.w / 2) * scale.value;
        const cy = rect.top + (drag.block.y + drag.block.w / 2) * scale.value;
        const deg = (Math.atan2(e.clientY - cy, e.clientX - cx) * 180) / Math.PI + 90;
        drag.block.rot = Math.round(Math.max(-180, Math.min(deg, 180)));
    }
}

/** 抬起：结束拖动 */
function on_up() {
    drag = null;
    window.removeEventListener('pointermove', on_move);
}

/* ---------------- 视口缩放适配 ---------------- */

/** 计算画布缩放：容器宽 / 750，最大 1（桌面大屏原尺寸） */
function fit_scale() {
    const stage = paper.value && paper.value.parentElement;
    if (!stage) return;
    const avail = stage.clientWidth - 8;
    scale.value = Math.min(1, avail / CANVAS.w);
}

let ro = null;
onMounted(async () => {
    fit_scale();
    ro = new ResizeObserver(fit_scale);
    if (paper.value) ro.observe(paper.value.parentElement);
    try { await load_stickers(); } catch { /* 未登录等场景忽略 */ }
    if (edit_id.value) await load_journal();
    await nextTick(fit_scale);
});
onUnmounted(() => { if (ro) ro.disconnect(); });

/* ---------------- 保存 / 回填 ---------------- */

/** 序列化画布为后端 layout（服务端 safe_layout 白名单兜底） */
function to_layout() {
    return blocks.value.map((b) => ({
        kind: b.kind, sticker: b.sticker || 0, src: b.src || '',
        x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.w),
        rot: b.rot, z: b.z, text: b.text || '', color: b.color || '3a2e1a', size: b.size || 24,
    }));
}

/** 首张贴纸对象键（列表封面） */
function cover_key() {
    const first = blocks.value.find((b) => b.kind === 'sticker' && (b.src || '').includes('/img/'));
    return first ? first.src.replace('/img/', '') : null;
}

/**
 * 保存手账（新建 POST / 编辑 PUT），成功跳详情
 */
async function save() {
    saving.value = true;
    try {
        const body = { title: title.value, date: date.value, text: text.value, bg: bg.value, bg_src: bg.value === 3 ? bg_src.value : null, layout: to_layout(), cover: cover_key() };
        if (edit_id.value) {
            await api_journal.update(edit_id.value, body);
            router.replace(`/journal/${edit_id.value}`);
        } else {
            const r = await api_journal.create(body);
            router.replace(`/journal/${r.id}`);
        }
        ElMessage.success('手账已保存');
    } catch (e) {
        ElMessage.error(e.response && e.response.data && e.response.data.msg || '保存失败');
    } finally {
        saving.value = false;
    }
}

/** 编辑模式回填 */
async function load_journal() {
    try {
        const r = await api_journal.get(edit_id.value);
        const j = r || {};
        title.value = j.title;
        date.value = j.date;
        text.value = j.text || '';
        bg.value = Number(j.bg) || 0;
        bg_src.value = j.bg_src || '';
        blocks.value = (j.layout || []).map((b) => ({ ...b, uid: `r${uid_seed++}` }));
    } catch (e) {
        ElMessage.error(e.response && e.response.data && e.response.data.msg || '手账不存在');
        router.replace('/footprint');
    }
}

/* ---------------- 导出 PNG（canvas 与画布同口径重绘） ---------------- */

/** 纸面背景绘制 */
async function draw_bg(ctx) {
    if (bg.value === 3 && bg_src.value) {
        // 自定义图片背景：cover 铺满画布
        try {
            const img = await load_img(bg_src.value);
            const s = Math.max(CANVAS.w / img.width, CANVAS.h / img.height);
            ctx.fillStyle = '#efe6d2';
            ctx.fillRect(0, 0, CANVAS.w, CANVAS.h);
            ctx.drawImage(img, (CANVAS.w - img.width * s) / 2, (CANVAS.h - img.height * s) / 2, img.width * s, img.height * s);
            return;
        } catch { /* 加载失败回退米纸 */ }
    }
    if (bg.value === 2) {
        ctx.fillStyle = '#efe0c3';
        ctx.fillRect(0, 0, CANVAS.w, CANVAS.h);
        ctx.strokeStyle = 'rgba(122,88,44,0.18)';
        ctx.lineWidth = 1;
        for (let y = 90; y < CANVAS.h; y += 48) {
            ctx.beginPath(); ctx.moveTo(36, y); ctx.lineTo(CANVAS.w - 36, y); ctx.stroke();
        }
        return;
    }
    ctx.fillStyle = '#fffdf5';
    ctx.fillRect(0, 0, CANVAS.w, CANVAS.h);
    if (bg.value === 0) {
        ctx.strokeStyle = 'rgba(201,138,30,0.10)';
        for (let x = 30; x < CANVAS.w; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, CANVAS.h); ctx.stroke(); }
        for (let y = 30; y < CANVAS.h; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(CANVAS.w, y); ctx.stroke(); }
    } else {
        ctx.fillStyle = 'rgba(201,138,30,0.16)';
        for (let x = 30; x < CANVAS.w; x += 40) {
            for (let y = 30; y < CANVAS.h; y += 40) {
                ctx.beginPath(); ctx.arc(x, y, 2, 0, Math.PI * 2); ctx.fill();
            }
        }
    }
}

/**
 * 导出 PNG：背景 + 逐块重绘（贴纸图旋转缩放 / 文字便签）→ 触发下载
 */
async function export_png() {
    exporting.value = true;
    try {
        const canvas = document.createElement('canvas');
        canvas.width = CANVAS.w;
        canvas.height = CANVAS.h;
        const ctx = canvas.getContext('2d');
        await draw_bg(ctx);
        // z 序绘制
        const ordered = [...blocks.value].sort((a, b) => a.z - b.z);
        for (const b of ordered) {
            ctx.save();
            ctx.translate(b.x + b.w / 2, b.y + b.w / 2);
            ctx.rotate((b.rot * Math.PI) / 180);
            if (b.kind === 'sticker') {
                const img = await load_img(b.src);
                ctx.drawImage(img, -b.w / 2, -b.w / 2, b.w, b.w);
            } else {
                // 文字便签：白纸片 + 阴影 + 手写感文字
                ctx.shadowColor = 'rgba(58,46,26,0.18)';
                ctx.shadowBlur = 10;
                ctx.shadowOffsetY = 4;
                ctx.fillStyle = '#fffef7';
                ctx.strokeStyle = '#ead9b4';
                round_rect(ctx, -b.w / 2, -b.w / 2, b.w, Math.max(b.size * 2.4, b.w * 0.42), 14);
                ctx.fill();
                ctx.stroke();
                ctx.shadowColor = 'transparent';
                ctx.fillStyle = `#${b.color}`;
                ctx.font = `700 ${b.size}px "Kaiti SC", "STKaiti", "KaiTi", serif`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                wrap_text(ctx, b.text, b.w - 28);
            }
            ctx.restore();
        }
        // 右下日期章
        ctx.fillStyle = 'rgba(58,46,26,0.55)';
        ctx.font = '600 20px sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(date.value, CANVAS.w - 30, CANVAS.h - 40);
        const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `手账-${date.value}.png`;
        a.click();
        URL.revokeObjectURL(a.href);
        ElMessage.success('图片已保存到下载');
    } catch (e) {
        ElMessage.error('导出失败，请重试');
    } finally {
        exporting.value = false;
    }
}

/** 图片加载（缓存避免重复请求） */
const img_cache = new Map();
function load_img(src) {
    if (img_cache.has(src)) return img_cache.get(src);
    const p = new Promise((resolve, reject) => {
        const im = new Image();
        im.onload = () => resolve(im);
        im.onerror = reject;
        im.src = src;
    });
    img_cache.set(src, p);
    return p;
}

/** 圆角矩形路径 */
function round_rect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
}

/** 便签文字换行绘制（中英文按字符宽累计） */
function wrap_text(ctx, text, max_w) {
    const lines = [];
    let line = '';
    for (const ch of String(text)) {
        if (ctx.measureText(line + ch).width > max_w) { lines.push(line); line = ch; }
        else line += ch;
    }
    if (line) lines.push(line);
    const lh = Number(ctx.font.match(/(\d+)px/)[1]) * 1.5;
    const start = -(lines.length - 1) * lh / 2;
    lines.forEach((l, i) => ctx.fillText(l, 0, start + i * lh));
}
</script>

<style scoped>
/* ============ 编辑器骨架 ============ */
.je-page { padding-bottom: 90px; }
.je-top { display: flex; align-items: center; gap: 10px; margin-top: 14px; }
.back {
    width: 30px; height: 30px; flex-shrink: 0; border-radius: 50%;
    background: #FFF; border: 1px solid var(--paper-line); box-shadow: var(--shadow-soft);
    display: grid; place-items: center; font-size: 18px; color: var(--ink); cursor: pointer;
}
.je-meta { flex: 1; display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.je-title {
    border: none; background: transparent; font-size: 17px; font-weight: 800;
    color: var(--ink); font-family: inherit; outline: none; padding: 0;
}
.je-date-row { display: flex; align-items: center; gap: 4px; }
.date-ic { width: 16px; height: 16px; display: grid; place-items: center; color: var(--ink-3); cursor: pointer; }
.je-date {
    border: none; background: transparent; font-size: 11px; color: var(--ink-3);
    font-family: inherit; outline: none; padding: 0; width: 130px;
}
/* 原生日历指示器隐藏（改由左侧 date-ic 图标触发 showPicker） */
.je-date::-webkit-calendar-picker-indicator { display: none; }
.je-acts { display: flex; gap: 6px; }
.act {
    border: none; background: var(--brand); color: #FFFDF5; font-weight: 700; font-size: 12px;
    padding: 7px 12px; border-radius: 999px; cursor: pointer; white-space: nowrap;
}
.act.ghost { background: #FFF; color: var(--brand-dark); border: 1px solid var(--paper-line); }
.act:disabled { opacity: 0.6; }

/* ============ 画布 ============ */
.je-body { display: flex; flex-direction: column; gap: 14px; margin-top: 12px; }
.je-stage { display: flex; justify-content: center; }
.paper {
    position: relative; width: 750px; height: 1000px; flex-shrink: 0;
    transform-origin: top center;
    border-radius: 14px; overflow: hidden;
    border: 1px solid var(--paper-line);
    box-shadow: var(--shadow-soft);
    touch-action: none;
}
/* 纸面背景（bg-0 多层渐变时颜色只能写在末层，拆成 color+image 才能生效） */
.paper.bg-0 { background-color: #FFFDF5; background-image: linear-gradient(var(--paper-line) 1px, transparent 1px), linear-gradient(90deg, var(--paper-line) 1px, transparent 1px); background-size: 40px 40px; background-position: 10px 10px; }
.paper.bg-1 { background: #FFFDF5 radial-gradient(rgba(201,138,30,0.22) 1.6px, transparent 1.6px); background-size: 40px 40px; background-position: 10px 10px; }
.paper.bg-2 { background: #EFE0C3; }
.paper.bg-2::after {
    content: ''; position: absolute; inset: 0; pointer-events: none;
    background: repeating-linear-gradient(transparent 0 47px, rgba(122,88,44,0.16) 47px 48px);
}
.date-stamp {
    position: absolute; right: 22px; bottom: 18px; z-index: 0;
    font-size: 16px; font-weight: 700; color: rgba(58,46,26,0.55);
    text-align: right; display: flex; flex-direction: column; align-items: flex-end;
}
.date-stamp i { font-style: normal; font-size: 10px; font-weight: 600; color: rgba(58,46,26,0.35); margin-top: 2px; }

/* ============ 排版块 ============ */
.blk { position: absolute; cursor: grab; touch-action: none; }
.blk:active { cursor: grabbing; }
.blk img { display: block; width: 100%; pointer-events: none; user-select: none;
    filter: drop-shadow(0 4px 8px rgba(58,46,26,0.18)); }
.blk.k-text .txt {
    display: block; background: #FFFEF7; border: 1.5px solid #EAD9B4; border-radius: 12px;
    box-shadow: 0 4px 10px rgba(58,46,26,0.16);
    padding: 10px 14px; font-family: 'Kaiti SC', 'STKaiti', 'KaiTi', serif;
    font-weight: 700; line-height: 1.5; word-break: break-all; user-select: none;
}
.blk.sel { outline: 2px dashed rgba(201,138,30,0.65); outline-offset: 6px; border-radius: 6px; }

/* 控制柄（画布逻辑坐标，随画布缩放） */
.hd {
    position: absolute; width: 26px; height: 26px; border-radius: 50%;
    background: #FFF; border: 1.5px solid var(--brand); color: var(--brand-dark);
    display: grid; place-items: center; font-size: 13px; font-style: normal;
    font-weight: 800; cursor: pointer; box-shadow: 0 2px 6px rgba(58,46,26,0.2);
    user-select: none;
}
.hd.del { top: -13px; right: -13px; }
.hd svg { pointer-events: none; }
.hd.rot { top: -13px; left: -13px; cursor: grab; background: var(--brand); color: #FFFDF5; }
.hd.scl { bottom: -13px; right: -13px; cursor: nwse-resize; background: var(--brand); color: #FFFDF5; }
.hd.up { bottom: -13px; left: -13px; font-size: 9px; }
.hd.dn { bottom: -13px; left: 20px; font-size: 9px; }

/* ============ 工具面板 ============ */
.je-tools { display: flex; flex-direction: column; gap: 12px; }
.tool-sec {
    background: #FFF; border: 1px solid var(--paper-line); border-radius: var(--radius);
    box-shadow: var(--shadow-soft); padding: 12px 14px;
    display: flex; flex-direction: column; gap: 8px;
}
.tool-sec > b { font-size: 12.5px; color: var(--ink); }
.tool-desc { font-size: 10.5px; color: var(--ink-3); margin-top: -4px; }
.tool-row { display: flex; gap: 8px; align-items: center; }
.tool-btn {
    border: 1px solid var(--paper-line); background: var(--paper); color: var(--brand-dark);
    font-weight: 700; font-size: 12px; padding: 8px 14px; border-radius: 999px; cursor: pointer;
    white-space: nowrap; /* 按钮文字禁止折行，空间不足时整颗按钮换行 */
}
.tool-btn.main { background: var(--brand); border-color: var(--brand); color: #FFFDF5; flex: 1; text-align: center; }
.tool-btn.on { background: var(--brand); border-color: var(--brand); color: #FFFDF5; }
.tool-btn.file { position: relative; overflow: hidden; }
.text-in {
    flex: 1; border: 1px solid var(--paper-line); border-radius: 10px; padding: 8px 10px;
    font-size: 12px; font-family: inherit; outline: none; background: var(--paper);
}
.color-row { display: flex; gap: 8px; }
.color-row i {
    width: 22px; height: 22px; border-radius: 50%; cursor: pointer;
    border: 2px solid transparent; box-shadow: inset 0 0 0 2px #FFF;
}
.color-row i.on { border-color: var(--ink); }
.bg-row { display: flex; gap: 8px; flex-wrap: wrap; }
.note-in {
    border: 1px solid var(--paper-line); border-radius: 10px; padding: 8px 10px;
    font-size: 12px; font-family: inherit; outline: none; resize: none; background: var(--paper);
}

/* ============ 贴图库抽屉 ============ */
.lib-body { display: flex; flex-direction: column; gap: 18px; padding-bottom: 20px; }
.lib-sec { display: flex; flex-direction: column; gap: 10px; }
.lib-sec > b { font-size: 14px; }
.up-big { align-self: flex-start; padding: 10px 22px; }
.lib-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
.lib-cell {
    position: relative; background: var(--paper); border: 1px solid var(--paper-line);
    border-radius: 12px; padding: 6px; cursor: pointer; display: flex; flex-direction: column;
    align-items: center; gap: 4px; transition: transform 0.15s;
}
.lib-cell:hover { transform: translateY(-2px); }
/* 贴纸展示统一质感：沿 alpha 轮廓的柔和投影，让白描边贴纸有立体浮贴感（与详情页同族） */
.blk.k-sticker img { filter: drop-shadow(0 4px 8px rgba(58, 46, 26, 0.18)); }
.lib-cell img { width: 100%; aspect-ratio: 1; object-fit: contain; filter: drop-shadow(0 2px 4px rgba(58, 46, 26, 0.16)); }
.lib-name { font-size: 9.5px; color: var(--ink-2); max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lib-del {
    position: absolute; top: -6px; right: -6px; width: 20px; height: 20px; border-radius: 50%;
    background: #C0533E; color: #FFF; font-style: normal; font-size: 12px;
    display: grid; place-items: center; box-shadow: 0 2px 6px rgba(58,46,26,0.3);
}
.lib-tag {
    position: absolute; top: 4px; left: 4px; font-style: normal; font-size: 8.5px; font-weight: 700;
    background: var(--brand); color: #FFFDF5; padding: 2px 6px; border-radius: 999px;
}
.lib-tag.sys { background: #6f8f5a; }
.lib-empty { font-size: 11.5px; color: var(--ink-3); padding: 14px 0; }

/* ============ 桌面端（≥769）：左画布 + 右工具面板双列 ============ */
@media (min-width: 769px) {
    .je-page { max-width: 980px; }
    .je-top { margin-top: 24px; }
    .je-title { font-size: 20px; }
    .je-body { flex-direction: row; align-items: flex-start; margin-top: 20px; }
    .je-stage { flex: 1; min-width: 0; }
    .je-tools { width: 300px; flex-shrink: 0; position: sticky; top: 89px; }
    .lib-grid { grid-template-columns: repeat(5, 1fr); }
}
</style>
