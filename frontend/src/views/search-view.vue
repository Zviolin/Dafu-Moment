<template>
    <div class="search-page" :class="in_state_a ? 'map-mode' : 'list-mode'" :style="page_style">
        <!-- ============ 状态 A：满屏地图（对齐美团地图：浮层搜索 + 标签 + 气泡标记 + 底部推荐抽屉） ============ -->
        <template v-if="in_state_a">
            <!-- 地图铺满整页（进页面立刻可见，不再多一次跳转）；底图不可用时回退静态导览图 -->
            <div class="map-stage">
                <tile-map
                    v-if="!map_failed"
                    ref="map_ref"
                    :lat="MAP_CENTER.lat"
                    :lng="MAP_CENTER.lng"
                    :zoom="16"
                    :markers="area_pins"
                    @marker-click="open_canteen"
                    @ready="fit_map"
                    @resize="fit_map"
                    @fail="map_failed = true"
                >
                    <template #marker="{ m }">
                        <div class="bub" :class="{ dim: !Number(m.avg_score) }">
                            <b>{{ Number(m.avg_score) ? `${fmt_score(m.avg_score)}分` : '暂无评分' }}</b>
                            <span>{{ m.short || m.name }}</span>
                        </div>
                    </template>
                </tile-map>
                <img v-else src="/assets/bg/ai-map.jpg" alt="校园美食地图" class="map-fallback">
                <div class="map-brand">底图 © 高德地图 · 校园美食地图</div>

                <!-- 右侧竖排快捷入口（美团式：必吃榜 / 收藏）；抽屉拉高时让位给列表 -->
                <div v-show="sheet_level === 0" class="side-fabs">
                    <button class="fab" title="必吃榜" @click="$router.push('/rank')">
                        <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.4-.5-2-1-3-1.1-2.1-.2-4.1 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.2.4-2.3 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>
                        <span>必吃榜</span>
                    </button>
                    <button class="fab" title="收藏" @click="$router.push('/collection')">
                        <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.6l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.8 1-5.8L3.5 9.8l5.9-.9z"/></svg>
                        <span>收藏</span>
                    </button>
                </div>

                <!-- 回到校区中心 -->
                <button v-show="sheet_level === 0" class="locate-btn" title="回到校区中心" @click="recenter">
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="12" cy="12" r="6.2"/><path d="M12 2.6v3M12 18.4v3M2.6 12h3M18.4 12h3"/></svg>
                </button>
            </div>

            <!-- 顶部浮层：胶囊搜索框 + 区域标签 -->
            <div class="float-top">
                <div class="pill-search">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#B0A18A" stroke-width="1.7" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>
                    <input v-model="f.q" type="text" placeholder="搜索食堂、档口、菜品" @keyup.enter="do_search">
                    <el-icon v-if="f.q" class="pill-clear" :size="14" @click="clear_kw"><Close /></el-icon>
                </div>
                <div class="pill-chips">
                    <span v-for="a in AREAS" :key="a.key" class="pill-chip" :class="{ on: area === a.key }" @click="set_area(a.key)">{{ a.label }}</span>
                </div>
            </div>

            <!-- 底部抽屉：附近推荐（按住横条 / 标题栏上下拖，松手吸附到 46% · 72% · 92% 三档；轻点横条也能开合） -->
            <div class="sheet" :class="{ dragging: sheet_dragging }" ref="sheet_el">
                <div class="sheet-bar" @pointerdown="sheet_grab"><i></i></div>
                <div class="sheet-head" @pointerdown="sheet_grab">
                    <b>附近推荐</b>
                    <span class="sheet-more" @click.stop="set_sheet(1)">全部 ›</span>
                </div>
                <div class="sheet-list">
                    <div v-for="c in rec_list" :key="c.id" class="poi" @click="$router.push(`/canteen/${c.id}`)">
                        <img v-if="c.cover_object_key" class="poi-thumb" :src="cover_url(c.cover_object_key)" alt="" loading="lazy">
                        <div v-else class="poi-thumb img-fallback">{{ c.name.slice(0, 1) }}</div>
                        <div class="poi-main">
                            <div class="poi-name">{{ c.name }}</div>
                            <div class="poi-rate">
                                <span v-if="Number(c.avg_score)" class="poi-stars"><i v-for="n in 5" :key="n" :class="{ on: n <= stars_of(c) }">★</i></span>
                                <b v-if="Number(c.avg_score)" class="poi-score">{{ fmt_score(c.avg_score) }}</b>
                                <span v-else class="poi-none">暂无评分</span>
                                <span v-if="station_of(c)" class="poi-dim">{{ station_of(c) }} 档口</span>
                            </div>
                            <div class="poi-loc"><span class="poi-type">{{ CANTEEN_TYPE_NAME[c.type] ?? '点位' }}</span>{{ c.location }}</div>
                        </div>
                        <div class="poi-dist">{{ dist_text(c) }}</div>
                    </div>
                    <div v-if="!rec_list.length" class="poi-empty">该区域暂无点位</div>
                </div>
            </div>
        </template>

        <!-- ============ 状态 B：搜索结果列表态 ============ -->
        <template v-else>
            <!-- 顶部搜索条：回车 / 深色按钮触发搜索 -->
            <div class="search-top fade-up">
                <div class="search-input">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#B0A18A" stroke-width="1.7" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>
                    <input
                        v-model="f.q"
                        type="text"
                        placeholder="搜食堂、档口、菜品"
                        @keyup.enter="do_search"
                    >
                    <el-icon v-if="f.q" class="clear-ico" :size="14" @click="clear_kw"><Close /></el-icon>
                </div>
                <button class="sqbtn" @click="do_search">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#FFFDF5" stroke-width="1.7" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>
                </button>
            </div>
            <div v-if="f.category" class="cat-tag fade-up">
                品类：{{ f.category }}
                <el-icon class="cat-close" :size="12" @click="clear_category"><Close /></el-icon>
            </div>

            <!-- 统一搜索三分组：点位 / 档口 / 菜品（带命中类型签） -->
            <div v-if="uni.points.length" class="uni-group fade-up">
                <div class="uni-title">点位</div>
                <div class="uni-list">
                    <div v-for="p in uni.points" :key="`p${p.id}`" class="uni-item" @click="$router.push(`/canteen/${p.id}`)">
                        <span class="hit-tag">点位</span>
                        <b class="uni-name">{{ p.name }}</b>
                        <span class="uni-belong">{{ uni_belong(p) }}</span>
                        <span v-if="uni_score(p)" class="uni-score score-num" :style="{ color: score_color(uni_score(p)) }">{{ fmt_score(uni_score(p)) }}</span>
                    </div>
                </div>
            </div>
            <div v-if="uni.stations.length" class="uni-group fade-up">
                <div class="uni-title">档口</div>
                <div class="uni-list">
                    <div v-for="s in uni.stations" :key="`s${s.id}`" class="uni-item" @click="$router.push(`/station/${s.id}`)">
                        <span class="hit-tag">档口</span>
                        <b class="uni-name">{{ s.name }}</b>
                        <span class="uni-belong">{{ uni_belong(s) }}</span>
                        <span v-if="uni_score(s)" class="uni-score score-num" :style="{ color: score_color(uni_score(s)) }">{{ fmt_score(uni_score(s)) }}</span>
                    </div>
                </div>
            </div>
            <div v-if="uni.dishes.length" class="uni-group fade-up">
                <div class="uni-title">菜品</div>
                <div class="uni-list">
                    <div v-for="d in uni.dishes" :key="`d${d.id}`" class="uni-item" @click="$router.push(d.station_id ? `/station/${d.station_id}` : `/dish/${d.id}`)">
                        <span class="hit-tag">菜品</span>
                        <b class="uni-name">{{ d.name }}</b>
                        <span class="uni-belong">{{ uni_belong(d) }}</span>
                        <span v-if="uni_score(d)" class="uni-score score-num" :style="{ color: score_color(uni_score(d)) }">{{ fmt_score(uni_score(d)) }}</span>
                    </div>
                </div>
            </div>

            <!-- 排序 tabs + 筛选展开开关 -->
            <div class="tool-row fade-up">
                <div class="sort-tabs">
                    <span v-for="s in sorts" :key="s.key" class="sort-tab" :class="{ on: f.sort === s.key }" @click="set_sort(s.key)">{{ s.name }}</span>
                </div>
                <span class="filter-toggle" :class="{ on: filter_open }" @click="filter_open = !filter_open">
                    筛选
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>
                </span>
            </div>

            <!-- 筛选面板（可折叠）：点位类型 / 食堂 / 营业状态 / 品类 / 人均 / 口味 / 忌口 / 评分 / 推荐菜 -->
            <div v-if="filter_open" class="filter-panel card fade-up">
                <div v-if="type_options.length" class="f-group">
                    <div class="f-title">点位类型</div>
                    <div class="chip-row">
                        <span class="chip" :class="{ on: f.canteenType === null }" @click="set_canteen_type(null)">全部</span>
                        <span
                            v-for="t in type_options" :key="t.type"
                            class="chip" :class="{ on: f.canteenType === t.type }"
                            @click="set_canteen_type(t.type)"
                        >{{ CANTEEN_TYPE_NAME[t.type] }} {{ t.count }}</span>
                    </div>
                </div>
                <div class="f-group">
                    <div class="f-title">食堂</div>
                    <el-select v-model="f.canteenId" placeholder="全部食堂" clearable style="width: 100%" @change="do_search">
                        <el-option v-for="c in canteens" :key="c.id" :value="c.id" :label="short_name(c.name)" />
                    </el-select>
                </div>
                <div v-if="business_options.length > 1" class="f-group">
                    <div class="f-title">营业状态</div>
                    <div class="chip-row">
                        <span v-for="b in business_options" :key="b.value" class="chip" :class="{ on: f.businessStatus === b.value }" @click="set_business(b.value)">{{ b.label }} {{ b.count }}</span>
                    </div>
                </div>
                <div v-if="categories.length" class="f-group">
                    <div class="f-title">品类</div>
                    <div class="chip-row">
                        <span class="chip" :class="{ on: !f.category }" @click="clear_category">全部</span>
                        <span
                            v-for="c in categories" :key="c.name"
                            class="chip" :class="{ on: f.category === c.name }"
                            @click="set_category(c.name)"
                        >{{ c.name }} {{ c.count }}</span>
                    </div>
                </div>
                <div class="f-group">
                    <div class="f-title">人均价格</div>
                    <div class="chip-row">
                        <span
                            v-for="p in PRICE" :key="p.label"
                            class="chip" :class="{ on: f.priceMin === p.min && f.priceMax === p.max }"
                            @click="set_price(p)"
                        >{{ p.label }}</span>
                    </div>
                </div>
                <div class="f-group">
                    <div class="f-title">口味</div>
                    <div class="chip-row">
                        <span v-for="t in TASTE" :key="t" class="chip" :class="{ on: f.taste.includes(t) }" @click="toggle_tag('taste', t)">{{ t }}</span>
                    </div>
                </div>
                <div class="f-group">
                    <div class="f-title">忌口</div>
                    <div class="chip-row">
                        <span v-for="t in TABOO" :key="t" class="chip" :class="{ on: f.taboo.includes(t) }" @click="toggle_tag('taboo', t)">{{ t }}</span>
                    </div>
                </div>
                <div v-if="rating_options.length" class="f-group">
                    <div class="f-title">评分</div>
                    <div class="chip-row">
                        <span
                            v-for="r in rating_options" :key="r.min"
                            class="chip" :class="{ on: f.ratingMin === r.min }"
                            @click="set_rating(r.min)"
                        >≥{{ r.min }} 星 {{ r.count }}</span>
                    </div>
                </div>
                <div v-if="filter_meta.recommended > 0" class="f-group">
                    <div class="f-title">推荐</div>
                    <div class="chip-row">
                        <span class="chip" :class="{ on: f.recommended }" @click="toggle_recommended">只看推荐菜 {{ filter_meta.recommended }}</span>
                    </div>
                </div>
                <div class="filter-note">筛选项按当前在售菜品自动生成；暂无菜品的点位不展示</div>
                <el-button plain class="reset-btn" @click="reset">重置筛选</el-button>
            </div>

            <!-- 菜品结果网格 -->
            <div class="result-grid fade-up">
                <dish-card v-for="d in result.list" :key="d.id" :dish="d" />
            </div>

            <!-- 无结果：明确提示 + 热门引导（AC02 降级） -->
            <div v-if="!loading && result.list.length === 0 && has_no_result" class="empty-block">
                <div class="empty-main">没找到「{{ f.q }}」相关内容</div>
                <div class="empty-sub">已收录学生街与周边门店的完整菜单，以及 8 个校内食堂的 28 个档口（食堂档口菜品仍在完善），可先试试下面的真实热搜</div>
                <div class="wordrow center">
                    <span v-for="w in hot_guide" :key="w" class="word" @click="go_word(w)">{{ w }}</span>
                </div>
            </div>

            <div class="pager" v-if="result.total > 12">
                <el-pagination layout="prev, pager, next" :total="result.total" :page-size="12" v-model:current-page="f.page" @current-change="do_search" />
            </div>
        </template>
    </div>
