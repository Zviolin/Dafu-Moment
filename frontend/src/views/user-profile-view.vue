<template>
    <div class="page-wrap user-page">
        <!-- 用户不存在/加载失败兜底（拦截器已提示具体原因） -->
        <div v-if="failed" class="empty-tip card">这位同学的主页走丢了…</div>

        <template v-else>
            <!-- 名片区：头像 + 昵称/认证/头衔 + 关注·私信·分享 -->
            <section v-if="user" class="hero card fade-up">
                <div class="hero-main">
                    <user-avatar :user="user" :size="76" class="hero-avatar" />
                    <div class="hero-id">
                        <div class="nick-row">
                            <h1 class="nick">{{ user.nickname }}</h1>
                            <span v-if="user.fzuVerified" class="cert-tag">校内已认证</span>
                            <span v-if="title" class="title-pill" :class="{ max: title.is_max }">
                                {{ title.name }} · Lv.{{ title.level }}
                            </span>
                        </div>
                        <div class="meta-row">
                            <span class="meta">加入于 {{ joined_date }}</span>
                            <i class="meta-dot"></i>
                            <span class="meta">贡献 {{ fmt_num(stats.contribution) }}</span>
                        </div>
                    </div>
                    <div class="hero-ops">
                        <button
                            v-if="!is_self" class="op-btn follow" :class="{ on: followed }"
                            @click="toggle_follow"
                        >
                            {{ followed ? '已关注' : '+ 关注' }}
                        </button>
                        <button v-if="!is_self" class="op-btn msg" @click="open_message">私信</button>
                        <router-link v-else class="op-btn edit" to="/me">编辑资料</router-link>
                        <button class="op-btn share" @click="copy_link">{{ copied ? '链接已复制' : '分享主页' }}</button>
                    </div>
                </div>
            </section>

            <!-- 主体：桌面侧栏（数据/头衔）+ 主区（点评流）；移动端单列 -->
            <div class="layout">
                <aside class="side">
                    <div class="stat-card card fade-up">
                        <div class="stat-grid">
                            <div v-for="s in stat_items" :key="s.key" class="stat">
                                <b class="score-num" :class="{ dim: s.value === null }">{{ fmt_num(s.value) }}</b>
                                <span>{{ s.label }}</span>
                            </div>
                        </div>
                    </div>

                    <div v-if="title" class="title-card card fade-up">
                        <div class="tc-head">
                            <b class="tc-name">{{ title.name }}</b>
                            <span class="tc-lv">Lv.{{ title.level }}</span>
                        </div>
                        <div class="tc-bar"><i :style="{ width: title.progress + '%' }"></i></div>
                        <div class="tc-foot">
                            {{ title.is_max ? '已达最高头衔，继续分享好吃哒～' : `距「${title.next_name}」还差 ${title.remaining} 贡献` }}
                        </div>
                    </div>
                </aside>

                <main class="main">
                    <div class="sec-bar">
                        <b>TA 的点评</b>
                        <span class="sec-count">{{ review_total }} 条</span>
                    </div>

                    <el-skeleton :loading="loading" animated :count="2">
                        <template #template>
                            <div class="skel"><el-skeleton-item variant="rect" style="height: 128px; border-radius: 12px" /></div>
                        </template>
                        <template #default>
                            <div class="rev-list">
                                <article
                                    v-for="r in reviews" :key="r.id" class="review-row card fade-up"
                                    @click="go_detail(r)"
                                >
                                    <div class="r-head">
                                        <b class="r-subject">{{ r.subjectName || '未知对象' }}</b>
                                        <span class="chip">{{ SUBJECT_TYPE_NAME[r.subjectType] }}</span>
                                        <span class="time">{{ time_ago(r.createdAt) }}</span>
                                    </div>
                                    <p class="r-content">{{ r.content || '（纯图点评）' }}</p>
                                    <div v-if="(r.images || []).length" class="r-imgs">
                                        <img v-for="k in (r.images || []).slice(0, 3)" :key="k" :src="`/img/${k}`" loading="lazy" alt="" />
                                    </div>
                                    <div class="r-foot">
                                        <span class="r-score score-num">★ {{ fmt_score(r.overallScore) }}</span>
                                        <span class="r-likes">
                                            <img class="like-img" src="/assets/icons/icon-like.png" alt="赞" />{{ r.likeCount || 0 }}
                                        </span>
                                    </div>
                                </article>
                            </div>

                            <div v-if="!loading && reviews.length === 0" class="empty-tip card">还没有公开点评</div>
                            <div v-if="review_total > page_size" class="pager">
                                <el-pagination
                                    layout="prev, pager, next" :total="review_total" :page-size="page_size"
                                    v-model:current-page="page" @current-change="load_reviews"
                                />
                            </div>
                        </template>
                    </el-skeleton>
                </main>
            </div>
        </template>
    </div>
