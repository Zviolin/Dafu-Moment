<template>
    <div class="page-wrap list-page">
        <!-- 1. 顶部返回头：icircle 返回 + 居中标题 -->
        <div class="titlebar">
            <span class="icircle back" @click="go_back">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#3A2E1A" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>
            </span>
            <b class="title">点位与菜品</b>
        </div>

        <!-- 2. 场景 chips：切换点位类型（来自首页场景四格的 type，带素材图标） -->
        <div class="scene-chips fade-up">
            <span
                v-for="t in TYPE_CHIPS" :key="String(t.value)"
                class="chip" :class="{ on: active_type === t.value }"
                @click="set_type(t.value)"
            ><img class="chip-ico" :src="t.icon" alt="" />{{ t.label }}</span>
        </div>

        <!-- 3. 下拉筛选栏：附近食堂（多选）+ 智能排序（单选·按场景显示适用项） -->
        <div class="dropbar fade-up">
            <span class="drop" @click="toggle_panel('near')">
                附近：{{ near_label }}
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#8A6A3A" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>
            </span>
            <span class="drop" @click="toggle_panel('sort')">
                智能排序：{{ sort_label }}
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#8A6A3A" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>
            </span>
        </div>

        <!-- 下拉面板：附近食堂（多选含全选，默认全选） -->
        <div v-if="open_panel === 'near'" class="dpanel fade-up">
            <b class="dpanel-title">选择食堂（可多选）</b>
            <div class="dopts">
                <span class="dopt" :class="{ on: near_sel.length === canteen_names.length }" @click="toggle_all_near">全选</span>
                <span
                    v-for="c in canteen_names" :key="c"
                    class="dopt" :class="{ on: near_sel.includes(c) }"
                    @click="toggle_near(c)"
                >{{ c }}</span>
            </div>
            <div class="dbtn-row"><span class="dbtn" @click="open_panel = null">确定</span></div>
        </div>

        <!-- 下拉面板：智能排序（单选 = 打分维度 + 场景项，只显示当前场景适用项） -->
        <div v-if="open_panel === 'sort'" class="dpanel fade-up">
            <b class="dpanel-title">智能排序（单选）</b>
            <div class="dpanel-hint">按打分维度聚合得分排序 · 堂食含排队体验，外卖 / 微商为配送速度</div>
            <div class="dopts">
                <span
                    v-for="s in sort_options" :key="s.value"
                    class="dopt" :class="{ on: active_sort === s.value }"
                    @click="set_sort(s.value)"
                >{{ s.label }}</span>
            </div>
            <div class="dbtn-row"><span class="dbtn" @click="apply_sort">确定</span></div>
        </div>

        <!-- 4. 列表卡片流：图 / 名称 / 食堂·档口·人均（不含排队时间）/ chip / ★分+条数 -->
        <div class="list fade-up">
            <div v-for="row in display_rows" :key="`${row.kind}_${row.id}`" class="card shopcard" @click="go_row(row)">
                <div class="pic">
                    <img :src="row.img" :alt="row.name">
                    <span class="n">{{ row.kind }}</span>
                </div>
                <div class="info">
                    <div class="info-top">
                        <b class="name">{{ row.name }}</b>
                        <span class="star">★ {{ fmt_score(row.score) }} <i>{{ count_text(row.count) }}</i></span>
                    </div>
                    <div class="sub">{{ row.sub }}<template v-if="row.price != null && row.price !== ''"> · 人均¥{{ row.price }}</template></div>
                    <div class="tags"><span v-for="t in row.tags" :key="t" class="chip">{{ t }}</span></div>
                </div>
            </div>
            <div v-if="display_rows.length === 0" class="empty-tip">该筛选下暂无内容，换个条件试试</div>
        </div>
    </div>
</template>

<script setup>
/**
 * 点位与菜品列表（P03 暖纸奶油风新建）：返回头 + 场景 chips + 两个可展开下拉筛选 + 列表卡流
 * 筛选口径（需求 L201）：排序维度 = 口味 / 份量 / 包装 + 场景项（堂食→排队体验，外卖→配送速度）
 * 数据：api_content.canteens({ type, sort }) 带参重查，接口失败或空数据展示空态（不使用页内假数据）
 */
import { ref, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api_content } from '../api';
import { fmt_score, CANTEEN_TYPE_NAME } from '../utils/format';

const route = useRoute();
const router = useRouter();

