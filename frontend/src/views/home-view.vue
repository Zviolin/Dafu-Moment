<template>
    <div class="page-wrap home">
        <!-- 1. 就餐场景四格 → /list?type=N（类型文案取自 CANTEEN_TYPE_NAME）
             搜索入口统一收敛到顶部导航栏搜索框（首页不再重复放页内搜索条，r90） -->
        <div class="scence fade-up">
            <div v-for="s in SCENES" :key="s.type" class="scene-item" @click="$router.push(`/list?type=${s.type}`)">
                <span class="simg"><img :src="s.img" :alt="CANTEEN_TYPE_NAME[s.type]"></span>
                <div class="t">{{ CANTEEN_TYPE_NAME[s.type] }}</div>
            </div>
        </div>

        <!-- 桌面双列区（口碑榜⇄推荐 tab 同位切换 / 最新点评右侧跨行）：
             移动端容器 display:contents，六个块按 DOM 顺序平铺（与原布局完全一致）；
             桌面端六块用 grid-area 显式定位入格 -->
        <div class="home-top-grid">
        <!-- 3. 校园口碑榜：三行 rankrow，整卡 → /rank；
             桌面端与「为你推荐」同位 tab 切换（移动端恒双显，tab 控件隐藏） -->
        <div class="sec home-tab-sec">
            <b class="m-title">校园口碑榜</b>
            <div class="tab-switch" role="tablist">
                <button type="button" :class="{ on: home_tab === 'rank' }" @click="home_tab = 'rank'">校园口碑榜</button>
                <button type="button" :class="{ on: home_tab === 'rec' }" @click="home_tab = 'rec'">为你推荐</button>
            </div>
            <span @click="$router.push(home_tab === 'rank' ? '/rank' : '/list')">{{ home_tab === 'rank' ? '本周更新 ›' : '更多 ›' }}</span>
        </div>
        <div v-show="show_rank" class="card rankcard fade-up" @click="$router.push('/rank')">
            <template v-for="(r, i) in rank_rows" :key="r.name">
                <div v-if="i > 0" class="hairline-dashed"></div>
                <div class="rankrow">
                    <span class="no" :class="no_cls(i + 1)">{{ i + 1 }}</span>
                    <div class="rinfo">
                        <b>{{ r.name }}</b>
                        <div class="rsub">{{ r.sub }}</div>
                    </div>
                    <b class="rscore score-num">{{ fmt_score(r.score) }}</b>
                </div>
            </template>
            <div v-if="!rank_rows.length" class="rec-empty">暂无口碑数据，快去打分吧</div>
        </div>

        <!-- 4. 最新真实点评：气泡×5（随机 2 条降透明度，第 3 条固定）；桌面占右列并跨行 -->
        <div class="sec home-bub-sec"><b>最新真实点评</b><span @click="$router.push('/circle')">全部 ›</span></div>
        <div class="bub-block fade-up">
            <div class="bub-flow">
                <span
                    v-for="(b, i) in bubbles" :key="i"
                    class="bubble" :class="bub_cls(i)" :style="{ opacity: bubble_op[i] }"
                    @click="go_bubble(b)"
                >{{ b.text }}</span>
            </div>
            <div v-if="!bubbles.length" class="rec-empty">暂无点评，去写第一条吧</div>
            <div class="bub-foot">
                <div class="bub-avatars">
                    <img class="avatar-fix" src="/assets/avatar-user.png" alt="">
                    <img class="avatar-fix" src="/assets/food/yangzhi.png" alt="">
                    <img class="avatar-fix" src="/assets/food/kuanfen.png" alt="">
                </div>
                <span class="bub-tip">他们都在说</span>
                <span class="say-chip" @click="$router.push('/publish')">我也说 ›</span>
            </div>
        </div>

        <!-- 5. 为你推荐：带推荐理由文案（数据不足时展示热门内容）；
             桌面端标题由 tab 控件表达（sec 隐藏），卡片与口碑榜同位切换 -->
        <div class="sec rec-sec"><b>为你推荐</b><span @click="$router.push('/list')">更多 ›</span></div>
        <div v-show="show_rec" class="card reccard fade-up">
            <div v-for="(r, i) in rec_items" :key="`${r.subjectType}_${r.subjectId}`" class="rec-row" @click="go_rec(r)">
                <div class="rec-cover img-fallback">
                    <img v-if="r.cover" :src="cover_url(r.cover)" loading="lazy" alt="">
                    <span v-else class="fallback-char">{{ (r.name || '').slice(0, 1) }}</span>
                </div>
                <div class="rec-info">
                    <b class="rec-name">{{ r.name }}</b>
                    <div v-if="r.reason" class="rec-reason">{{ r.reason }}</div>
                </div>
                <b class="rec-score score-num">{{ fmt_score(r.avgScore) }}</b>
            </div>
            <div v-if="rec_items.length === 0" class="rec-empty">暂无推荐，快去打分吧</div>
        </div>
        </div><!-- /home-top-grid -->

        <!-- 6. 热门档口：2 列网格卡（无排队角标，右上收藏心形）；无数据展示空态 -->
        <div class="sec"><b>热门档口</b><span class="more" @click="shuffle_hot">换一换 ›</span></div>
        <div v-if="hot_cards.length" class="hotgrid fade-up">
            <div v-for="c in hot_cards" :key="`${c.subjectType}_${c.subjectId}`" class="hotcard" @click="go_card(c)">
                <div class="pic">
                    <img v-if="c.img" :src="c.img" loading="lazy" alt="">
                    <span v-else class="pic-fallback img-fallback">{{ (c.name || '').slice(0, 1) }}</span>
                    <span class="fav" @click.stop="toggle_fav(c)">
                        <svg width="12" height="12" viewBox="0 0 24 24" :fill="is_fav(c) ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-7.5-4.9-9.5-9A5.4 5.4 0 0 1 12 6.6 5.4 5.4 0 0 1 21.5 12c-2 4.1-9.5 9-9.5 9z"/></svg>
                    </span>
                </div>
                <div class="hinfo">
                    <b class="hname">{{ c.name }}</b>
                    <div class="hsub">{{ c.sub }}</div>
                    <div class="htags"><span v-for="t in c.chips" :key="t" class="chip">{{ t }}</span></div>
                    <div class="hmeta">
                        <span class="hstar">★ {{ fmt_score(c.score) }} <i>{{ c.count }} 条</i></span>
                        <span class="hprice">{{ c.price_text }}</span>
                    </div>
                </div>
            </div>
        </div>
        <div v-else class="rec-empty">暂无热门档口</div>
    </div>
