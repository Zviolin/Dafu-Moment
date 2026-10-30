<template>
    <div class="page-wrap detail-page">
        <!-- 加载/失败兜底 -->
        <div v-if="failed" class="empty-tip card">这条内容走丢了，回点评圈看看别的吧</div>

        <template v-else-if="post">
            <!-- 1. 顶部作者栏：返回 / 头像 / 昵称+认证签 / 关注钮 / 分享 -->
            <div class="authorbar">
                <button class="icircle" aria-label="返回" @click="go_back">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7" /></svg>
                </button>
                <img class="avatar-fix av" :src="post.avatar" alt="头像" />
                <div class="who">
                    <div class="name">{{ post.author }}</div>
                    <div class="time">{{ post.time }}</div>
                </div>
            </div>

            <!-- 2. 通栏大图 / 宫格 -->
            <div v-if="post.images.length" class="hero-grid" :class="`n${Math.min(post.images.length, 3)}`">
                <img v-for="(img, i) in post.images.slice(0, 3)" :key="i" :src="img" loading="lazy" alt="点评图片" />
            </div>

            <!-- 3. 正文区：正文 + 多维评分（按场景显示适用维度） -->
            <div class="body-sec fade-up">
                <p class="content">{{ post.content }}</p>

                <div v-if="dim_rows.length" class="dims">
                    <div v-for="d in dim_rows" :key="d.name" class="dim">
                        <span class="dim-name">{{ d.name }}</span>
                        <span class="stars">
                            <svg v-for="i in 5" :key="i" viewBox="0 0 24 24" width="13" height="13" :class="{ on: i <= Math.round(d.value) }"><path d="M12 3l2.7 5.6 6.1.8-4.5 4.2 1.1 6-5.4-3-5.4 3 1.1-6L3.2 9.4l6.1-.8z" /></svg>
                        </span>
                        <b class="score-num dim-val">{{ d.value }}</b>
                    </div>
                </div>

                <div v-if="post.overall" class="overall">
                    <span class="ol-label">TA 的总评</span>
                    <span class="chip">{{ post.scene === '外卖' ? '外卖配送' : '堂食体验' }}</span>
                    <b class="score-num ol-score">★ {{ post.overall }}</b>
                </div>

                <div v-if="post.topics.length" class="topics">
                    <span v-for="t in post.topics" :key="t" class="chip">{{ t }}</span>
                </div>
            </div>

            <!-- 4. 互动条：点赞 / 评论 / 举报 / 分享 -->
            <div class="interact card fade-up">
                <span class="op" :class="{ on: liked }" @click="toggle_like">
                    <img class="like-img" src="/assets/icons/icon-like.png" alt="赞" /><i class="score-num">{{ like_count }}</i>
                </span>
                <span class="op" @click="focus_input">
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a8 8 0 0 1-8 8H4l2.2-3.3A8 8 0 1 1 21 12z" /></svg>
                    <i class="score-num">{{ comments.length }}</i>
                </span>
                <span class="op" @click="go_report">
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M5 21V4" /><path d="M5 5h13l-2.5 4L18 13H5" /></svg>
                    <i>举报</i>
                </span>
                <span class="op" @click="share_open = true">
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="6" cy="12" r="2.6" /><circle cx="17" cy="5.5" r="2.6" /><circle cx="17" cy="18.5" r="2.6" /><path d="M8.3 10.8l6.4-4M8.3 13.2l6.4 4" /></svg>
                    <i>分享</i>
                </span>
            </div>

            <!-- 5. 评论区 -->
            <div class="cmt-sec">
                <div class="cmt-head">
                    <b>评论 · {{ comments.length }}</b>
                    <span>按时间</span>
                </div>
                <div class="hairline"></div>

                <div v-for="c in comments" :key="c.id" class="cmt-card card fade-up">
                    <div class="crow">
                        <img class="avatar-fix cav" :src="c.avatar" alt="头像" />
                        <b class="cname">{{ c.author }}</b>
                        <span class="ctime">{{ c.time }}</span>
                    </div>
                    <p class="ccontent">{{ c.content }}</p>
                </div>

                <div v-if="comments.length === 0" class="cmt-empty">还没有评论，来说第一句吧</div>
            </div>

            <!-- 底部留白，避让固定输入条 -->
            <div class="bottom-space"></div>
        </template>

        <!-- 分享弹窗：可复制链接（对齐修改说明 C7 形态） -->
        <el-dialog v-model="share_open" title="分享给同学" width="320px">
            <el-input :model-value="share_link" readonly />
            <template #footer>
                <el-button type="primary" @click="copy_link">复制链接</el-button>
            </template>
        </el-dialog>

        <!-- 底部固定评论输入条（登录后可发） -->
        <div class="cmt-bar">
            <img class="avatar-fix mav" :src="my_avatar" alt="我" />
            <input
                ref="input_ref" v-model="draft" class="cmt-input" type="text"
                placeholder="说点什么…" maxlength="300" @keyup.enter="send_comment"
            />
            <button class="send-btn" @click="send_comment">发送</button>
        </div>
    </div>
