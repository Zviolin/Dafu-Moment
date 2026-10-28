<template>
    <div class="page-wrap compare-page">
        <!-- 1. 顶部标题栏：返回 + 标题 -->
        <div class="titlebar">
            <span class="icircle back" @click="go_back">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#3A2E1A" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>
            </span>
            <b class="title">横向对比</b>
        </div>

        <!-- 1.5 对比模式 Tab（AC07：点位 / 档口） -->
        <div class="cmode fade-up">
            <span class="cmode-btn" :class="{ on: mode === 'canteen' }" @click="switch_mode('canteen')">点位对比</span>
            <span class="cmode-btn" :class="{ on: mode === 'station' }" @click="switch_mode('station')">档口对比</span>
        </div>

        <!-- 2. 对象选择器：从真实点位池点选，2~4 个 -->
        <div v-if="mode === 'canteen'" class="card picker fade-up">
            <b class="picker-title">选择对比点位（2~4 个）</b>
            <div v-if="pool.length" class="picker-chips">
                <span
                    v-for="p in pool" :key="p.id"
                    class="pchip" :class="{ on: selected.includes(p.id) }"
                    @click="toggle_obj(p.id)"
                >{{ p.name }}</span>
            </div>
            <div v-else class="picker-empty">暂无点位数据，请稍后重试</div>
        </div>

        <!-- 2b. 档口选择器（AC07）：档口池来自 GET /stations 轻量列表 -->
        <div v-else class="card picker fade-up">
            <b class="picker-title">选择对比档口（2~4 个）</b>
            <div v-if="spool.length" class="picker-chips">
                <span
                    v-for="s in spool" :key="s.id"
                    class="pchip" :class="{ on: s_selected.includes(s.id) }"
                    @click="toggle_sobj(s.id)"
                >{{ s.name }} · {{ s.canteenName }}</span>
            </div>
            <div v-else class="picker-empty">暂无档口数据，请稍后重试</div>
        </div>

        <!-- 3. 对比表：表头对象 + 字段行（细横线分隔，缺数据显示 —） -->
        <div v-if="mode === 'canteen' && selected_objs.length >= 2" class="card cmp fade-up" :style="{ '--cols': selected_objs.length }">
            <!-- 表头：图片 + 名称 + 综合分，点击进详情 -->
            <div class="crow head">
                <span class="k"></span>
                <span v-for="o in selected_objs" :key="o.id" class="cobj" @click="go_detail(o)">
                    <img v-if="o.img" :src="o.img" :alt="o.name">
                    <span v-else class="cobj-ph">{{ o.name[0] }}</span>
                    <b>{{ o.name }}</b>
                    <span class="st">★ {{ o.score_text }}</span>
                </span>
            </div>
            <!-- 类型 -->
            <div class="crow">
                <span class="k">类型</span>
                <span v-for="o in selected_objs" :key="o.id" class="v">{{ o.type_text }}</span>
            </div>
            <!-- 位置 -->
            <div class="crow">
                <span class="k">位置</span>
                <span v-for="o in selected_objs" :key="o.id" class="v">{{ o.location_text }}</span>
            </div>
            <!-- 人均价（越低越好） -->
            <div class="crow">
                <span class="k">人均价</span>
                <span v-for="o in selected_objs" :key="o.id" class="v" :class="{ best: is_best('price', o) }">{{ o.price_text }}</span>
            </div>
            <!-- 综合分（越高越好） -->
            <div class="crow">
                <span class="k">综合分</span>
                <span v-for="o in selected_objs" :key="o.id" class="v" :class="{ best: is_best('score', o) }">{{ o.score_text }}</span>
            </div>
            <!-- 档口数（越多越好） -->
            <div class="crow">
                <span class="k">档口数</span>
                <span v-for="o in selected_objs" :key="o.id" class="v" :class="{ best: is_best('station_count', o) }">{{ o.station_count }}</span>
            </div>
            <!-- 标签 -->
            <div class="crow">
                <span class="k">标签</span>
                <span v-for="o in selected_objs" :key="o.id" class="v v-tags">{{ o.tags.length ? o.tags.join(' · ') : '—' }}</span>
            </div>
            <!-- 操作：详情 -->
            <div class="crow">
                <span class="k">操作</span>
                <span v-for="o in selected_objs" :key="o.id" class="v"><span class="go-link" @click="go_detail(o)">详情 ›</span></span>
            </div>
        </div>
        <div v-else-if="mode === 'canteen'" class="empty-tip fade-up">请从上方选择 2~4 个点位开始对比</div>

        <!-- 3b. 档口对比表（AC07）：维度分项为选中档口的并集动态行，缺分项显示 — -->
        <div v-if="mode === 'station' && s_objs.length >= 2" class="card cmp fade-up" :style="{ '--cols': s_objs.length }">
            <!-- 表头：图片 + 名称 + 综合分，点击进档口详情 -->
            <div class="crow head">
                <span class="k"></span>
                <span v-for="o in s_objs" :key="o.id" class="cobj" @click="go_sdetail(o)">
                    <img v-if="o.img" :src="o.img" :alt="o.name">
                    <span v-else class="cobj-ph">{{ o.name[0] }}</span>
                    <b>{{ o.name }}</b>
                    <span class="st">★ {{ o.score_text }}</span>
                </span>
            </div>
            <!-- 所属点位 -->
            <div class="crow">
                <span class="k">所属点位</span>
                <span v-for="o in s_objs" :key="o.id" class="v">{{ o.canteen_text }}</span>
            </div>
            <!-- 品类 -->
            <div class="crow">
                <span class="k">品类</span>
                <span v-for="o in s_objs" :key="o.id" class="v">{{ o.category_text }}</span>
            </div>
            <!-- 营业状态 -->
            <div class="crow">
                <span class="k">状态</span>
                <span v-for="o in s_objs" :key="o.id" class="v">{{ o.status_text }}</span>
            </div>
            <!-- 综合分（越高越好） -->
            <div class="crow">
                <span class="k">综合分</span>
                <span v-for="o in s_objs" :key="o.id" class="v" :class="{ best: s_is_best('score', o) }">{{ o.score_text }}</span>
            </div>
            <!-- 评价数（越多越好） -->
            <div class="crow">
                <span class="k">评价数</span>
                <span v-for="o in s_objs" :key="o.id" class="v" :class="{ best: s_is_best('review_count', o) }">{{ o.review_count }}</span>
            </div>
            <!-- 维度分项均分（动态并集，越高越好；校内档口含排队分） -->
            <div v-for="k in s_dim_keys" :key="k" class="crow">
                <span class="k">{{ dim_name[k] || k }}</span>
                <span v-for="o in s_objs" :key="o.id" class="v" :class="{ best: s_is_best_dim(k, o) }">{{ o.dims[k] !== undefined ? fmt_score(o.dims[k]) : '—' }}</span>
            </div>
            <!-- 操作：档口详情 -->
            <div class="crow">
                <span class="k">操作</span>
                <span v-for="o in s_objs" :key="o.id" class="v"><span class="go-link" @click="go_sdetail(o)">详情 ›</span></span>
            </div>
        </div>
        <div v-else-if="mode === 'station'" class="empty-tip fade-up">请从上方选择 2~4 个档口开始对比</div>

        <!-- 4. 底部操作与说明 -->
        <div class="foot-actions fade-up">
            <span class="card act-btn" @click="clear_all">清空</span>
        </div>
        <div class="addtip">
            <template v-if="mode === 'canteen'">仅展示真实点位数据 · 最多对比 4 个<br>
            人均价越低越好 · 综合分与档口数越高越好 · 数据来源于全站已发布评价</template>
            <template v-else>仅展示真实档口数据 · 最多对比 4 个<br>
            综合分、评价数与各维度分越高越好 · 分项为已发布评价的维度均分</template>
        </div>
    </div>
