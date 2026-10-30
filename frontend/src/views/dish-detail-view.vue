<template>
    <!-- 菜品详情（暖纸奶油风，与档口详情同版式）：顶栏 → 封面 → 信息 → 互动行 → 综合分与维度 → 相关评价 -->
    <div class="page-wrap" v-if="data">
        <!-- 顶部栏：返回 + 居中标题 -->
        <div class="topbar">
            <span class="icircle" @click="$router.back()">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7" /></svg>
            </span>
            <b class="topbar-title">{{ data.dish.name }}</b>
            <span class="topbar-hold"></span>
        </div>

        <!-- 封面图（无实拍时淡纸底 + 首字占位） -->
        <div class="hero-img img-fallback">
            <img v-if="cover" :src="cover" alt="菜品图片" />
            <span v-else class="big-char">{{ data.dish.name.slice(0, 1) }}</span>
        </div>

        <!-- 信息区：所属档口 / 价格 / 忌口食材标签 chips -->
        <div class="info">
            <div class="crumb">
                <router-link :to="`/canteen/${data.dish.canteen_id}`">{{ data.dish.canteen_name }}</router-link>
                <span class="crumb-sep">/</span>
                <router-link :to="`/station/${data.dish.station_id}`">{{ data.dish.station_name }} ›</router-link>
            </div>
            <h1 class="info-name">{{ data.dish.name }}</h1>
            <div class="price-row">
                <span class="price score-num"><i>¥</i>{{ data.dish.price }}<em>/份</em></span>
                <span v-if="summary && summary.review_count > 0" class="score-line">
                    <img v-if="score_bun(summary.rating_avg)" class="mini-bun" :src="score_bun(summary.rating_avg)" alt="" />
                    <b class="star-text score-num">{{ fmt_score(summary.rating_avg) }}</b>
                    <span class="muted">{{ summary.review_count }} 人评</span>
                </span>
            </div>
            <div class="chip-row">
                <span v-for="t in taste_list" :key="t" class="chip">{{ t }}</span>
                <span v-for="t in taboo_list" :key="t" class="chip">可做{{ t }}</span>
            </div>
        </div>

        <!-- 互动行：想吃（收藏 toggle）/ 吃过（去写点评）/ 收藏（与「想吃」共用同一收藏列表） -->
        <div class="duo">
            <button class="duo-btn want" @click="set_fav">
                <img src="/assets/icons/icon-want.png" alt="" />{{ fav === 0 ? '已想吃' : '想吃' }}
            </button>
            <button class="duo-btn ate" @click="go_publish(0)">
                <img src="/assets/icons/icon-eaten.png" alt="" />吃过
            </button>
            <button class="duo-btn mark" :class="{ on: fav === 0 }" @click="set_fav">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M6.5 4.5h11a0.5 0.5 0 0 1 0.5 0.5v14.5l-6-4-6 4V5a0.5 0.5 0 0 1 0.5-0.5z" /></svg>
                {{ fav === 0 ? '已收藏' : '收藏' }}
            </button>
        </div>
        <div class="duo-hint">后端收藏体系仅「想吃」一种语义，「收藏」与「想吃」共用同一收藏状态</div>

        <!-- 综合分 + 分维得分（动态维度，堂食含排队体验、不含配送速度） -->
        <template v-if="summary && summary.review_count > 0">
            <div class="sec"><b>评分与维度</b><span>{{ summary.review_count }} 人评均分</span></div>
            <div class="score-zone card">
                <div class="score-side">
                    <img v-if="score_bun(summary.rating_avg)" class="score-bun" :src="score_bun(summary.rating_avg)" alt="" />
                    <b class="big-avg score-num">{{ fmt_score(summary.rating_avg) }}</b>
                </div>
                <div class="dim-side">
                    <div v-for="d in dim_rows" :key="d.key" class="dim-row">
                        <span class="dim-name">{{ d.name }}</span>
                        <span class="dim-track"><span class="dim-bar" :style="{ width: (d.avg / 5) * 100 + '%' }"></span></span>
                        <span class="dim-val score-num">{{ d.avg.toFixed(1) }}</span>
                    </div>
                </div>
            </div>
            <!-- 大家都在说：评价标签云（保留原 tag_cloud 接线） -->
            <div v-if="tag_cloud.length" class="cloud-zone card">
                <div class="cloud-title">大家都在说</div>
                <div class="cloud-row">
                    <span v-for="t in tag_cloud" :key="t.tag" class="chip">{{ t.tag }} ×{{ t.c }}</span>
                </div>
            </div>
        </template>

        <!-- 相关评价：写评价 → 发布页（预选菜品） -->
        <div class="sec">
            <b>同学评价（{{ review_total }}）</b>
            <span class="write-link" @click="go_publish(0)">写评价 ›</span>
        </div>
        <div class="sort-tabs" v-if="review_total > 0">
            <span class="sort-tab" :class="{ on: sort === 'hot' }" @click="set_sort('hot')">最热</span>
            <span class="sort-tab" :class="{ on: sort === 'new' }" @click="set_sort('new')">最新</span>
        </div>
        <div v-for="r in reviews" :key="r.id" class="revcard card fade-up">
            <div class="rev-head">
                <user-avatar
                    :anon="r.isAnonymous"
                    :user="{ id: r.userId, nickname: r.nickname, avatar: r.avatar, avatar_object_key: r.avatar_object_key }"
                    :size="34" class="rev-av"
                />
                <div class="rev-who">
                    <div class="rev-name">
                        <b>{{ r.nickname }}</b>
                        <span v-if="r.isAnonymous" class="chip">匿名</span>
                    </div>
                    <div class="rev-dims" v-if="review_dims(r).length">
                        <span v-for="d in review_dims(r)" :key="d.name" class="rev-dim">{{ d.name }} <i class="score-num">{{ d.value }}</i></span>
                    </div>
                </div>
                <img v-if="score_bun(r.overallScore)" class="rev-bun" :src="score_bun(r.overallScore)" alt="总分" />
            </div>
            <p class="rev-body">{{ r.content }}</p>
            <div v-if="r.images && r.images.length" class="rev-imgs">
                <img v-for="k in r.images" :key="k" :src="`/img/${k}`" loading="lazy" alt="" />
            </div>
            <div class="rev-foot">
                <span class="rev-time">{{ time_ago(r.createdAt) }}</span>
                <span class="rev-tags">
                    <span v-for="t in r.tags" :key="t" class="chip">{{ t }}</span>
                </span>
                <span class="rev-ops">
                    <button class="rev-like" :class="{ on: r.liked }" @click="do_like(r)">
                        <img src="/assets/icons/icon-like.png" alt="赞" /><span class="score-num">{{ r.likeCount }}</span>
                    </button>
                    <router-link class="rev-report" :to="`/report?subjectType=0&subjectId=${r.id}`">举报</router-link>
                </span>
            </div>
        </div>
        <div v-if="reviews.length === 0" class="empty-tip">还没有人评价，<a class="link" @click="go_publish(0)">成为第一个</a></div>
        <div class="pager" v-if="review_total > 20">
            <el-pagination layout="prev, pager, next" :total="review_total" :page-size="20" v-model:current-page="page" @current-change="load_reviews" />
        </div>
    </div>
