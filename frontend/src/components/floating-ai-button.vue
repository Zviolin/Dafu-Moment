<template>
    <!-- 全局悬浮 AI 助手快捷入口：小包子形象，默认贴左边缘垂直居中，可拖动 -->
    <div
        ref="root"
        class="ai-float"
        :class="{ dragging: is_dragging }"
        :style="pos_style"
        @pointerdown.prevent="on_down"
        @pointerup="on_up"
        @pointercancel="on_up"
        @click="on_click"
        role="button"
        aria-label="打开 AI 助手"
        title="AI 助手"
    >
        <!-- 小包子形象（用户提供的素材，已去白底：public/assets/icons/ai-float-bun.png） -->
        <img class="bun" src="/assets/icons/ai-float-bun.png" alt="" draggable="false" />
        <!-- 悬停提示 -->
        <span class="ai-float-label">AI 助手</span>
    </div>
</template>

<script setup>
/**
 * 全局悬浮 AI 助手入口
 * - 固定定位，默认贴左侧边缘垂直居中
 * - 可拖动（pointer 事件，区分点击与拖动）
 * - 点击跳转 /ai；位置写入 localStorage，刷新/换页后保留
 */
import { ref, reactive, computed, watch, onMounted, onBeforeUnmount } from 'vue';
import { useRouter } from 'vue-router';

/**
 * 满屏页（底部有抽屉）时给按钮留出的空间。
 * @prop {boolean} reserveSheet - 是不是满屏地图页；为真时直接量底部抽屉的顶边，比写死比例准
 * @prop {number} avoidBottom - 量不到抽屉时的兜底：底部被占的高度占视口高度的比例
 * @prop {number} avoidBottomPx - 兜底里再额外扣掉的像素（底部 tabbar）
 */
const props = defineProps({
    reserveSheet: { type: Boolean, default: false },
    avoidBottom: { type: Number, default: 0 },
    avoidBottomPx: { type: Number, default: 0 },
});

const router = useRouter();
const root = ref(null);

// 当前位置（x=左边缘像素，y=包子中心垂直坐标）
const pos = reactive({ x: 4, y: 0 });
// 拖动状态
const is_dragging = ref(false);
// 区分点击与拖动：拖动总位移阈值
const DRAG_THRESHOLD = 5;
let start = { px: 0, py: 0, x: 0, y: 0 };
let moved = 0;

// v2：换图后重置旧存档，保证默认落回左侧垂直居中
const STORE_KEY = 'fk_ai_float_pos_v2';

const pos_style = computed(() => ({
    left: pos.x + 'px',
    top: pos.y + 'px',
    transform: 'translateY(-50%)',
}));

/**
 * 可用的下边界：正常页面就是视口底部；满屏地图页要停在底部抽屉的上沿，
 * 否则默认落点会压在「附近推荐」的标题和把手上
 */
function bottom_limit() {
    const vh = window.innerHeight;
    if (props.reserveSheet) {
        const sheet = document.querySelector('.sheet');
        const top = sheet ? sheet.getBoundingClientRect().top : 0;
        if (top > 0) return Math.min(top, vh);
    }
    return vh * (1 - Math.min(Math.max(props.avoidBottom, 0), 0.9)) - props.avoidBottomPx;
}

/** 把位置限制在可视区内（有抽屉的页面下边界上移） */
function clamp() {
    const w = root.value?.offsetWidth || 58;
    const h = root.value?.offsetHeight || 58;
    const max_x = window.innerWidth - w;
    const min_y = h / 2;
    const max_y = Math.max(min_y, bottom_limit() - h / 2 - 10);
    pos.x = Math.min(Math.max(pos.x, 0), Math.max(0, max_x));
    pos.y = Math.min(Math.max(pos.y, min_y), max_y);
}

/** 用户有没有自己拖过；拖过才照他放的位置，没拖过就按每页的默认位置摆 */
let user_moved = false;

function save() {
    try {
        localStorage.setItem(STORE_KEY, JSON.stringify({ x: pos.x, y: pos.y, u: 1 }));
    } catch { /* 隐私模式等忽略 */ }
}

function restore() {
    try {
        const raw = localStorage.getItem(STORE_KEY);
        if (raw) {
            const v = JSON.parse(raw);
            if (typeof v.x === 'number' && typeof v.y === 'number') {
                pos.x = v.x;
                pos.y = v.y;
                user_moved = !!v.u; // 老存档没有 u，当作没拖过，回默认居中
            }
        }
    } catch { /* 坏数据忽略，回落默认 */ }
    if (!user_moved) pos.y = window.innerHeight / 2; // 默认左侧垂直居中
}