</template>

<script setup>
/**
 * 横向对比（P07 暖纸奶油风）：2~4 个真实点位/档口横向对比表（AC07 加档口级）
 * 点位模式数据源：api_content.canteens()（点位聚合：人均价 / 综合分 / 档口数 / 标签）；
 * 档口模式数据源：api_content.stations() 候选池 + api_content.stations_compare() 对比行（含维度分项均分）；
 * 接口失败或数据不足时展示友好空态，不回退演示数据；详情跳转使用真实 id。
 */
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { api_content } from '../api';
import { fmt_score, cover_url, CANTEEN_TYPE_NAME } from '../utils/format';

const router = useRouter();

// 对比池（来自真实点位接口）
const pool = ref([]);
// 已选对比对象 id
const selected = ref([]);

/**
 * 点位原始行 → 对比模型（人均价 / 综合分为空时置 null，便于「最优」判断）
 * @param {Object} c - 点位列表行
 */
function map_point(c) {
    const price = c.avg_price != null && Number(c.avg_price) > 0 ? Number(c.avg_price) : null;
    const score = c.avg_score != null && Number(c.avg_score) > 0 ? Number(c.avg_score) : null;
    return {
        id: c.id,
        name: c.name,
        img: c.cover_object_key ? cover_url(c.cover_object_key) : '',
        type_text: CANTEEN_TYPE_NAME[Number(c.type)] ?? '点位',
        location_text: [c.campus, c.location].filter(Boolean).join(' · ') || '—',
        price,
        price_text: price != null ? `¥${price}/人` : '—',
        score,
        score_text: score != null ? fmt_score(score) : '—',
        station_count: Number(c.station_count) || 0,
        tags: Array.isArray(c.tags) ? c.tags : [],
    };
}

