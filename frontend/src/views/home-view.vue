<template>
    <div class="page-wrap home">
        <!-- 1. 就餐场景四格（4.5 轮十四批：需求方澄清会议未要求减少场景，恢复原版四类）→ /list?type=N -->
        <!-- 0. 顶部大标题：名词式与各节标题统一 -->
        <div class="sec"><b>场景分类</b><span @click="$router.push('/list')">更多 ›</span></div>

        <div class="scence fade-up">
            <div v-for="s in SCENES" :key="s.type" class="scene-card" @click="$router.push(`/list?type=${s.type}`)">
                <span class="simg"><img :src="s.img" :alt="s.label"></span>
                <div class="t">{{ s.label }}</div>
            </div>
        </div>

        <!-- 2. 三合一滑动窗口（4.5 轮十四批，需求方澄清）：最新点评 / 口碑榜 / 为你推荐
             收进一个可滑动、可切换的窗口（scroll-snap 滑动 + 标签点击联动），首页独立栏目只保留 用餐场景 + 热门档口 -->
        <div class="combo fade-up">
            <div ref="combo_ref" class="combo-window"
                @scroll="on_combo_scroll"
                @pointerdown="combo_down"
                @pointermove="combo_move"
                @pointerup="combo_up"
                @pointercancel="combo_up"
                @click.capture="combo_click_guard">
                <div class="combo-panel">
                    <div class="panel-head">
                        <b>点评榜单</b>
                        <span @click="$router.push('/rank')">更多榜单 ›</span>
                    </div>
                    <div v-if="rank_rows.length" class="rank-grid">
                        <div v-for="(r, i) in rank_rows" :key="r.name" class="rank-chip" @click="go_rank(r)">
                            <div class="chip-cover">
                                <img v-if="r.cover" :src="cover_url(r.cover)" loading="lazy" alt="">
                                <span v-else class="fallback-char">{{ (r.name || '').slice(0, 1) }}</span>
                            </div>
                            <div class="rc-main">
                                <b class="chip-name">{{ r.name }}</b>
                                <div class="rsub">{{ r.sub }}</div>
                            </div>
                            <div class="rank-right">
                                <span class="bd">{{ r.board }}</span>
                                <b class="rank-no">第{{ r.rank }}名</b>
                            </div>
                        </div>
                    </div>
                    <div v-else class="rec-empty">暂无口碑数据，快去打分吧</div>
                </div>
                <div class="combo-panel">
                    <div class="panel-head">
                        <b>最新点评</b>
                        <span @click="$router.push('/circle')">更多评论 ›</span>
                    </div>
                    <div class="bub-flow">
                        <span
                            v-for="(b, i) in bubbles" :key="i"
                            class="bubble" :class="'bz-' + (i + 1)"
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
                <div class="combo-panel">
                    <div class="panel-head">
                        <b>为你推荐</b>
                    </div>
                    <div v-if="rec_items.length" class="rec-grid">
                        <div v-for="(r, i) in rec_items" :key="`${r.subjectType}_${r.subjectId}`" class="rec-chip" @click="go_rec(r)">
                            <div class="rc-cover img-fallback">
                                <img v-if="r.cover" :src="cover_url(r.cover)" loading="lazy" alt="">
                                <span v-else class="fallback-char">{{ (r.name || '').slice(0, 1) }}</span>
                            </div>
                            <div class="rc-main">
                                <b class="rc-name">{{ r.name }}</b>
                                <div v-if="r.reason" class="rc-reason">{{ r.reason }}</div>
                            </div>
                            <b class="rc-score score-num">★ {{ fmt_score(r.avgScore) }}</b>
                        </div>
                    </div>
                    <div v-else class="rec-empty">暂无推荐，快去打分吧</div>
                </div>
            </div>

            <div class="combo-foot">
                <div class="combo-dots">
                    <i v-for="(c, i) in COMBO_TABS" :key="c" :class="{ on: combo_active === i }"
                        role="button" :aria-label="'切换到' + c" @click="goto_combo(i)"></i>
                </div>
                <span class="combo-hint">滑动切换更多</span>
            </div>
        </div>

        <!-- 5. 热门档口：2 列网格卡（无排队角标，右上收藏心形）；无数据展示空态 -->
        <div class="sec"><b>热门档口</b><span class="more" @click="shuffle_hot"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg> 换一换</span></div>
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
 * 首页（4.5 轮 UI 改版 · 11-02 会议 + 需求方口头澄清）：场景四格 →
 * [最新点评 | 口碑榜 | 为你推荐 三合一滑动窗口] → 热门档口
 * 改版要点：四个用餐场景全恢复（会议未要求减少）；点评/榜单/推荐收进一个可滑动、可切换的窗口；
 * 独立栏目只保留 用餐场景 + 热门档口
 * 数据：recommendations()（口碑榜/推荐/热门）+ api_review.list()（点评气泡）；接口无数据时展示空态，不启用页内假数据
 */
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { api_content, api_review } from '../api';
import { fmt_score, cover_url } from '../utils/format';

