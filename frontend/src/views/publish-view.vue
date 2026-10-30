<template>
    <!-- 发布点评（对齐 P10-发布点评.html）：顶栏 → 对象选择 → 场景化维度包子打分 → 正文 → 图片 → 标签 → 匿名 → 发布 -->
    <div class="page-wrap publish-page">
        <!-- 顶部栏：返回 + 居中标题 -->
        <div class="topbar">
            <span class="icircle" @click="$router.back()">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7" /></svg>
            </span>
            <b class="topbar-title">{{ is_edit ? '修改点评' : '写点评' }}</b>
            <span class="topbar-hold"></span>
        </div>

        <!-- 关联对象选择（保留原 SubjectPicker 三级联动逻辑） -->
        <div class="card block">
            <div class="block-title">点评对象</div>
            <subject-picker ref="picker_ref" @change="on_subject" />
            <!-- 找不到菜品 → 共建页提交新增申请，进入审核 -->
            <div class="obj-tip">
                找不到要评的菜品？<a class="link" @click="$router.push('/cobuild')">申请新增 ›</a>
                <span class="tip-sub">提交新增申请，审核通过后即可点评</span>
            </div>
        </div>

        <!-- 场景化评分维度：api_content.dimensions(type) 动态渲染（堂食含排队体验、外卖/微商含配送速度，不适用维度不出现） -->
        <div class="card block">
            <div class="block-title">分项评分 <span class="hint" v-if="!subject">先选点评对象再打分</span></div>
            <div v-for="d in dims" :key="d.key" class="dimrow">
                <div class="dname">{{ d.name }} <span class="dval">{{ form.dimensionScores[d.key] ? form.dimensionScores[d.key] + ' 星' : '未评分' }}</span></div>
                <!-- 星级包子选择器：5 枚插画，选中高亮放大、未选中半透明 -->
                <div class="stars">
                    <img
                        v-for="i in 5" :key="i" :src="`/assets/stars/s${i}.png`" :alt="`${i} 星`"
                        :class="{ on: i <= (form.dimensionScores[d.key] || 0) }" @click="set_dim(d.key, i)"
                    />
                </div>
            </div>
            <div v-if="subject && dims.length === 0" class="dim-empty">维度加载中…</div>
        </div>

        <!-- 正文 -->
        <div class="card block">
            <div class="block-title">想说的话 <span class="hint" v-if="content_len < 20">再写 {{ 20 - content_len }} 字，真实体验更有参考价值</span></div>
            <el-input
                v-model="form.content" type="textarea" :rows="4" maxlength="1000" show-word-limit
                placeholder="味道怎么样？分量足不足？值不值这个价？真实体验帮到更多同学"
            />
        </div>

        <!-- 实拍图（保留原上传逻辑，失败可重试） -->
        <div class="card block">
            <div class="block-title">实拍图（≤3 张）</div>
            <image-uploader ref="uploader_ref" @update:keys="form.imageKeys = $event" />
            <div class="up-tip">上传失败不会清空已写内容，重新点「＋」选择即可重试</div>
        </div>

        <!-- 标签 chips 多选（外层 wrapper 供桌面与匿名卡并排，移动端 display:contents 不影响原流） -->
        <div class="pub-grid">
        <div class="card block">
            <div class="block-title">打标签</div>
            <div class="chip-row">
                <span v-for="t in TAGS" :key="t" class="chip" :class="{ on: form.tags.includes(t) }" @click="toggle_tag(t)">{{ t }}</span>
            </div>
        </div>

        <!-- 匿名 -->
        <div class="card block">
            <div class="anon-row">
                <span>匿名同学（隐藏昵称与头像）</span>
                <el-switch v-model="form.isAnonymous" />
            </div>
        </div>
        </div><!-- /pub-grid -->

        <el-button type="primary" size="large" class="submit-btn" :loading="submitting" @click="do_submit">
            {{ is_edit ? '保存修改' : '发布点评' }}
        </el-button>

        <!-- 机审结果反馈 -->
        <el-dialog v-model="result_open" :title="result_title" width="400px">
            <p>{{ result_msg }}</p>
            <template #footer>
                <el-button @click="result_open = false">知道了</el-button>
            </template>
        </el-dialog>
    </div>
</template>

<script setup>
/**
 * 点评发布页（暖纸奶油风改版，对齐 P10）：
 * 对象选择 → 场景化维度包子打分（dimensions 动态）→ 正文 → 图传 → 标签 → 匿名 → 机审三路反馈
 * 保留原有 create/update 提交字段名与全部业务逻辑
 */