// 场景 chips：value 对应后端 canteens.type（null = 全部），文案统一取自 CANTEEN_TYPE_NAME
const TYPE_CHIPS = [
    { value: null, label: '全部', icon: '/assets/icons/icon-house.png' },
    { value: 0, label: CANTEEN_TYPE_NAME[0], icon: '/assets/icons/scene-canteen.png' },
    { value: 1, label: CANTEEN_TYPE_NAME[1], icon: '/assets/icons/scene-mall.png' },
    { value: 2, label: CANTEEN_TYPE_NAME[2], icon: '/assets/icons/scene-stall.png' },
    { value: 3, label: CANTEEN_TYPE_NAME[3], icon: '/assets/icons/scene-waimai.png' },
];
// 点位类型 → 场景素材图（覆盖 0-3 全部类型，避免越界后统一回落食堂图标）
const TYPE_IMG = {
    0: '/assets/icons/scene-canteen.png',
    1: '/assets/icons/scene-mall.png',
    2: '/assets/icons/scene-stall.png',
    3: '/assets/icons/scene-waimai.png',
};
// 基础打分维度（通用项）
const BASE_SORTS = [
    { value: 'taste', label: '口味' },
    { value: 'portion', label: '份量' },
    { value: 'package', label: '包装' },
];

const active_type = ref(route.query.type != null && route.query.type !== '' ? Number(route.query.type) : null);
// 附近食堂可选项（取真实食堂名）与已选项（默认全选）
const canteen_names = ref([]);
const near_sel = ref([]);
const active_sort = ref('taste');
const open_panel = ref(null);
const rows_data = ref([]);

/** 排序可选项：通用维度 + 按当前场景显示适用项（需求 L201） */
const sort_options = computed(() => {
    const opts = [...BASE_SORTS];
    if (active_type.value === null) {
        // 全部场景：堂食与外卖附加项都展示
        opts.push({ value: 'queue', label: '排队体验（堂食）' }, { value: 'delivery', label: '配送速度（外卖）' });
    } else if (Number(active_type.value) === 3) {
        opts.push({ value: 'delivery', label: '配送速度' });
    } else {
        opts.push({ value: 'queue', label: '排队体验' });
    }
    return opts;
});

/** 排序按钮文案（当前选中项的 label） */
const sort_label = computed(() => {
    const hit = sort_options.value.find((s) => s.value === active_sort.value);
    return hit ? hit.label : '口味';
});

/** 附近食堂按钮文案：全选显示「全部食堂」，否则列出所选 */
const near_label = computed(() => {
    if (!canteen_names.value.length) return '全部食堂';
    if (near_sel.value.length === canteen_names.value.length) return '全部食堂';
    if (!near_sel.value.length) return '未选择';
    return near_sel.value.join(' / ');
});

/**
 * 展示行：按「附近食堂」多选过滤（可选项未加载时展示全部，排序由后端按 sort 参数完成）
 */
const display_rows = computed(() => {
    if (!canteen_names.value.length) return rows_data.value;
    return rows_data.value.filter((r) => near_sel.value.includes(r.belong));
});

/**
 * 评价数文案：千位以上缩写为 k
 * @param {number} n
 */
function count_text(n) {
    const num = Number(n) || 0;
    return num >= 1000 ? `${(num / 1000).toFixed(1)}k 条` : `${num} 条`;
}

/**
 * 展开 / 收起下拉面板（互斥：一次只开一个）
 * @param {'near'|'sort'} p
 */
function toggle_panel(p) {
    open_panel.value = open_panel.value === p ? null : p;
}

/**
 * 勾选 / 取消一个食堂
 * @param {string} c
 */
function toggle_near(c) {
    const i = near_sel.value.indexOf(c);
    if (i >= 0) near_sel.value.splice(i, 1);
    else near_sel.value.push(c);
}

/** 全选 / 清空附近食堂 */
function toggle_all_near() {
    near_sel.value = near_sel.value.length === canteen_names.value.length ? [] : [...canteen_names.value];
}

/**
 * 切换场景类型：重置为该场景默认排序并重查
 * @param {number|null} v
 */
function set_type(v) {
    if (active_type.value === v) return;
    active_type.value = v;
    // 场景切换后原排序维度可能不适用，回到通用「口味」
    active_sort.value = 'taste';
    // 附近食堂选项随场景变化，重置为空以便重查后重新全选
    near_sel.value = [];
    load_list();
}

/**
 * 记录选中的排序维度（确定时才触发重查）
 */
function set_sort(v) {
    active_sort.value = v;
}

/** 确定排序：带 type + sort 参数重查 */
function apply_sort() {
    open_panel.value = null;
    load_list();
}

/**
 * 列表行点击 → 点位详情 /canteen/:id
 * @param {{id:number}} row
 */
function go_row(row) {
    router.push(`/canteen/${row.id}`);
}

/** 返回上一页 */
function go_back() {
    router.back();
}

/**
 * 加载列表：接口按 type + sort 带参重查映射为列表卡模型；失败或空数据展示空态
 */