</template>

<script setup>
/**
 * 首页（P01 暖纸奶油风改版）：搜索条 → 场景四格 → 校园口碑榜 → 最新点评气泡 → 为你推荐 → 热门档口
 * 数据：recommendations()（口碑榜/推荐/热门）+ api_review.list()（点评气泡）；接口无数据时展示空态，不启用页内假数据
 */
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { api_content, api_review } from '../api';
import { fmt_score, cover_url, CANTEEN_TYPE_NAME } from '../utils/format';

const router = useRouter();

// 场景四格：type 对应后端 canteens.type，文案统一取自 CANTEEN_TYPE_NAME（0 校内食堂 / 1 永嘉天地 / 2 学生街 / 3 周边其他）
const SCENES = [
    { type: 0, img: '/assets/icons/scene-canteen.png' },
    { type: 3, img: '/assets/icons/scene-waimai.png' },
    { type: 2, img: '/assets/icons/scene-sichu.png' },
    { type: 1, img: '/assets/icons/scene-mall.png' },
];

const recs = ref({ top: [], forYou: [] });
const bubbles = ref([]);
const bubble_op = ref([1, 1, 1, 1, 1]);
const hot_cards = ref([]);
const favs = ref([]);

/** 口碑榜三行：取接口高分口碑 top（无数据则由模板展示空态） */
const rank_rows = computed(() => (recs.value.top || []).slice(0, 3).map((r) => ({
    name: r.name,
    sub: r.subtitle || '',
    score: r.avgScore,
})));

