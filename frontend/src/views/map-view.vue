<template>
    <div class="page-wrap map-page">
        <div class="map-head">
            <h2 class="highlight-mark">食堂档口导览图</h2>
            <span class="map-note">底图 © 高德地图 · 点位基于真实 POI 坐标标注 · 点击标记查看食区</span>
        </div>

        <!-- 点位搜索：按名称 / 位置 / 标签筛选标记 -->
        <div class="map-tools card">
            <el-input
                v-model="keyword" class="map-search" size="small" clearable
                placeholder="搜索点位名称或位置，如「京元食堂」「学生街」"
            >
                <template #prefix><el-icon :size="14"><Search /></el-icon></template>
            </el-input>
        </div>

        <div class="map-body card">
            <tile-map
                ref="map_ref" class="map-canvas"
                :lat="MAP_CENTER.lat" :lng="MAP_CENTER.lng" :zoom="16"
                :markers="visible_pins"
                @marker-click="open_pin" @ready="fit_all" @resize="fit_all"
            >
                <template #marker="{ m }">
                    <span v-html="pin_html({ on: !!active && Number(active.id) === Number(m.id) })" />
                </template>
            </tile-map>

            <!-- 底部悬浮信息卡（P08 对齐：点位名 / 评分 / 营业状态 / 查看档口） -->
            <transition name="card-pop">
                <aside v-if="active" class="pin-card card">
                    <button class="pc-close" @click="close_card"><el-icon :size="14"><Close /></el-icon></button>
                    <div class="pc-main">
                        <div class="pc-info">
                            <div class="pc-title-row">
                                <span class="pc-title">{{ active.name }}</span>
                                <!-- 公开列表仅返回 enabled=1（在架）点位，「营业中」由上架状态推导 -->
                                <span class="pc-open"><i></i>营业中</span>
                            </div>
                            <div class="pc-loc"><el-icon :size="13"><Location /></el-icon>{{ active.location }}</div>
                            <div class="pc-stats">
                                <span class="pc-score">
                                    <svg class="pc-star" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4 6.1 20.5l1.2-6.5L2.5 9.4l6.6-.9z" /></svg>
                                    <b class="score-num" :class="active.avg_score ? '' : 'dim'">{{ active.avg_score ? fmt_score(active.avg_score) : '—' }}</b>
                                </span>
                                <span><b class="score-num">{{ active.station_count ?? active.stations_count ?? 0 }}</b> 档口</span>
                                <span class="chip">{{ type_name(active.type) }}</span>
                            </div>
                        </div>
                        <el-button type="primary" size="small" class="pc-btn" @click="go_detail(active)">查看档口</el-button>
                    </div>
                </aside>
            </transition>
        </div>

        <!-- 类型筛选：点击切换，与地图标记联动（真实类型：食堂 / 学生街 / 周边） -->
        <div class="legend">
            <button
                v-for="g in FILTERS" :key="g.label" class="legend-chip"
                :class="{ on: active_type === g.type }"
                @click="set_type(g.type)"
            >
                <img :src="g.img" :alt="g.label" />{{ g.label }}
                <i class="cnt">{{ count_of(g.type) }}</i>
            </button>
        </div>
    </div>
</template>

<script setup>
/**
 * 校内美食地图：自绘瓦片地图（tile-map 组件，高德官方栅格底图，不吃 JS API key）。
 * 食区标记锚定真实 POI 坐标（GCJ-02），楼栋级为近似落点；?focus=id 直达定位并弹出详情卡
 */
import { ref, computed, onMounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Close, Location, Search } from '@element-plus/icons-vue';
import { api_content } from '../api';
import { fmt_score, CANTEEN_TYPE_NAME } from '../utils/format';
import { pin_html, place_pins } from '../utils/amap';
import TileMap from '../components/tile-map.vue';

const route = useRoute();
const router = useRouter();
const canteens = ref([]);
const active = ref(null);
const map_ref = ref(null);
const keyword = ref('');
const active_type = ref('all');