/**
 * 拉取真实点位作为对比池；接口失败时置空（展示空态，不复用假数据）
 */
async function load_pool() {
    try {
        const res = await api_content.canteens();
        const list = Array.isArray(res) ? res : (res && res.list) || [];
        pool.value = list.map(map_point);
        // 默认选中前 3 个，便于直接看到对比表
        selected.value = pool.value.slice(0, 3).map((p) => p.id);
    } catch {
        pool.value = [];
        selected.value = [];
    }
}

/** 已选对象模型列表（保持点选顺序） */
const selected_objs = computed(() => (
    selected.value.map((id) => pool.value.find((p) => p.id === id)).filter(Boolean)
));

/**
 * 点选 / 取消对比对象（上限 4 个）
 * @param {number} id - 点位 id
 */
function toggle_obj(id) {
    const i = selected.value.indexOf(id);
    if (i >= 0) {
        selected.value.splice(i, 1);
        return;
    }
    if (selected.value.length >= 4) return;
    selected.value.push(id);
}

/** 清空当前模式的对比对象 */
function clear_all() {
    if (mode.value === 'canteen') {
        selected.value = [];
    } else {
        s_selected.value = [];
        s_rows.value = [];
    }
}

/**
 * 数值字段是否为本行最优（人均价取最小，其余取最大；空值不参与也不高亮）
 * @param {'price'|'score'|'station_count'} field
 * @param {Object} o
 */
function is_best(field, o) {
    if (selected_objs.value.length < 2 || o[field] == null) return false;
    const vals = selected_objs.value.map((x) => x[field]).filter((v) => v != null);
    if (vals.length < 2) return false;
    const best = field === 'price' ? Math.min(...vals) : Math.max(...vals);
    // best 为 0（如全员无档口 / 无评分）时不高亮
    return best > 0 && o[field] === best;
}

/**
 * 详情跳转：点位 → /canteen/:id（真实 id）
 * @param {{id:number}} o
 */
function go_detail(o) {
    router.push(`/canteen/${o.id}`);
}

/* ================= AC07 档口级对比 ================= */

// 对比模式：canteen 点位（原口径）/ station 档口（AC07）
const mode = ref('canteen');
// 档口候选池（GET /stations 轻量全量）
const spool = ref([]);
// 已选档口 id（点选顺序即对比列顺序）
const s_selected = ref([]);
// 档口对比行（GET /stations/compare 返回，含 dimScores 维度分项均分）
const s_rows = ref([]);
// 维度 key → 中文名（/dimensions 全量配置；缺失时回退显示 key）
const dim_name = ref({});

/**
 * 切换对比模式（点位/档口两套选择互不影响）
 * @param {'canteen'|'station'} m
 */
function switch_mode(m) {
    mode.value = m;
}

/**
 * 拉档口候选池 + 维度配置名映射；接口失败置空展示空态，不回退演示数据
 */
