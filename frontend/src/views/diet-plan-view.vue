<template>
    <div class="page-wrap plan-page">
        <!-- 顶部标题栏：返回 + 页名 -->
        <div class="titlebar">
            <span class="icircle back" role="button" aria-label="返回" @click="go_back">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3A2E1A" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>
            </span>
            <b class="tb-title">饮食计划</b>
        </div>

        <!-- 顶部横幅：干饭地图手绘背景（素材 bg/ai-map-2） -->
        <div class="hero fade-up">
            <img class="hero-bg" src="/assets/bg/ai-map-2.jpg" alt="" aria-hidden="true" />
            <div class="hero-txt">
                <b>让福宝帮你排好这一周</b>
                <span>按忌口与预算生成三餐 · 可一键重新生成</span>
            </div>
        </div>

        <!-- 表单卡：周期 / 预算上限 / 忌口 / 目标 -->
        <div class="card form-card fade-up">
            <div class="fgroup">
                <span class="flabel">计划周期</span>
                <div class="seg">
                    <span
                        v-for="c in CYCLES" :key="c.days"
                        :class="{ on: form.days === c.days }"
                        @click="form.days = c.days"
                    >{{ c.label }}</span>
                </div>
            </div>
            <hr class="hairline" />
            <div class="fgroup frow">
                <span class="flabel">预算上限</span>
                <div class="budget-box">
                    <span class="yen">¥</span>
                    <el-input-number v-model="form.budget" :min="10" :max="80" :step="5" size="small" />
                    <span class="unit">/ 天</span>
                </div>
            </div>
            <hr class="hairline" />
            <div class="fgroup">
                <span class="flabel">忌口 <i class="fnote">已从偏好档案带入，可临时调整</i></span>
                <div class="chips">
                    <span
                        v-for="a in AVOID_LIST" :key="a"
                        class="pchip" :class="{ on: form.avoids.includes(a) }"
                        @click="toggle_avoid(a)"
                    >{{ a }}</span>
                </div>
            </div>
            <hr class="hairline" />
            <div class="fgroup">
                <span class="flabel">饮食目标 <i class="fnote">可多选</i></span>
                <div class="chips">
                    <span
                        v-for="g in GOALS" :key="g.key"
                        class="pchip" :class="{ on: form.goals.includes(g.key) }"
                        @click="toggle_goal(g.key)"
                    >{{ g.label }}</span>
                </div>
            </div>
            <button class="btn-primary gen-btn" :disabled="generating" @click="generate">{{ generating ? '生成中…' : '生成计划' }}</button>
        </div>

        <!-- 按档案生成的摘要行 -->
        <div v-if="profile_summary" class="profile-line">按你的条件：{{ profile_summary }}</div>

        <!-- 生成失败提示（模拟失败 / 条件无解） -->
        <div v-if="failed" class="card fail-card fade-up">
            <b>计划生成失败</b>
            <p>{{ fail_reason }}</p>
            <button class="btn-primary" @click="generate">放宽条件重试</button>
        </div>

        <!-- 计划结果：每日三餐卡 -->
        <template v-if="plan">
            <div v-for="day in plan.days" :key="day.title" class="day-block">
                <div class="sec day-sec"><b>{{ day.title }}</b><span>{{ day.tag_line }}</span></div>
                <!-- 每日三餐卡 wrapper：供桌面两列网格（移动端 display:contents 不影响原流） -->
                <div class="meal-grid">
                <div v-for="meal in day.meals" :key="meal.slot" class="card meal fade-up">
                    <div class="mhead">
                        <span class="mico"><component :is="meal.icon" /></span>
                        <b class="mtitle">{{ meal.slot }} · 约 ¥{{ meal.dish.price }}</b>
                        <span class="mstation">{{ meal.dish.station }}</span>
                    </div>
                    <!-- 菜品行：真实菜品 id，可点击进入详情 -->
                    <div class="dish-row" @click="go_dish(meal.dish)">
                        <img v-if="meal.dish.img" class="dish-img" :src="meal.dish.img" :alt="meal.dish.name" />
                        <span v-else class="dish-img img-fallback">{{ meal.dish.name[0] }}</span>
                        <div class="dish-main">
                            <b class="dish-name">{{ meal.dish.name }}</b>
                            <span class="dish-meta">¥{{ meal.dish.price }}{{ meal.dish.estimated ? '（估）' : '' }} · {{ meal.dish.desc }}</span>
                        </div>
                    </div>
                </div>
                </div><!-- /meal-grid -->
            </div>

            <!-- 汇总卡：估算预算合计 -->
            <div class="card total-card">
                <span class="tlabel">预计{{ form.days > 1 ? '总花费' : '当日总预算' }}</span>
                <b class="tnum score-num">¥{{ plan.total }}</b>
                <span v-if="form.days > 1" class="tavg">日均 ¥{{ plan.avg }}</span>
            </div>

            <!-- 重新生成：保留已填条件（DietPlan.regenerate） -->
            <div class="ops">
                <button class="btn-primary regen-btn" :disabled="generating" @click="generate">{{ generating ? '重新生成中…' : '重新生成' }}</button>
            </div>
        </template>

        <!-- 声明（AC24 / P18 口径） -->
        <p class="compliance">以上内容仅供参考，不替代专业医生、营养师的医疗诊断与营养方案。<br>本计划不构成医疗或专业营养建议。</p>
    </div>