</template>

<script setup>
/**
 * 他人公开主页（/user/:id）：名片 + 数据/头衔侧栏 + 点评流
 * - 数据全部来自 GET /users/:id/profile：stats（点评/获赞/收藏/打卡/足迹/贡献）、title（头衔进度）、follow（关注/粉丝数与关注态）
 * - 关注按钮走真实接口（POST/DELETE /users/:id/follow），未登录先跳登录；自己看自己只给「编辑资料」
 * - 点评流按 subjectType 标注「菜品/窗口/食堂」，点击进 /post/:id
 */
import { ref, computed, watch, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { api_user } from '../api';
import { useAuthStore } from '../stores/auth';
import UserAvatar from '../components/user-avatar.vue';
import { time_ago, fmt_score, SUBJECT_TYPE_NAME } from '../utils/format';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();

const user = ref(null);
const stats = ref({});
const title = ref(null);
const follow = ref({ available: false, following_count: 0, follower_count: 0, followed: false });
const reviews = ref([]);
const review_total = ref(0);
const page_size = ref(10);
const page = ref(1);
const loading = ref(false);
const failed = ref(false);
const busy_follow = ref(false);
const copied = ref(false);

/** 当前查看的是否为自己的主页 */
const is_self = computed(() => !!auth.user && Number(auth.user.id) === Number(route.params.id));

/** 关注关系是否可用（follow_relation 表待建时后端返回 available=false） */
const follow_available = computed(() => follow.value.available !== false);

/** 关注按钮当前态（以服务端返回为准） */
const followed = computed(() => !!follow.value.followed);

/** 统计六宫格：关注/粉丝来自关注关系，其余来自 T-21 贡献统计；关系表未建时关注/粉丝显示「—」而非假 0 */
const stat_items = computed(() => [
    { key: 'following', label: '关注', value: follow_available.value ? (follow.value.following_count || 0) : null },
    { key: 'follower', label: '粉丝', value: follow_available.value ? (follow.value.follower_count || 0) : null },
    { key: 'like', label: '获赞', value: stats.value.like_count || 0 },
    { key: 'review', label: '点评', value: stats.value.review_count || 0 },
    { key: 'checkin', label: '打卡', value: stats.value.check_in_count || 0 },
    { key: 'spot', label: '足迹', value: stats.value.spot_count || 0 },
]);

/** 注册时间格式化 YYYY-MM-DD（createdAt 缺省防御） */
const joined_date = computed(() => String(user.value?.createdAt || user.value?.created_at || '').slice(0, 10) || '—');

/**
 * 数字展示：≥10000 收敛为「万」，避免侧栏数字撑破栅格；null 表示该指标暂不可用
 * @param {number|null} v
 * @returns {string}
 */
function fmt_num(v) {
    if (v === null || v === undefined) return '—';
    const n = Number(v) || 0;
    if (n >= 10000) return `${(n / 10000).toFixed(1)}万`;
    return String(n);
}

/**
 * 拉取公开主页数据（用户卡只在首次成功后填充；评价流随分页刷新）
 */
async function load_profile() {
    loading.value = true;
    failed.value = false;
    try {
        const d = await api_user.profile(Number(route.params.id), { page: page.value });
        user.value = d.user;
        stats.value = d.stats || {};
        title.value = d.title || null;
        follow.value = d.follow || follow.value;
        const rv = d.reviews || {};
        reviews.value = rv.list || [];
        review_total.value = Number(rv.total) || 0;
        if (rv.size) page_size.value = Number(rv.size) || 10;
    } catch {
        failed.value = true;
        user.value = null;
        reviews.value = [];
    } finally {
        loading.value = false;
    }
}

/**
 * 评价流独立刷新（只重拉当前页，保留侧栏数据）
 */
async function load_reviews() {
    try {
        const d = await api_user.profile(Number(route.params.id), { page: page.value });
        const rv = d.reviews || {};
        reviews.value = rv.list || [];
        review_total.value = Number(rv.total) || 0;
        follow.value = d.follow || follow.value;
    } catch { /* 拦截器已提示 */ }
}

/**
 * 关注/取关：未登录先跳登录；成功后同步服务端计数（取关 404 时回读状态兜底）
 */
async function toggle_follow() {
    // 关注关系表未落库时后端降级（available=false）：给出明确提示，不制造无效交互
    if (!follow_available.value) {
        ElMessage.info('关注功能即将开放，敬请期待～');
        return;
    }
    if (!auth.is_login) {
        ElMessage.info('登录后才能关注同学');
        router.push(`/login?redirect=${encodeURIComponent(route.fullPath)}`);
        return;
    }
    if (busy_follow.value) return;
    busy_follow.value = true;
    const uid = Number(route.params.id);
    try {
        if (followed.value) {
            await api_user.unfollow(uid);
            follow.value = {
                ...follow.value,
                followed: false,
                follower_count: Math.max(0, (follow.value.follower_count || 0) - 1),
            };
        } else {
            await api_user.follow(uid);
            follow.value = {
                ...follow.value,
                followed: true,
                follower_count: (follow.value.follower_count || 0) + 1,
            };
        }
    } catch {
        // 并发/重复操作导致 404 时，回读真实关注态，避免按钮显示与服务端不一致
        try {
            const s = await api_user.follow_status(uid);
            follow.value = { ...follow.value, followed: !!s.followed };
        } catch { /* 保持原状 */ }
    } finally {
        busy_follow.value = false;
    }
}

/**
 * 私信：暂未开放（保留入口，避免用户找不到沟通渠道）
 */
function open_message() {
    ElMessage.info('私信功能暂未开放，可在评论区交流～');
}

/**
 * 分享主页：复制当前页链接（Clipboard API 不可用时回退提示手动复制）
 */
async function copy_link() {
    const url = window.location.href;
    try {
        await navigator.clipboard.writeText(url);
        copied.value = true;
        setTimeout(() => { copied.value = false; }, 1800);
    } catch {
        ElMessage.info(`请手动复制：${url}`);
    }
}

/**
 * 跳点评详情
 * @param {Object} r
 */
function go_detail(r) {
    router.push(`/post/${r.id}`);
}

// 主页间跳转（/user/1 → /user/2）组件复用，监听参数变化重载
watch(() => route.params.id, (v, old) => {
    if (v && v !== old && route.name === 'user-profile') {
        page.value = 1;
        user.value = null;
        title.value = null;
        reviews.value = [];
        load_profile();
    }
});

onMounted(load_profile);
</script>

<style scoped>
/* ========== 名片区 ========== */
.hero {
    position: relative;
    padding: 20px 22px;
    background: linear-gradient(135deg, #FFFCF3 0%, #FBF3DC 58%, #F7E9C6 100%);
    overflow: hidden;
}
/* 右上角淡金光斑：增加卡片层次，不干扰文字可读性 */
.hero::after {
    content: '';
    position: absolute;
    top: -70px;
    right: -40px;
    width: 200px;
    height: 200px;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(232, 168, 56, .22) 0%, rgba(232, 168, 56, 0) 70%);
    pointer-events: none;
}
.hero-main {
    position: relative;
    z-index: 1;
    display: flex;
    align-items: center;
    gap: 16px;
}
.hero-avatar { flex-shrink: 0; }
.hero-id { flex: 1; min-width: 0; }
.nick-row { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
.nick {
    margin: 0;
    font-size: 20px;
    font-weight: 800;
    letter-spacing: .5px;
    color: var(--ink);
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.cert-tag {
    font-size: 9.5px;
    font-weight: 700;
    color: #FFFDF5;
    background: var(--brand);
    padding: 2px 7px;
    border-radius: 6px;
    flex-shrink: 0;
}
.title-pill {
    font-size: 10.5px;
    font-weight: 700;
    color: #8A6A3A;
    background: rgba(255, 255, 255, .72);
    border: 1px solid rgba(138, 106, 58, .22);
    padding: 2px 8px;
    border-radius: 999px;
    flex-shrink: 0;
}
.title-pill.max { color: #B4541E; border-color: rgba(180, 84, 30, .3); }
.meta-row { display: flex; align-items: center; gap: 8px; margin-top: 8px; }
.meta { font-size: 11px; color: var(--ink-2); font-weight: 400; }
.meta-dot { width: 3px; height: 3px; border-radius: 50%; background: var(--ink-2); opacity: .5; }

.hero-ops { display: flex; flex-direction: column; gap: 8px; flex-shrink: 0; }
.op-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 92px;
    height: 34px;
    padding: 0 16px;
    font-size: 12.5px;
    font-weight: 700;
    border-radius: var(--radius-sm);
    cursor: pointer;
    text-decoration: none;
    transition: background .12s ease, color .12s ease, border-color .12s ease;
}
.op-btn.follow { border: 1px solid var(--brand); background: var(--brand); color: #FFFDF5; }
.op-btn.follow.on { background: var(--paper); border-color: var(--line); color: var(--ink-2); }
.op-btn.follow:disabled { opacity: .55; cursor: not-allowed; }
.op-btn.msg { border: 1px solid var(--line); background: rgba(255, 255, 255, .6); color: var(--ink); }
.op-btn.msg:hover { background: #FBF3DC; }
.op-btn.edit { border: 1px solid var(--brand); background: var(--brand); color: #FFFDF5; }
.op-btn.share { border: 1px solid rgba(138, 106, 58, .28); background: rgba(255, 255, 255, .72); color: #6B5A44; }
.op-btn.share:hover { background: #fff; color: var(--ink); }

/* ========== 侧栏数据卡 ========== */
.stat-card { padding: 4px 6px; }
.stat-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 2px 4px;
}
.stat { text-align: center; padding: 12px 4px; }
.stat b { display: block; font-size: 17px; font-weight: 800; color: var(--ink); line-height: 1.2; }
.stat b.dim { color: var(--ink-2); opacity: .55; }
.stat span { display: block; font-size: 10.5px; color: var(--ink-2); margin-top: 4px; font-weight: 400; }

.title-card { padding: 14px 16px; margin-top: 12px; }
.tc-head { display: flex; align-items: baseline; justify-content: space-between; }
.tc-name { font-size: 14px; font-weight: 800; color: var(--ink); }
.tc-lv { font-size: 10.5px; color: #8A6A3A; font-weight: 700; }
.tc-bar {
    height: 6px;
    margin-top: 10px;
    background: #F1E4C8;
    border-radius: 999px;
    overflow: hidden;
}
.tc-bar i { display: block; height: 100%; background: linear-gradient(90deg, #F0B429, var(--brand)); border-radius: 999px; }
.tc-foot { margin-top: 8px; font-size: 10.5px; color: var(--ink-2); font-weight: 400; line-height: 1.6; }

/* ========== 点评流 ========== */
.sec-bar { display: flex; align-items: baseline; gap: 8px; margin-bottom: 12px; }
.sec-bar b { font-size: 15px; font-weight: 800; color: var(--ink); }
.sec-count { font-size: 11px; color: var(--ink-2); font-weight: 400; }

.skel { margin-bottom: 12px; }
.review-row { margin-bottom: 12px; cursor: pointer; transition: transform .12s ease, box-shadow .12s ease; }
.review-row:hover { transform: translateY(-1px); }
.r-head { display: flex; align-items: center; gap: 8px; }
.r-subject { font-size: 14px; font-weight: 700; color: var(--ink); }
.chip { flex-shrink: 0; }
.time { margin-left: auto; font-size: 10.5px; color: var(--ink-2); font-weight: 400; }
.r-content { margin: 8px 0 0; font-size: 13px; line-height: 1.75; font-weight: 400; white-space: pre-wrap; word-break: break-word; }
.r-imgs { display: flex; gap: 7px; margin-top: 9px; }
.r-imgs img { width: 78px; height: 78px; object-fit: cover; border-radius: var(--radius-sm); }
.r-foot {
    display: flex;
    align-items: center;
    gap: 16px;
    margin-top: 10px;
    padding-top: 9px;
    border-top: 1px solid var(--line);
    font-size: 12px;
}
.r-score { color: var(--star); font-weight: 700; }
.r-likes { display: inline-flex; align-items: center; gap: 4px; color: var(--ink-2); }
.like-img { width: 14px; height: 14px; object-fit: contain; opacity: .7; }

.empty-tip { text-align: center; color: var(--ink-2); padding: 44px 0; }
.pager { display: flex; justify-content: center; margin-top: 14px; }

/* ========== 布局：移动端单列 ========== */
.layout { margin-top: 12px; }
.side { min-width: 0; }
.main { min-width: 0; margin-top: 12px; }

/* ========== 桌面端（≥769px）：侧栏 + 正文两栏，名片横排 ========== */
@media (min-width: 769px) {
    .page-wrap { max-width: 1080px; }
    .user-page { padding-top: 8px; }
    .hero { padding: 22px 26px; }
    .hero-main { gap: 20px; }
    .hero-ops { flex-direction: row; align-items: center; }
    .op-btn { min-width: 100px; }
    .layout {
        display: grid;
        grid-template-columns: 268px minmax(0, 1fr);
        gap: 20px;
        align-items: start;
        margin-top: 16px;
    }
    /* 侧栏随滚动吸顶，长点评流阅读时数据一直在视野内 */
    .side { position: sticky; top: 16px; }
    .main { margin-top: 0; }
    .rev-list { display: grid; grid-template-columns: minmax(0, 1fr); gap: 12px; }
    .rev-list .review-row { margin-bottom: 0; }
    .r-imgs img { width: 92px; height: 92px; }
}

/* ========== 移动端（≤768px）：名片纵向、按钮整行 ========== */
@media (max-width: 768px) {
    .hero-main { flex-wrap: wrap; }
    .hero-ops {
        flex-direction: row;
        width: 100%;
        margin-top: 14px;
    }
    .hero-ops .op-btn { flex: 1; min-width: 0; }
    .nick { font-size: 18px; }
}
</style>
