<template>
    <div class="page-wrap circle-page">
        <!-- 二级导航：四项水平居中（修改说明 C10） -->
        <nav class="lv2">
            <a
                v-for="t in TABS" :key="t.key" href="javascript:;"
                :class="{ on: active_tab === t.key }" @click="switch_tab(t.key)"
            >{{ t.name }}</a>
        </nav>

        <!-- 顶部宠物入口小卡：去喂福宝 → /pet-community -->
        <div class="pet-entry card fade-up" @click="go_pet">
            <img class="avatar-fix pet-img" src="/assets/icons/grid-avatar.png" alt="福宝" />
            <div class="pet-info">
                <b>我的福宝</b>
                <span>福宝已经在食堂门口等你好久啦</span>
            </div>
            <span class="pet-go">去喂福宝
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7" /></svg>
            </span>
        </div>

        <!-- 动态卡流 -->
        <div class="feed">
            <article v-for="p in feed_list" :key="p.id" class="post-card card fade-up">
                <!-- 作者行：头像 / 昵称 / 时间 -->
                <div class="author-row">
                    <img class="avatar-fix av" :src="p.avatar" alt="头像" />
                    <div class="who">
                        <div class="name">{{ p.author }}</div>
                        <div class="time">{{ p.time }}</div>
                    </div>
                </div>

                <!-- 正文（点击进详情） -->
                <p class="content" @click="go_detail(p)">{{ p.content }}</p>

                <!-- 图片 1~3 宫格 -->
                <div v-if="p.images.length" class="img-grid" :class="`n${p.images.length}`" @click="go_detail(p)">
                    <img v-for="(img, i) in p.images" :key="i" :src="img" loading="lazy" alt="" />
                </div>

                <!-- 话题 chip -->
                <div v-if="p.topics.length" class="topics">
                    <span v-for="t in p.topics" :key="t" class="chip">{{ t }}</span>
                </div>

                <!-- 互动条：点赞（icon-like） / 评论 / 收藏 -->
                <div class="ops">
                    <span class="op" :class="{ on: p.liked }" @click="toggle_like(p)">
                        <img class="like-img" src="/assets/icons/icon-like.png" alt="赞" /><i class="score-num">{{ p.likes }}</i>
                    </span>
                    <span class="op" @click="go_detail(p)">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a8 8 0 0 1-8 8H4l2.2-3.3A8 8 0 1 1 21 12z" /></svg>
                        <i class="score-num">{{ p.comments }}</i>
                    </span>
                </div>
            </article>

            <!-- 空态 -->
            <div v-if="!loading && feed_list.length === 0" class="empty-tip card">
                社区还没有动态，去写一条点评吧
            </div>
        </div>

        <!-- 悬浮发布按钮：水平居中（修改说明 C11），点击 → 发动态 -->
        <button class="fab" aria-label="发动态" @click="go_publish">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#FFFDF5" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14" /></svg>
        </button>
    </div>
</template>

<script setup>
/**
 * 点评圈（/circle）：对齐 P09 原型 + 修改说明 C10/C11
 * - 二级导航「推荐 / 最新」水平居中，切换过滤数据（关注 / 社区无后端数据源，已移除）
 * - 动态卡流：作者行 / 正文 / 图片宫格 / 话题 chip / 互动条（点赞走真实接口）
 * - 数据：全部来自 api_review.list；无数据即空态，不再内置 mock 帖子
 * - 顶部宠物入口小卡 → /pet-community；悬浮发布按钮 → /post-publish
 */
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { api_review, api_post } from '../api';
import { useAuthStore } from '../stores/auth';
import { time_ago, avatar_url } from '../utils/format';

const router = useRouter();
const auth = useAuthStore();

/** 二级导航定义（key 对应过滤口径；仅保留有真实数据来源的两栏） */
const TABS = [
    { key: 'recommend', name: '推荐' },
    { key: 'latest', name: '最新' },
];

const active_tab = ref('recommend');
const loading = ref(false);
// 社区动态流：全部来自真实点评接口，无数据即空态（不再内置 mock 帖子）
const posts = ref([]);

/**
 * 推荐分：评分 2 + 点赞 1.5 + 评论 1 + 7 天新鲜度 3
 * 与「最新」严格时间序形成明显差异，避免两栏内容完全相同
 * @param {Object} p
 * @returns {number}
 */
function recommend_score(p) {
    const age_day = Math.max(0, (Date.now() - (p.order || 0)) / 86400000);
    const fresh = Math.max(0, 1 - age_day / 7) * 3;
    return (p.overall || 0) * 2 + (p.likes || 0) * 1.5 + (p.comments || 0) * 1 + fresh;
}

