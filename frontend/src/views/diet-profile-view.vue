<template>
    <div class="page-wrap profile-page">
        <!-- 顶部标题栏：返回 + 页名 -->
        <div class="titlebar">
            <span class="icircle back" role="button" aria-label="返回" @click="go_back">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3A2E1A" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>
            </span>
            <b class="tb-title">饮食偏好档案</b>
        </div>

        <!-- 授权说明卡（隐私要求：用途说明 + 授权开关可随时撤回） -->
        <div class="card auth-card fade-up">
            <div class="auth-head">
                <b>档案授权</b>
                <el-switch v-model="form.authorized" />
            </div>
            <p class="auth-text">
                开启后，AI 推荐、口碑榜个性化与饮食计划会读取你的忌口 / 过敏 / 预算设置，让结果更懂你；关闭即撤回授权，已保存内容仅保留在本机，可随时再开。
            </p>
        </div>

        <!-- 忌口 -->
        <div class="card group fade-up" style="animation-delay:.04s">
            <div class="gt">忌口 <small>筛选 / 推荐 / 计划共用</small></div>
            <div class="chips">
                <span
                    v-for="a in AVOID_OPTIONS" :key="a"
                    class="pchip" :class="{ on: form.avoids.includes(a) }"
                    @click="toggle_item(form.avoids, a)"
                >{{ a }}</span>
                <!-- 档案里保存过、但不在预设列表里的自定义忌口 -->
                <span
                    v-for="a in custom_avoids" :key="'c-' + a"
                    class="pchip" :class="{ on: form.avoids.includes(a) }"
                    @click="toggle_item(form.avoids, a)"
                >{{ a }}</span>
            </div>
            <div class="add-row">
                <el-input
                    v-model="avoid_input"
                    size="small"
                    maxlength="8"
                    placeholder="自定义忌口，如「不吃苦瓜」"
                    @keyup.enter="add_avoid"
                />
                <button class="add-btn" type="button" @click="add_avoid">添加</button>
            </div>
        </div>

        <!-- 过敏原 · 严重过敏（硬性过滤，安全要求独立分组） -->
        <div class="card group fade-up" style="animation-delay:.08s">
            <div class="gt">严重过敏 <small>将硬性过滤，务必如实填写</small></div>
            <div class="chips">
                <span
                    v-for="g in SEVERE_OPTIONS" :key="g"
                    class="pchip danger" :class="{ on: form.severe_allergy.includes(g) }"
                    @click="toggle_item(form.severe_allergy, g)"
                >{{ g }}</span>
                <!-- 档案里保存过、但不在预设列表里的自定义过敏原（与忌口口径一致） -->
                <span
                    v-for="g in custom_severe" :key="'cs-' + g"
                    class="pchip danger" :class="{ on: form.severe_allergy.includes(g) }"
                    @click="toggle_item(form.severe_allergy, g)"
                >{{ g }}</span>
            </div>
            <div class="add-row">
                <el-input
                    v-model="severe_input"
                    size="small"
                    maxlength="8"
                    placeholder="自定义过敏原，如「腰果」"
                    @keyup.enter="add_severe"
                />
                <button class="add-btn" type="button" @click="add_severe">添加</button>
            </div>
        </div>

        <!-- 过敏原 · 一般不喜欢（降低出现频率，不强制过滤） -->
        <div class="card group fade-up" style="animation-delay:.12s">
            <div class="gt">一般不喜欢 <small>降低出现频率，不强制过滤</small></div>
            <div class="chips">
                <span
                    v-for="g in MILD_OPTIONS" :key="g"
                    class="pchip" :class="{ on: form.mild_dislike.includes(g) }"
                    @click="toggle_item(form.mild_dislike, g)"
                >{{ g }}</span>
                <!-- 档案里保存过、但不在预设列表里的自定义不喜欢项 -->
                <span
                    v-for="g in custom_mild" :key="'cm-' + g"
                    class="pchip" :class="{ on: form.mild_dislike.includes(g) }"
                    @click="toggle_item(form.mild_dislike, g)"
                >{{ g }}</span>
            </div>
            <div class="add-row">
                <el-input
                    v-model="mild_input"
                    size="small"
                    maxlength="8"
                    placeholder="自定义不喜欢，如「苦瓜」"
                    @keyup.enter="add_mild"
                />
                <button class="add-btn" type="button" @click="add_mild">添加</button>
            </div>
        </div>

        <!-- 素食偏好：开关 + 展开类型选择 -->
        <div class="card group fade-up" style="animation-delay:.16s">
            <div class="gt">素食偏好</div>
            <div class="srow">
                <span class="slabel">我是素食者</span>
                <el-switch v-model="form.vegetarian" />
            </div>
            <div v-if="form.vegetarian" class="chips">
                <span
                    v-for="v in VEGAN_OPTIONS" :key="v"
                    class="pchip" :class="{ on: form.vegan_type === v }"
                    @click="form.vegan_type = v"
                >{{ v }}</span>
            </div>
        </div>

        <!-- 预算区间：双数字输入 -->
        <div class="card group fade-up" style="animation-delay:.2s">
            <div class="gt">单餐预算区间</div>
            <div class="budget-row">
                <span class="yen">¥</span>
                <el-input-number v-model="form.budget_min" :min="3" :max="form.budget_max - 1" size="small" />
                <span class="wave">~</span>
                <span class="yen">¥</span>
                <el-input-number v-model="form.budget_max" :min="form.budget_min + 1" :max="100" size="small" />
            </div>
        </div>

        <!-- 口味偏好 -->
        <div class="card group fade-up" style="animation-delay:.24s">
            <div class="gt">口味偏好 <small>多选</small></div>
            <div class="chips">
                <span
                    v-for="t in TASTE_OPTIONS" :key="t"
                    class="pchip" :class="{ on: form.tastes.includes(t) }"
                    @click="toggle_item(form.tastes, t)"
                >{{ t }}</span>
            </div>
        </div>

        <!-- 饮食目标 -->
        <div class="card group fade-up" style="animation-delay:.28s">
            <div class="gt">饮食目标 <small>可多选，推荐与计划会同时兼顾</small></div>
            <div class="chips">
                <span
                    v-for="g in GOAL_OPTIONS" :key="g"
                    class="pchip" :class="{ on: form.goals.includes(g) }"
                    @click="toggle_goal(g)"
                >{{ g }}</span>
            </div>
        </div>

        <!-- 保存 -->
        <div class="ops">
            <button class="btn-primary save-btn" :disabled="saving" @click="save">{{ saving ? '保存中…' : '保存档案' }}</button>
        </div>

        <p class="compliance-note">档案暂仅保存在本机浏览器 · TODO: 待后端接口后同步云端账号</p>
    </div>