</template>

<script setup>
/**
 * 菜品详情（暖纸奶油风改版）：
 * 封面 → 所属档口/价格/忌口标签 → 想吃/吃过/收藏 → 综合分与分维得分（包子插画）→ 相关评价（点赞/举报）
 * 保留原有 dish_detail / dimensions / favorite / review 接线与业务方法
 */
import { ref, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { api_content, api_review, api_favorite } from '../api';
import { useAuthStore } from '../stores/auth';
import { time_ago, fmt_score, cover_url } from '../utils/format';
import UserAvatar from '../components/user-avatar.vue';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const data = ref(null);
const reviews = ref([]);
const review_total = ref(0);
const sort = ref('hot');
const page = ref(1);
// 想吃收藏状态（0 已收藏 / null 未收藏）
const fav = ref(null);
// 维度配置（按菜品所属点位类型动态拉取）
const dims = ref([]);

const cover = computed(() => {
    if (data.value.dish.cover_object_key) return cover_url(data.value.dish.cover_object_key);
    if (data.value.fallbackCover) return cover_url(data.value.fallbackCover);
    return '';
});
const summary = computed(() => data.value.summary);
const taste_list = computed(() => (data.value.dish.taste_tags || '').split(',').filter(Boolean));
const taboo_list = computed(() => (data.value.dish.taboo_tags || '').split(',').filter(Boolean));
const tag_cloud = computed(() => data.value.tags || []);

/**
 * 各维度均分（dim_sums[key] ÷ review_count），均分为 0 的维度不展示
 */
const dim_rows = computed(() => {
    if (!summary.value || !summary.value.review_count) return [];
    return dims.value
        .map((d) => ({ key: d.key, name: d.name, avg: (summary.value.dim_sums?.[d.key] || 0) / summary.value.review_count }))
        .filter((d) => d.avg > 0);
});

/**
 * 分数 → 星级包子插画：按分值取整档（如 4.5 分显示 s5），无分返回空串
 * @param {number|string} v
 */
function score_bun(v) {
    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0) return '';
    const lvl = Math.min(5, Math.max(1, Math.round(n)));
    return `/assets/stars/s${lvl}.png`;
}

