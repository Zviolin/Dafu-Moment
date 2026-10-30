<template>
    <div class="review-card card">
        <div class="head">
            <user-avatar
                :anon="review.isAnonymous"
                :user="{ id: review.userId, nickname: review.nickname, avatar: review.avatar, avatar_object_key: review.avatar_object_key }"
                :size="36"
                :class="{ 'avatar-link': can_visit_author }" @click="go_author"
            />
            <div class="who">
                <div class="name">
                    <span :class="{ 'author-link': can_visit_author }" @click="go_author">{{ review.nickname }}</span>
                    <el-tag v-if="review.isAnonymous" size="small" type="info" effect="plain">匿名</el-tag>
                    <el-tag v-if="review.status === 2" size="small" type="info">已下架</el-tag>
                </div>
                <div class="time">{{ time_ago(review.createdAt) }}</div>
            </div>
            <star-rating :model-value="review.overallScore" readonly />
        </div>

        <!-- 分项迷你条（v2.0：维度动态，dimensionScores 对象 + dims 配置） -->
        <div class="dims">
            <span v-for="d in dim_list" :key="d.name" class="dim">
                <i class="dim-name">{{ d.name }}</i>
                <i class="dim-track"><i class="dim-bar" :style="{ width: (d.value / 5) * 100 + '%' }"></i></i>
                <i class="dim-val score-num">{{ d.value }}</i>
            </span>
        </div>

        <p class="content">{{ review.content }}</p>

        <!-- 实拍图 -->
        <div v-if="review.images.length" class="imgs">
            <img v-for="k in review.images" :key="k" :src="`/img/${k}`" loading="lazy" decoding="async" alt="" />
        </div>

        <!-- 标签 -->
        <div v-if="review.tags.length" class="tags">
            <span v-for="t in review.tags" :key="t" class="tag" :class="{ bad: t === '踩雷' }">{{ t }}</span>
        </div>

        <!-- 窗口回应 -->
        <div v-if="review.reply" class="reply">
            <b>{{ review.reply.nickname }}（窗口）：</b>{{ review.reply.content }}
        </div>

        <div class="ops">
            <!-- 点赞（靠左小号，与有用/没用并存）：已赞实色果酱橙，未赞描边墨色 -->
            <button class="like-btn" :class="{ on: liked }" @click="do_like">
                <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" aria-hidden="true">
                    <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                </svg>
                <span class="score-num">{{ like_count }}</span>
            </button>
            <span class="vote" :class="{ on: my_vote === 1 }" @click="do_vote(1)">
                👍 有用 {{ review.upCount }}
            </span>
            <span class="vote" :class="{ on: my_vote === -1 }" @click="do_vote(-1)">
                👎 没用 {{ review.downCount }}
            </span>
            <span v-if="can_reply" class="op-link" @click="reply_open = true">回应</span>
            <span v-if="is_mine && review.status === 2" class="op-link" @click="do_appeal">申诉</span>
            <span v-if="is_mine && review.status !== 3" class="op-link" @click="$emit('edit')">修改</span>
            <span v-if="is_mine && review.status !== 3" class="op-link danger" @click="do_delete">删除</span>
            <span v-if="!is_mine && auth.is_login" class="op-link" @click="report_open = true">举报</span>
        </div>

        <!-- 回应弹窗（窗口负责人） -->
        <el-dialog v-model="reply_open" title="公开回应" width="480px">
            <el-input v-model="reply_text" type="textarea" :rows="3" maxlength="500" show-word-limit placeholder="公开回应这条点评，其他同学也能看到" />
            <template #footer>
                <el-button @click="reply_open = false">取消</el-button>
                <el-button type="primary" @click="do_reply">发布回应</el-button>
            </template>
        </el-dialog>

        <!-- 举报弹窗 -->
        <el-dialog v-model="report_open" title="举报这条点评" width="420px">
            <el-select v-model="report_reason" placeholder="选择举报理由" style="width: 100%">
                <el-option :value="1" label="垃圾广告" />
                <el-option :value="2" label="人身攻击" />
                <el-option :value="3" label="虚假信息" />
                <el-option :value="4" label="抄袭搬运" />
                <el-option :value="5" label="其他" />
            </el-select>
            <el-input v-model="report_detail" type="textarea" :rows="2" class="report-detail" placeholder="补充说明（可选）" />
            <template #footer>
                <el-button @click="report_open = false">取消</el-button>
                <el-button type="danger" @click="do_report">提交举报</el-button>
            </template>
        </el-dialog>
    </div>