</template>

<script setup>
/**
 * 个性化饮食计划（对齐 P18-饮食计划.html）
 * 表单：周期（单日/3日/7日）/ 预算上限 / 忌口（默认读偏好档案）/ 目标；
 * 生成：规则模板输出每日三餐卡（仅展示菜品名与档口名，无真实详情页可跳）+ 预算合计；
 * 「重新生成」保留已填条件；条件无解或模拟失败时提示降级。
 * TODO: 待后端接口（当前为页内规则模板 + 本地档案读取）
 */
import { ref, onMounted, h } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { api_content } from '../api';
import { cover_url } from '../utils/format';

const router = useRouter();

// 常量配置
const CYCLES = [
    { days: 1, label: '单日' },
    { days: 3, label: '3 日' },
    { days: 7, label: '7 日' },
];
const AVOID_LIST = ['不吃香菜', '不吃辣', '不吃内脏', '不吃生冷', '不吃花生', '不吃海鲜'];
const GOALS = [
    { key: 'light', label: '清淡' },
    { key: 'muscle', label: '增肌' },
    { key: 'save', label: '省钱' },
    { key: 'novel', label: '尝鲜' },
];
// 忌口选项 → 菜品 avoid_tags 的匹配键
const AVOID_KEY_MAP = {
    不吃香菜: '香菜', 不吃辣: '辣', 不吃内脏: '内脏',
    不吃生冷: '生冷', 不吃花生: '花生', 不吃海鲜: '海鲜',
};
// 目标 → 池内标签（多选目标取并集，用于排序加权）
const GOAL_TAG_MAP = { light: '清淡', muscle: '高蛋白', save: '省钱', novel: '尝鲜' };
// 餐次名（早/午/晚 用自绘 SVG 图标，禁汉字图标）
const SLOTS = [
    { slot: '早餐', offset: 0, icon: 'icon-sun' },
    { slot: '午餐', offset: 1, icon: 'icon-fork' },
    { slot: '晚餐', offset: 2, icon: 'icon-moon' },
];