// 筛选类型：与真实点位类型对齐（0 食堂 / 2 学生街 / 3 周边其他）
const FILTERS = [
    { label: '全部', type: 'all', img: '/assets/icons/scene-canteen.png' },
    { label: '食堂', type: 0, img: '/assets/icons/scene-canteen.png' },
    { label: '学生街', type: 2, img: '/assets/icons/scene-mall.png' },
    { label: '周边', type: 3, img: '/assets/icons/scene-sichu.png' },
];

const pins = ref([]);
/** 地图初始中心（GCJ-02，福州大学旗山校区） */
const MAP_CENTER = { lat: 26.0568, lng: 119.1961 };

/**
 * 点位类型名（0 校内食堂 / 1 永嘉天地 / 2 学生街 / 3 周边其他 / 4 外卖）
 * @param {number} t
 */
function type_name(t) {
    return CANTEEN_TYPE_NAME[t] ?? '点位';
}

/**
 * 某筛选类型下的点位数（「全部」返回总数）
 * @param {string|number} type
 * @returns {number}
 */
function count_of(type) {
    if (type === 'all') return pins.value.length;
    return pins.value.filter((p) => Number(p.type) === Number(type)).length;
}

/**
 * 切换类型筛选
 * @param {string|number} type
 */
function set_type(type) {
    active_type.value = type;
}

/** 当前筛选（类型 + 关键词）下要显示的点位，直接喂给地图组件 */
const visible_pins = computed(() => {
    const kw = keyword.value.trim().toLowerCase();
    return pins.value.filter((p) => {
        const type_ok = active_type.value === 'all' || Number(p.type) === Number(active_type.value);
        const tags = Array.isArray(p.tags) ? p.tags.join(' ') : '';
        const hay = `${p.name || ''} ${p.location || ''} ${tags}`.toLowerCase();
        return type_ok && (!kw || hay.includes(kw));
    });
});

/** 让地图框住当前可见点位 */
function fit_all() {
    map_ref.value?.fit(visible_pins.value, { top: 44, right: 44, bottom: 44, left: 44 });
}

// 筛选变化：视野跟着缩放；当前详情卡的点位被筛掉时收起卡片
watch([keyword, active_type], () => {
    if (active.value && !visible_pins.value.some((p) => Number(p.id) === Number(active.value.id))) active.value = null;
    fit_all();
});

/**
 * 打开标记详情卡（focus 直达时视角移动过去）
 * @param {Object} p
 * @param {boolean} [fly]
 */
function open_pin(p, fly = false) {
    active.value = p;
    if (fly) map_ref.value?.set_center(Number(p.lat), Number(p.lng), 17);
}

/** 关闭详情卡 */
function close_card() {
    active.value = null;
}

/**
 * 查看点位下的档口：当前标记均为食区/食堂点位 → /canteen/:id；
 * 独立档口标记（kind=station）走 /station/:id
 * @param {Object} p
 */
function go_detail(p) {
    router.push(p.kind === 'station' ? `/station/${p.id}` : `/canteen/${p.id}`);
}

onMounted(async () => {
    const data = await api_content.canteens();
    const list = Array.isArray(data) ? data : (data?.list || []);
    pins.value = place_pins(list);

    // 支持 /map?focus=id 直达定位并弹出详情卡
    const focusId = Number(route.query.focus);
    if (focusId) {
        const p = pins.value.find((x) => x.id === focusId);
        if (p) open_pin(p, true);
    }
});
</script>

<style scoped>
/* r49.5 填充布局：页面吃满 app-main 剩余高度，地图卡随之增高（弃固定 560px），消除与页脚间大段空白 */
.map-page { flex: 1; display: flex; flex-direction: column; }
.map-head { display: flex; align-items: baseline; gap: 12px; margin-bottom: 12px; flex-wrap: wrap; }
.map-head h2 { margin: 0; font-size: 18px; }
.map-note { font-size: 12px; color: var(--ink-2); }
/* 搜索条：地图上方，按名称/位置/标签过滤标记 */
.map-tools { margin-bottom: 10px; padding: 8px 10px; }
.map-search { max-width: 420px; }
/* 地图卡：isolation 隔离底图内部层级，避免盖住吸顶导航；flex:1 撑满剩余高度 */
.map-body { position: relative; padding: 10px; isolation: isolate; z-index: 0; flex: 1; display: flex; min-height: 420px; }
/* 自绘瓦片地图是绝对定位的，用 inset 让它落在卡片内边距里并切圆角 */
.map-canvas { position: absolute; inset: 10px; border-radius: 12px; border: 1px solid var(--line); overflow: hidden; z-index: 0; }