</template>

<script setup>
/**
 * ReviewCard：评价卡（头像/星级/四维/图/标签/点赞/投票/回应/举报，04 §四）
 * - 头像/昵称点击 → 他人主页 /user/:id（匿名点评不跳转）
 * - 点赞：POST /reviews/:id/like toggle，未登录跳登录
 */
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import StarRating from './star-rating.vue';
import UserAvatar from './user-avatar.vue';
import { api_review, api_report } from '../api';
import { useAuthStore } from '../stores/auth';
import { time_ago } from '../utils/format';

const props = defineProps({
    review: { type: Object, required: true },
    // 维度配置数组 [{key, name}]（按点位类型动态传入）
    dims: { type: Array, default: () => [] },
    // 窗口负责人模式：显示回应按钮
    manager_mode: { type: Boolean, default: false },
    // 我的档案模式：显示修改/删除/申诉
    mine_mode: { type: Boolean, default: false },
});
const emit = defineEmits(['changed', 'edit']);

const router = useRouter();
const auth = useAuthStore();
const reply_open = ref(false);
const reply_text = ref('');
const report_open = ref(false);
const report_reason = ref(null);
const report_detail = ref('');

const is_mine = computed(() => auth.is_login && auth.user && auth.user.id === props.review.userId && props.review.userId !== 0);
const can_reply = computed(() => props.manager_mode && !props.review.reply);

// 分项迷你条数据：review.dimensionScores 对象按 dims 配置展开（未打分的维度不显示）
const dim_list = computed(() => (props.dims || [])
    .map((d) => ({
        name: d.name,
        value: Number(props.review.dimensionScores?.[d.key]) || 0,
    }))
    .filter((d) => d.value > 0));

// 投票本地去重（课程口径：localStorage）
const my_vote = computed(() => Number(localStorage.getItem(`fk_vote_${props.review.id}`) || 0));

// 点赞状态（后端新字段 liked / likeCount，缺省防御为未赞 0 赞）
const liked = ref(!!props.review.liked);
const like_count = ref(Number(props.review.likeCount) || 0);

// 作者主页可跳转：非匿名且 userId 有效（匿名评价 userId 为 0）
const can_visit_author = computed(() => !props.review.isAnonymous && !!props.review.userId && props.review.userId !== 0);

/**
 * 跳作者公开主页
 */
function go_author() {
    if (!can_visit_author.value) return;
    router.push(`/user/${props.review.userId}`);
}

/**
 * 点赞/取消赞 toggle（服务端为唯一事实源，成功后回写 liked/likeCount；未登录跳登录）
 */
async function do_like() {
    if (!auth.is_login) {
        router.push({ path: '/login', query: { redirect: router.currentRoute.value.fullPath } });
        return;
    }
    try {
        const d = await api_review.like(props.review.id);
        liked.value = !!d.liked;
        like_count.value = Number(d.likeCount) || 0;
    } catch { /* 拦截器已提示 */ }
}

/**
 * 投票（乐观更新 + 失败回滚）
 * @param {number} v - 1/-1
 */
async function do_vote(v) {
    const prev = my_vote.value;
    const next = prev === v ? 0 : v;
    const delta = next - (prev === 1 ? 1 : 0) * (v === 1 ? 1 : 0);
    // 简化：直接按 next-prev 语义计算
    const d = next === 0 ? -prev : (prev === 0 ? next : 0);
    try {
        localStorage.setItem(`fk_vote_${props.review.id}`, String(next));
        await api_review.vote(props.review.id, d);
        if (next === 1) props.review.upCount++;
        if (prev === 1 && next !== 1) props.review.upCount--;
        if (next === -1) props.review.downCount++;
        if (prev === -1 && next !== -1) props.review.downCount--;
    } catch {
        localStorage.setItem(`fk_vote_${props.review.id}`, String(prev));
    }
}

/**
 * 举报
 */
