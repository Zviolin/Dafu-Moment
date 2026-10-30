<template>
    <!-- 点位详情（对齐 P05-档口详情.html 同款版式）：顶栏 → 轮播 → 信息 → 互动行 → 窗口列表 → 同学评价 -->
    <div class="page-wrap" v-if="data">
        <!-- 顶部栏：仅「返回 + 分享」两枚圆形浮钮（原型 C7：三点菜单已删） -->
        <div class="topbar">
            <span class="icircle" @click="$router.back()">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7" /></svg>
            </span>
            <b class="topbar-title">{{ data.canteen.name }}</b>
            <span class="icircle" @click="open_share">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V4" /><path d="M8 7.5L12 3.5l4 4" /><path d="M5 12v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" /></svg>
            </span>
        </div>

        <!-- 封面：接口仅返回单张封面，不做多图轮播（原左右箭头/角标是假交互，已移除） -->
        <div class="carousel">
            <img v-if="data.canteen.cover_object_key" :src="cover_url(data.canteen.cover_object_key)" alt="点位封面" />
            <div v-else class="carousel-fallback img-fallback">{{ data.canteen.name.slice(0, 1) }}</div>
        </div>

        <!-- 分享弹窗：可复制链接，点击弹窗外区域关闭（不显示二维码） -->
        <div v-if="share_open" class="share-mask" @click.self="share_open = false">
            <div class="share-box card fade-up">
                <b class="share-title">分享给同学</b>
                <div class="share-link">{{ share_link }}</div>
                <button class="share-copy" @click="copy_link">{{ copied ? '已复制 ✓' : '复制链接' }}</button>
            </div>
        </div>

        <!-- 信息区：名称 / 位置 / 类型 / 人均 / 标签 chips（信息行不含任何排队时间） -->
        <div class="info">
            <h1 class="info-name">{{ data.canteen.name }}</h1>
            <div class="info-loc">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-6-5.2-6-10a6 6 0 1 1 12 0c0 4.8-6 10-6 10z" /><circle cx="12" cy="11" r="2.2" /></svg>
                {{ data.canteen.location }}
                <router-link class="map-link" :to="`/map?focus=${data.canteen.id}`">在地图上查看 ›</router-link>
            </div>
            <div class="info-score">
                <span class="muted">{{ data.stations.length }} 个窗口 · {{ posts_count }} 条动态</span>
                <span v-if="has_avg_price" class="avg-price score-num">人均 ¥{{ data.canteen.avg_price }}</span>
            </div>
            <!-- 真实营业时间：仅展示公开资料里有值的点位，无资料不臆造 -->
            <div v-if="data.canteen.business_hours" class="info-hours">
                营业时间 {{ data.canteen.business_hours }}
            </div>
            <div class="chip-row">
                <span class="chip">{{ CANTEEN_TYPE_NAME[data.canteen.type] }}</span>
                <span v-for="t in point_tags" :key="t" class="chip">{{ t }}</span>
            </div>
        </div>

        <!-- 点位公告（保留原动态聚合接线，档口名可跳档口页） -->
        <div v-for="p in data.posts" :key="p.id" class="post-bar">
            <span class="post-ico">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9a6 6 0 1 1 12 0c0 5 2 6 2 6H4s2-1 2-6" /><path d="M10 19a2 2 0 0 0 4 0" /></svg>
            </span>
            <span class="chip">{{ post_label(p.type) }}</span>
            <span class="post-text"><a class="post-station" @click="$router.push(`/station/${p.station_id}`)">{{ p.station_name }}</a>：{{ p.content }}</span>
            <span class="post-time">{{ time_ago(p.created_at) }}</span>
        </div>

        <!-- 互动行：想吃（收藏 toggle）/ 吃过（去写点评）/ 打卡（跳打卡页） -->
        <div class="duo">
            <button class="duo-btn want" @click="set_fav">
                <img src="/assets/icons/icon-want.png" alt="" />{{ fav === 0 ? '已想吃' : '想吃' }}
            </button>
            <button class="duo-btn ate" @click="go_publish(2)">
                <img src="/assets/icons/icon-eaten.png" alt="" />吃过
            </button>
            <button class="duo-btn check" @click="$router.push('/checkin')">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="5" width="17" height="16" rx="3" /><path d="M8 3v4M16 3v4M3.5 10h17" /><path d="M9.5 15.5l2 2 3.5-3.5" /></svg>
                打卡
            </button>
        </div>
        <div class="duo-hint">「想吃」先收藏起来 · 「吃过」直接写点评</div>

        <!-- 窗口列表：行点击进档口详情 -->
        <div class="sec"><b>窗口列表（{{ data.stations.length }}）</b><span>点击查看档口</span></div>
        <div class="station-list card" v-if="data.stations.length">
            <div v-for="s in data.stations" :key="s.id" class="station-row" @click="$router.push(`/station/${s.id}`)">
                <div class="st-thumb img-fallback">{{ s.name.slice(0, 1) }}</div>
                <div class="st-mid">
                    <b>{{ s.name }}</b>
                    <div class="st-meta">
                        <span class="chip">{{ s.category }}</span>
                        <span class="muted">{{ s.status === 0 ? '营业中' : '休摊' }}</span>
                        <span v-if="s.review_count > 0" class="muted">{{ s.review_count }} 人评</span>
                    </div>
                </div>
                <span v-if="s.rating_avg > 0" class="wr score-num">{{ fmt_score(s.rating_avg) }}</span>
                <span v-else class="wr na">暂无评分</span>
            </div>
        </div>
        <div v-else class="empty-tip">这个点位还没有录入窗口</div>

        <!-- 同学评价：写评价 → 发布页（预选点位） -->
        <div class="sec">
            <b>同学评价（{{ review_total }}）</b>
            <span class="write-link" @click="go_publish(2)">写评价 ›</span>
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
        <div v-if="reviews.length === 0" class="empty-tip">还没有同学评价，<a class="link" @click="go_publish(2)">写下第一条</a></div>
        <button v-if="reviews.length < review_total" class="more-btn" @click="load_more">查看更多评价</button>
    </div>