</template>

<script setup>
/**
 * 搜索与地图页（美团地图式改版）：
 * 状态 A（无关键词）：满屏地图（tile-map，高德栅格底图）+ 顶部浮层搜索与区域标签 + 底部「附近推荐」抽屉
 * 状态 B（有关键词）：统一搜索三分组（点位/档口/菜品·带命中类型签）+ 筛选与排序 + 菜品结果
 * 业务逻辑沿用原版：search_all 统一搜索 + dishes 筛选 + URL 同步
 */
import { ref, reactive, computed, onMounted, watch, nextTick } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Close } from '@element-plus/icons-vue';
import { api_content } from '../api';
import { score_color, fmt_score, CANTEEN_TYPE_NAME, cover_url } from '../utils/format';
import { place_pins } from '../utils/amap';
import TileMap from '../components/tile-map.vue';
import DishCard from '../components/dish-card.vue';

const TASTE = ['偏辣', '清淡', '少油', '香辣', '咸鲜', '酸甜', '浓郁'];
const TABOO = ['清真', '素食', '无香菜', '无葱蒜'];
// 人均价格档（单选 chip，替代数字区间输入）
const PRICE = [
    { label: '不限', min: null, max: null },
    { label: '≤8元', min: null, max: 8 },
    { label: '8-12元', min: 8, max: 12 },
    { label: '12-18元', min: 12, max: 18 },
    { label: '18元以上', min: 18, max: null },
];
const sorts = [
    { key: 'comprehensive', name: '综合' },
    { key: 'new', name: '最新' },
    { key: 'hot', name: '热门' },
    { key: 'priceAsc', name: '价格↑' },
    { key: 'priceDesc', name: '价格↓' },
];

