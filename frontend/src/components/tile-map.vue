<template>
    <div
        ref="wrap"
        class="tmap"
        :class="{ grabbing, moving: !!drag }"
        @pointerdown="on_down"
        @pointermove="on_move"
        @pointerup="on_up"
        @pointercancel="on_up"
        @wheel.prevent="on_wheel"
        @dblclick="on_dblclick"
    >
        <!-- 瓦片层：按当前视口算可见瓦片，绝对定位拼贴（transform 平移，避免逐张改 left/top） -->
        <div class="tmap-tiles">
            <img
                v-for="t in tiles"
                :key="t.key"
                class="tmap-tile"
                :src="t.src"
                :style="t.style"
                alt=""
                draggable="false"
                @load="on_tile_load"
                @error="on_tile_error"
            >
        </div>

        <!-- 标记层：点位按经纬度换算成像素，锚点在底部中心 -->
        <div class="tmap-pins">
            <div
                v-for="m in shown"
                :key="m.id"
                class="tmap-pin tmap-ui"
                :style="{ left: `${m.px}px`, top: `${m.py}px` }"
                @click.stop="emit('marker-click', m.data)"
            >
                <slot name="marker" :m="m.data" />
            </div>
        </div>

        <!-- 缩放按钮（移动端不显示，靠双指捏合） -->
        <div class="tmap-zoom tmap-ui">
            <button type="button" aria-label="放大" @click.stop="zoom_by(1)">+</button>
            <button type="button" aria-label="缩小" @click.stop="zoom_by(-1)">−</button>
        </div>
    </div>
</template>

<script setup>
/**
 * 轻量瓦片地图（不依赖高德 JS API key，直接拼官方栅格底图）
 * 说明：底图取自高德地图瓦片服务（国内合规测绘底图），坐标系统一 GCJ-02，
 * 点位经纬度按 Web 墨卡托直接投影即可对齐，无需额外纠偏。
 * 能力：拖动平移 / 滚轮与双击缩放 / 双指捏合 / 定位复位 / 标记点击。
 */
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue';

const props = defineProps({
    /** 初始中心纬度（GCJ-02） */
    lat: { type: Number, required: true },
    /** 初始中心经度（GCJ-02） */
    lng: { type: Number, required: true },
    /** 初始层级 */
    zoom: { type: Number, default: 16 },
    min_zoom: { type: Number, default: 12 },
    max_zoom: { type: Number, default: 19 },
    /** 自动框选时的层级上限（点位很密时不至于贴到楼栋） */
    fit_max_zoom: { type: Number, default: 17 },
    /** 标记列表，元素需带 id / lng / lat */
    markers: { type: Array, default: () => [] },
});

const emit = defineEmits(['marker-click', 'fail', 'ready', 'resize']);

const wrap = ref(null);
const size = ref({ w: 0, h: 0 });
const z = ref(props.zoom);
/** 视口左上角对应的世界像素坐标（原点为 0 级单瓦片左上角） */
const ox = ref(0);
const oy = ref(0);
const dragging = ref(false);
const grabbing = ref(false);
let drag = null;

const TILE = 256;

/**
 * 高德栅格瓦片地址（style=8：路网 + 中文注记，接近美团底图观感）
 * @param {number} x 瓦片列号
 * @param {number} y 瓦片行号
 * @param {number} z 层级
 */
function tile_url(x, y, zz) {
    const s = 1 + (Math.abs(x + y) % 4);
    return `https://webrd0${s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x=${x}&y=${y}&z=${zz}`;
}

/**
 * 经度 → 世界像素 X
 */
function lng_to_x(lng, zz) {
    return ((lng + 180) / 360) * TILE * 2 ** zz;
}

/**
 * 纬度 → 世界像素 Y（Web 墨卡托）
 */
function lat_to_y(lat, zz) {
    const s = Math.sin((Math.max(-85, Math.min(85, lat)) * Math.PI) / 180);
    return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * TILE * 2 ** zz;
}

/** 世界像素 X → 经度 */
function x_to_lng(px, zz) {
    return (px / (TILE * 2 ** zz)) * 360 - 180;
}

/** 世界像素 Y → 纬度 */
function y_to_lat(py, zz) {
    const n = Math.PI - (2 * Math.PI * py) / (TILE * 2 ** zz);
    return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
}

/** 视口不越出世界范围（世界比视口小的方向居中） */
function clamp() {
    const world = TILE * 2 ** z.value;
    const { w, h } = size.value;
    ox.value = world <= w ? (world - w) / 2 : Math.min(world - w, Math.max(0, ox.value));
    oy.value = world <= h ? (world - h) / 2 : Math.min(world - h, Math.max(0, oy.value));
}

