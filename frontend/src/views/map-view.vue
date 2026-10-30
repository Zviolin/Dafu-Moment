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
            <div ref="map_el" class="map-canvas" aria-label="福州大学旗山校区美食地图"></div>

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
                                <span><b class="score-num">{{ active.station_count ?? 0 }}</b> 档口</span>
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
 * 校内美食地图：高德 JS API 2.0 官方矢量渲染（r42 起，免手拼栅格瓦片）——
 * 文字/图标矢量绘制任意缩放锐利，自带完整中文注记；GCJ-02 坐标与 DB 无缝衔接。
 * 食区标记锚定真实 POI 坐标（高德官方点/官方数据集/POI 库火星坐标），楼栋级为近似落点；?focus=id 直达定位并弹出详情卡
 */
import { ref, onMounted, onBeforeUnmount, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Close, Location, Search } from '@element-plus/icons-vue';
import { api_content } from '../api';
import { fmt_score, CANTEEN_TYPE_NAME } from '../utils/format';
import { load_amap, pin_html, AMAP_CENTER } from '../utils/amap';

const route = useRoute();
const router = useRouter();
const canteens = ref([]);
const active = ref(null);
const map_el = ref(null);
const keyword = ref('');
const active_type = ref('all');

// 筛选类型：与真实点位类型对齐（0 食堂 / 2 学生街 / 3 周边其他）
const FILTERS = [
    { label: '全部', type: 'all', img: '/assets/icons/scene-canteen.png' },
    { label: '食堂', type: 0, img: '/assets/icons/scene-canteen.png' },
    { label: '学生街', type: 2, img: '/assets/icons/scene-mall.png' },
    { label: '周边', type: 3, img: '/assets/icons/scene-sichu.png' },
];

// 食区默认落点（GCJ-02 火星坐标）：餐厅名取自福大后勤管理处官网公告（hqc.fzu.edu.cn）。
// 仅作 DB 无坐标时的兜底——后台「地图点位」拖拽校准后以前端 DB 值为准。
// 注意美岐必须用火星坐标（poi86 火星 119.191987,26.059497），误用大地坐标 119.187,26.063 会偏约 500 米
const PIN_POS = [
    // 生活一区（丁香园·学府北路福大生活1区：119.192162,26.056662）· 海棠园一楼
    { kw: '京元', lat: 26.0567, lng: 119.1927, short: '京元' },
    // 丁香园·临青春广场（生活一区中南部，锚点以南数十米）
    { kw: '丁香园', lat: 26.0559, lng: 119.1920, short: '丁香园' },
    // 丹桂园朝阳餐厅（原丁香园二楼楼群，丁香园西北侧近似）
    { kw: '朝阳', lat: 26.0565, lng: 119.1914, short: '朝阳' },
    // 玫瑰园·生活三区大门旁，与紫荆园并排（临生活二区）
    { kw: '玫瑰园', lat: 26.0523, lng: 119.1917, short: '玫瑰园' },
    // 紫荆园（捷祥）·生活三区（百度系 26.05867,119.198516 → GCJ-02 26.0528,119.1926）
    { kw: '紫荆园', lat: 26.0528, lng: 119.1926, short: '紫荆园' },
    // 桃李园·教学区东三教学楼旁（图书馆主馆官方 26.056812,119.198453 西侧教学区，楼栋级近似）
    { kw: '桃李园', lat: 26.0576, lng: 119.1962, short: '桃李园' },
    // 佳客来西餐厅·源库 map_location 无此点，仅作地图兜底示意（与桃李园同片区，待实地校准）
    { kw: '佳客来', lat: 26.057, lng: 119.194, short: '佳客来' },
    // 紫竹园到口餐厅·源库 map_location 无此点，仅作地图兜底示意（生活三区北侧，待实地校准）
    { kw: '紫竹园', lat: 26.053, lng: 119.192, short: '紫竹园' },
    // 美岐学生街·岐安村福大学生街（poi86 火星坐标：119.191987,26.059497）
    { kw: '美岐', lat: 26.0595, lng: 119.1920, short: '美岐学生街' },
];

const pins = ref([]);
let map = null;
const markers = [];
const marker_pins = [];

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

/**
 * 按类型 + 关键字过滤地图标记，并自适应视野
 */