</template>

<script setup>
/**
 * 饮食偏好档案（对齐 P21-饮食偏好档案.html）
 * 忌口多选；过敏原分「严重过敏（硬性过滤）」与「一般不喜欢」两组（安全要求）；
 * 素食开关 + 类型；预算区间双数字输入；口味偏好多选；饮食目标单选；
 * 顶部授权说明卡（用途说明 + 可撤回开关）。
 * 保存 → localStorage(dafu_diet_profile)，供 AI 推荐 / 榜单 / 饮食计划读取。
 * TODO: 待后端接口（当前仅本地持久化）
 */
import { ref, reactive, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';

const router = useRouter();
/** 本地持久化键（TODO: 待后端接口后改为云端同步） */
const STORAGE_KEY = 'dafu_diet_profile';

// 选项常量
const AVOID_OPTIONS = ['不吃香菜', '不吃辣', '不吃内脏', '不吃生冷', '不吃葱姜蒜', '不吃海鲜'];
const SEVERE_OPTIONS = ['花生', '虾蟹', '芒果', '鸡蛋', '牛奶'];
const MILD_OPTIONS = ['虾蟹', '芒果', '香菜', '菌菇', '肥肉'];
const VEGAN_OPTIONS = ['蛋奶素', '纯素'];
const TASTE_OPTIONS = ['微辣党', '嗜辣', '嗜酸', '嗜甜', '清淡', '浓香'];
const GOAL_OPTIONS = ['吃够蔬菜', '控卡', '高蛋白', '无'];

const saving = ref(false);
// 表单数据（保存/回显结构，即档案 schema）
const form = reactive({
    authorized: true,      // 授权开关（撤回后 AI 推荐/榜单/计划不再读取）
    avoids: [],            // 忌口
    severe_allergy: [],    // 严重过敏（硬性过滤）
    mild_dislike: [],      // 一般不喜欢
    vegetarian: false,     // 素食开关
    vegan_type: '',        // 蛋奶素 / 纯素
    budget_min: 8,         // 单餐预算下限
    budget_max: 20,        // 单餐预算上限
    tastes: [],            // 口味偏好
    goals: [],             // 饮食目标（多选；'无' 与其他互斥）
});

const avoid_input = ref('');
const severe_input = ref('');
const mild_input = ref('');
const custom_avoids = computed(() =>
    form.avoids.filter((a) => !AVOID_OPTIONS.includes(a))
);
// 已保存但不在预设里的自定义过敏原 / 不喜欢项（回显时单独渲染，避免被预设覆盖）
const custom_severe = computed(() =>
    form.severe_allergy.filter((g) => !SEVERE_OPTIONS.includes(g))
);
const custom_mild = computed(() =>
    form.mild_dislike.filter((g) => !MILD_OPTIONS.includes(g))
);

/**
 * 添加自定义项（统一口径：去重、最多 8 字、空值忽略）
 * @param {string[]} arr - form 内的多选数组（引用传递，直接 push）
 * @param {{value: string}} input - 对应输入框的 ref
 * @param {string} label - 类别名（忌口 / 严重过敏 / 一般不喜欢），用于提示文案
 */
function add_custom(arr, input, label) {
    const v = (input.value || '').trim();
    if (!v) return;
    if (arr.includes(v)) {
        ElMessage.info(`这个${label}已经在列表里了`);
        input.value = '';
        return;
    }
    arr.push(v);
    input.value = '';
    ElMessage.success(`已添加${label}「${v}」`);
}

/**
 * 添加自定义忌口（去重、最多 8 字）
 */
function add_avoid() {
    add_custom(form.avoids, avoid_input, '忌口');
}

/**
 * 添加自定义严重过敏原（硬性过滤口径与预设一致）
 */
function add_severe() {
    add_custom(form.severe_allergy, severe_input, '过敏原');
}

/**
 * 添加自定义「一般不喜欢」
 */
function add_mild() {
    add_custom(form.mild_dislike, mild_input, '不喜欢的');
}

/**
 * 饮食目标多选；「无」与其他目标互斥
 * @param {string} g
 */
function toggle_goal(g) {
    if (g === '无') {
        form.goals = ['无'];
        return;
    }
    const i = form.goals.indexOf(g);
    if (i >= 0) form.goals.splice(i, 1);
    else form.goals.push(g);
    const none = form.goals.indexOf('无');
    if (none >= 0) form.goals.splice(none, 1);
    if (!form.goals.length) form.goals.push('无');
}

/**
 * 通用多选切换
 * @param {string[]} arr - 目标数组（form 内字段引用）
 * @param {string} v - 选项值
 */
function toggle_item(arr, v) {
    const i = arr.indexOf(v);
    if (i >= 0) arr.splice(i, 1);
    else arr.push(v);
}

/**
 * 保存档案 → localStorage 并给出成功反馈
 */
function save() {
    saving.value = true;
    // 预算区间兜底（上界恒大于下界，由输入约束保证）
    setTimeout(() => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...form, updated_at: Date.now() }));
        saving.value = false;
        ElMessage.success(form.authorized ? '档案已保存，推荐与计划将按此生效' : '档案已保存（授权已关闭，暂不参与个性化）');
    }, 300);
}