// 点位类型筛选项（按真实菜品数动态生成，避免出现「选了必空」的选项）
const type_options = ref([]);
// 筛选项可用性统计（推荐菜 / 营业状态 / 品类 / 评分档位）
const filter_meta = reactive({
    recommended: 0,
    business: { open: 0, closed: 0 },
    ratings: [],
});
// 只展示有真实数据的评分档位（≥4.5 无达标菜品时自动隐藏）
const rating_options = computed(() => filter_meta.ratings.filter((r) => Number(r.count) > 0));
// 营业状态（all 未下架全量 / open 营业中 / closed 休息中）
const BUSINESS = [
    { value: 'all', label: '全部' },
    { value: 'open', label: '营业中' },
    { value: 'closed', label: '休息中' },
];
// 只展示有真实菜品的营业状态选项（如「休息中」为 0 时自动隐藏）
const business_options = computed(() => BUSINESS
    .map((b) => ({ ...b, count: b.value === 'all' ? filter_meta.business.open + filter_meta.business.closed : filter_meta.business[b.value] }))
    .filter((b) => b.value === 'all' || b.count > 0));

// 热搜词：由后端 /search/hot 按真实数据生成（失败时回退到可命中的通用词）
const hot_words = ref(['夜宵', '早餐']);
// 无结果引导词与热搜同源，最多展示 4 个
const hot_guide = computed(() => hot_words.value.slice(0, 4));
// 品类 chips（/categories 聚合，取前 12 个）
const categories = ref([]);

// 本机搜索历史：仅记录不展示（历史词仍写入 localStorage，供后续版本恢复历史区用）
const HISTORY_KEY = 'dafu_search_history';
const HISTORY_MAX = 6;
// 历史词的运行时容器（push_search_history 读写都用它，从 localStorage 回填）
const search_history = ref([]);

const route = useRoute();
const router = useRouter();
const canteens = ref([]);
const loading = ref(false);
const result = ref({ list: [], total: 0 });
// 统一搜索三分组（点位/档口/菜品，有关键词时才请求）
const uni = ref({ points: [], stations: [], dishes: [] });
const filter_open = ref(false);
// 是否已执行过一次搜索（用于区分「无结果」与「尚未搜索」）
const searched = ref(false);

// 筛选状态（URL query 同步：可分享可回退）
const f = reactive({
    q: route.query.q || '',
    canteenId: route.query.canteenId ? Number(route.query.canteenId) : null,
    canteenType: route.query.canteenType !== undefined ? Number(route.query.canteenType) : null,
    category: route.query.category || null,
    priceMin: null, priceMax: null,
    taste: route.query.taste ? String(route.query.taste).split(',') : [],
    taboo: route.query.taboo ? String(route.query.taboo).split(',') : [],
    ratingMin: null,
    // 营业状态：all 全部 / open 营业中 / closed 休息中
    businessStatus: route.query.businessStatus || 'all',
    // 只看推荐菜（is_recommended=1）
    recommended: route.query.recommended === '1',
    sort: 'comprehensive', page: 1,
});

/** 是否处于「已搜索但无结果」状态（分组与菜品都为空） */
const has_no_result = computed(() => (
    searched.value
    && result.value.list.length === 0
    && !uni.value.points.length
    && !uni.value.stations.length
    && !uni.value.dishes.length
));