/** 以视口内某点为锚点缩放（默认视口中心），保证锚点下的地理位置不动 */
function zoom_by(step, anchor) {
    const nz = Math.min(props.max_zoom, Math.max(props.min_zoom, z.value + step));
    if (nz === z.value) return;
    const ax = anchor ? anchor.x : size.value.w / 2;
    const ay = anchor ? anchor.y : size.value.h / 2;
    const lng = x_to_lng(ox.value + ax, z.value);
    const lat = y_to_lat(oy.value + ay, z.value);
    z.value = nz;
    ox.value = lng_to_x(lng, nz) - ax;
    oy.value = lat_to_y(lat, nz) - ay;
    clamp();
}

/** 把某一经纬度挪到视口正中（定位复位用） */
function set_center(lat, lng, zoom) {
    if (zoom != null) z.value = Math.min(props.max_zoom, Math.max(props.min_zoom, zoom));
    ox.value = lng_to_x(lng, z.value) - size.value.w / 2;
    oy.value = lat_to_y(lat, z.value) - size.value.h / 2;
    clamp();
}

/**
 * 自动框住一组点位：选一个能全装下的层级，并让点位落在「去掉浮层后的可视区」中央
 * @param {Array<Object>} points 带 lat/lng 的点位
 * @param {{top?:number,right?:number,bottom?:number,left?:number}} [pad] 四周被浮层遮挡的像素
 */
function fit(points, pad) {
    const list = (points || []).filter((p) => Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lng)));
    if (!list.length || !size.value.w || !size.value.h) return;
    const p = { top: 0, right: 0, bottom: 0, left: 0, ...(pad || {}) };
    const w = Math.max(120, size.value.w - p.left - p.right);
    const h = Math.max(120, size.value.h - p.top - p.bottom);
    // 气泡本身有宽高，按 96×64 预留，避免缩放到刚好卡边导致标签互相压住
    const gap_x = 48;
    const gap_y = 24;

    let zz = props.min_zoom;
    for (let i = props.max_zoom; i >= props.min_zoom; i -= 1) {
        const xs = list.map((m) => lng_to_x(Number(m.lng), i));
        const ys = list.map((m) => lat_to_y(Number(m.lat), i));
        if (Math.max(...xs) - Math.min(...xs) + gap_x <= w && Math.max(...ys) - Math.min(...ys) + gap_y <= h) {
            zz = i;
            break;
        }
    }
    z.value = Math.min(zz, props.fit_max_zoom);

    const xs = list.map((m) => lng_to_x(Number(m.lng), z.value));
    const ys = list.map((m) => lat_to_y(Number(m.lat), z.value));
    const cx = (Math.max(...xs) + Math.min(...xs)) / 2;
    const cy = (Math.max(...ys) + Math.min(...ys)) / 2;
    ox.value = cx - (p.left + w / 2);
    oy.value = cy - (p.top + h / 2);
    clamp();
}

const tiles = computed(() => {
    const { w, h } = size.value;
    if (!w || !h) return [];
    const n = 2 ** z.value;
    const x0 = Math.floor(ox.value / TILE);
    const x1 = Math.floor((ox.value + w - 1) / TILE);
    const y0 = Math.max(0, Math.floor(oy.value / TILE));
    const y1 = Math.min(n - 1, Math.floor((oy.value + h - 1) / TILE));
    const out = [];
    for (let ty = y0; ty <= y1; ty += 1) {
        for (let tx = x0; tx <= x1; tx += 1) {
            const wx = ((tx % n) + n) % n; // 横向世界循环
            const left = tx * TILE - ox.value;
            const top = ty * TILE - oy.value;
            out.push({
                key: `${z.value}/${tx}/${ty}`,
                src: tile_url(wx, ty, z.value),
                style: { transform: `translate3d(${left}px, ${top}px, 0)` },
            });
        }
    }
    return out;
});

// 加载计数（只用于判断底图是否整体不可用）
let ok_count = 0;
let err_count = 0;
let failed = false;

/** 瓦片加载成功：用于判断底图可用 */
function on_tile_load() {
    ok_count += 1;
    if (!failed && ok_count === 3) emit('ready');
}

/**
 * 瓦片加载失败：连续失败且从未成功过 → 判为底图不可用（父级回退静态图）
 */
function on_tile_error() {
    err_count += 1;
    if (!failed && ok_count === 0 && err_count >= 6) {
        failed = true;
        emit('fail');
    }
}

/** 标记投影：屏幕外（含余量）的点不渲染，省 DOM */
const shown = computed(() => {
    const { w, h } = size.value;
    const out = [];
    for (const m of props.markers) {
        const lat = Number(m.lat);
        const lng = Number(m.lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
        const px = lng_to_x(lng, z.value) - ox.value;
        const py = lat_to_y(lat, z.value) - oy.value;
        if (px < -90 || px > w + 90 || py < -90 || py > h + 130) continue;
        out.push({ id: m.id ?? `${lat},${lng}`, px, py, data: m });
    }
    return out;
});

/* ---------------- 交互：拖动 / 滚轮 / 双击 / 双指 ---------------- */

const pointers = new Map();
// 用户是否手动动过视野：动过之后容器尺寸变化不再自动重新框选，免得把手动视角冲掉
let touched = false;
let pinch = null;

/**
 * 按下：单指进入拖动，双指进入捏合
 * @param {PointerEvent} e
 */
function on_down(e) {
    if (e.button != null && e.button !== 0) return;
    if (e.target.closest('.tmap-ui')) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, applied: 1 };
        drag = null;
        dragging.value = false;
        return;
    }
    grabbing.value = true;
    drag = { x: e.clientX, y: e.clientY, ox: ox.value, oy: oy.value };
    wrap.value?.setPointerCapture?.(e.pointerId);
}