/** 当前分栏的卡片流：最新=严格时间倒序；推荐=评分/互动/新鲜度加权 */
const feed_list = computed(() => {
    const list = posts.value;
    if (active_tab.value === 'latest') return [...list].sort((a, b) => b.order - a.order);
    return [...list].sort((a, b) => recommend_score(b) - recommend_score(a));
});

/**
 * 拉取社区内容：真实点评 + 真实动态（post 表）
 * 两栏都基于同一份真实数据，但排序口径不同：推荐=质量/互动/新鲜度，最新=时间。
 * 任一接口失败不影响另一类内容展示，不回退 mock。
 */
async function load_feed() {
    loading.value = true;
    const [rv, ps] = await Promise.allSettled([
        api_review.list({ page: 1, size: 30 }),
        api_post.list({ tab: 'latest', size: 30 }),
    ]);
    const list = [];
    if (rv.status === 'fulfilled') {
        const d = rv.value;
        const rows = Array.isArray(d) ? d : (d.list || d.reviews?.list || []);
        rows.forEach((r, i) => {
            const at = Date.parse(r.createdAt) || (Date.now() - (i + 1) * 3600000);
            list.push({
                id: String(r.id),
                kind: 'review',
                review_id: r.id,
                author: r.nickname || '福大同学',
                avatar: avatar_url(r.avatarObjectKey || r.avatar_object_key),
                time: time_ago(r.createdAt),
                order: at,
                scene: Number(r.dimensionScores?.delivery) > 0 ? '外卖' : '堂食',
                content: r.content || '（纯图点评）',
                images: (r.images || []).slice(0, 3).map((k) => `/img/${k}`),
                topics: (r.tags || []).map((t) => `#${t}#`),
                likes: Number(r.likeCount) || 0,
                comments: Number(r.commentCount) || 0,
                liked: !!r.liked,
                scores: r.dimensionScores || {},
                overall: Number(r.overallScore) || 0,
            });
        });
    }
    if (ps.status === 'fulfilled') {
        const d = ps.value;
        const rows = Array.isArray(d) ? d : (d.list || []);
        rows.forEach((x) => {
            const at = Date.parse(x.created_at) || Date.now();
            list.push({
                id: `p-${x.id}`,
                kind: 'post',
                post_id: x.id,
                author: x.author?.nickname || '福大同学',
                avatar: avatar_url(x.author?.avatar_object_key),
                time: time_ago(x.created_at),
                order: at,
                scene: '动态',
                content: x.content || '（纯图动态）',
                images: (x.images || []).slice(0, 3).map((k) => (String(k).startsWith('/') ? k : `/img/${k}`)),
                topics: (x.topics || []).map((t) => `#${t}#`),
                likes: Number(x.like_count) || 0,
                comments: Number(x.comment_count) || 0,
                liked: !!x.liked,
                scores: {},
                overall: 0,
            });
        });
    }
    posts.value = list;
    loading.value = false;
}

/**
 * 切换二级导航
 * @param {string} key
 */
function switch_tab(key) {
    active_tab.value = key;
}

/**
 * 跳详情页
 * @param {Object} p
 */
function go_detail(p) {
    router.push(`/post/${p.id}`);
}

/**
 * 去宠物社区
 */
function go_pet() {
    router.push('/pet-community');
}

/**
 * 去发动态
 */
function go_publish() {
    router.push('/post-publish');
}

/**
 * 点赞切换：来自接口的点评走 api_review.like
 * @param {Object} p
 */
async function toggle_like(p) {
    if (auth.is_login) {
        try {
            const d = p.kind === 'post'
                ? await api_post.like(p.post_id)
                : await api_review.like(p.review_id);
            p.liked = !!d.liked;
            p.likes = Number(d.likeCount ?? d.like_count) || 0;
            return;
        } catch { /* 失败回落本地切换 */ }
    }
    p.liked = !p.liked;
    p.likes += p.liked ? 1 : -1;
}

onMounted(load_feed);
</script>

<style scoped>
/* 二级导航：四项水平居中（C10），琥珀下划指示 */
.lv2 {
    display: flex;
    justify-content: center;
    gap: 22px;
    padding: 4px 16px 0;
    border-bottom: 1px solid var(--line);
}
.lv2 a {
    font-size: 13px;
    color: var(--ink-2);
    font-weight: 600;
    text-decoration: none;
    position: relative;
    padding: 9px 2px 10px;
}
.lv2 a.on { color: var(--ink); font-weight: 800; }
.lv2 a.on::after {
    content: '';
    position: absolute;
    left: 22%; right: 22%; bottom: 0;
    height: 2.5px;
    border-radius: 2px;
    background: var(--brand);
}