// ===== 地图首页态（状态 A）：区域标签 + 高德地图 + 推荐列表 =====
// 区域标签与点位类型对齐：推荐=全部，食堂=0 校内食堂，永嘉=1 永嘉天地，学生街=2 学生街
const AREAS = [
    { key: 'all', label: '推荐', type: 'all' },
    { key: 'canteen', label: '食堂', type: 0 },
    { key: 'yongjia', label: '永嘉', type: 1 },
    { key: 'street', label: '学生街', type: 2 },
];
const area = ref('all');
const map_ref = ref(null);
const sheet_el = ref(null);
const map_failed = ref(false);
/** 地图初始中心（GCJ-02，福州大学旗山校区） */
const MAP_CENTER = { lat: 26.0568, lng: 119.1961 };
// 地图点位（与 /map 同源落点逻辑，place_pins 见 utils/amap）
const pins = ref([]);
const rec_list = computed(() => {
    const a = AREAS.find((x) => x.key === area.value);
    const src = a.type === 'all' ? pins.value : pins.value.filter((p) => Number(p.type) === Number(a.type));
    return [...src].sort((x, y) => (Number(y.avg_score) || 0) - (Number(x.avg_score) || 0));
});
/** 地图上要画的点位：跟区域标签联动（与下方推荐列表同源） */
const area_pins = computed(() => {
    const a = AREAS.find((x) => x.key === area.value);
    return a.type === 'all' ? pins.value : pins.value.filter((p) => Number(p.type) === Number(a.type));
});

// 底部推荐抽屉：可上下拖，松手吸附到这三档高度（占总高比例）
// 最高档留出顶部搜索框的位置，不然拉满会把搜索和标签盖掉
const SHEET_STEPS = [0.46, 0.68, 0.80];
const sheet_level = ref(0);
// 拖动过程中用像素高度跟手，松手后交回百分比档位（走 CSS 过渡）
const sheet_px = ref(0);
const sheet_dragging = ref(false);
let sheet_drag = null;

/** 抽屉高度 → CSS 变量（抽屉本身和右侧悬浮按钮都靠 --sheet-h 定位） */
const page_style = computed(() => ({
    '--sheet-h': sheet_px.value ? `${sheet_px.value}px` : `${SHEET_STEPS[sheet_level.value] * 100}%`,
}));

/**
 * 按下抽屉把手 / 标题栏：开始拖
 * @param {PointerEvent} e
 */
function sheet_grab(e) {
    if (e.button != null && e.button !== 0) return;
    if (e.target.closest('.sheet-more')) return; // 「全部 ›」是按钮，不参与拖动
    const host = sheet_el.value?.parentElement;
    sheet_drag = {
        y: e.clientY,
        from: sheet_el.value?.offsetHeight || 0,
        moved: 0,
        max: host?.clientHeight || window.innerHeight,
    };
    sheet_dragging.value = true;
    window.addEventListener('pointermove', sheet_move);
    window.addEventListener('pointerup', sheet_release);
}

/**
 * 拖动中：实时改抽屉高度（跟手）
 * @param {PointerEvent} e
 */
function sheet_move(e) {
    if (!sheet_drag) return;
    const dy = sheet_drag.y - e.clientY;
    sheet_drag.moved = Math.max(sheet_drag.moved, Math.abs(dy));
    const h = sheet_drag.from + dy;
    sheet_px.value = Math.min(sheet_drag.max * 0.86, Math.max(sheet_drag.max * 0.24, h));
}

/** 松手：吸附到最近的一档；几乎没动就当成点击（开合） */
function sheet_release() {
    window.removeEventListener('pointermove', sheet_move);
    window.removeEventListener('pointerup', sheet_release);
    const d = sheet_drag;
    sheet_drag = null;
    sheet_dragging.value = false;
    if (!d) return;
    if (d.moved < 6) {
        set_sheet(sheet_level.value === 0 ? 1 : 0);
        return;
    }
    const ratio = sheet_px.value / d.max;
    let best = 0;
    SHEET_STEPS.forEach((lv, i) => {
        if (Math.abs(lv - ratio) < Math.abs(SHEET_STEPS[best] - ratio)) best = i;
    });
    set_sheet(best);
}

/**
 * 切到某一档高度（0 收起 / 1 半开 / 2 全开）
 * @param {number} i 档位下标
 */
function set_sheet(i) {
    sheet_px.value = 0;
    sheet_level.value = i;
    // 只有收回最小档才重新框地图：拉高时地图本来就快被盖住，
    // 跟着缩会把点位挤成一小坨，不如保持原来的视野。
    if (i === 0) setTimeout(fit_map, 250);
}

/**
 * 星级整数（评分四舍五入到整星，用于列表卡片 ★ 展示）
 * @param {Object} c
 */
function stars_of(c) {
    return Math.round(Number(c.avg_score) || 0);
}

/**
 * 档口数（后端不同接口字段名不一：station_count / stations_count）
 * @param {Object} c
 */
function station_of(c) {
    return c.station_count ?? c.stations_count ?? null;
}

/**
 * 点位到校区中心的球面距离（米）：GCJ-02 与底图同源，误差可忽略
 * @param {Object} p - 带 lat/lng 的点位
 */
function meters_from_center(p) {
    const R = 6371000;
    const rad = (d) => (d * Math.PI) / 180;
    const { lng: lng0, lat: lat0 } = MAP_CENTER;
    const d_lat = rad(Number(p.lat) - lat0);
    const d_lng = rad(Number(p.lng) - lng0);
    const a = Math.sin(d_lat / 2) ** 2
        + Math.cos(rad(lat0)) * Math.cos(rad(Number(p.lat))) * Math.sin(d_lng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(Math.min(1, a)));
}

/**
 * 距离文案（<1km 用米，否则一位小数公里；无坐标不显示）
 * @param {Object} c
 */
function dist_text(c) {
    if (c.lat == null || c.lng == null) return '';
    const m = meters_from_center(c);
    return m < 1000 ? `${Math.round(m)}m` : `${(m / 1000).toFixed(1)}km`;
}

/** 回到校区中心（定位按钮） */
function recenter() {
    fit_map();
}