/** 为你推荐：优先 forYou，缺数据回落到口碑 top；理由字段缺失时留空（不编造文案） */
const rec_items = computed(() => {
    const for_you = recs.value.forYou || [];
    const src = for_you.length ? for_you : (recs.value.top || []);
    return src.slice(0, 3).map((r) => ({ ...r, reason: r.reason || '' }));
});

/**
 * 名次圆号配色：1 金 2 银 3 铜渐变，其余淡纸底
 * @param {number} n - 名次
 */
function no_cls(n) {
    return n === 1 ? 'gold' : n === 2 ? 'silver' : n === 3 ? 'bronze' : '';
}

/**
 * 气泡底色轮换（纸面同族浅色，避免整列同色呆板）
 * @param {number} i - 气泡序号
 */
function bub_cls(i) {
    return i % 3 === 1 ? 'bg-cream' : i % 3 === 2 ? 'bg-light' : '';
}

/**
 * 气泡点击：有点评 id 进详情，无 id 去点评圈
 * @param {{id:number|null, text:string}} b
 */
function go_bubble(b) {
    if (b.id) router.push(`/post/${b.id}`);
    else router.push('/circle');
}

/**
 * 推荐卡跳转：subjectType 0 菜品 / 1 窗口 / 2 食区
 * @param {{subjectType:number, subjectId:number}} r
 */
function go_rec(r) {
    const path = [`/dish/${r.subjectId}`, `/station/${r.subjectId}`, `/canteen/${r.subjectId}`][r.subjectType];
    if (path) router.push(path);
}

/**
 * 热门卡跳转（构建时已生成 to 路径）
 * @param {{to:string}} c
 */
function go_card(c) {
    router.push(c.to);
}

/**
 * 收藏心形切换（仅本地视觉态）
 * @param {Object} c - 热门卡
 */
function toggle_fav(c) {
    const i = favs.value.indexOf(c);
    if (i >= 0) favs.value.splice(i, 1);
    else favs.value.push(c);
}

/**
 * 是否已收藏
 * @param {Object} c - 热门卡
 */
function is_fav(c) {
    return favs.value.includes(c);
}

/** 换一换：热门档口随机重排 */
function shuffle_hot() {
    hot_cards.value = [...hot_cards.value].sort(() => Math.random() - 0.5);
}

/**
 * 气泡随机透明度：从 [0,1,3,4] 随机取 2 条设 0.70~0.90，第 3 条固定不透明（C2 口径）
 */
function apply_bubble_opacity() {
    const op = [1, 1, 1, 1, 1];
    const idx = [0, 1, 3, 4].sort(() => Math.random() - 0.5).slice(0, 2);
    idx.forEach((i) => { op[i] = Number((0.7 + Math.random() * 0.2).toFixed(2)); });
    bubble_op.value = op;
}

/**
 * 加载推荐 + 首页口碑榜：
 * 口碑榜与 /rank 页「口碑榜（近 7 天）」同源（rankings?period=week&dim=score），避免前后端两套口径导致榜单不一致；
 * 榜单为空时回落到 recommendations.top，推荐块仍用 forYou。
 */