async function load_spool() {
    try {
        const list = await api_content.stations();
        spool.value = Array.isArray(list) ? list : [];
    } catch {
        spool.value = [];
    }
    try {
        const dims = await api_content.dimensions();
        const m = {};
        for (const d of Array.isArray(dims) ? dims : []) m[d.key] = d.name;
        dim_name.value = m;
    } catch { /* 维度名缺失不阻塞主流程，行标签回退显示 key */ }
}

/**
 * 点选 / 取消档口（上限 4 个）；选择 ≥2 时拉取对比数据
 * @param {number} id - 档口 id
 */
async function toggle_sobj(id) {
    const i = s_selected.value.indexOf(id);
    if (i >= 0) {
        s_selected.value.splice(i, 1);
    } else {
        if (s_selected.value.length >= 4) return;
        s_selected.value.push(id);
    }
    await load_scompare();
}

/**
 * 拉取档口对比行（接口按入参顺序返回，与点选顺序一致）；不足 2 个清空表格
 */
async function load_scompare() {
    if (s_selected.value.length < 2) { s_rows.value = []; return; }
    try {
        s_rows.value = await api_content.stations_compare(s_selected.value);
    } catch {
        s_rows.value = [];
    }
}

/**
 * 档口对比行 → 视图模型（综合分为 0 置 null，便于「最优」判断与缺省显示）
 * @param {Object} r - /stations/compare 返回行
 */
function map_station(r) {
    const score = Number(r.ratingAvg) > 0 ? Number(r.ratingAvg) : null;
    return {
        id: r.id,
        name: r.name,
        img: r.coverObjectKey ? cover_url(r.coverObjectKey) : '',
        canteen_text: r.canteenName || '—',
        category_text: r.category || '—',
        status_text: Number(r.status) === 0 ? '营业中' : '休摊中',
        score,
        score_text: score != null ? fmt_score(score) : '—',
        review_count: Number(r.reviewCount) || 0,
        dims: r.dimScores || {},
    };
}

/** 档口对比模型列表（接口已按点选顺序返回） */
const s_objs = computed(() => s_rows.value.map(map_station));

/** 选中档口的维度并集（保持先出现顺序，动态行渲染用） */
const s_dim_keys = computed(() => {
    const keys = [];
    for (const o of s_objs.value) {
        for (const k of Object.keys(o.dims)) {
            if (!keys.includes(k)) keys.push(k);
        }
    }
    return keys;
});

/**
 * 档口数值字段是否最优（越高越好；空值不参与也不高亮）
 * @param {'score'|'review_count'} field
 * @param {Object} o
 */
function s_is_best(field, o) {
    if (s_objs.value.length < 2 || o[field] == null) return false;
    const vals = s_objs.value.map((x) => x[field]).filter((v) => v != null);
    if (vals.length < 2) return false;
    const best = Math.max(...vals);
    return best > 0 && o[field] === best;
}

/**
 * 维度分项是否最优（仅在带该分项的档口间比较，≥2 个才高亮）
 * @param {string} k - 维度 key
 * @param {Object} o
 */
function s_is_best_dim(k, o) {
    const v = o.dims[k];
    if (s_objs.value.length < 2 || v === undefined) return false;
    const vals = s_objs.value.map((x) => x.dims[k]).filter((x) => x !== undefined).map(Number);
    if (vals.length < 2) return false;
    const best = Math.max(...vals);
    return best > 0 && Number(v) === best;
}

/**
 * 详情跳转：档口 → /station/:id（真实 id）
 * @param {{id:number}} o
 */
function go_sdetail(o) {
    router.push(`/station/${o.id}`);
}

/** 返回上一页 */
function go_back() {
    router.back();
}

onMounted(() => { load_pool(); load_spool(); });
</script>

<style scoped>
/* ===== 顶部标题栏 ===== */
.titlebar {
    height: 48px;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
    margin-top: 8px;
}
.back { position: absolute; left: 0; }
.title { font-size: 16px; }

/* ===== 对比模式 Tab（AC07：点位 / 档口） ===== */
.cmode { display: flex; gap: 8px; margin-top: 12px; }
.cmode-btn {
    flex: 1;
    text-align: center;
    font-size: 12px; font-weight: 700;
    padding: 8px 0;
    border-radius: 8px;
    background: #FBF4E4;
    border: 1px solid #E8D5C0;
    color: var(--ink-3);
    cursor: pointer;
    transition: background .12s ease, color .12s ease;
}
.cmode-btn.on { background: var(--ink); color: var(--paper); border-color: var(--ink); }