/**
 * 让地图框住当前区域的所有点位（顶部搜索浮层 + 底部抽屉都要让开，否则点位被压住看不见）
 */
function fit_map() {
    // 等一帧再量：转屏/拉伸后布局刚变，立刻量会拿到旧尺寸，框出来的视野会偏大
    requestAnimationFrame(() => {
        const rect = sheet_el.value?.getBoundingClientRect();
        const bottom = rect ? Math.max(0, window.innerHeight - rect.top) + 12 : 360;
        // top 让开搜索框 + 标签行，再加上气泡自身高度，避免气泡钻到浮层底下
        map_ref.value?.fit(area_pins.value, { top: 132, right: 20, bottom, left: 20 });
    });
}

/**
 * 打开点位详情（地图气泡点击）
 * @param {Object} c 点位
 */
function open_canteen(c) {
    router.push(`/canteen/${c.id}`);
}

/**
 * 切换区域标签（联动地图标记与推荐列表）
 * @param {string} k
 */
function set_area(k) {
    area.value = k;
    fit_map();
}

/** 是否处于地图首页态（无关键词且无品类筛选） */
const in_state_a = computed(() => !f.q.trim() && !f.category);

/**
 * 记录一条搜索关键词（去重前置，最多保留 HISTORY_MAX 条）
 * @param {string} kw - 关键词
 */
function push_search_history(kw) {
    const t = String(kw || '').trim();
    if (!t) return;
    const next = [t, ...search_history.value.filter((x) => x !== t)].slice(0, HISTORY_MAX);
    search_history.value = next;
    try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
    } catch { /* 本地存储不可用则忽略 */ }
}

/**
 * 执行搜索并同步 URL（/dishes 筛选 + /search 统一搜索双路）
 */
async function do_search() {
    loading.value = true;
    searched.value = true;
    try {
        const params = { ...f, taste: f.taste.join(','), taboo: f.taboo.join(',') };
        if (f.q) push_search_history(f.q);
        const data = await api_content.dishes(params);
        result.value = data;
        // 统一搜索三分组（仅有关键词时）
        if (f.q) {
            uni.value = await api_content.search_all(f.q);
        } else {
            uni.value = { points: [], stations: [], dishes: [] };
        }
        // URL 同步（可分享）
        const q = { ...route.query };
        if (f.q) q.q = f.q; else delete q.q;
        if (f.canteenId) q.canteenId = f.canteenId; else delete q.canteenId;
        if (f.canteenType !== null) q.canteenType = f.canteenType; else delete q.canteenType;
        if (f.category) q.category = f.category; else delete q.category;
        if (f.taste.length) q.taste = f.taste.join(','); else delete q.taste;
        if (f.businessStatus !== 'all') q.businessStatus = f.businessStatus; else delete q.businessStatus;
        if (f.recommended) q.recommended = '1'; else delete q.recommended;
        history.replaceState(null, '', `/search?${new URLSearchParams(q)}`);
    } finally {
        loading.value = false;
    }
}

/**
 * 清空关键词回到搜索首页态
 */
function clear_kw() {
    f.q = '';
    searched.value = false;
    uni.value = { points: [], stations: [], dishes: [] };
}

/**
 * 词组点击：以该词执行搜索（写入 URL 与本机历史）
 * @param {string} t - 词组
 */
function go_word(t) {
    f.q = t;
    f.page = 1;
    do_search();
}

/**
 * 统一搜索行展示评分（点位 avg_score / 档口菜品 rating_avg，兼容字段命名波动）
 * @param {Object} item
 */
function uni_score(item) {
    return Number(item.avg_score ?? item.rating_avg) || 0;
}

/**
 * 统一搜索行展示所属（点位地址 / 档口食堂 / 菜品窗口）
 * @param {Object} item
 */
function uni_belong(item) {
    return item.location || item.canteen_name || item.station_name || '';
}

/**
 * 短食堂名
 */
function short_name(name) {
    return name.replace('旗山校区·', '');
}

/**
 * 标签切换
 * @param {string} field - taste|taboo
 * @param {string} t
 */
function toggle_tag(field, t) {
    const arr = f[field];
    const i = arr.indexOf(t);
    if (i >= 0) arr.splice(i, 1);
    else arr.push(t);
    do_search();
}

/**
 * 人均价格档（单选：重复点击或点「不限」即清空）
 * @param {{label:string,min:number|null,max:number|null}} p
 */
function set_price(p) {
    const same = f.priceMin === p.min && f.priceMax === p.max;
    // 仅「不限」档（min/max 同时为空）或重复点击当前档时才清空；≤8元、18元以上这类单边档必须正常赋值
    const is_all = p.min === null && p.max === null;
    if (same || is_all) {
        f.priceMin = null;
        f.priceMax = null;
    } else {
        f.priceMin = p.min;
        f.priceMax = p.max;
    }
    do_search();
}

/**
 * 评分档
 */
function set_rating(v) {
    f.ratingMin = f.ratingMin === v ? null : v;
    do_search();
}

/**
 * 切换排序
 * @param {string} key
 */
function set_sort(key) {
    f.sort = key;
    do_search();
}

/**
 * 清除品类筛选
 */
function clear_category() {
    f.category = null;
    do_search();
}

/**
 * 选中品类筛选项（重复点击即取消）
 * @param {string} name - 品类名
 */
function set_category(name) {
    f.category = f.category === name ? null : name;
    do_search();
}

/**
 * 点位类型筛选（null 为全部）
 * @param {number|null} t
 */
function set_canteen_type(t) {
    f.canteenType = f.canteenType === t ? null : t;
    do_search();
}

/**
 * 营业状态筛选
 * @param {string} v - all/open/closed
 */
function set_business(v) {
    f.businessStatus = v;
    do_search();
}

/**
 * 只看推荐菜开关
 */
function toggle_recommended() {
    f.recommended = !f.recommended;
    do_search();
}

/**
 * 重置
 */
function reset() {
    Object.assign(f, {
        q: '', canteenId: null, canteenType: null, category: null, priceMin: null, priceMax: null,
        taste: [], taboo: [], ratingMin: null, businessStatus: 'all', recommended: false,
        sort: 'comprehensive', page: 1,
    });
    do_search();
}