function apply_filter() {
    if (!map) return;
    const kw = keyword.value.trim().toLowerCase();
    const visible = [];
    let active_visible = false;
    markers.forEach((m, i) => {
        const p = marker_pins[i];
        const type_ok = active_type.value === 'all' || Number(p.type) === Number(active_type.value);
        const tags = Array.isArray(p.tags) ? p.tags.join(' ') : '';
        const hay = `${p.name || ''} ${p.location || ''} ${tags}`.toLowerCase();
        const kw_ok = !kw || hay.includes(kw);
        const show = type_ok && kw_ok;
        m.setMap(show ? map : null);
        if (show) {
            visible.push(m);
            if (active.value && Number(p.id) === Number(active.value.id)) active_visible = true;
        }
    });
    // 当前详情卡对应点位被筛掉时收起卡片并复位标记
    if (active.value && !active_visible) {
        active.value = null;
        markers.forEach((m) => m.setContent(pin_html()));
    }
    if (visible.length) map.setFitView(visible, false, [42, 42, 42, 42], 16);
}

watch([keyword, active_type], apply_filter);

/**
 * 打开标记详情卡（focus 直达时视角移动过去）
 * @param {Object} p
 * @param {boolean} fly
 */
function open_pin(p, fly = false) {
    active.value = p;
    markers.forEach((m, i) => m.setContent(pin_html({ on: Number(marker_pins[i].id) === Number(p.id) })));
    if (fly && map) map.setZoomAndCenter(17, [p.lng, p.lat]);
}

/**
 * 关闭详情卡并复位标记
 */
function close_card() {
    active.value = null;
    markers.forEach((m) => m.setContent(pin_html()));
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
    canteens.value = await api_content.canteens();
    // 坐标优先级：DB（后台拖拽校准值）> PIN_POS 关键字兜底；两者皆无才顺排沿线
    const placed = [];
    const rest = [];
    for (const c of canteens.value) {
        const pos = PIN_POS.find((p) => c.name.includes(p.kw));
        const db_pos = (c.lat != null && c.lng != null) ? { lat: Number(c.lat), lng: Number(c.lng) } : null;
        if (pos) placed.push({ ...c, short: pos.short, ...(db_pos || { lat: pos.lat, lng: pos.lng }) });
        else if (db_pos) placed.push({ ...c, short: c.name.slice(0, 3), ...db_pos });
        else rest.push(c);
    }
    rest.forEach((c, i) => placed.push({ ...c, lat: 26.0602 + i * 0.0008, lng: 119.1940 - i * 0.0012, short: c.name.slice(0, 3) }));
    pins.value = placed;

    // 初始化高德矢量地图（GCJ-02 原生，key/密钥走 .env 环境变量）
    const AMap = await load_amap();
    map = new AMap.Map(map_el.value, { center: AMAP_CENTER, zoom: 16, viewMode: '2D' });
    // 缩放工具条放右下（信息卡已移至底部悬浮，不再占用右上）
    map.addControl(new AMap.ToolBar({ position: 'RB' }));

    // 食区标记（品牌橙水滴 pin，AMap 坐标序 [lng, lat]）+ 全点位自适应视野
    pins.value.forEach((p) => {
        const m = new AMap.Marker({
            position: [p.lng, p.lat],
            content: pin_html(),
            anchor: 'bottom-center', // 水滴尖对准坐标点
            title: p.name,
            map,
        });
        m.on('click', () => open_pin(p));
        markers.push(m);
        marker_pins.push(p);
    });
    // 自适应含全部标记的视野（四边留白 42px，最大 z16）
    map.setFitView(null, false, [42, 42, 42, 42], 16);

    // 支持 /map?focus=id 直达定位并弹出详情卡
    const focusId = Number(route.query.focus);
    if (focusId) {
        const p = pins.value.find((x) => x.id === focusId);
        if (p) open_pin(p, true);
    }
});

onBeforeUnmount(() => {
    if (map) {
        map.destroy();
        map = null;
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
/* isolation 隔离高德内部高 z-index，避免盖住吸顶导航；flex:1 让卡片撑满剩余高度 */
.map-body { position: relative; padding: 10px; isolation: isolate; z-index: 0; flex: 1; display: flex; }
/* 高德 2.0 自带容器尺寸监听，视口变化自动适配；min-height 兜底矮视口可用性 */
.map-canvas { flex: 1; min-height: 460px; border-radius: 12px; border: 1px solid var(--line); z-index: 0; }

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
    .map-canvas { min-height: 380px; }
    .pin-card { left: 12px; right: 12px; bottom: 12px; }
    .pc-main { align-items: stretch; flex-direction: column; gap: 10px; }
    .pc-btn { width: 100%; }
}

/* ===== 桌面适配（≥769）===== */
@media (min-width: 769px) {
    /* 地图画布：桌面加高到视口主导高度（保持 flex 填充体系，min-height 仅兜底下限） */
    .map-canvas { min-height: calc(100vh - 220px); }
    /* 底部悬浮信息卡：桌面限宽居中（left/right + margin auto，避免与弹出动画的 transform 冲突） */
    .pin-card {
        left: 0; right: 0; margin-left: auto; margin-right: auto;
        width: min(560px, calc(100% - 32px));
    }
}
</style>