// 真实菜品池由 /dishes 接口按预算/忌口/目标拉取，不再使用虚构菜品模板
// 自绘餐次 SVG（24 viewBox / stroke currentColor / 1.7 / round，禁汉字图标）
const MEAL_ICONS = {
    'icon-sun': () => h('svg', { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.7, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, [
        h('circle', { cx: 12, cy: 12, r: 4 }),
        h('path', { d: 'M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6L17 7M7 17l-1.4 1.4' }),
    ]),
    'icon-fork': () => h('svg', { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.7, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, [
        h('path', { d: 'M7 3v5a2 2 0 0 0 4 0V3M9 3v18M16 3c-2 3-2 7 0 9v9' }),
    ]),
    'icon-moon': () => h('svg', { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.7, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, [
        h('path', { d: 'M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z' }),
    ]),
};

const form = ref({ days: 1, budget: 20, avoids: [], goals: ['light'] });
const generating = ref(false);
const failed = ref(false);
const fail_reason = ref('');
const plan = ref(null);
/** 档案摘要（表单下方一行提示） */
const profile_summary = ref('');

/**
 * 切换忌口选项
 * @param {string} a - 忌口文案
 */
function toggle_avoid(a) {
    const i = form.value.avoids.indexOf(a);
    if (i >= 0) form.value.avoids.splice(i, 1);
    else form.value.avoids.push(a);
}

/**
 * 饮食目标多选（允许全不选 = 不限目标）
 * @param {string} key
 */
function toggle_goal(key) {
    const i = form.value.goals.indexOf(key);
    if (i >= 0) form.value.goals.splice(i, 1);
    else form.value.goals.push(key);
}

/** 忌口文案 → 名称关键词（「不吃苦瓜」→「苦瓜」） */
function avoid_keywords() {
    return form.value.avoids
        .map((a) => String(a).replace(/^不吃/, '').replace(/^少/, '').trim())
        .filter(Boolean);
}

/**
 * 真实菜品行 → 计划卡结构
 * @param {Object} d
 * @returns {Object}
 */
function normalize_dish(d) {
    const tags = String(d.taste_tags || '').split(',').filter(Boolean);
    const name = d.name || '';
    const is_breakfast = /粥|包|豆浆|油条|饼|馒|蛋|面|粉|饺|馄饨|烧麦|吐司|三明治|奶|咖啡|甜品|糖水/.test(name);
    return {
        id: Number(d.id),
        name,
        price: Number(d.price) || 0,
        estimated: Number(d.is_estimated) === 1,
        img: cover_url(d.cover_object_key),
        station: d.station_name || d.canteen_name || '',
        desc: tags.length ? tags.join(' · ') : '真实在架菜品',
        tags,
        first_seen_at: d.first_seen_at || '',
        meal: is_breakfast ? 'breakfast' : 'main',
    };
}

/**
 * 目标排序分：多目标加权，保证「清淡 / 高蛋白 / 省钱 / 尝鲜」都能被兼顾
 * @param {Object} d
 * @returns {number}
 */
function goal_score(d) {
    let score = 0;
    if (form.value.goals.includes('light') && (d.tags.includes('清淡') || /汤|粥|蒸|菜|豆花/.test(d.name))) score += 3;
    if (form.value.goals.includes('muscle') && /鸡|牛|肉|蛋|鱼|虾|豆/.test(d.name)) score += 3;
    if (form.value.goals.includes('save')) score += Math.max(0, 3 - d.price / 10);
    if (form.value.goals.includes('novel') && d.first_seen_at) score += 1;
    return score;
}

/**
 * 从后端拉取真实菜品池（预算 + 忌口 + 目标）
 * @returns {Promise<Array>}
 */
async function fetch_pool() {
    const sort = form.value.goals.includes('novel') ? 'new'
        : (form.value.goals.includes('save') ? 'priceAsc' : 'comprehensive');
    const res = await api_content.dishes({
        priceMax: form.value.budget,
        pageSize: 50,
        sort,
        businessStatus: 'open',
    });
    const rows = Array.isArray(res) ? res : (res.list || []);
    const keywords = avoid_keywords();
    const list = rows.map(normalize_dish)
        .filter((d) => d.name)
        .filter((d) => !keywords.some((k) => d.name.includes(k) || d.desc.includes(k)))
        .map((d) => ({ ...d, goal_score: goal_score(d) }));
    return list.sort((a, b) => b.goal_score - a.goal_score);
}

/**
 * 生成计划：真实菜品池 + 每日三餐轮转，不再模拟随机失败
 */
async function generate() {
    if (generating.value) return;
    generating.value = true;
    failed.value = false;
    plan.value = null;
    try {
        const pool = await fetch_pool();
        const breakfast = pool.filter((d) => d.meal === 'breakfast');
        const main = pool.filter((d) => d.meal === 'main');
        if (pool.length < 3 || (breakfast.length === 0 && main.length < 3)) {
            fail_reason.value = '当前预算与忌口条件下可选的真实菜品不足，试着放宽预算或减少忌口';
            failed.value = true;
            ElMessage.error(fail_reason.value);
            return;
        }
        const days = [];
        let total = 0;
        for (let di = 0; di < form.value.days; di++) {
            let day_sum = 0;
            const meals = SLOTS.map((sl, si) => {
                // 早餐优先早餐类；不足时回退主菜池，避免无解
                const bf = breakfast.length ? breakfast : main;
                const list = sl.slot === '早餐' ? bf : main;
                const dish = list[(di * 2 + si) % list.length];
                day_sum += dish.price;
                return { slot: sl.slot, icon: MEAL_ICONS[sl.icon], dish };
            });
            total += day_sum;
            days.push({
                title: form.value.days > 1 ? `第 ${di + 1} 天` : '今日计划',
                tag_line: `${goal_labels()} · 全天约 ¥${day_sum.toFixed(0)}`,
                meals,
            });
        }
        plan.value = { days, total: Number(total.toFixed(1)), avg: Math.round(total / form.value.days) };
        ElMessage.success(`已按真实在架菜品生成 ${form.value.days} 日计划`);
    } catch (e) {
        fail_reason.value = e?.message || '计划生成失败，请稍后重试';
        failed.value = true;
        ElMessage.error(fail_reason.value);
    } finally {
        generating.value = false;
    }
}

/** 目标文案（多选用 + 连接） */
function goal_labels() {
    const labels = GOALS.filter((g) => form.value.goals.includes(g.key)).map((g) => g.label);
    return labels.length ? `${labels.join(' + ')}目标` : '不限目标';
}

/**
 * 打开真实菜品详情
 * @param {Object} dish
 */
function go_dish(dish) {
    if (dish.id) router.push(`/dish/${dish.id}`);
}

/**
 * 返回 AI 助手主页
 */
function go_back() {
    router.push('/ai');
}

onMounted(() => {
    // 默认读偏好档案（dafu_diet_profile）：忌口 / 严重过敏 / 多选目标 / 预算
    try {
        const profile = JSON.parse(localStorage.getItem('dafu_diet_profile') || 'null');
        if (profile) {
            const avoids = Array.isArray(profile.avoids) ? [...profile.avoids] : [];
            if (Array.isArray(profile.severe_allergy)) {
                for (const a of profile.severe_allergy) avoids.push(`不吃${a}`);
            }
            form.value.avoids = [...new Set(avoids)];
            const goals = Array.isArray(profile.goals)
                ? profile.goals.filter((g) => GOALS.some((x) => x.key === g || x.label === g))
                : (profile.goal ? [profile.goal] : []);
            // 档案里可能存的是中文标签，映射成 key
            form.value.goals = goals.map((g) => (GOALS.some((x) => x.key === g) ? g : (GOALS.find((x) => x.label === g) || {}).key)).filter(Boolean);
            if (!form.value.goals.length) form.value.goals = ['light'];
            if (profile.budget_max) form.value.budget = Math.max(10, Number(profile.budget_max) || 20);
            const parts = [];
            if (form.value.avoids.length) parts.push(`忌口：${form.value.avoids.join('、')}`);
            parts.push(goal_labels());
            if (profile.budget_max) parts.push(`预算约 ¥${profile.budget_min || 0}~¥${profile.budget_max}/餐`);
            profile_summary.value = parts.join(' · ');
        }
    } catch { /* 档案损坏时按默认条件 */ }
});
</script>

<style scoped>
.plan-page { padding-bottom: 8px; }

/* 顶部标题栏 */
.titlebar { height: 48px; display: flex; align-items: center; gap: 10px; margin-top: 10px; }
.tb-title { font-size: 16px; font-weight: 700; }

/* ===== 表单卡 ===== */
.form-card { margin-top: 6px; }

/* 顶部横幅：手绘干饭地图背景 + 叠字（无框卡 + 极淡阴影） */
.hero { position: relative; margin-top: 14px; border-radius: var(--radius); overflow: hidden; box-shadow: var(--shadow-soft); }
.hero-bg { display: block; width: 100%; height: 92px; object-fit: cover; }
.hero-txt { position: absolute; inset: 0; display: flex; flex-direction: column; justify-content: center; gap: 4px; padding: 0 18px; background: linear-gradient(90deg, rgba(250, 244, 227, .92) 30%, rgba(250, 244, 227, .35) 100%); }
.hero-txt b { font-size: 16px; font-weight: 800; color: var(--ink); }
.hero-txt span { font-size: 11px; color: var(--ink-2); }
.fgroup { display: flex; flex-direction: column; gap: 10px; }
.fgroup.frow { flex-direction: row; align-items: center; justify-content: space-between; }
.flabel { font-size: 13px; font-weight: 700; }
.fnote { font-style: normal; font-size: 10px; color: var(--ink-2); font-weight: 400; margin-left: 4px; }
/* 周期分段：淡纸分段（去墨底重选段，选中琥珀） */
.seg { display: flex; background: var(--page); border-radius: var(--radius-sm); padding: 3px; }
.seg span {
    flex: 1; text-align: center; font-size: 12.5px; font-weight: 700; color: var(--ink-2);
    padding: 8px 0; border-radius: var(--radius-sm); cursor: pointer; transition: background .12s ease, color .12s ease;
}
.seg span.on { background: var(--brand); color: #FFFDF5; }
/* 预算输入 */
.budget-box { display: flex; align-items: center; gap: 6px; }
.budget-box .el-input-number { width: 120px; }
.yen { font-size: 14px; font-weight: 700; color: var(--ink-3); }
.unit { font-size: 11px; color: var(--ink-2); font-weight: 400; }
/* 忌口 / 目标 chips */
.chips { display: flex; flex-wrap: wrap; gap: 8px; }
.pchip {
    font-size: 12px; padding: 6px 13px; border-radius: var(--radius-sm);
    border: 1px solid var(--line); background: var(--paper); color: var(--ink-3);
    font-weight: 600; cursor: pointer; transition: background .12s ease, color .12s ease;
}
.pchip:hover { background: #FBF3DC; }
.pchip.on { background: var(--ink); color: var(--paper); border-color: var(--ink); }
.gen-btn { margin-top: 14px; width: 100%; padding: 12px 18px; font-size: 14px; }

/* 档案摘要行 */
.profile-line { text-align: center; font-size: 10.5px; color: var(--ink-2); margin-top: 12px; font-weight: 400; }

/* 生成失败提示卡 */
.fail-card { margin-top: 20px; text-align: center; }
.fail-card b { font-size: 14px; }
.fail-card p { margin: 8px 0 12px; font-size: 12px; color: var(--ink-2); font-weight: 400; }

/* ===== 计划结果 ===== */
.day-block { margin-top: 4px; }
.day-sec { padding-top: 22px; }
.day-sec b { font-size: 14px; }
/* 餐次卡 */
.meal { margin-top: 0; }
.meal + .meal { margin-top: 10px; }
.mhead { display: flex; align-items: center; gap: 8px; }
/* 餐次图标：圆形淡金底 + 自绘 SVG（禁汉字图标） */
.mico {
    width: 26px; height: 26px; border-radius: 50%; background: var(--brand-light); color: var(--ink-3);
    display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.mtitle { font-size: 13.5px; font-weight: 700; }
.mstation { margin-left: auto; font-size: 10px; color: var(--ink-2); font-weight: 400; }
/* 菜品行：图 / 名 / 价（无真实 id，不做整行跳转） */
.dish-row {
    display: flex; align-items: center; gap: 9px; margin-top: 11px;
    padding: 6px 8px; margin-left: -8px; margin-right: -8px; border-radius: var(--radius-sm);
}
.dish-img { width: 40px; height: 40px; border-radius: var(--radius-sm); object-fit: cover; flex-shrink: 0; font-size: 15px; }
.dish-main { flex: 1; min-width: 0; }
.dish-name { display: block; font-size: 12.5px; font-weight: 700; }
.dish-meta { display: block; font-size: 10px; color: var(--ink-2); margin-top: 2px; font-weight: 400; }

/* 汇总卡 */
.total-card { margin-top: 12px; display: flex; align-items: baseline; gap: 8px; }
.tlabel { font-size: 11px; color: var(--ink-2); font-weight: 400; }
.tnum { margin-left: auto; font-size: 18px; color: var(--brand-dark); }
.tavg { font-size: 10.5px; color: var(--ink-2); font-weight: 400; }

/* 重新生成（保留已填条件） */
.ops { display: flex; margin-top: 14px; }
.regen-btn { width: 100%; padding: 12px 18px; font-size: 14px; }

/* 声明（AC24） */
.compliance { text-align: center; font-size: 10.5px; color: var(--ink-2); margin: 26px 0 8px; line-height: 1.8; }

/* 移动端 wrapper：display:contents 不生成盒子，三餐卡保持原纵向流 */
.meal-grid { display: contents; }

/* ===== 桌面适配（≥769）===== */
@media (min-width: 769px) {
    /* 桌面：计划列收窄至 760px 并保持居中 */
    .plan-page { max-width: 760px; }
    /* 桌面：每日三餐卡改两列网格（间距替代移动端纵向 margin） */
    .meal-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; align-items: start; }
    /* 桌面：网格下清掉卡片间纵向 margin，避免同排卡片错位 */
    .meal-grid .meal + .meal { margin-top: 0; }
}
</style>