const router = useRouter();

// 场景四格（4.5 轮十四批恢复四类）：type 对应后端 canteens.type（0 校内食堂 / 1 永嘉天地 / 2 学生街 / 3 校外周边）
const SCENES = [
    { type: 0, img: '/assets/icons/scene-canteen.png', label: '校内食堂' },
    { type: 3, img: '/assets/icons/scene-waimai.png', label: '校外周边' },
    { type: 2, img: '/assets/icons/scene-sichu.png', label: '学生街' },
    { type: 1, img: '/assets/icons/scene-mall.png', label: '永嘉天地' },
];

const recs = ref({ top: [], forYou: [] });
const bubbles = ref([]);
const hot_cards = ref([]);
const favs = ref([]);

// 三合一滑动窗口（4.5 轮十四批）：三面板滑动/点击切换联动，右侧「更多」链接随激活面板变化
const combo_ref = ref(null);
const combo_active = ref(0);
const COMBO_TABS = ['点评榜单', '最新点评', '为你推荐']; // 面板顺序即此顺序（榜单第一）

/** 标签点击：窗口平滑滑到对应面板 */
function goto_combo(i) {
    combo_active.value = i;
    const el = combo_ref.value;
    if (el) el.scrollTo({ left: i * el.clientWidth, behavior: 'smooth' });
}

/** 滑动同步激活标签（取滚动位置最近的面板） */
function on_combo_scroll() {
    const el = combo_ref.value;
    if (!el || !el.clientWidth) return;
    combo_active.value = Math.min(2, Math.max(0, Math.round(el.scrollLeft / el.clientWidth)));
}

/* 鼠标拖拽支持（十五批补）：触摸屏走原生滚动，鼠标没有滚动条拖不动——
   按住左键横向拖动窗口，松手吸附到最近面板；拖动中关 snap，结束后恢复 */
let combo_drag = null;      // { x, left }
let combo_dragged = false;  // 刚完成一次拖动（用于拦截拖动后的误点击）

function combo_down(e) {
    if (e.pointerType !== 'mouse') return; // 触摸/触控笔走原生滚动
    const el = combo_ref.value;
    // 十六批修正：不在按下时立刻 setPointerCapture——捕获会把后续 click 重定向到
    // 滑窗容器，卡片自己的跳转点击就永远不触发；改为拖过阈值才捕获
    combo_drag = { x: e.clientX, left: el.scrollLeft, captured: false };
    combo_dragged = false;
    el.style.cursor = 'grabbing';
}

function combo_move(e) {
    if (!combo_drag) return;
    const el = combo_ref.value;
    const dx = e.clientX - combo_drag.x;
    if (!combo_drag.captured && Math.abs(dx) > 6) {
        combo_drag.captured = true; // 确认真的拖动后才捕获指针
        combo_dragged = true;
        try { el.setPointerCapture(e.pointerId); } catch { /* 已释放则忽略 */ }
        el.style.scrollSnapType = 'none';
    }
    if (combo_drag.captured) el.scrollLeft = combo_drag.left - dx;
}

function combo_up(e) {
    if (!combo_drag) return;
    const el = combo_ref.value;
    const captured = combo_drag.captured;
    combo_drag = null;
    el.style.cursor = '';
    if (captured) {
        try { el.releasePointerCapture(e.pointerId); } catch { /* 已释放 */ }
        el.style.scrollSnapType = '';
        goto_combo(Math.min(2, Math.max(0, Math.round(el.scrollLeft / el.clientWidth))));
    }
}