/**
 * 返回 AI 助手主页
 */
function go_back() {
    router.push('/ai');
}

onMounted(() => {
    // 回显已保存档案
    try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
        if (saved) {
            Object.assign(form, saved);
            // 兼容旧版单选 goal 字段 → 多选 goals
            if (!Array.isArray(form.goals)) {
                form.goals = saved.goal && saved.goal !== '无' ? [saved.goal] : ['无'];
            }
            delete form.goal;
            // 兼容旧版本缺失字段：三个多选组一律兜底为数组（避免 .includes 抛错）
            for (const k of ['avoids', 'severe_allergy', 'mild_dislike', 'tastes']) {
                if (!Array.isArray(form[k])) form[k] = [];
            }
        } else {
            form.goals = ['无'];
        }
    } catch { /* 本地数据损坏时按默认表单 */ }
});
</script>

<style scoped>
.profile-page { padding-bottom: 8px; }

/* 顶部标题栏 */
.titlebar { height: 48px; display: flex; align-items: center; gap: 10px; margin-top: 10px; }
.tb-title { font-size: 16px; font-weight: 700; }

/* ===== 授权说明卡 ===== */
.auth-card { margin-top: 6px; }
.auth-head { display: flex; align-items: center; justify-content: space-between; }
.auth-head b { font-size: 14px; font-weight: 700; }
.auth-text { margin: 8px 0 0; font-size: 11.5px; color: var(--ink-2); line-height: 1.8; font-weight: 400; }