/* 底部悬浮信息卡（桌面/移动端一致落底，浮于地图之上） */
.pin-card {
    position: absolute; left: 16px; right: 16px; bottom: 16px;
    padding: 14px 16px; z-index: 900;
    box-shadow: 0 8px 40px rgba(140, 110, 60, 0.18);
}
.pc-close {
    position: absolute; top: 8px; right: 8px; border: none; background: none;
    color: var(--ink-2); cursor: pointer; padding: 4px;
}
.pc-main { display: flex; align-items: center; gap: 14px; }
.pc-info { flex: 1; min-width: 0; }
.pc-title-row { display: flex; align-items: center; gap: 8px; min-width: 0; }
.pc-title { font-weight: 800; font-size: 16px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
/* 营业状态：绿点小签（语义色，仅状态徽标使用） */
.pc-open {
    display: inline-flex; align-items: center; gap: 4px; flex-shrink: 0;
    font-size: 10.5px; font-weight: 700; color: var(--good);
    background: #e4f3e6; padding: 1px 8px; border-radius: 6px;
}
.pc-open i { width: 6px; height: 6px; border-radius: 50%; background: var(--good); }
.pc-loc { display: flex; align-items: center; gap: 4px; color: var(--ink-2); font-size: 12px; margin-top: 4px; }
.pc-stats { display: flex; align-items: center; gap: 14px; font-size: 12px; color: var(--ink-2); margin-top: 8px; flex-wrap: wrap; }
.pc-stats b { font-size: 16px; margin-right: 2px; color: var(--ink); }
.pc-stats b.dim { color: var(--ink-2); font-weight: 400; }
.pc-score { display: inline-flex; align-items: center; }
/* 星形小图标：琥珀实底（对应 --star 分数色） */
.pc-star { width: 13px; height: 13px; color: var(--star); margin-right: 4px; flex-shrink: 0; }
.pc-btn { flex-shrink: 0; }

/* 卡片弹出动画 */
.card-pop-enter-active { transition: all .2s ease; }
.card-pop-leave-active { transition: all .15s ease; }
.card-pop-enter-from, .card-pop-leave-to { opacity: 0; transform: translateY(8px); }

/* 类型筛选 chip：可点击，选中态琥珀描边 */
.legend { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 12px; }
.legend-chip {
    display: inline-flex; align-items: center; gap: 6px;
    font-size: 11px; font-weight: 600; color: var(--ink-3);
    background: var(--paper); border: 1px solid var(--line);
    border-radius: var(--radius-sm); padding: 4px 10px;
    cursor: pointer; transition: border-color .12s ease, color .12s ease, background .12s ease;
}
.legend-chip:hover { border-color: var(--brand); }
.legend-chip.on { color: var(--brand-dark); border-color: var(--brand); background: var(--brand-light); }
.legend-chip img { width: 16px; height: 16px; object-fit: contain; display: block; }
.legend-chip .cnt { font-style: normal; font-size: 10px; color: var(--ink-2); }

@media (max-width: 768px) {
    /* 移动端高度由 flex 填充接管，min-height 兜底 */
    .map-body { min-height: 380px; }
    .pin-card { left: 12px; right: 12px; bottom: 12px; }
    .pc-main { align-items: stretch; flex-direction: column; gap: 10px; }
    .pc-btn { width: 100%; }
}

/* ===== 桌面适配（≥769）===== */
@media (min-width: 769px) {
    /* 地图卡：桌面加高到视口主导高度（保持 flex 填充体系，min-height 仅兜底下限） */
    .map-body { min-height: calc(100vh - 220px); }
    /* 底部悬浮信息卡：桌面限宽居中（left/right + margin auto，避免与弹出动画的 transform 冲突） */
    .pin-card {
        left: 0; right: 0; margin-left: auto; margin-right: auto;
        width: min(560px, calc(100% - 32px));
    }
}
</style>