</template>

<script setup>
/**
 * 点评详情（/post/:id）：对齐 P11 原型
 * - 作者头（头像/昵称/校内已认证签/关注钮）、多维评分（按场景显示适用维度）、正文、图片
 * - 互动条：点赞可切换 / 收藏 / 评论数 / 举报 → /report / 分享 → 复制链接弹窗
 * - 评论列表 + 底部固定评论输入条（登录后可发）
 * - 数据：动态 id 形如 p-12 走 /posts/12；点评为纯数字 id 走 /reviews/12
 */
import { ref, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { api_review, api_post } from '../api';
import { useAuthStore } from '../stores/auth';
import { time_ago } from '../utils/format';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();

const post = ref(null);
const failed = ref(false);
const liked = ref(false);
const like_count = ref(0);
const comments = ref([]);
const draft = ref('');
const input_ref = ref(null);
const share_open = ref(false);
// 数据来源标记：来自接口的点评 id（评论/点赞走真实接口）
const review_id = ref(null);
// 动态 id：来自 /posts/{id}（点评圈会以 p-{id} 形式跳转）
const post_id = ref(null);

/** 维度定义：口味/份量/包装通用；排队体验堂食适用、配送速度外卖适用 */
const DIM_DEFS = [
    { key: 'taste', name: '口味' },
    { key: 'portion', name: '份量' },
    { key: 'package', name: '包装' },
    { key: 'queue', name: '排队体验' },
    { key: 'delivery', name: '配送速度' },
];

/** 我的头像（评论输入条展示） */
const my_avatar = '/assets/avatar-user.png';
/** 分享链接（History 路由，直接拼当前页地址） */
const share_link = computed(() => `${location.origin}/post/${route.params.id}`);

/** 适用维度行：堂食不显示配送速度，外卖不显示排队体验 */
const dim_rows = computed(() => {
    const p = post.value;
    if (!p) return [];
    const scene = p.scene || '堂食';
    return DIM_DEFS
        .filter((d) => (scene === '外卖' ? d.key !== 'queue' : d.key !== 'delivery'))
        .map((d) => ({ name: d.name, value: Number(p.scores?.[d.key]) || 0 }))
        .filter((d) => d.value > 0);
});

/**
 * 头像/图片地址归一：对象键走 /img 代理，站内路径与完整链接原样返回
 * @param {string|null} key
 * @returns {string}
 */
function avatar_url(key) {
    if (!key) return '/assets/avatar-user.png';
    const s = String(key);
    if (s.startsWith('/') || s.startsWith('http')) return s;
    return `/img/${s}`;
}

/**
 * 加载详情：
 * - 动态 id 形如 p-12（点评圈跳转口径）→ /posts/12
 * - 点评 id 为纯数字 → /reviews/12
 * 两类都加载真实评论列表，未命中即失败态（无假数据兜底）
 */
async function load_post() {
    failed.value = false;
    const id = String(route.params.id || '');
    if (/^p-\d+$/.test(id)) {
        try {
            const d = await api_post.get(id.slice(2));
            if (d && d.id) {
                apply_post(d);
                await load_comments();
                return;
            }
        } catch { /* 接口不可用 → 失败态 */ }
    }
    if (/^\d+$/.test(id)) {
        try {
            const d = await api_review.get(id);
            if (d && d.id) {
                apply_review(d);
                await load_comments();
                return;
            }
        } catch { /* 接口不可用 → 失败态 */ }
    }
    failed.value = true;
}

/**
 * 将接口点评映射为详情数据
 * @param {Object} r
 */
function apply_review(r) {
    review_id.value = r.id;
    post_id.value = null;
    const scores = r.dimensionScores || {};
    post.value = {
        author: r.nickname || '福大同学',
        avatar: avatar_url(r.avatar_object_key),
        time: time_ago(r.createdAt),
        scene: Number(scores.delivery) > 0 ? '外卖' : '堂食',
        overall: Number(r.overallScore) || 0,
        content: r.content || '（纯图点评）',
        images: (r.images || []).slice(0, 3).map((k) => avatar_url(k)),
        topics: (r.tags || []).map((t) => `#${t}#`),
        scores,
    };
    comments.value = [];
    liked.value = !!r.liked;
    like_count.value = Number(r.likeCount) || 0;
}

/**
 * 将接口动态映射为详情数据（无评分维度，不展示星级）
 * @param {Object} p
 */
function apply_post(p) {
    post_id.value = p.id;
    review_id.value = null;
    post.value = {
        author: p.author?.nickname || '福大同学',
        avatar: avatar_url(p.author?.avatar_object_key),
        time: time_ago(p.created_at),
        scene: '动态',
        overall: 0,
        content: p.content || '（纯图动态）',
        images: (p.images || []).slice(0, 3).map((k) => avatar_url(k)),
        topics: (p.topics || []).map((t) => `#${t}#`),
        scores: {},
    };
    comments.value = [];
    liked.value = !!p.liked;
    like_count.value = Number(p.like_count) || 0;
}

/**
 * 加载评论列表（点评/动态共用单层评论服务）
 */
async function load_comments() {
    try {
        const d = post_id.value
            ? await api_post.comments(post_id.value)
            : await api_review.comments(review_id.value);
        const rows = Array.isArray(d) ? d : (d && Array.isArray(d.list) ? d.list : []);
        comments.value = rows.map((c) => ({
            id: c.id,
            author: c.nickname || '福大同学',
            avatar: avatar_url(c.avatar_object_key),
            content: c.content,
            time: time_ago(c.created_at),
        }));
    } catch { /* 评论接口不可用时保持空列表，不影响正文展示 */ }
}

/**
 * 返回上一页
 */
function go_back() {
    router.back();
}

/**
 * 聚焦底部评论输入条
 */
function focus_input() {
    input_ref.value?.focus();
}

/**
 * 去举报页
 */
function go_report() {
    router.push('/report');
}

/**
 * 复制分享链接到剪贴板
 */
async function copy_link() {
    try {
        await navigator.clipboard.writeText(share_link.value);
    } catch {
        // 剪贴板 API 不可用时走 execCommand 兜底
        const el = document.createElement('textarea');
        el.value = share_link.value;
        document.body.appendChild(el);
        el.select();
        document.execCommand('copy');
        document.body.removeChild(el);
    }
    share_open.value = false;
    ElMessage.success('链接已复制，快去发给同学吧');
}

/**
 * 点赞切换：动态走 api_post.like，点评走 api_review.like
 */
async function toggle_like() {
    if (!auth.is_login) {
        ElMessage.warning('登录后才能点赞');
        router.push({ path: '/login', query: { redirect: route.fullPath } });
        return;
    }
    try {
        if (post_id.value) {
            const d = await api_post.like(post_id.value);
            liked.value = !!d.liked;
            like_count.value = Number(d.like_count ?? d.likeCount) || 0;
            return;
        }
        if (review_id.value) {
            const d = await api_review.like(review_id.value);
            liked.value = !!d.liked;
            like_count.value = Number(d.likeCount ?? d.like_count) || 0;
            return;
        }
    } catch { /* 失败回落本地切换 */ }
    liked.value = !liked.value;
    like_count.value += liked.value ? 1 : -1;
}

/**
 * 发送评论：未登录先去登录；已登录写入服务端后重新拉取评论列表
 */
async function send_comment() {
    const text = draft.value.trim();
    if (!text) return;
    if (!auth.is_login) {
        ElMessage.warning('登录后才能评论');
        router.push({ path: '/login', query: { redirect: route.fullPath } });
        return;
    }
    if (!post.value) return;
    try {
        if (post_id.value) {
            await api_post.comment(post_id.value, { content: text });
        } else if (review_id.value) {
            await api_review.comment(review_id.value, { content: text });
        }
    } catch (e) {
        ElMessage.error(e?.message || '评论失败，请稍后再试');
        return;
    }
    draft.value = '';
    await load_comments();
}

onMounted(load_post);
</script>

<style scoped>
/* 作者栏：返回圆钮 + 头像 + 昵称 + 关注 */
.authorbar { display: flex; align-items: center; gap: 10px; padding: 10px 0 12px; }
.av { width: 34px; height: 34px; border-radius: 50%; }
.who { flex: 1; min-width: 0; }
.name { font-size: 13.5px; font-weight: 700; display: flex; align-items: center; gap: 6px; }
.time { font-size: 10.5px; color: var(--ink-2); margin-top: 2px; font-weight: 400; }

/* 通栏大图 / 宫格 */
.hero-grid { display: grid; gap: 6px; }
.hero-grid.n1 { grid-template-columns: 1fr; }
.hero-grid.n2 { grid-template-columns: 1fr 1fr; }
.hero-grid.n3 { grid-template-columns: repeat(3, 1fr); }
.hero-grid img { width: 100%; height: 150px; object-fit: cover; border-radius: var(--radius-sm); }
.hero-grid.n1 img { height: 190px; }

/* 正文区 */
.body-sec { padding-top: 14px; }
.content { margin: 0; font-size: 13.5px; line-height: 1.8; font-weight: 400; color: var(--ink); }

/* 多维评分：名称 + 五星 SVG + 分值 */
.dims { margin-top: 14px; display: flex; flex-direction: column; gap: 9px; }
.dim { display: flex; align-items: center; gap: 10px; }
.dim-name { width: 58px; flex-shrink: 0; font-size: 12px; color: var(--ink-2); font-weight: 400; }
.stars { display: inline-flex; gap: 2px; }
.stars svg { fill: var(--line); }
.stars svg.on { fill: var(--star); }
.dim-val { font-size: 13px; color: var(--brand-dark); }

/* 总评行 */
.overall { display: flex; align-items: center; gap: 8px; margin-top: 14px; }
.ol-label { font-size: 12px; color: var(--ink-2); font-weight: 400; }
.ol-score { font-size: 15px; color: var(--star); }

.topics { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 12px; }

/* 互动条：无框卡一行五项 */
.interact {
    margin-top: 16px;
    display: flex;
    align-items: center;
    justify-content: space-around;
    padding: 12px 8px;
}
.op { display: inline-flex; align-items: center; gap: 5px; font-size: 12px; color: #5C4A2E; cursor: pointer; font-weight: 400; transition: color .12s ease; }
.op i { font-style: normal; }
.op:hover { color: var(--brand-dark); }
.op .like-img { width: 17px; height: 17px; object-fit: contain; opacity: .55; filter: grayscale(1); transition: opacity .12s ease, filter .12s ease; }
.op.on { color: var(--brand-dark); font-weight: 700; }
.op.on .like-img { opacity: 1; filter: none; }

/* 评论区 */
.cmt-sec { margin-top: 24px; }
.cmt-head { display: flex; align-items: baseline; justify-content: space-between; }
.cmt-head b { font-size: 13px; font-weight: 700; }
.cmt-head span { font-size: 10.5px; color: var(--ink-2); }
.cmt-card { margin-top: 10px; padding: 12px 14px; }
.crow { display: flex; align-items: center; gap: 7px; }
.cav { width: 24px; height: 24px; border-radius: 50%; }
.cname { font-size: 12px; font-weight: 700; }
.ctime { margin-left: auto; font-size: 10px; color: var(--ink-2); font-weight: 400; }
.ccontent { margin: 8px 0 0; font-size: 12.5px; line-height: 1.7; color: #5C4A2E; font-weight: 400; }
.cmt-empty { text-align: center; font-size: 12px; color: var(--ink-2); padding: 26px 0; }

.bottom-space { height: 84px; }

/* 底部固定评论输入条：抬升至 tabbar 上方（tabbar 高约 62px），避免被盖住 */
.detail-page { padding-bottom: 150px; } /* 页尾让位 评论输入条 + tabbar */
.cmt-bar {
    position: fixed;
    left: 50%;
    transform: translateX(-50%);
    bottom: calc(72px + env(safe-area-inset-bottom));
    width: 100%;
    max-width: 480px;
    background: var(--paper);
    border-top: 1px solid var(--line);
    border-bottom: 1px solid var(--line);
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 9px 14px;
    z-index: 60;
}
.mav { width: 28px; height: 28px; border-radius: 50%; }
.cmt-input {
    flex: 1;
    min-width: 0;
    height: 36px;
    border: 1px solid var(--line);
    border-radius: var(--radius-sm);
    background: var(--page);
    padding: 0 12px;
    font-size: 12.5px;
    color: var(--ink);
    outline: none;
    font-family: inherit;
}
.cmt-input::placeholder { color: var(--ink-2); }
.cmt-input:focus { border-color: var(--brand); }
.send-btn {
    flex-shrink: 0;
    height: 36px;
    padding: 0 16px;
    border: none;
    border-radius: var(--radius-sm);
    background: var(--brand);
    color: #FFFDF5;
    font-size: 12.5px;
    font-weight: 700;
    cursor: pointer;
    transition: background .12s ease;
}
.send-btn:hover { background: var(--brand-dark); }

.empty-tip { text-align: center; color: var(--ink-2); padding: 44px 0; }

@media (max-width: 768px) {
    .cmt-bar { bottom: calc(66px + env(safe-area-inset-bottom)); }
    .bottom-space { height: 150px; }
}

/* ===== 桌面适配（≥769）===== */
@media (min-width: 769px) {
    /* 阅读宽度：780px 居中，正文与评论行宽更舒适（覆盖全局 1080） */
    .page-wrap { max-width: 780px; }
    /* 宫格大图：宽幅下加高保持图片视觉分量 */
    .hero-grid img { height: 200px; }
    .hero-grid.n1 img { height: 320px; }
    /* 评论输入条：与阅读列同宽；桌面无底部 tabbar，改为贴底悬浮圆角卡 */
    .cmt-bar { max-width: 780px; bottom: 20px; border: 1px solid var(--line); border-radius: var(--radius); box-shadow: var(--shadow-soft); }
    /* 页尾让位：桌面无 tabbar，底部预留相应减小 */
    .detail-page { padding-bottom: 110px; }
}
</style>
