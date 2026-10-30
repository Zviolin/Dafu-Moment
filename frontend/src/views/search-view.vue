<template>
    <div class="page-wrap search-page">
        <!-- 1. 顶部搜索条：回车 / 深色按钮触发搜索 -->
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

        <!-- ============ 状态 A：搜索首页态（无关键词且无品类筛选） ============ -->
        <template v-if="!f.q.trim() && !f.category">
            <!-- 历史记录：本机真实搜索记录（点击即用该词重新搜索） -->
            <div class="sect">历史记录</div>
            <div v-if="search_history.length" class="wordrow">
                <span v-for="w in search_history" :key="w" class="word" @click="go_word(w)">{{ w }}</span>
            </div>
            <div v-else class="word-empty">暂无搜索记录</div>

            <!-- 大家还在搜：热搜词取自后端真实数据，点开必有结果 -->
            <div class="sect">大家还在搜</div>
            <div v-if="hot_words.length" class="wordrow">
                <span v-for="w in hot_words" :key="w" class="word" @click="go_word(w)">{{ w }}</span>
            </div>
            <div v-else class="word-empty">暂无热搜词</div>

            <!-- 食堂导览入口：AI 地图背景 → /map -->
            <div class="sect">食堂导览</div>
            <div class="mapblock fade-up" @click="$router.push('/map')">
                <img src="/assets/bg/ai-map.jpg" alt="食堂导览">
                <span class="mlabel" style="left:12%;top:18%;">紫荆园</span>
                <span class="mlabel" style="left:47%;top:30%;">京元</span>
                <span class="mlabel" style="left:62%;top:64%;">丁香园</span>
            </div>
        </template>

        <!-- ============ 状态 B：搜索结果列表态 ============ -->
        <template v-else>
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
 * 搜索与结果页（P02 暖纸奶油风改版）：
 * 状态 A（无关键词）：本机搜索历史 / 大家还在搜（点击即用该词搜索）+ 食堂导览入口
 * 状态 B（有关键词）：统一搜索三分组（点位/档口/菜品·带命中类型签）+ 筛选与排序 + 菜品结果
 * 业务逻辑沿用原版：search_all 统一搜索 + dishes 筛选 + URL 同步
 */
import { ref, reactive, computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { Close } from '@element-plus/icons-vue';
import { api_content } from '../api';
import { score_color, fmt_score, CANTEEN_TYPE_NAME } from '../utils/format';
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

// 本机搜索历史（localStorage 记录的真实搜索词，无记录展示空态）
const HISTORY_KEY = 'dafu_search_history';
const HISTORY_MAX = 6;
const search_history = ref([]);

const route = useRoute();
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

/**
 * 读取本机搜索历史（localStorage，解析失败按空处理）
 */
function load_search_history() {
    try {
        const raw = localStorage.getItem(HISTORY_KEY);
        const arr = raw ? JSON.parse(raw) : [];
        search_history.value = Array.isArray(arr) ? arr : [];
    } catch {
        search_history.value = [];
    }
}

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
    load_search_history();
    load_filters_meta();
    try {
        canteens.value = await api_content.canteens();
    } catch {
        canteens.value = [];
    }
    // 带关键词进入（如首页品类跳转）直接出结果，否则停在搜索首页态
    if (f.q || f.category) await do_search();
});
</script>

<style scoped>
/* ===== 顶部搜索条：纸面输入框 + 墨色方形搜索钮 ===== */
.search-top { display: flex; gap: 8px; margin-top: 8px; }
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

/* 食堂导览块：AI 地图背景 + 淡签标注 */
.mapblock {
    margin-top: 12px;
    height: 131px;
    border-radius: var(--radius);
    overflow: hidden;
    position: relative;
    cursor: pointer;
    box-shadow: var(--shadow-soft);
}
.mapblock img { width: 100%; height: 100%; object-fit: cover; display: block; }
.mlabel {
    position: absolute;
    white-space: nowrap;
    font-size: 10px;
    font-weight: 700;
    color: var(--ink-3);
    background: rgba(255, 253, 245, 0.9);
    padding: 2px 7px;
    border-radius: var(--radius-sm);
}

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
    /* 结果卡片流：桌面固定 2 列（替代移动端 auto-fill 自适应，节奏更稳）；筛选条与历史热门区保持全宽不动 */
    .result-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; margin-top: 18px; }
}

/* ===== 桌面适配二档（≥1200）===== */
@media (min-width: 1200px) {
    /* 超宽屏：结果 3 列并加大列距 */
    .result-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; }
}
</style>