async function load_recs() {
    const [reco, rank] = await Promise.allSettled([
        api_content.recommendations(),
        api_content.rankings({ period: 'week', dim: 'score', limit: 6 }),
    ]);
    const data = reco.status === 'fulfilled' ? (reco.value || {}) : {};
    const board = rank.status === 'fulfilled' ? (rank.value || []) : [];
    // 榜单行 → 首页卡片字段（subjectType 1 = 档口）
    const top = board.length
        ? board.map((r) => ({
            subjectType: 1,
            subjectId: r.id,
            name: r.name,
            subtitle: [r.canteenName, r.category, r.avgPrice ? `¥${r.avgPrice}/人` : ''].filter(Boolean).join(' · '),
            tags: r.category ? [r.category] : [],
            avgScore: r.ratingAvg,
            reviewCount: r.reviewCount,
            cover: r.coverObjectKey,
        }))
        : (data.top || []);
    recs.value = { top, forYou: data.forYou || [] };
    build_hot_cards();
}

/**
 * 构建热门档口卡：取接口高分口碑 top 映射为卡片模型；无数据为空（模板展示空态）
 */
function build_hot_cards() {
    const top = recs.value.top || [];
    hot_cards.value = top.slice(0, 4).map((r) => {
        const m = String(r.subtitle || '').match(/¥(\d+(?:\.\d+)?)/);
        return {
            subjectType: r.subjectType,
            subjectId: r.subjectId,
            name: r.name,
            sub: r.subtitle || '',
            chips: (r.tags || []).slice(0, 2),
            score: r.avgScore,
            count: r.reviewCount || 0,
            price_text: m ? `¥${m[1]}/人` : '—',
            img: r.cover ? cover_url(r.cover) : '',
            to: [`/dish/${r.subjectId}`, `/station/${r.subjectId}`, `/canteen/${r.subjectId}`][r.subjectType] || '/list',
        };
    });
}

/**
 * 加载最新点评气泡：取接口最近 5 条；无数据为空（模板展示空态），随后应用随机透明度
 */
async function load_bubbles() {
    let rows = [];
    try {
        const data = await api_review.list({ page: 1, size: 5 });
        rows = Array.isArray(data) ? data : (data.list || []);
    } catch {
        rows = [];
    }
    bubbles.value = rows
        .filter((r) => r.content)
        .slice(0, 5)
        .map((r) => ({ id: r.id ?? null, text: r.content }));
    apply_bubble_opacity();
}

/** 桌面端「校园口碑榜 / 为你推荐」同位切换态（tab 控件仅桌面渲染） */
const home_tab = ref('rank');
/** 是否桌面视口（≥769px）：切换逻辑仅在桌面生效，移动端两块恒显示 */
const is_desktop = ref(typeof window !== 'undefined' && window.innerWidth >= 769);
/** 口碑榜块显示条件：移动恒显，桌面随 tab */
const show_rank = computed(() => !is_desktop.value || home_tab.value === 'rank');
/** 推荐块显示条件：移动恒显，桌面随 tab */
const show_rec = computed(() => !is_desktop.value || home_tab.value === 'rec');

/** 视口宽度监听：跨过 769 断点时更新 is_desktop */
function handle_resize() {
    is_desktop.value = window.innerWidth >= 769;
}
onMounted(() => window.addEventListener('resize', handle_resize));
onUnmounted(() => window.removeEventListener('resize', handle_resize));

onMounted(() => {
    load_recs();
    load_bubbles();
});
</script>

<style scoped>
/* ===== 场景四格：68px 外框 / 52px 素材图 ===== */
.scence {
    display: flex;
    justify-content: space-around;
    padding: 10px 0 4px;
}
.scene-item { text-align: center; cursor: pointer; }
.simg {
    width: 68px;
    height: 68px;
    border-radius: var(--radius-sm);
    background: var(--paper);
    box-shadow: var(--shadow-soft);
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    transition: transform .12s ease;
}
.scene-item:hover .simg { transform: translateY(-2px); }
.simg img { width: 52px; height: 52px; object-fit: contain; }
.scene-item .t { font-size: 11px; margin-top: 5px; font-weight: 700; }