/* ===== 对象选择器 ===== */
.picker { margin-top: 14px; }
.picker-title { font-size: 12px; display: block; }
.picker-chips { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
.picker-empty { font-size: 12px; color: var(--ink-2); margin-top: 10px; }
.pchip {
    font-size: 11px;
    background: #FBF4E4;
    border: 1px solid #E8D5C0;
    color: var(--ink-3);
    padding: 5px 13px;
    border-radius: 6px;
    font-weight: 600;
    cursor: pointer;
    transition: background .12s ease, color .12s ease;
}
.pchip.on { background: var(--ink); color: var(--paper); border-color: var(--ink); }

/* ===== 对比表：横向滚动，列数随对象数自适应 ===== */
.cmp { margin-top: 14px; padding: 6px 0 10px; overflow-x: auto; }
.crow {
    display: grid;
    grid-template-columns: 64px repeat(var(--cols), minmax(88px, 1fr));
    gap: 8px;
    padding: 9px 12px;
    align-items: center;
}
/* 细横线分隔行（替代封闭描边） */
.crow + .crow { border-top: 1px solid var(--line); }
.crow .k { font-size: 10px; color: var(--ink-2); font-weight: 600; }
.crow .v { font-size: 10.5px; text-align: center; color: var(--ink); word-break: break-all; }
.crow .v.best { color: var(--brand); font-weight: 800; }
.v-tags { font-size: 9px; color: var(--ink-3); }

/* 表头对象：图 + 名称 + 星分 */
.cobj { text-align: center; cursor: pointer; }
.cobj img {
    width: 52px;
    height: 52px;
    border-radius: var(--radius-sm);
    object-fit: cover;
    margin: 0 auto;
    display: block;
}
/* 无封面时的首字占位 */
.cobj-ph {
    display: flex; align-items: center; justify-content: center;
    width: 52px; height: 52px; margin: 0 auto;
    border-radius: var(--radius-sm); background: var(--brand-light);
    color: var(--ink-3); font-size: 20px; font-weight: 800;
}
.cobj b { font-size: 10.5px; display: block; margin-top: 5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cobj .st { font-size: 9px; color: var(--star); font-weight: 800; }

/* 详情链接 */
.go-link { color: var(--brand); font-weight: 700; cursor: pointer; font-size: 10.5px; }
.go-link:hover { color: var(--brand-dark); }

/* ===== 底部操作与说明 ===== */
.empty-tip { text-align: center; color: var(--ink-2); font-size: 13px; padding: 40px 0; }
.foot-actions { display: flex; gap: 8px; justify-content: center; margin-top: 14px; }
.act-btn {
    font-size: 11.5px;
    font-weight: 700;
    color: var(--ink-2);
    padding: 8px 20px;
    cursor: pointer;
}
.addtip { text-align: center; font-size: 10px; color: var(--ink-2); margin-top: 14px; line-height: 1.8; }

/* ===== 桌面适配（≥769）===== */
@media (min-width: 769px) {
    /* 整页限宽 1000 居中 */
    .compare-page { max-width: 1000px; }
    /* 对比表：行距与列间距加大，最小列宽放宽（4 对象时每列约 200px） */
    .crow {
        grid-template-columns: 88px repeat(var(--cols), minmax(150px, 1fr));
        gap: 12px; padding: 12px 16px;
    }
    /* 对比表字号整体上调一档 */
    .crow .k { font-size: 11px; }
    .crow .v { font-size: 12px; }
    .v-tags { font-size: 10.5px; }
    .cobj img { width: 64px; height: 64px; }
    .cobj-ph { width: 64px; height: 64px; }
    .cobj b { font-size: 12px; }
    .cobj .st { font-size: 10.5px; }
    /* 选择器 chips 与清空按钮同步放大 */
    .pchip { font-size: 12px; padding: 7px 16px; }
    .act-btn { font-size: 12.5px; padding: 10px 28px; }
    /* 模式 Tab 同步放大 */
    .cmode-btn { font-size: 13px; padding: 10px 0; }
}
</style>