/**
 * 单条评价的维度小分：dimensionScores 按维度配置展开（未打分的维度不显示）
 * @param {Object} r
 */
function review_dims(r) {
    return dims.value
        .map((d) => ({ name: d.name, value: Number(r.dimensionScores?.[d.key]) || 0 }))
        .filter((d) => d.value > 0)
        .map((d) => ({ ...d, value: d.value.toFixed(1) }));
}

/**
 * 加载评价列表
 */
async function load_reviews() {
    const res = await api_review.list({ subjectType: 0, subjectId: route.params.id, sort: sort.value, page: page.value });
    reviews.value = res.list;
    review_total.value = res.total;
}

/**
 * 排序切换
 * @param {string} s
 */
function set_sort(s) {
    sort.value = s;
    page.value = 1;
    load_reviews();
}

/**
 * 点赞 / 取消赞 toggle（未登录跳登录，回跳当前页）
 * @param {Object} r
 */
async function do_like(r) {
    if (!auth.is_login) {
        router.push({ path: '/login', query: { redirect: route.fullPath } });
        return;
    }
    try {
        const d = await api_review.like(r.id);
        r.liked = !!d.liked;
        r.likeCount = Number(d.likeCount) || 0;
    } catch { /* 拦截器已提示 */ }
}

/**
 * 想吃收藏 toggle（未登录跳登录）：加想吃走 set，取消走 DELETE /favorites/:type/:id
 */
async function set_fav() {
    if (!auth.is_login) {
        router.push({ path: '/login', query: { redirect: route.fullPath } });
        return;
    }
    const id = Number(route.params.id);
    if (fav.value === 0) {
        await api_favorite.remove(0, id);
        fav.value = null;
        ElMessage.success('已取消想吃');
    } else {
        await api_favorite.set({ subjectType: 0, subjectId: id, listType: 0 });
        fav.value = 0;
        ElMessage.success('已加入「想吃」');
    }
}

/**
 * 去发布
 * @param {number} subjectType
 */
function go_publish(subjectType) {
    if (!auth.is_login) {
        router.push({ path: '/login', query: { redirect: route.fullPath } });
        return;
    }
    router.push({ path: '/publish', query: { type: subjectType, id: route.params.id } });
}

onMounted(async () => {
    const id = Number(route.params.id);
    data.value = await api_content.dish_detail(id);
    // 维度配置：按菜品所属点位类型拉取
    dims.value = await api_content.dimensions(data.value.dish.canteen_type);
    await load_reviews();
    // 收藏初始态：单对象 status 接口（不再整表拉取比对）
    if (auth.is_login) {
        const st = await api_favorite.status(0, id).catch(() => null);
        fav.value = st && st.favored ? 0 : null;
    }
});
</script>