/**
 * 加载热搜词与筛选项元数据（失败静默降级，不阻塞搜索主流程）
 */
async function load_filters_meta() {
    try {
        const words = await api_content.hot_keywords();
        if (Array.isArray(words) && words.length) hot_words.value = words;
    } catch { /* 热搜接口不可用则保留兜底词 */ }
    try {
        const opt = await api_content.filter_options();
        if (opt && Array.isArray(opt.canteenTypes)) {
            // 只保留有真实菜品的点位类型（避免选择后必空）
            type_options.value = opt.canteenTypes.filter((t) => Number(t.count) > 0);
        }
        if (opt && opt.business) filter_meta.business = opt.business;
        if (opt && Number(opt.recommended) > 0) filter_meta.recommended = Number(opt.recommended);
        if (opt && Array.isArray(opt.ratings)) filter_meta.ratings = opt.ratings;
        categories.value = Array.isArray(opt && opt.categories) ? opt.categories.slice(0, 12) : [];
    } catch {
        // 元数据接口不可用时回落品类接口
        try {
            const rows = await api_content.categories();
            categories.value = Array.isArray(rows) ? rows.slice(0, 12) : [];
        } catch { categories.value = []; }
    }
    // URL 里残留了已无数据的筛选值时自动清掉，避免「一进来就空结果」
    if (type_options.value.length && f.canteenType !== null
        && !type_options.value.some((t) => t.type === f.canteenType)) {
        f.canteenType = null;
    }
    if (!filter_meta.recommended) f.recommended = false;
    if (f.ratingMin !== null && !rating_options.value.some((r) => Number(r.min) === Number(f.ratingMin))) {
        f.ratingMin = null;
    }
}

onMounted(async () => {
    load_filters_meta();
    // 回填本机搜索历史（只记录不展示）
    try {
        const raw = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
        if (Array.isArray(raw)) search_history.value = raw;
    } catch { /* 坏数据忽略 */ }
    try {
        const data = await api_content.canteens();
        // 接口 data 可能是 {list,total} 也可能是纯数组，两种都接住（否则地图点位会全空）
        const list = Array.isArray(data) ? data : (data?.list || []);
        canteens.value = list;
        pins.value = place_pins(list);
        nextTick(fit_map);
    } catch {
        canteens.value = [];
    }
    // 带关键词进入（如首页品类跳转）直接出结果，否则停在地图首页态
    if (f.q || f.category) await do_search();
});</script>

<style scoped>
/* ============================================================
   页面容器两态
   - map-mode：满屏地图，根节点吃满 app-main 剩余高度，内部全绝对定位
   - list-mode：搜索结果列表，回落常规居中列（等价原 .page-wrap）
   ============================================================ */
.search-page.map-mode {
    position: relative;
    flex: 1;
    min-height: 0;
    overflow: hidden;
    background: var(--page);
    /* 底部抽屉高度（地图上的悬浮元素都靠它算落点，展开时由 :has 切） */
    --sheet-h: 46%;
    /* 底部 tabbar 实际高度（含安全区），抽屉与悬浮按钮都要让开它 */
    --tab-h: calc(68px + env(safe-area-inset-bottom));
    /* 抽屉实际占掉的底部空间 */
    --sheet-off: calc(var(--sheet-h) + var(--tab-h));
}


.search-page.list-mode {
    max-width: 480px;
    margin: 0 auto;
    padding: 0 16px 32px;
}
@media (min-width: 769px) {
    .search-page.list-mode { max-width: 1080px; padding: 0 24px 48px; }
}