/* ===== 口碑榜卡：三行 rankrow + 虚线分隔 ===== */
.rankcard { margin-top: 8px; cursor: pointer; }
.rankrow { display: flex; align-items: center; gap: 10px; padding: 11px 6px; }
.rankcard .hairline-dashed { margin: 0; }
.no {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    color: #FFF;
    font-size: 12px;
    font-weight: 800;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    background: #D8CBB0;
}
.no.gold { background: linear-gradient(135deg, #FFD700, #FFA500); }
.no.silver { background: linear-gradient(135deg, #C0C0C0, #9A9A9A); }
.no.bronze { background: linear-gradient(135deg, #CD7F32, #A05A2A); }
.rinfo { flex: 1; min-width: 0; }
.rinfo b { font-size: 13px; display: block; }
.rsub { font-size: 10px; color: var(--ink-2); margin-top: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.rscore { font-size: 16px; color: var(--star); flex-shrink: 0; }

/* ===== 最新点评：气泡流 + 底部头像组 ===== */
.bub-block { margin-top: 12px; padding: 2px 0 4px; }
.bub-flow { display: flex; flex-wrap: wrap; gap: 14px 8px; }
.bubble { cursor: pointer; transition: opacity .2s ease; }
.bg-cream { background: #FBF3DC; }
.bg-light { background: var(--brand-light); }
.bub-foot { display: flex; align-items: center; gap: 8px; margin-top: 18px; }
.bub-avatars { display: flex; }
.bub-avatars img {
    width: 22px;
    height: 22px;
    border-radius: 50%;
    border: 2px solid var(--paper);
    margin-left: -7px;
}
.bub-avatars img:first-child { margin-left: 0; }
.bub-tip { font-size: 11px; color: var(--ink-2); flex: 1; }
/* 「我也说」深色签：墨底纸字 */
.say-chip {
    font-size: 10px;
    background: var(--ink);
    color: var(--paper);
    padding: 4px 11px;
    border-radius: var(--radius-sm);
    font-weight: 600;
    cursor: pointer;
}

/* ===== 为你推荐：横排推荐行（图 + 名称 + 理由 + 分） ===== */
.reccard { margin-top: 8px; }
.rec-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 9px 2px;
    cursor: pointer;
    border-radius: var(--radius-sm);
    transition: background .12s ease;
}
.rec-row:hover { background: #FBF3DC; }
.rec-row + .rec-row { border-top: 1px solid var(--line); }
.rec-cover { width: 44px; height: 44px; border-radius: var(--radius-sm); overflow: hidden; flex-shrink: 0; }
.rec-cover img { width: 100%; height: 100%; object-fit: cover; }
.fallback-char { font-size: 18px; }
.rec-info { flex: 1; min-width: 0; }
.rec-name { font-size: 13px; display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.rec-reason { font-size: 10px; color: var(--ink-3); margin-top: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.rec-score { font-size: 15px; color: var(--star); flex-shrink: 0; }
.rec-empty { text-align: center; color: var(--ink-2); font-size: 12px; padding: 14px 0; }

/* ===== 热门档口：2 列网格卡（无排队角标） ===== */
.hotgrid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 8px; padding-bottom: 8px; }
.hotcard {
    background: var(--paper);
    border-radius: var(--radius);
    overflow: hidden;
    box-shadow: var(--shadow-soft);
    cursor: pointer;
    transition: transform .12s ease;
}
.hotcard:hover { transform: translateY(-2px); }
.hotcard .pic { position: relative; height: 96px; overflow: hidden; }
.hotcard .pic img { width: 100%; height: 100%; object-fit: cover; }
.pic-fallback { width: 100%; height: 100%; font-size: 26px; }
.fav {
    position: absolute;
    top: 6px;
    right: 7px;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: rgba(255, 253, 245, 0.9);
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--brand);
}
.hinfo { padding: 11px 14px 13px; }
.hname { font-size: 13px; display: block; }
.hsub { font-size: 10px; color: var(--ink-2); margin-top: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.htags { margin-top: 6px; display: flex; gap: 5px; flex-wrap: wrap; }
.hmeta {
    display: flex;
    justify-content: space-between;
    margin-top: 8px;
    font-size: 10.5px;
}
.hstar { color: var(--star); font-weight: 700; }
.hstar i { font-style: normal; color: var(--ink-2); font-weight: 400; }
.hprice { color: var(--ink-2); }

/* ===== 榜单/推荐切换分段控件：移动端隐藏（两块纵向堆叠），桌面端启用 ===== */
.tab-switch { display: none; }

/* ===== 桌面适配（≥769）：宽幅布局，设计语言与移动端同源 ===== */

/* 双列区容器：移动端 display:contents 不产生任何盒影响（六块按 DOM 序平铺） */
.home-top-grid { display: contents; }

@media (min-width: 769px) {
    /* 四场景格：顶部无页内搜索条，居中收窄避免大屏稀疏拉伸 */
    .scence { max-width: 620px; margin: 0 auto; padding-top: 20px; }

    /* 双列区 grid：左主列 1.15fr（r1 = tab 标题行，r2 = 口碑榜/推荐卡「同格互斥叠放」：
       两卡都定位到 2/1，桌面 v-show 保证同一时刻只显示其一，切换顶格零空隙）
       + 右侧列 1fr（r1 点评标题，r2 点评气泡块） */
    .home-top-grid {
        display: grid;
        grid-template-columns: 1.15fr 1fr;
        grid-template-rows: auto auto;
        column-gap: 36px;
        align-items: start;
    }
    .home-tab-sec { grid-area: 1 / 1; }
    .rankcard { grid-area: 2 / 1; }
    .reccard { grid-area: 2 / 1; } /* 与口碑榜同格：v-show 互斥，桌面同时只渲染一张 */
    .home-bub-sec { grid-area: 1 / 2; }
    .bub-block { grid-area: 2 / 2; }

    /* 桌面 tab 控件：淡金底分段控件，on 态琥珀实底 */
    .tab-switch {
        display: flex; gap: 4px;
        background: var(--brand-light);
        border-radius: var(--radius-sm);
        padding: 3px;
    }
    .tab-switch button {
        border: none; background: transparent; cursor: pointer;
        font-size: 12.5px; font-weight: 700; color: var(--ink-3);
        padding: 5px 14px; border-radius: 6px;
        font-family: inherit; letter-spacing: .5px;
        transition: background .12s ease, color .12s ease;
    }
    .tab-switch button.on { background: var(--brand); color: #FFFDF5; }
    .tab-switch button:not(.on):hover { color: var(--brand-dark); }
    /* 桌面隐藏移动版标题与推荐 sec（tab 控件已表达语义） */
    .home-tab-sec .m-title { display: none; }
    .rec-sec { display: none; }

    /* 主列卡：内容加高更饱满（榜单行距/推荐行距放大一档） */
    .rankcard, .reccard { padding: 6px 18px; }
    .rankrow { padding: 14px 0; }
    .rec-row { padding: 13px 0; }

    /* 侧列（最新真实点评）：气泡与底部栏桌面态微放大 */
    .bub-block { padding: 18px 18px 16px; }
    .bubble { font-size: 12px; padding: 8px 13px; }

    /* 热门档口：3 列网格，封面与内边距按桌面比例放大 */
    .hotgrid { grid-template-columns: repeat(3, 1fr); gap: 16px; }
    .hotcard .pic { height: 124px; }
    .hinfo { padding: 13px 16px 15px; }
    .hname { font-size: 14px; }
}

/* ===== 桌面适配二档（≥1200）===== */
@media (min-width: 1200px) {
    /* 超宽屏：热门档口 4 列铺满 */
    .hotgrid { grid-template-columns: repeat(4, 1fr); }
}
</style>