/** 拖动结束后的 click 误触拦截（拖过就不当卡片点击） */
function combo_click_guard(e) {
    if (combo_dragged) {
        e.stopPropagation();
        e.preventDefault();
        combo_dragged = false;
    }
}

/** 口碑榜横滑卡：取接口高分口碑 top（4.5 轮放宽到 6 张适配滑动窗口；无数据由模板展示空态） */
const rank_rows = computed(() => (recs.value.top || []).slice(0, 3).map((r) => ({ // 三条（十六批：点评榜单/点评/推荐均三条）
    name: r.name,
    sub: r.subtitle || '',
    score: r.avgScore,
    cover: r.cover,
    subjectType: r.subjectType,
    subjectId: r.subjectId,
    board: r.board || '点评榜单',
    rank: r.rank,
})));

/**
 * 口碑榜卡跳转（4.5 轮十批）：菜品进对应详情页，其余回落总榜单
 * @param {{subjectType:number, subjectId:number}} r
 */
function go_rank(r) {
    if (r.subjectType === 0 && r.subjectId) router.push(`/dish/${r.subjectId}`);
    else router.push('/rank');
}

/** 为你推荐：优先 forYou，缺数据回落到口碑 top；理由字段缺失时留空（不编造文案） */
const rec_items = computed(() => {
    const for_you = recs.value.forYou || [];
    const src = for_you.length ? for_you : (recs.value.top || []);
    return src.slice(0, 3).map((r) => ({ ...r, reason: r.reason || '' })); // 三条（十六批）
});

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

/** 换一换（十六批②修）：从全量候选池随机抽 4 张——此前只重排同一批 4 张，怎么换都是这几个 */
function shuffle_hot() {
    build_hot_cards(true);
}

/**
 * 气泡随机透明度：从 [0,1,3,4] 随机取 2 条设 0.70~0.90，第 3 条固定不透明（C2 口径）
 */
/**
 * 加载推荐 + 首页口碑榜：
 * 口碑榜与 /rank 页「口碑榜（近 7 天）」同源（rankings?period=week&dim=score），避免前后端两套口径导致榜单不一致；
 * 榜单为空时回落到 recommendations.top，推荐块仍用 forYou。
 */
async function load_recs() {
    // 双榜合并（4.5 轮十五批②）：口碑榜(score) + 人气榜(hot) 各取名次，卡片右侧标注真实所属榜单
    const [reco, rank_score, rank_hot] = await Promise.allSettled([
        api_content.recommendations(),
        api_content.rankings({ period: 'week', dim: 'score', limit: 6 }),
        api_content.rankings({ period: 'week', dim: 'hot', limit: 6 }),
    ]);
    const data = reco.status === 'fulfilled' ? (reco.value || {}) : {};
    const with_board = (r, board) => (r.status === 'fulfilled' ? (r.value || []) : [])
        .map((x, i) => ({ ...x, board, rank: i + 1 }));
    const board_rows = [
        ...with_board(rank_score, '口碑榜'),
        ...with_board(rank_hot, '人气榜'),
    ];
    const seen = new Set();
    const top = [];
    for (const r of board_rows) {
        const key = `${r.name}@${r.canteenName}`;
        if (seen.has(key)) continue; // 同菜品双榜在列，保留先出现的（口碑榜优先）
        seen.add(key);
        top.push({
            subjectType: r.subjectType ?? 1,
            subjectId: r.id,
            name: r.name,
            subtitle: [r.canteenName, r.category].filter(Boolean).join(' · '),
            tags: r.category ? [r.category] : [],
            avgScore: r.ratingAvg,
            avgPrice: r.avgPrice,
            reviewCount: r.reviewCount,
            cover: r.coverObjectKey,
            board: r.board,
            rank: r.rank,
        });
        if (top.length >= 8) break;
    }
    if (!top.length) top.push(...(data.top || []).slice(0, 8));
    recs.value = { top, forYou: data.forYou || [] };
    build_hot_cards();
}

/**
 * 构建热门档口卡：取接口高分口碑 top 映射为卡片模型；无数据为空（模板展示空态）
 */