async function load_list() {
    try {
        const params = { sort: active_sort.value };
        if (active_type.value !== null) params.type = active_type.value;
        const data = await api_content.canteens(params);
        const rows = Array.isArray(data) ? data : (data.list || []);
        rows_data.value = rows.map((c) => ({
            kind: '点位',
            id: c.id,
            belong: c.name,
            name: c.name,
            sub: c.location || '',
            price: c.avg_price,
            score: c.avg_score,
            count: c.review_count || 0,
            tags: (c.tags || []).slice(0, 2),
            img: TYPE_IMG[c.type] || '/assets/icons/scene-canteen.png',
        }));
        // 附近食堂可选项：真实食堂名去重；已选项与新选项取交集（首查默认全选）
        const names = [...new Set(rows.map((c) => c.name).filter(Boolean))];
        canteen_names.value = names;
        near_sel.value = near_sel.value.length
            ? near_sel.value.filter((n) => names.includes(n))
            : [...names];
    } catch {
        rows_data.value = [];
        canteen_names.value = [];
    }
}

onMounted(() => {
    load_list();
});
</script>

<style scoped>
/* ===== 顶部返回头 ===== */
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

/* ===== 场景 chips：微圆角签，选中琥珀底 ===== */
.scene-chips { display: grid; grid-template-columns: repeat(5, 1fr); gap: 6px; margin-top: 12px; } /* 五格等宽单行（4.5 轮：修 3+2 换行的凌乱排版） */
.scene-chips .chip { cursor: pointer; padding: 5px 4px; font-size: 11px; display: inline-flex; align-items: center; justify-content: center; gap: 4px; min-width: 0; }
.scene-chips .chip span, .scene-chips .chip { white-space: nowrap; }
.scene-chips .chip.on { background: var(--brand); color: #FFFDF5; }
.chip-ico { width: 13px; height: 13px; object-fit: contain; }
/* ≤360 窄屏：图标隐藏保单行 */
@media (max-width: 360px) { .scene-chips .chip-ico { display: none; } }

/* ===== 下拉筛选栏 ===== */
.dropbar { display: flex; gap: 10px; margin-top: 12px; }
.drop {
    flex: 1;
    height: 32px;
    background: var(--paper);
    border: 1px solid var(--line);
    border-radius: var(--radius-sm);
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    font-size: 12px;
    color: #5C4A2E;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
    overflow: hidden;
}

/* ===== 下拉面板：卡面 + 淡阴影 ===== */
.dpanel {
    margin-top: 10px;
    background: var(--paper);
    border: 1px solid var(--line);
    border-radius: var(--radius-sm);
    padding: 14px;
    box-shadow: var(--shadow-soft);
}
.dpanel-title { font-size: 12px; display: block; }
.dpanel-hint { font-size: 9.5px; color: var(--ink-2); margin-top: 4px; }
.dopts { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
.dopt {
    font-size: 11px;
    background: #FBF4E4;
    border: 1px solid #E8D5C0;
    color: var(--ink-3);
    padding: 5px 13px;
    border-radius: 6px;
    font-weight: 600;
    cursor: pointer;
}
.dopt.on { background: var(--ink); color: var(--paper); border-color: var(--ink); }
.dbtn-row { display: flex; gap: 10px; margin-top: 12px; }
.dbtn {
    display: inline-flex;
    align-items: center;
    height: 34px;
    padding: 0 28px;
    border-radius: 6px;
    background: var(--ink);
    color: var(--paper);
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
}

/* ===== 列表卡片流 ===== */
.list { margin-top: 14px; display: flex; flex-direction: column; gap: 12px; padding-bottom: 8px; }
.shopcard { padding: 0; overflow: hidden; cursor: pointer; transition: transform .12s ease; }
.shopcard:hover { transform: translateY(-2px); }
.pic { position: relative; height: 140px; overflow: hidden; }
.pic img { width: 100%; height: 100%; object-fit: cover; }
.pic .n {
    position: absolute;
    top: 8px;
    left: 8px;
    font-size: 10px;
    background: rgba(58, 46, 26, 0.72);
    color: #FFF;
    padding: 2px 8px;
    border-radius: var(--radius-sm);
}
.info { padding: 12px 14px 14px; }
.info-top { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
.name { font-size: 15px; }
.star { font-size: 12px; color: var(--star); font-weight: 700; flex-shrink: 0; }
.star i { font-style: normal; color: var(--ink-2); font-weight: 400; font-size: 10.5px; }
.sub { font-size: 11px; color: var(--ink-2); margin-top: 5px; }
.tags { margin-top: 8px; display: flex; gap: 6px; flex-wrap: wrap; }
.empty-tip { text-align: center; color: var(--ink-2); font-size: 13px; padding: 40px 0; }

/* ===== 桌面适配（≥769）===== */
@media (min-width: 769px) {
    /* 卡片列表：桌面改 2 列网格（覆盖移动端纵向 flex 流）；筛选 tabs/下拉筛选区保持不动 */
    .list { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; align-items: start; }
    /* 空态提示跨全宽，不参与分列 */
    .list .empty-tip { grid-column: 1 / -1; }
    /* 封面桌面适当加高，宽卡图文比例更协调 */
    .list .pic { height: 160px; }
}

/* ===== 桌面适配二档（≥1200）===== */
@media (min-width: 1200px) {
    /* 超宽屏：列表 3 列铺满 */
    .list { grid-template-columns: repeat(3, 1fr); }
}
</style>