function on_down(e) {
    is_dragging.value = true;
    moved = 0;
    start.px = e.clientX;
    start.py = e.clientY;
    start.x = pos.x;
    start.y = pos.y;
    // 捕获指针，拖动到窗口外也不丢事件
    try { root.value.setPointerCapture(e.pointerId); } catch { /* 某些环境无此 API */ }
    window.addEventListener('pointermove', on_move);
}

function on_move(e) {
    if (!is_dragging.value) return;
    const dx = e.clientX - start.px;
    const dy = e.clientY - start.py;
    moved = Math.max(moved, Math.abs(dx) + Math.abs(dy));
    pos.x = start.x + dx;
    pos.y = start.y + dy;
    clamp();
}

function on_up(e) {
    if (!is_dragging.value) return;
    is_dragging.value = false;
    try { root.value.releasePointerCapture(e.pointerId); } catch { /* 忽略 */ }
    window.removeEventListener('pointermove', on_move);
    if (moved > DRAG_THRESHOLD) user_moved = true; // 真拖过才记住这个位置
    save();
}

/** 点击：仅当几乎没拖动时才算点击（避免拖完误触跳转） */
function on_click() {
    if (moved > DRAG_THRESHOLD) return;
    if (router.currentRoute.value.path === '/ai') return; // 已在 AI 页不重复跳
    router.push('/ai');
}

function on_resize() {
    if (!user_moved) pos.y = window.innerHeight / 2;
    clamp();
}

let timers = [];
/**
 * 延迟再收一次位置：满屏地图页的路由组件是懒加载的，
 * 挂载瞬间抽屉还没进 DOM，量不到它的上沿，只能等它渲染完再算
 */
function schedule_clamp() {
    if (!user_moved) pos.y = window.innerHeight / 2; // 没拖过：每页都回默认（居中，被抽屉顶上去）
    clamp();
    timers.forEach(clearTimeout);
    timers = [160, 400].map((ms) => setTimeout(clamp, ms));
}

onMounted(() => {
    restore();
    schedule_clamp();
    window.addEventListener('resize', on_resize);
});

// 路由在满屏页和普通页之间切换时，可用的下边界会变，重新收一次位置（不落盘，避免把临时收拢当成用户拖的位置）
watch(
    () => props.reserveSheet,
    () => schedule_clamp()
);

onBeforeUnmount(() => {
    timers.forEach(clearTimeout);
    window.removeEventListener('pointermove', on_move);
    window.removeEventListener('resize', on_resize);
});
</script>

<style scoped>
.ai-float {
    position: fixed;
    z-index: 9000;
    width: 58px;
    height: 58px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: grab;
    touch-action: none;          /* 触摸拖动不触发页面滚动 */
    user-select: none;
    -webkit-user-select: none;
    /* 无底托：透明底包子直接悬浮 */
    background: transparent;
    border: none;
}
.ai-float:active { cursor: grabbing; }
/* 拖动中关掉过渡，避免跟手延迟 */
.ai-float.dragging {
    transition: none;
    cursor: grabbing;
}
.bun {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: contain;
    pointer-events: none; /* 让指针事件落在容器上，拖动判定更稳 */
    filter: drop-shadow(0 4px 10px rgba(140, 110, 60, 0.35));
    transition: filter 0.15s ease, transform 0.15s ease;
}
.ai-float:hover .bun {
    filter: drop-shadow(0 6px 14px rgba(201, 138, 30, 0.5));
    transform: scale(1.08);
}
/* 悬停提示：包子正下方淡签 */
.ai-float-label {
    position: absolute;
    left: 50%;
    top: calc(100% + 4px);
    transform: translateX(-50%) scale(0.9);
    transform-origin: top center;
    white-space: nowrap;
    background: var(--paper);
    color: var(--ink);
    border: 1px solid var(--line);
    border-radius: var(--radius-sm);
    font-size: 12px;
    font-weight: 600;
    padding: 4px 9px;
    opacity: 0;
    pointer-events: none;
    box-shadow: var(--shadow-soft);
    transition: opacity 0.15s ease, transform 0.15s ease;
}
.ai-float:hover .ai-float-label {
    opacity: 1;
    transform: translateX(-50%) scale(1);
}
</style>