function build_hot_cards(random = false) {
    const pool = [...(recs.value.top || [])];
    if (random) pool.sort(() => Math.random() - 0.5);
    hot_cards.value = pool.slice(0, 4).map((r) => {
        return {
            subjectType: r.subjectType,
            subjectId: r.subjectId,
            name: r.name,
            sub: r.subtitle || '',
            chips: (r.tags || []).slice(0, 2),
            score: r.avgScore,
            count: r.reviewCount || 0,
            price_text: r.avgPrice ? `¥${r.avgPrice}/人` : '—',
            img: r.cover ? cover_url(r.cover) : '',
            to: [`/dish/${r.subjectId}`, `/station/${r.subjectId}`, `/canteen/${r.subjectId}`][r.subjectType] || '/list',
        };
    });
}

/**
 * 加载最新点评气泡：取接口最近 5 条；无数据为空（模板展示空态），前后深浅由 bz-N 位置类表达
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
        .slice(0, 4) // 4 条（十六批定稿：点评 4 条、榜单/推荐各 3 条）
        .map((r) => ({ id: r.id ?? null, text: r.content }));
}

onMounted(() => {
    load_recs();
    load_bubbles();
});
</script>

<style scoped>
/* ===== 场景三格（4.5 轮五回）：回退白卡包裹——恢复原版裸图钉（白框只框图标，文字在外），保留场景副标 ===== */
.scence {
    display: flex;
    justify-content: space-around;
    padding: 10px 0 4px;
}
.scene-card { text-align: center; cursor: pointer; }
.scene-card .simg {
    width: 68px;
    height: 68px;
    margin: 0 auto;
    border-radius: var(--radius-sm);
    background: var(--paper);
    box-shadow: var(--shadow-soft);
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    transition: transform .12s ease;
}
.scene-card:hover .simg { transform: translateY(-2px); }
.scene-card .simg img { width: 52px; height: 52px; object-fit: contain; }
.scene-card .t { font-size: 11px; margin-top: 9px; font-weight: 700; }

/* ===== 三合一滑动窗口（4.5 轮十四批）：最新点评/口碑榜/为你推荐 可滑动、可切换 =====
   scroll-snap 整屏对齐；隐藏滚动条；容器负 margin 让滑动区通栏到屏边。
   面板内用网格布局，不做嵌套横滑（避免与窗口手势冲突） */