/* 宠物入口小卡：无框卡 + 淡阴影 */
.pet-entry {
    margin-top: 14px;
    display: flex;
    align-items: center;
    gap: 12px;
    cursor: pointer;
}
/* 福宝贴纸：与 AI 智能推荐入口卡同款裸贴纸（contain 完整显示，去掉圆形裁切） */
.pet-img { width: 46px; height: 46px; object-fit: contain; border-radius: 0; flex-shrink: 0; }
.pet-info { flex: 1; min-width: 0; }
.pet-info b { display: block; font-size: 13.5px; font-weight: 700; }
.pet-info span { display: block; font-size: 11px; color: var(--ink-2); margin-top: 2px; }
.pet-go {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    gap: 3px;
    font-size: 11.5px;
    font-weight: 700;
    color: var(--brand-dark);
}

/* 动态卡流 */
.feed { margin-top: 8px; }
.post-card { margin-top: 12px; }
.author-row { display: flex; align-items: center; gap: 10px; }
.av { width: 36px; height: 36px; border-radius: 50%; }
.who { flex: 1; min-width: 0; }
.name { font-size: 13.5px; font-weight: 700; }
.time { font-size: 10.5px; color: var(--ink-2); margin-top: 2px; font-weight: 400; }

.content {
    margin: 10px 0 0;
    font-size: 13px;
    line-height: 1.75;
    font-weight: 400;
    color: var(--ink);
    cursor: pointer;
}

/* 图片宫格：1 张通栏，2/3 张等分 */
.img-grid { display: grid; gap: 6px; margin-top: 10px; cursor: pointer; }
.img-grid.n1 { grid-template-columns: 1fr; }
.img-grid.n2 { grid-template-columns: 1fr 1fr; }
.img-grid.n3 { grid-template-columns: repeat(3, 1fr); }
.img-grid img {
    width: 100%;
    height: 118px;
    object-fit: cover;
    border-radius: var(--radius-sm);
}
.img-grid.n1 img { height: 170px; }

.topics { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 10px; }

/* 互动条 */
.ops {
    display: flex;
    align-items: center;
    gap: 26px;
    margin-top: 12px;
    padding-top: 10px;
    border-top: 1px solid var(--line);
}
.op {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 12px;
    color: var(--ink-2);
    cursor: pointer;
    font-weight: 400;
    transition: color .12s ease;
}
.op i { font-style: normal; }
.op:hover { color: var(--brand-dark); }
.op .like-img { width: 16px; height: 16px; object-fit: contain; opacity: .55; filter: grayscale(1); transition: opacity .12s ease, filter .12s ease; }
.op.on { color: var(--brand-dark); font-weight: 700; }
.op.on .like-img { opacity: 1; filter: none; }

.empty-tip { text-align: center; color: var(--ink-2); padding: 40px 0; margin-top: 12px; }

/* 悬浮发布按钮：水平居中（C11），底部避让安全区与移动端 tabbar */
.fab {
    position: fixed;
    left: 50%;
    transform: translateX(-50%);
    bottom: calc(96px + env(safe-area-inset-bottom)); /* 悬浮在 tabbar（约 62px）上方 */
    width: 52px;
    height: 52px;
    border-radius: 50%;
    border: none;
    background: var(--brand);
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 4px 14px rgba(140, 110, 60, .35);
    cursor: pointer;
    z-index: 50;
    transition: background .12s ease, transform .08s ease;
}
.fab:hover { background: var(--brand-dark); }
.fab:active { transform: translateX(-50%) translateY(2px); }
@media (max-width: 768px) {
    .fab { bottom: calc(80px + env(safe-area-inset-bottom)); }
}

/* ===== 桌面适配（≥769）===== */
@media (min-width: 769px) {
    /* 帖子卡流：桌面改 2 列网格（feed 容器直接网格化，卡片按列错落排布） */
    .feed { display: grid; grid-template-columns: repeat(2, 1fr); gap: 14px; align-items: start; margin-top: 14px; }
    /* 网格列距接管纵向间距，卡片自带的上边距在网格内置 0 */
    .post-card { margin-top: 0; }
    /* 空态提示跨全宽，不参与分列 */
    .feed .empty-tip { grid-column: 1 / -1; }
}

/* ===== 桌面适配二档（≥1200）===== */
@media (min-width: 1200px) {
    /* 超宽屏：帖子卡流 3 列并加大列距 */
    .feed { grid-template-columns: repeat(3, 1fr); gap: 16px; }
}
</style>