<style scoped>
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
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.topbar-hold { width: 40px; flex-shrink: 0; }
/* 封面：无框圆角卡 + 弥散阴影 */
.hero-img {
    height: 210px;
    border-radius: var(--radius);
    overflow: hidden;
    box-shadow: var(--shadow-soft);
    font-size: 56px;
    background: var(--paper);
}
.hero-img img { width: 100%; height: 100%; object-fit: cover; display: block; }
.big-char { font-size: 64px; opacity: 0.7; }
/* 信息区 */
.info { padding: 14px 2px 0; }
.crumb { font-size: 12px; color: var(--ink-2); }
.crumb a { color: var(--brand); text-decoration: none; }
.crumb a:hover { color: var(--brand-dark); }
.crumb-sep { margin: 0 5px; }
.info-name { margin: 6px 0 0; font-size: 21px; font-weight: 800; }
.price-row { display: flex; align-items: center; gap: 14px; margin-top: 9px; flex-wrap: wrap; }
.price { color: var(--brand); font-size: 22px; font-weight: 800; }
.price i { font-style: normal; font-size: 13px; margin-right: 1px; }
.price em { font-style: normal; font-size: 11px; color: var(--ink-2); font-weight: 400; margin-left: 2px; }
.score-line { display: inline-flex; align-items: center; gap: 6px; }
.mini-bun { width: 26px; height: 26px; object-fit: contain; }
.star-text { color: var(--star); font-size: 15px; }
.muted { font-size: 11px; color: var(--ink-2); font-weight: 400; }
.chip-row { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 10px; }
/* 互动行：想吃（墨底）/ 吃过（卡面）/ 收藏（卡面，激活时标签底） */
.duo { display: flex; gap: 10px; margin-top: 16px; }
.duo-btn {
    flex: 1;
    height: 42px;
    border-radius: var(--radius-sm);
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    font-size: 14px;
    font-weight: 700;
    cursor: pointer;
    font-family: inherit;
}
.duo-btn img { width: 20px; height: 20px; object-fit: contain; }
.duo-btn.want { background: var(--ink); color: var(--paper); border: none; }
.duo-btn.want img { filter: brightness(0) invert(1); }
.duo-btn.ate { background: var(--paper); color: var(--ink); border: 1px solid var(--line); box-shadow: var(--shadow-soft); }
.duo-btn.mark { background: var(--paper); color: var(--ink); border: 1px solid var(--line); box-shadow: var(--shadow-soft); }
.duo-btn.mark.on { background: var(--brand-light); color: var(--brand-dark); border-color: var(--line); }
.duo-hint { text-align: center; font-size: 10.5px; color: var(--ink-2); margin-top: 8px; }
/* 评分与维度 */
.score-zone { display: flex; gap: 18px; align-items: center; }
.score-side { display: flex; flex-direction: column; align-items: center; gap: 4px; flex-shrink: 0; min-width: 72px; }
.score-bun { width: 44px; height: 44px; object-fit: contain; }
.big-avg { font-size: 24px; color: var(--star); }
.dim-side { flex: 1; display: flex; flex-direction: column; gap: 9px; }
.dim-row { display: flex; align-items: center; gap: 10px; font-size: 12px; }
.dim-name { width: 58px; color: var(--ink-2); flex-shrink: 0; }
.dim-track { flex: 1; height: 8px; background: var(--line); border-radius: 4px; overflow: hidden; }
.dim-bar { display: block; height: 100%; background: var(--brand); border-radius: 4px; }
.dim-val { color: var(--star); width: 28px; text-align: right; }
/* 标签云 */
.cloud-zone { margin-top: 12px; }
.cloud-title { font-size: 13px; font-weight: 700; margin-bottom: 10px; }
.cloud-row { display: flex; gap: 6px; flex-wrap: wrap; }
/* 评价区 */
.write-link { cursor: pointer; }
.write-link:hover { color: var(--brand); }
.sort-tabs { display: flex; gap: 6px; margin-bottom: 12px; }
.sort-tab {
    font-size: 12px;
    padding: 4px 12px;
    border-radius: var(--radius-sm);
    background: var(--brand-light);
    color: var(--ink-3);
    font-weight: 600;
    cursor: pointer;
    border: none;
    font-family: inherit;
}
.sort-tab.on { background: var(--ink); color: var(--paper); }
.revcard { margin-bottom: 12px; }
.rev-head { display: flex; gap: 9px; align-items: flex-start; }
.rev-av { width: 34px; height: 34px; border-radius: 50%; }
.rev-who { flex: 1; min-width: 0; }
.rev-name { display: flex; align-items: center; gap: 6px; font-size: 13px; flex-wrap: wrap; }
.rev-dims { display: flex; gap: 8px; margin-top: 4px; flex-wrap: wrap; }
.rev-dim { font-size: 10.5px; color: var(--ink-2); }
.rev-dim i { font-style: normal; color: var(--star); }
.rev-bun { width: 38px; height: 38px; object-fit: contain; flex-shrink: 0; }
.rev-body { margin: 10px 0 0; font-size: 12.5px; line-height: 1.8; white-space: pre-wrap; font-weight: 400; }
.rev-imgs { display: flex; gap: 8px; margin-top: 10px; flex-wrap: wrap; }
.rev-imgs img { width: 88px; height: 88px; object-fit: cover; border-radius: var(--radius-sm); }
.rev-foot { display: flex; align-items: center; gap: 10px; margin-top: 12px; font-size: 11px; color: var(--ink-2); }
.rev-tags { display: flex; gap: 5px; flex-wrap: wrap; }
.rev-ops { margin-left: auto; display: flex; align-items: center; gap: 12px; flex-shrink: 0; }
.rev-like {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    background: none;
    border: none;
    cursor: pointer;
    color: var(--ink-2);
    font-size: 11px;
    padding: 0;
    font-family: inherit;
}
.rev-like img { width: 16px; height: 16px; object-fit: contain; }
.rev-like.on { color: var(--brand); }
.rev-report { color: var(--ink-2); text-decoration: none; }
.rev-report:hover { color: var(--brand); }
/* 空态 / 分页 */
.empty-tip { text-align: center; color: var(--ink-2); padding: 28px 0; font-size: 13px; }
.link { color: var(--brand); cursor: pointer; }
.pager { display: flex; justify-content: center; margin-top: 14px; }

/* ===== 桌面适配（≥769）===== */
@media (min-width: 769px) {
    /* 阅读宽度：780px 居中，信息与评价行宽更舒适（覆盖全局 1080） */
    .page-wrap { max-width: 780px; }
    /* 封面图：宽幅下加高保持视觉分量 */
    .hero-img { height: 280px; }
}

/* ===== 桌面适配（≥1200）===== */
</style>