import { ref, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { api_review, api_content } from '../api';
import ImageUploader from '../components/image-uploader.vue';
import SubjectPicker from '../components/subject-picker.vue';

const TAGS = ['推荐', '踩雷', '量大', '实惠', '偏辣', '清淡', '少油'];

const route = useRoute();
const router = useRouter();
const picker_ref = ref(null);
const uploader_ref = ref(null);
const submitting = ref(false);
const is_edit = ref(false);
const edit_id = ref(null);
const subject = ref(null);
// 维度配置（由点评对象的 canteen_type 动态拉取）
const dims = ref([]);
// 编辑模式待回填的分项评分（等维度配置就绪后写入）
const pending_scores = ref(null);
const result_open = ref(false);
const result_status = ref(0);
const result_msg = ref('');

const form = ref({
    dimensionScores: {},
    content: '', imageKeys: [], tags: [], isAnonymous: false,
});

const content_len = computed(() => form.value.content.length);
const result_title = computed(() => ({ 0: '发布成功', 1: '已提交，审核中', 3: '未通过机审' }[result_status.value] || '结果'));

/**
 * 星级包子点选：分数记录进原表单字段 dimensionScores
 * @param {string} key - 维度键
 * @param {number} v - 1~5 星
 */
function set_dim(key, v) {
    form.value.dimensionScores[key] = v;
}

/**
 * 按对象类型拉详情取 canteen_type
 * @param {{subjectType:number, subjectId:number}} s
 */
async function fetch_canteen_type(s) {
    if (s.subjectType === 0) {
        const d = await api_content.dish_detail(s.subjectId);
        return d.dish.canteen_type;
    }
    if (s.subjectType === 1) {
        const d = await api_content.station_detail(s.subjectId);
        return d.station.canteen_type;
    }
    const d = await api_content.canteen_detail(s.subjectId);
    return d.canteen.type;
}

/**
 * 加载维度配置并重置已填分项（默认 0 星 = 全灰，必须用户主动打分）
 * 说明：测试记录第 1 条要求评分默认呈灰色，避免「没点过也显示 5 星」的误导
 * @param {number} canteenType
 */
async function load_dims(canteenType) {
    dims.value = await api_content.dimensions(canteenType);
    const scores = {};
    for (const d of dims.value) scores[d.key] = 0;
    form.value.dimensionScores = scores;
    // 编辑模式：维度就绪后回填原分
    if (pending_scores.value) {
        for (const d of dims.value) {
            if (pending_scores.value[d.key] != null) scores[d.key] = pending_scores.value[d.key];
        }
        pending_scores.value = null;
    }
}

/**
 * 对象选择回调：拉对象详情 → 拉维度配置（切换对象即重置已填维度）
 * @param {Object|null} s
 */
async function on_subject(s) {
    subject.value = s;
    if (!s) {
        dims.value = [];
        form.value.dimensionScores = {};
        return;
    }
    try {
        const ct = await fetch_canteen_type(s);
        await load_dims(ct);
    } catch { /* 拦截器已提示（对象不存在等） */ }
}

/**
 * 标签切换
 * @param {string} t
 */
function toggle_tag(t) {
    const arr = form.value.tags;
    const i = arr.indexOf(t);
    if (i >= 0) arr.splice(i, 1);
    else arr.push(t);
}

/**
 * 提交（机审三路反馈）
 */
async function do_submit() {
    if (!subject.value) {
        ElMessage.warning('请先选择点评对象');
        return;
    }
    // 分项完整性校验：每个维度都需打分（1-5）
    const missing = dims.value.some((d) => {
        const v = form.value.dimensionScores[d.key];
        return !(v >= 1 && v <= 5);
    });
    if (missing) {
        ElMessage.warning('还有分项没打分哦');
        return;
    }
    submitting.value = true;
    try {
        const payload = {
            subjectType: subject.value.subjectType,
            subjectId: subject.value.subjectId,
            dimensionScores: form.value.dimensionScores,
            content: form.value.content,
            isAnonymous: form.value.isAnonymous,
            tags: form.value.tags,
            imageKeys: form.value.imageKeys,
        };
        if (is_edit.value) {
            const res = await api_review.update(edit_id.value, payload);
            handle_result(res.status, res.reason);
        } else {
            const res = await api_review.create(payload);
            handle_result(res.status, res.reason);
        }
    } finally {
        submitting.value = false;
    }
}

/**
 * 机审结果处理：VISIBLE→toast+跳详情；PENDING→说明；BANNED→理由
 * @param {number} status
 * @param {string} reason
 */
function handle_result(status, reason) {
    result_status.value = status;
    if (status === 0) {
        ElMessage.success('已发布！');
        go_dish();
    } else if (status === 1) {
        result_msg.value = '你的点评已提交人工审核，预计 1 小时内完成，审核通过后会展示在详情页。';
        result_open.value = true;
    } else {
        result_msg.value = `你的点评未通过机审：${reason}。如认为误判，可在「我的点评」中查看申诉入口。`;
        result_open.value = true;
    }
}

/**
 * 跳回被评对象详情页（菜品 / 窗口 / 点位）
 */
function go_dish() {
    result_open.value = false;
    if (subject.value) {
        const t = subject.value.subjectType;
        if (t === 0) router.push(`/dish/${subject.value.subjectId}`);
        else if (t === 1) router.push(`/station/${subject.value.subjectId}`);
        else router.push(`/canteen/${subject.value.subjectId}`);
    } else {
        router.push('/');
    }
}

onMounted(async () => {
    // 编辑模式
    if (route.query.reviewId) {
        is_edit.value = true;
        edit_id.value = Number(route.query.reviewId);
        const mine = await api_review.my_reviews();
        const r = mine.find((x) => x.id === edit_id.value);
        if (r) {
            // 分项评分先暂存，等对象回填触发维度加载后再写入表单
            pending_scores.value = { ...(r.dimensionScores || {}) };
            form.value.content = r.content;
            form.value.imageKeys = r.images || [];
            form.value.tags = r.tags;
            form.value.isAnonymous = false;
            // 图片回填
            setTimeout(() => uploader_ref.value && uploader_ref.value.fill(r.images || []), 100);
            // 对象回填（触发 on_subject → 拉维度 → 回填分项）
            setTimeout(() => picker_ref.value && picker_ref.value.fill({ subjectType: r.subjectType, subjectId: r.subjectId }), 100);
        }
        return;
    }
    // 详情页带参进入：预选对象
    if (route.query.type && route.query.id) {
        setTimeout(() => picker_ref.value && picker_ref.value.fill({
            subjectType: Number(route.query.type), subjectId: Number(route.query.id),
        }), 100);
    }
});
</script>

<style scoped>
.publish-page { max-width: 560px; }
/* 顶部栏：返回 + 居中标题 */
.topbar {
    height: 52px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 6px 0;
    color: var(--ink);
}
.topbar-title {
    flex: 1;
    text-align: center;
    font-size: 15px;
    font-weight: 700;
}
.topbar-hold { width: 40px; flex-shrink: 0; }
/* 内容卡块：纵向 14px 节奏（P10 密度），标题与内容间距 12px */
.block { margin-top: 14px; }
.block-title {
    font-size: 14px;
    font-weight: 700;
    margin-bottom: 12px;
    display: flex;
    align-items: baseline;
    gap: 8px;
}
.hint { color: var(--warn); font-weight: 400; font-size: 12px; }
/* 找不到菜品 → 共建申请入口 */
.obj-tip { margin-top: 12px; font-size: 11px; color: var(--ink-2); }
.obj-tip .link { color: var(--brand); font-weight: 700; cursor: pointer; text-decoration: none; margin-right: 6px; }
.tip-sub { font-weight: 400; }
/* 维度行：虚线分隔，标题与包子行间距 ≥12px */
.dimrow { padding: 14px 0 12px; }
.dimrow + .dimrow { border-top: 1px dashed var(--line); }
.dimrow:first-of-type { padding-top: 2px; }
.dname {
    font-size: 12.5px;
    font-weight: 700;
    margin-bottom: 12px;
    display: flex;
    justify-content: space-between;
    align-items: baseline;
}
.dval { font-size: 10px; color: var(--ink-2); font-weight: 400; }
/* 星级包子选择器：选中高亮放大、未选中半透明 */
.stars { display: flex; gap: 10px; justify-content: center; }
.stars img {
    width: 42px;
    height: 42px;
    object-fit: contain;
    opacity: 0.4;
    /* 未选中统一灰度，避免彩色插画被误认为已评分 */
    filter: grayscale(1) contrast(0.9);
    cursor: pointer;
    transition: opacity 0.15s, transform 0.15s, filter 0.15s;
}
.stars img.on { opacity: 1; filter: none; transform: scale(1.08); }
.stars img:hover { opacity: 0.75; }
.dim-empty { font-size: 13px; color: var(--ink-2); }
/* 标签 chips：微圆角，选中墨底 */
.chip-row { display: flex; gap: 8px; flex-wrap: wrap; }
.chip {
    font-size: 12px;
    padding: 6px 12px;
    border-radius: var(--radius-sm);
    background: var(--brand-light);
    color: var(--ink-3);
    cursor: pointer;
    font-weight: 600;
}
.chip.on { background: var(--ink); color: var(--paper); }
/* 图片重试提示 */
.up-tip { margin-top: 10px; font-size: 11px; color: var(--ink-2); }
/* 匿名行 */
.anon-row { display: flex; justify-content: space-between; align-items: center; font-size: 13px; color: var(--ink); }
/* 提交：通栏主按钮 */
.submit-btn { width: 100%; margin-top: 20px; height: 44px; font-size: 15px; }

/* 移动端 wrapper：display:contents 不生成盒子，标签卡与匿名卡保持原纵向流 */
.pub-grid { display: contents; }

/* ===== 桌面适配（≥769）===== */
@media (min-width: 769px) {
    /* 桌面：点评列收窄至 680px 并保持居中（覆盖移动端 560px 档） */
    .publish-page { max-width: 680px; }
    /* 桌面：标签卡与匿名卡并排成两列（间距替代移动端纵向 margin） */
    .pub-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-top: 14px; align-items: start; }
    /* 桌面：并排卡清掉纵向 margin，避免两卡上下错位 */
    .pub-grid .block { margin-top: 0; }
}
</style>