</template>

<script setup>
/**
 * 食堂点位详情（暖纸奶油风改版，对齐 P05 版式）：
 * 顶栏返回/分享（链接弹窗）→ 封面轮播示意 → 信息区（类型/人均/标签）→ 想吃/吃过/打卡 → 窗口列表 → 同学评价
 * 保留原有 canteen_detail / favorite 接线与业务方法
 */
import { ref, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { api_content, api_review, api_favorite } from '../api';
import { useAuthStore } from '../stores/auth';
import { CANTEEN_TYPE_NAME, time_ago, fmt_score, cover_url } from '../utils/format';
import UserAvatar from '../components/user-avatar.vue';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const data = ref(null);
// 想吃收藏状态（0 已收藏 / null 未收藏）
const fav = ref(null);
// 维度配置（按点位类型动态拉取，评价卡维度小分用）
const dims = ref([]);
// 评价列表状态
const reviews = ref([]);
const review_total = ref(0);
const sort = ref('hot');
const page = ref(1);
// 分享弹窗状态
const share_open = ref(false);
const share_link = ref('');
const copied = ref(false);

const posts_count = computed(() => (data.value ? data.value.posts.length : 0));
// 点位标签 chips（后端新字段 tags，字符串数组；最多展示 4 个，缺省防御）
const point_tags = computed(() => (data.value?.canteen?.tags || []).slice(0, 4));
// 人均价存在标记（v2.0 四类型口径，NULL 不展示）
const has_avg_price = computed(() => data.value && data.value.canteen.avg_price != null && data.value.canteen.avg_price !== '');

/**
 * 公告类型文案
 * @param {string} t
 */
function post_label(t) {
    return { new_dish: '上新', menu_change: '换菜', away: '休摊', promo: '优惠' }[t] || '动态';
}

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
 * 打开分享弹窗：链接取当前地址
 */
function open_share() {
    share_link.value = location.href;
    copied.value = false;
    share_open.value = true;
}

/**
 * 复制链接：clipboard API 优先，失败降级 execCommand
 */
async function copy_link() {
    try {
        await navigator.clipboard.writeText(share_link.value);
    } catch {
        // 降级：临时 textarea + execCommand（http 环境下 clipboard 不可用）
        const ta = document.createElement('textarea');
        ta.value = share_link.value;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
    }
    copied.value = true;
    ElMessage.success('链接已复制');
    setTimeout(() => { copied.value = false; }, 1500);
}

/**
 * 加载评价列表（最热 / 最新）
 */
async function load_reviews() {
    const res = await api_review.list({ subjectType: 2, subjectId: route.params.id, sort: sort.value, page: page.value });
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
 * 加载更多（追加下一页）
 */
async function load_more() {
    page.value += 1;
    const res = await api_review.list({ subjectType: 2, subjectId: route.params.id, sort: sort.value, page: page.value });
    reviews.value = reviews.value.concat(res.list);
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
        await api_favorite.remove(2, id);
        fav.value = null;
        ElMessage.success('已取消想吃');
    } else {
        await api_favorite.set({ subjectType: 2, subjectId: id, listType: 0 });
        fav.value = 0;
        ElMessage.success('已加入「想吃」');
    }
}

/**
 * 去发布（预选点位）
 * @param {number} subjectType
 */
function go_publish(subjectType) {
    router.push({ path: '/publish', query: { type: subjectType, id: route.params.id } });
}

onMounted(async () => {
    const id = Number(route.params.id);
    data.value = await api_content.canteen_detail(id);
    // 维度配置：按点位类型拉取（评价卡多维小分用）
    dims.value = await api_content.dimensions(data.value.canteen.type);
    // 收藏初始态：单对象 status 接口（不再整表拉取比对）
    if (auth.is_login) {
        const st = await api_favorite.status(2, id).catch(() => null);
        fav.value = st && st.favored ? 0 : null;
    }
    // 评价列表
    await load_reviews();
});
</script>

<style scoped>
/* 顶部栏：返回 + 居中标题 + 分享 */
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
/* 轮播区：无框圆角卡 + 弥散阴影；箭头/角标浮层 */
.carousel {
    position: relative;
    height: 230px;
    border-radius: var(--radius);
    overflow: hidden;
    box-shadow: var(--shadow-soft);
    background: var(--paper);
}
.carousel > img { width: 100%; height: 100%; object-fit: cover; display: block; }
.carousel-fallback { width: 100%; height: 100%; font-size: 44px; }
/* 分享弹窗：居中卡面小盒，遮罩点击关闭 */
.share-mask {
    position: fixed;
    inset: 0;
    background: rgba(58, 46, 26, 0.4);
    z-index: 30;
    display: flex;
    align-items: center;
    justify-content: center;
}
.share-box { width: 309px; max-width: 86vw; border-radius: var(--radius-sm); }
.share-title { font-size: 15px; }
.share-link {
    margin-top: 12px;
    background: var(--page);
    border: 1px solid var(--line);
    border-radius: 6px;
    padding: 10px 12px;
    font-size: 11px;
    color: var(--ink-3);
    word-break: break-all;
    user-select: all;
}
.share-copy {
    margin-top: 14px;
    width: 100%;
    height: 40px;
    border-radius: 6px;
    background: var(--ink);
    color: var(--paper);
    border: none;
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
}
/* 信息区 */
.info { padding: 14px 2px 0; }
.info-name { margin: 0; font-size: 21px; font-weight: 800; }
.info-loc { display: flex; align-items: center; gap: 4px; margin-top: 5px; font-size: 12px; color: var(--ink-2); }
.map-link { color: var(--brand); margin-left: 6px; text-decoration: none; }
.map-link:hover { color: var(--brand-dark); }
.info-score { display: flex; align-items: baseline; gap: 12px; margin-top: 9px; }
.muted { font-size: 11px; color: var(--ink-2); font-weight: 400; }
.avg-price { color: var(--brand); font-size: 13px; font-weight: 700; }
/* 真实营业时间：低调说明行，不与人均抢视觉 */
.info-hours { margin-top: 6px; font-size: 11.5px; color: var(--ink-2); }
.chip-row { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 10px; }
/* 公告条：1px 虚线淡纸签 */
.post-bar {
    margin-top: 10px;
    background: var(--paper);
    border: 1px dashed var(--line);
    border-radius: var(--radius-sm);
    padding: 10px 12px;
    font-size: 12.5px;
    display: flex;
    gap: 8px;
    align-items: center;
    font-weight: 400;
}
.post-ico { color: var(--brand); flex-shrink: 0; display: flex; }
.post-text { flex: 1; min-width: 0; }
.post-station { color: var(--brand); cursor: pointer; font-weight: 600; }
.post-time { margin-left: auto; color: var(--ink-2); font-size: 11px; flex-shrink: 0; }
/* 互动行：想吃（墨底）/ 吃过（卡面）/ 打卡（标签底） */
.duo { display: flex; gap: 10px; margin-top: 16px; }
.duo-btn {
    flex: 1;
    height: 42px;
    border-radius: var(--radius-sm);
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    font-size: 14px;
    font-weight: 700;
    cursor: pointer;
    font-family: inherit;
}
.duo-btn img { width: 20px; height: 20px; object-fit: contain; }
.duo-btn.want { background: var(--ink); color: var(--paper); border: none; }
.duo-btn.want img { filter: brightness(0) invert(1); }
.duo-btn.ate { background: var(--paper); color: var(--ink); border: 1px solid var(--line); box-shadow: var(--shadow-soft); }
.duo-btn.check { background: var(--brand-light); color: var(--brand-dark); border: none; }
.duo-hint { text-align: center; font-size: 10.5px; color: var(--ink-2); margin-top: 8px; }
/* 窗口列表：宽松行高 + 1px 细线分隔 */
.station-list { padding: 4px 14px; }
.station-row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 13px 0;
    border-bottom: 1px solid var(--line);
    cursor: pointer;
}
.station-row:last-child { border-bottom: none; }
.st-thumb {
    width: 48px;
    height: 48px;
    border-radius: var(--radius-sm);
    flex-shrink: 0;
    font-size: 18px;
    display: flex;
    align-items: center;
    justify-content: center;
}
.st-mid { flex: 1; min-width: 0; }
.st-meta { display: flex; gap: 8px; align-items: center; margin-top: 5px; flex-wrap: wrap; }
.wr { color: var(--star); font-size: 16px; flex-shrink: 0; }
.wr.na { color: var(--ink-2); font-size: 11px; font-weight: 400; }
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
/* 空态 / 加载更多 */
.empty-tip { text-align: center; color: var(--ink-2); padding: 28px 0; font-size: 13px; }
.link { color: var(--brand); cursor: pointer; }
.more-btn {
    display: block;
    width: 100%;
    margin-top: 12px;
    padding: 11px;
    border-radius: var(--radius-sm);
    background: var(--paper);
    border: 1px solid var(--line);
    box-shadow: var(--shadow-soft);
    color: var(--ink);
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
    font-family: inherit;
}

/* ===== 桌面适配（≥769）===== */
@media (min-width: 769px) {
    /* 页面列宽：详情类页面统一 920px 宽幅档（覆盖全局 1080） */
    .page-wrap { max-width: 920px; }
    /* 封面轮播：宽幅下加高，避免画面过度扁平 */
    .carousel { height: 320px; }
    /* 窗口列表：单列行改 2 列网格，列间以留白分隔 */
    .station-list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); column-gap: 24px; padding: 10px 18px; }
    /* 网格化后取消行分隔线，改用行内边距呼吸感（移动端分隔线不受影响） */
    .station-row { border-bottom: none; }
}

/* ===== 桌面适配（≥1200）===== */
</style>