/* ===== 地图层：铺满整页（加载失败时用静态导览图兜底，不再二次跳转） ===== */
.map-stage {
    position: absolute;
    inset: 0;
    isolation: isolate; /* 隔离高德内部高 z-index，避免压住浮层 */
    z-index: 0;
}
.map-canvas { width: 100%; height: 100%; }
/* 地图气泡：评分胶囊 + 点位短名（锚点在气泡底部中心，指向真实坐标） */
.bub { display: flex; flex-direction: column; align-items: center; gap: 2px; }
.bub b {
    background: var(--brand);
    color: #FFFDF5;
    font-size: 11px;
    font-weight: 800;
    line-height: 1;
    padding: 4px 8px;
    border-radius: 999px;
    white-space: nowrap;
    box-shadow: 0 2px 6px rgba(140, 110, 60, 0.35);
}
.bub.dim b { background: #8B7B5E; }
.bub span {
    font-size: 10px;
    font-weight: 700;
    color: #5C4A2E;
    background: rgba(255, 253, 245, 0.94);
    padding: 2px 7px;
    border-radius: 6px;
    white-space: nowrap;
    box-shadow: 0 1px 3px rgba(140, 110, 60, 0.22);
}
.map-fallback { width: 100%; height: 100%; object-fit: cover; display: block; }
/* 左下角地图标识：始终贴在底部抽屉上沿外侧 */
.map-brand {
    position: absolute;
    left: 10px;
    bottom: calc(var(--sheet-off) + 10px);
    z-index: 5;
    font-size: 10.5px;
    font-weight: 600;
    color: #8A7B62;
    background: rgba(255, 253, 245, 0.9);
    padding: 2px 8px;
    border-radius: 6px;
    transition: bottom 0.22s ease;
}

/* ===== 右侧快捷入口（必吃榜 / 收藏）+ 定位按钮 ===== */
.side-fabs {
    position: absolute;
    right: 10px;
    bottom: calc(var(--sheet-off) + 68px);
    display: flex;
    flex-direction: column;
    gap: 8px;
    z-index: 5;
    transition: bottom 0.22s ease;
}
.fab {
    width: 48px;
    padding: 7px 0 5px;
    border: none;
    border-radius: 12px;
    background: var(--paper);
    color: #5C4A2E;
    box-shadow: 0 2px 10px rgba(140, 110, 60, 0.2);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 3px;
    font-size: 10px;
    font-weight: 700;
    font-family: inherit;
    cursor: pointer;
}
.fab:hover { color: var(--brand-dark); }
.locate-btn {
    position: absolute;
    right: 10px;
    bottom: calc(var(--sheet-off) + 14px);
    width: 44px;
    height: 44px;
    border: none;
    border-radius: 50%;
    background: var(--paper);
    color: var(--brand-dark);
    box-shadow: 0 2px 10px rgba(140, 110, 60, 0.2);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    z-index: 5;
    transition: bottom 0.22s ease;
}

/* ===== 顶部浮层：胶囊搜索框 + 区域标签 ===== */
.float-top {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    padding: 10px 12px 0;
    display: flex;
    flex-direction: column;
    gap: 9px;
    z-index: 8;
    pointer-events: none; /* 空白处不挡地图拖动 */
}
.float-top > * { pointer-events: auto; }
.pill-search {
    height: 42px;
    background: var(--paper);
    border-radius: 999px;
    box-shadow: 0 2px 12px rgba(140, 110, 60, 0.18);
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 15px;
}
.pill-search input {
    flex: 1;
    min-width: 0;
    border: none;
    outline: none;
    background: transparent;
    font-size: 13.5px;
    color: var(--ink);
    font-family: inherit;
}
.pill-search input::placeholder { color: var(--ink-2); }
.pill-clear { color: var(--ink-2); cursor: pointer; flex-shrink: 0; }
.pill-chips { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 2px; }
.pill-chips::-webkit-scrollbar { display: none; }
.pill-chip {
    flex-shrink: 0;
    height: 30px;
    padding: 0 15px;
    border-radius: 999px;
    background: var(--paper);
    box-shadow: 0 2px 8px rgba(140, 110, 60, 0.16);
    color: #5C4A2E;
    font-size: 12.5px;
    font-weight: 700;
    display: inline-flex;
    align-items: center;
    cursor: pointer;
    transition: background 0.12s ease, color 0.12s ease;
}
.pill-chip.on { background: var(--brand); color: #FFFDF5; box-shadow: 0 3px 10px rgba(201, 138, 30, 0.35); }

/* ===== 底部抽屉：附近推荐（移动端让开底部 tabbar） ===== */
.sheet {
    position: absolute;
    left: 0;
    right: 0;
    bottom: var(--tab-h, 62px); /* 底部 tabbar 高度，桌面端在 media 里归零 */
    height: var(--sheet-h);
    background: var(--paper);
    border-radius: 18px 18px 0 0;
    box-shadow: 0 -6px 26px rgba(140, 110, 60, 0.18);
    display: flex;
    flex-direction: column;
    z-index: 6;
    transition: height 0.22s ease;
}
/* 拖动中跟手，不能有过渡，否则会拖出「粘手」的滞后感 */
.sheet.dragging { transition: none; }
.sheet.dragging .sheet-bar i { background: var(--brand); }
.sheet-bar { padding: 7px 0 3px; display: flex; justify-content: center; cursor: grab; flex-shrink: 0; touch-action: none; }
.sheet-bar i { width: 34px; height: 4px; border-radius: 999px; background: var(--line); display: block; }
.sheet-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    padding: 2px 16px 8px;
    flex-shrink: 0;
    cursor: grab;
    touch-action: none; /* 拖抽屉时别让浏览器把手势当页面滚动 */
}
.sheet-head b { font-size: 15px; color: var(--ink); }
.sheet-more { font-size: 12px; color: var(--ink-2); cursor: pointer; }
.sheet-list { flex: 1; min-height: 0; overflow-y: auto; padding: 0 16px 14px; -webkit-overflow-scrolling: touch; }

/* 点位卡（美团式：缩略图 + 名称 + 星级评分 + 品类位置 + 距离） */
.poi {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 11px 0;
    border-bottom: 1px solid var(--line);
    cursor: pointer;
}
.poi:last-child { border-bottom: none; }
.poi:active { background: #FBF3DC; }
.poi-thumb { width: 74px; height: 74px; border-radius: 10px; object-fit: cover; flex-shrink: 0; display: block; }
.poi-main { flex: 1; min-width: 0; }
.poi-name { font-size: 15px; font-weight: 800; color: var(--ink); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.poi-rate { display: flex; align-items: center; gap: 7px; margin-top: 4px; flex-wrap: wrap; }
.poi-stars { display: inline-flex; gap: 1px; }
.poi-stars i { font-size: 12px; font-style: normal; color: #E7DFCE; line-height: 1; }
.poi-stars i.on { color: var(--star); }
.poi-score { font-size: 12.5px; color: var(--brand-dark); font-weight: 800; }
.poi-none { font-size: 11.5px; color: var(--ink-2); }
.poi-dim { font-size: 11.5px; color: var(--ink-2); }
.poi-loc {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 5px;
    font-size: 11.5px;
    color: var(--ink-2);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.poi-type { flex-shrink: 0; font-size: 10px; font-weight: 700; background: var(--brand-light); color: var(--ink-3); padding: 1px 6px; border-radius: 5px; }
.poi-dist { flex-shrink: 0; align-self: flex-start; font-size: 11.5px; color: var(--ink-2); }
.poi-empty { font-size: 12px; color: var(--ink-2); padding: 18px 0; text-align: center; }

/* ===== 顶部搜索条（搜索结果态）：纸面输入框 + 墨色方形搜索钮 ===== */
.search-top { display: flex; gap: 8px; padding-top: 8px; }
.search-input {
    flex: 1;
    height: 38px;
    background: var(--paper);
    border: 1px solid #E8D5C0;
    border-radius: var(--radius-sm);
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 12px;
}
.search-input input {
    flex: 1;
    min-width: 0;
    border: none;
    outline: none;
    background: transparent;
    font-size: 12.5px;
    color: var(--ink);
    font-family: inherit;
}
.search-input input::placeholder { color: var(--ink-2); }
.clear-ico { color: var(--ink-2); cursor: pointer; flex-shrink: 0; }
.sqbtn {
    width: 38px;
    height: 38px;
    border: none;
    border-radius: var(--radius-sm);
    background: var(--ink);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    cursor: pointer;
}

/* ===== 品类签 ===== */
.cat-tag {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    margin-top: 10px;
    font-size: 11px;
    color: var(--ink-3);
    background: var(--brand-light);
    border-radius: var(--radius-sm);
    padding: 3px 10px;
    font-weight: 600;
}
.cat-close { cursor: pointer; }

/* ===== 状态 A：词组区（微圆角纸面词块，全部可点击） ===== */
.sect { font-size: 14px; font-weight: 700; padding: 22px 2px 0; }
.wordrow { display: flex; gap: 10px; padding: 12px 0 0; flex-wrap: wrap; }
.wordrow.center { justify-content: center; }
.word-empty { font-size: 11px; color: var(--ink-2); padding: 12px 2px 0; }
.word {
    min-width: 88px;
    height: 32px;
    padding: 0 14px;
    background: var(--paper);
    border: 1px solid var(--line);
    border-radius: var(--radius-sm);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    color: #5C4A2E;
    cursor: pointer;
    transition: background .12s ease, color .12s ease;
}
.word:hover { background: #FBF3DC; color: var(--brand-dark); }

/* ===== 状态 B：三分组结果（命中类型签 + 名称 + 所属 + 评分） ===== */
.uni-group { margin-top: 22px; }
.uni-title { font-size: 13px; font-weight: 700; margin-bottom: 10px; }
.uni-list { display: flex; flex-direction: column; gap: 8px; }
.uni-item {
    display: flex;
    align-items: center;
    gap: 10px;
    background: var(--paper);
    border-radius: var(--radius-sm);
    padding: 10px 12px;
    cursor: pointer;
    font-size: 13px;
    box-shadow: var(--shadow-soft);
    transition: background .12s ease;
}
.uni-item:hover { background: #FBF3DC; }
.hit-tag {
    flex-shrink: 0;
    font-size: 10px;
    background: var(--brand-light);
    color: var(--ink-3);
    padding: 2px 7px;
    border-radius: 6px;
    font-weight: 600;
}
.uni-name { flex-shrink: 0; }
.uni-belong { flex: 1; min-width: 0; color: var(--ink-2); font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.uni-score { font-size: 15px; flex-shrink: 0; }

/* ===== 工具行：排序 tabs + 筛选开关 ===== */
.tool-row { display: flex; align-items: center; gap: 10px; margin-top: 18px; }
.sort-tabs { display: flex; gap: 2px; flex: 1; min-width: 0; overflow-x: auto; }
.sort-tab { font-size: 12px; padding: 5px 11px; cursor: pointer; border-radius: var(--radius-sm); color: var(--ink-2); font-weight: 600; white-space: nowrap; }
.sort-tab:hover { color: var(--brand-dark); }
.sort-tab.on { background: var(--paper); color: var(--brand-dark); font-weight: 700; box-shadow: var(--shadow-soft); }
.filter-toggle {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
    font-size: 12px;
    color: #5C4A2E;
    font-weight: 600;
    background: var(--paper);
    border: 1px solid var(--line);
    border-radius: var(--radius-sm);
    padding: 5px 12px;
    cursor: pointer;
}
.filter-toggle.on { color: var(--brand-dark); border-color: var(--line); }

/* ===== 筛选面板：纸面卡（沿用原筛选逻辑） ===== */
.filter-panel { margin-top: 12px; }
.f-group { margin-bottom: 14px; }
.f-title { font-size: 12px; color: var(--ink-2); margin-bottom: 7px; font-weight: 700; }
.chip-row { display: flex; gap: 6px; flex-wrap: wrap; }
.chip {
    font-size: 11px;
    padding: 4px 12px;
    border-radius: 6px;
    background: #FBF4E4;
    color: var(--ink-3);
    border: 1px solid #E8D5C0;
    cursor: pointer;
    font-weight: 600;
    transition: background .12s ease, color .12s ease;
}
.chip:hover { background: #FBF3DC; color: var(--brand-dark); }
.chip.on { background: var(--ink); color: var(--paper); border-color: var(--ink); }
.reset-btn { width: 100%; }
.filter-note { font-size: 10px; color: var(--ink-2); line-height: 1.6; margin: -2px 0 10px; }

/* ===== 菜品结果网格 ===== */
.result-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 12px; margin-top: 14px; }

/* ===== 无结果降级：明确提示 + 热门引导 ===== */
.empty-block {
    text-align: center;
    padding: 36px 14px;
    margin-top: 16px;
    background: var(--paper);
    border-radius: var(--radius);
    box-shadow: var(--shadow-soft);
}
.empty-main { font-size: 14px; font-weight: 700; }
.empty-sub { font-size: 12px; color: var(--ink-2); margin-top: 8px; }
.empty-block .wordrow { justify-content: center; margin-top: 14px; }
.pager { display: flex; justify-content: center; margin-top: 16px; }

/* ===== 桌面适配（≥769）===== */
@media (min-width: 769px) {
    /* 搜索条桌面加高，点击目标更接近首页规格 */
    .search-top { margin-top: 16px; }
    .search-input, .sqbtn { height: 44px; }
    .search-input input { font-size: 13.5px; }
    /* 结果卡片流：桌面固定 2 列（替代移动端 auto-fill 自适应，节奏更稳）；筛选条与推荐区保持全宽不动 */
    .result-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; margin-top: 18px; }

    /* ===== 地图页桌面档：顶栏在，抽屉贴底不再让开 tabbar，卡片两列 ===== */
    .search-page.map-mode { --sheet-h: 42%; --tab-h: 0px; --sheet-off: var(--sheet-h); }

    .sheet { bottom: 0; }
    .float-top { padding: 14px 20px 0; }
    .pill-search { max-width: 520px; height: 46px; }
    .pill-search input { font-size: 14px; }
    .sheet-head { padding: 2px 28px 10px; }
    .sheet-list {
        padding: 0 28px 16px;
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        column-gap: 28px;
        align-content: start;
    }
    .poi-empty { grid-column: 1 / -1; }
    .side-fabs { right: 20px; }
    .locate-btn { right: 20px; width: 46px; height: 46px; }
    .map-brand { left: 20px; font-size: 11px; }
}

/* ===== 桌面适配二档（≥1200）===== */
@media (min-width: 1200px) {
    /* 超宽屏：结果 3 列并加大列距 */
    .result-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; }
}
</style>