/**
 * 移动：平移视野，或双指按距离变化分级缩放
 * @param {PointerEvent} e
 */
function on_move(e) {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.size >= 2 && pinch) {
        const [a, b] = [...pointers.values()];
        const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
        const ratio = dist / pinch.dist / pinch.applied;
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        if (ratio > 1.35) {
            zoom_by(1, local_point(mid));
            pinch.applied *= 2;
        } else if (ratio < 0.72) {
            zoom_by(-1, local_point(mid));
            pinch.applied /= 2;
        }
        return;
    }
    if (!drag) return;
    dragging.value = true;
    touched = true;
    ox.value = drag.ox - (e.clientX - drag.x);
    oy.value = drag.oy - (e.clientY - drag.y);
    clamp();
}

/**
 * 抬起：结束拖动 / 捏合
 * @param {PointerEvent} e
 */
function on_up(e) {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    if (pointers.size === 0) {
        dragging.value = false;
        grabbing.value = false;
        drag = null;
    }
}

/**
 * 把页面坐标转成组件内坐标
 * @param {{x:number,y:number}} p
 */
function local_point(p) {
    const box = wrap.value?.getBoundingClientRect();
    return box ? { x: p.x - box.left, y: p.y - box.top } : { x: size.value.w / 2, y: size.value.h / 2 };
}

/**
 * 滚轮缩放：向上放大（触控板捏合也走这里）
 * @param {WheelEvent} e
 */
function on_wheel(e) {
    touched = true;
    zoom_by(e.deltaY < 0 ? 1 : -1, local_point({ x: e.clientX, y: e.clientY }));
}

/**
 * 双击放大（以点击处为锚点）
 * @param {MouseEvent} e
 */
function on_dblclick(e) {
    touched = true;
    zoom_by(1, local_point({ x: e.clientX, y: e.clientY }));
}

/* ---------------- 生命周期 ---------------- */

let ro = null;

onMounted(async () => {
    await nextTick();
    const el = wrap.value;
    if (!el) return;
    const box = el.getBoundingClientRect();
    size.value = { w: Math.round(box.width), h: Math.round(box.height) };
    set_center(props.lat, props.lng, props.zoom);
    ro = new ResizeObserver(() => {
        const b = el.getBoundingClientRect();
        if (!b.width || !b.height) return;
        size.value = { w: Math.round(b.width), h: Math.round(b.height) };
        clamp();
        // 转屏 / 拉伸窗口后重新框选（用户自己拖过就不打扰）
        if (!touched) emit('resize');
    });
    ro.observe(el);
});

onBeforeUnmount(() => ro?.disconnect());

// 外部改中心点（如切换区域后飞过去）
watch(() => [props.lat, props.lng], ([la, ln]) => set_center(la, ln));

defineExpose({ set_center, zoom_by, fit });
</script>

<style scoped>
.tmap {
    position: absolute;
    inset: 0;
    overflow: hidden;
    background: #EAE6DC;
    cursor: grab;
    touch-action: none; /* 禁止浏览器接管手势，交给组件自己处理拖动/捏合 */
    user-select: none;
}
.tmap.grabbing { cursor: grabbing; }
.tmap-tiles { position: absolute; inset: 0; }
.tmap-tile {
    position: absolute;
    top: 0;
    left: 0;
    width: 256px;
    height: 256px;
    pointer-events: none;
    user-select: none;
    -webkit-user-drag: none;
}
.tmap-pins { position: absolute; inset: 0; pointer-events: none; }
.tmap-pin {
    position: absolute;
    transform: translate(-50%, -100%);
    pointer-events: auto;
    cursor: pointer;
    z-index: 2;
}
/* 缩放按钮：桌面端图纸风格，移动端隐藏（双指缩放） */
.tmap-zoom {
    position: absolute;
    right: 10px;
    top: 112px;
    display: flex;
    flex-direction: column;
    border-radius: 10px;
    overflow: hidden;
    background: var(--paper);
    box-shadow: 0 2px 10px rgba(140, 110, 60, 0.2);
    z-index: 4;
}
.tmap-zoom button {
    width: 34px;
    height: 32px;
    border: none;
    background: transparent;
    color: #5C4A2E;
    font-size: 17px;
    font-weight: 700;
    line-height: 1;
    font-family: inherit;
    cursor: pointer;
}
.tmap-zoom button + button { border-top: 1px solid var(--line); }
.tmap-zoom button:hover { background: #FBF3DC; color: var(--brand-dark); }
@media (max-width: 768px) {
    .tmap-zoom { display: none; }
}
</style>