async function do_report() {
    if (!report_reason.value) {
        ElMessage.warning('请选择举报理由');
        return;
    }
    await api_report.create({ subjectType: 0, subjectId: props.review.id, reason: report_reason.value, detail: report_detail.value });
    report_open.value = false;
    ElMessage.success('举报已提交，管理员会尽快处理');
}

/**
 * 公开回应（窗口负责人）
 */
async function do_reply() {
    await api_review.reply(props.review.id, reply_text.value);
    reply_open.value = false;
    ElMessage.success('回应已发布');
    emit('changed');
}

/**
 * 申诉（FOLDED → 复审）
 */
async function do_appeal() {
    await ElMessageBox.confirm('申诉后你的点评会重新进入人工复审，确定申诉吗？', '申诉');
    await api_review.appeal(props.review.id);
    ElMessage.success('申诉已提交');
    emit('changed');
}

/**
 * 删除自己的评价
 */
async function do_delete() {
    await ElMessageBox.confirm('删除后无法恢复，确定删除这条点评吗？', '删除点评');
    await api_review.remove(props.review.id);
    ElMessage.success('已删除');
    emit('changed');
}
</script>

<style scoped>
.review-card { margin-bottom: 12px; }
.head { display: flex; align-items: center; gap: 10px; }
.who { flex: 1; }
.name { font-weight: 700; font-size: 14px; display: flex; gap: 6px; align-items: center; }
.time { font-size: 11px; color: var(--ink-2); }
.dims { display: flex; gap: 14px; margin: 10px 0 4px; flex-wrap: wrap; }
.dim { display: flex; align-items: center; gap: 5px; font-size: 11px; }
.dim-name, .dim-track, .dim-val { font-style: normal; }
.dim-name { color: var(--ink-2); }
.dim-track { width: 44px; height: 5px; background: #f0f0f0; border-radius: 3px; overflow: hidden; display: inline-block; }
.dim-bar { height: 100%; background: var(--brand); border-radius: 3px; display: block; }
.dim-val { color: var(--brand); font-weight: 700; }
.content { margin: 8px 0; font-size: 14px; line-height: 1.7; white-space: pre-wrap; }
.imgs { display: flex; gap: 8px; margin-bottom: 8px; }
.imgs img { width: 96px; height: 96px; object-fit: cover; border-radius: 8px; border: 2px solid var(--ink); box-shadow: 0 2px 0 rgba(61, 47, 30, 0.35); }
.tags { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 8px; }
.tag { font-size: 11px; color: var(--brand); background: var(--brand-light); padding: 2px 8px; border-radius: var(--radius-sm); }
.tag.bad { color: var(--bad); background: #fdecec; }
.reply {
    background: var(--page); border-radius: 8px; padding: 10px 12px;
    font-size: 13px; color: var(--ink); margin-bottom: 8px;
}
.ops { display: flex; gap: 16px; font-size: 12px; color: var(--ink-2); align-items: center; }
.vote { cursor: pointer; }
.vote.on { color: var(--brand); font-weight: 700; }
/* 作者跳转：头像/昵称 hover 变果酱橙提示可点（匿名无此态） */
.avatar-link { cursor: pointer; transition: transform .12s ease; }
.avatar-link:hover { transform: rotate(-4deg); }
.author-link { cursor: pointer; }
.author-link:hover { color: var(--brand); text-decoration: underline; }
/* 点赞按钮：微圆角小签，已赞琥珀底、未赞淡描边 */
.like-btn {
    display: inline-flex; align-items: center; gap: 4px;
    padding: 2px 10px; border-radius: var(--radius-sm);
    font-size: 12px; line-height: 16px; font-weight: 700; color: var(--ink);
    background: var(--paper); border: 1px solid var(--line);
    cursor: pointer; user-select: none;
    transition: transform .08s ease, box-shadow .08s ease, background .12s ease;
}
.like-btn:hover { background: var(--brand-light); color: var(--brand-dark); }
.like-btn:active { transform: translateY(2px); box-shadow: 0 0 0 var(--ink); }
.like-btn.on { background: var(--brand); }
.like-btn.on:hover { background: var(--brand); color: var(--ink); }
.op-link { cursor: pointer; }
.op-link:hover { color: var(--brand); }
.op-link.danger:hover { color: var(--bad); }
.report-detail { margin-top: 10px; }
</style>