/* ===== 分组卡 ===== */
.group { margin-top: 12px; }
.gt { font-size: 13.5px; font-weight: 700; margin-bottom: 11px; }
.gt small { font-size: 10px; color: var(--ink-2); font-weight: 400; margin-left: 6px; }
.chips { display: flex; flex-wrap: wrap; gap: 8px; }
.add-row { display: flex; gap: 8px; margin-top: 10px; align-items: center; }
.add-row .el-input { flex: 1; }
.add-btn {
    flex: none; padding: 7px 14px; border-radius: var(--radius-sm); border: 1px solid var(--line);
    background: var(--brand); color: #FFFDF5; font-size: 12px; font-weight: 700; cursor: pointer;
}
/* 选项 chip：微圆角 + 墨色选中 */
.pchip {
    font-size: 12px; padding: 6px 14px; border-radius: var(--radius-sm);
    border: 1px solid var(--line); background: var(--paper); color: var(--ink-3);
    font-weight: 600; cursor: pointer; transition: background .12s ease, color .12s ease;
}
.pchip:hover { background: #FBF3DC; }
.pchip.on { background: var(--ink); color: var(--paper); border-color: var(--ink); }
/* 严重过敏：红系选中（硬性过滤视觉强调） */
.pchip.danger.on { background: #fde8e8; color: var(--bad); border-color: var(--bad); }

/* 素食开关行 */
.srow { display: flex; align-items: center; justify-content: space-between; padding: 2px 0; }
.srow + .chips { margin-top: 11px; }
.slabel { font-size: 12.5px; font-weight: 400; }

/* 预算区间 */
.budget-row { display: flex; align-items: center; gap: 8px; }
.budget-row .el-input-number { width: 110px; }
.yen { font-size: 13px; font-weight: 700; color: var(--ink-3); }
.wave { color: var(--ink-2); }

/* 保存 */
.ops { display: flex; margin-top: 20px; }
.save-btn { width: 100%; padding: 12px 18px; font-size: 14px; }

/* 淡色备注 */
.compliance-note { text-align: center; font-size: 10.5px; color: var(--ink-2); margin: 22px 0 8px; line-height: 1.7; }

/* ===== 桌面适配（≥769）===== */
@media (min-width: 769px) {
    /* 桌面：档案问卷列收窄至 680px 并保持居中（选项为流式 chips，无需网格化） */
    .profile-page { max-width: 680px; }
}

/* ===== 桌面适配（≥1200）===== */
</style>