/* 面板标题（十五批：标题随面板一起滑，不再有独立标签栏） */
.panel-head { display: flex; align-items: baseline; gap: 8px; padding: 28px 0 12px; } /* 间距对齐 .sec 节奏（32/12） */
.panel-head b { font-size: 15px; font-weight: 700; } /* 字号对齐热门档口等节标题 */
.panel-head span { margin-left: auto; font-size: 10px; color: var(--ink-2); cursor: pointer; }
/* 滑动指示圆点（十五批）：当前面板加长加亮，可点 */
.combo-foot { display: flex; align-items: center; justify-content: center; position: relative; margin-top: 10px; }
.combo-dots { display: flex; gap: 6px; } /* 圆点居中（十六批②） */
.combo-hint { position: absolute; right: 0; font-size: 10px; color: var(--ink-2); } /* 提示固定右缘（十六批②） */
.combo-dots i { width: 7px; height: 7px; border-radius: 4px; background: #E8DCC2; cursor: pointer; transition: all .15s ease; }
.combo-dots i.on { width: 18px; background: var(--brand); }

.combo-window {
    display: flex; overflow-x: auto; scroll-snap-type: x mandatory;
    margin: 0 0 4px; padding: 6px 0 12px; /* 上下间距（十六批②）拉开 */
    scrollbar-width: none;
    cursor: grab; touch-action: pan-y; /* 触屏：横向给窗口、纵向给页面 */
    user-select: none; /* 鼠标拖拽换页时禁文字选中 */
}
.combo-window img { -webkit-user-drag: none; pointer-events: none; } /* 禁原生图片拖拽：否则按住图片会触发 HTML5 drag 取消 pointer 拖动 */
/* 页面横向溢出裁剪兜底：滑窗到头后滚动不再链到整页 */
.home { overflow-x: clip; }
.combo-window::-webkit-scrollbar { display: none; }
.combo-panel { min-width: 100%; scroll-snap-align: start; }
.rank-grid, .rec-grid { display: grid; grid-template-columns: 1fr; gap: 14px; } /* 单列（十五批②）：宽度与热门档口卡一致；间距十六批拉大 */

/* 口碑榜矮卡（十五批）：左图 48 + 名称/副标 + 右侧榜名名次标注——与气泡同档高度，三面板卡片统一 */
.rank-chip {
    display: flex; align-items: center; gap: 10px;
    background: var(--paper); border-radius: var(--radius);
    box-shadow: var(--shadow-soft);
    padding: 10px 12px; cursor: pointer;
    transition: transform .12s ease;
}
.rank-chip:hover { transform: translateY(-2px); }
.chip-cover { width: 48px; height: 48px; border-radius: var(--radius-sm); overflow: hidden; flex-shrink: 0; }
.chip-cover img { width: 100%; height: 100%; object-fit: cover; }
.chip-cover .fallback-char { display: flex; align-items: center; justify-content: center; height: 100%; font-size: 20px; color: var(--ink-3); }
.rc-main { flex: 1; min-width: 0; }
.chip-name, .rc-name { display: block; font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
/* 右侧榜名名次标注（十五批） */
.rank-right { flex-shrink: 0; text-align: right; }
.rank-right .bd { display: block; font-size: 9px; color: var(--ink-2); }
.rank-right .rank-no { display: block; font-size: 11px; font-weight: 800; color: var(--brand-dark); margin-top: 2px; }
.rsub { font-size: 10px; color: var(--ink-2); margin-top: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.rscore { font-size: 16px; color: var(--star); flex-shrink: 0; }

/* ===== 最新点评：气泡流 + 底部头像组 ===== */
.bub-block { margin-top: 12px; padding: 2px 0 4px; }
/* 气泡流（4.5 轮八批）：不交叠——疏密靠左右落位与行距；三色近系轮换（奶油/浅金/米白，色差轻），
   交替使用有区分又不跳；bz-2 / bz-4 右对齐补位；微旋转保留手贴感 */
.bub-flow { display: flex; flex-wrap: wrap; align-items: flex-start; gap: 10px 8px; }
.bubble {
    position: relative; cursor: pointer; transition: transform .15s ease;
    padding: 8px 13px; font-size: 12px; border-radius: 14px 14px 14px 4px;
}
.bz-1 { background: #FBF3DC; }
.bz-2 { background: #F5E9CE; margin-left: auto; margin-top: 12px; transform: rotate(1deg); border-radius: 14px 14px 4px 14px; }
.bz-3 { background: #FDF6E3; margin-left: 6%; margin-top: 12px; transform: rotate(-.8deg); }
.bz-4 { background: #FBF3DC; margin-left: auto; margin-right: 8%; margin-top: 12px; transform: rotate(.9deg); border-radius: 14px 14px 4px 14px; }
.bz-5 { background: #F5E9CE; margin-top: 12px; transform: rotate(-1deg); } /* 末条左对齐（4.5 轮十一批） */
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

/* ===== 为你推荐：横向矮卡（与口碑榜卡同构，统一高度） ===== */
.rec-chip {
    display: flex; align-items: center; gap: 10px;
    background: var(--paper); border-radius: var(--radius);
    box-shadow: var(--shadow-soft);
    padding: 10px 12px; cursor: pointer;
    transition: transform .12s ease;
}
.rec-chip:hover { transform: translateY(-2px); }
.rc-cover { width: 48px; height: 48px; border-radius: var(--radius-sm); overflow: hidden; flex-shrink: 0; }
.rc-cover img { width: 100%; height: 100%; object-fit: cover; }
.rc-cover .fallback-char { display: flex; align-items: center; justify-content: center; height: 100%; font-size: 20px; color: var(--ink-3); }
.rc-name { font-size: 12px; display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.rc-reason { font-size: 10px; color: var(--ink-3); margin-top: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.rc-score { flex-shrink: 0; font-size: 13px; color: var(--star); }
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
.hstar i { font-style: normal; color: var(--ink-2); font-weight: 400; margin-left: 7px; } /* 评分与条数间隔（十六批②） */
.hprice { color: var(--ink-2); }

/* ===== 桌面适配（≥769）：宽幅布局，设计语言与移动端同源 ===== */

@media (min-width: 769px) {
    /* 三场景格：居中收窄避免大屏稀疏拉伸 */
    .scence { max-width: 620px; margin: 0 auto; padding-top: 20px; }

    /* 滑动窗口桌面态：通栏 + 三列网格 */
    .combo-window { margin: 10px 0 0; padding: 0 0 4px; }

    /* 最新真实点评：气泡桌面态微放大 */
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
