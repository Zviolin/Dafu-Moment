<template>
    <div class="page-wrap rank-page">
        <!-- 1. 顶部标题栏：返回 + 标题 + 周期切换（切换即按 period 重新取数） -->
        <div class="titlebar">
            <span class="icircle back" @click="go_back">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#3A2E1A" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>
            </span>
            <b class="title">校园口碑榜</b>
            <div class="cycle">
                <span :class="{ on: cycle === 'day' }" @click="set_cycle('day')">日</span>
                <span :class="{ on: cycle === 'week' }" @click="set_cycle('week')">周</span>
                <span :class="{ on: cycle === 'all' }" @click="set_cycle('all')">总</span>
            </div>
        </div>

        <!-- 2. 三榜 Tab：人气榜 / 口碑榜 / 点赞榜（均为真实评价聚合口径） -->
        <div class="tabbar2 fade-up">
            <span
                v-for="(b, key) in BOARDS" :key="key"
                class="tab-item" :class="{ on: active === key }"
                @click="set_board(key)"
            >{{ b.name }}</span>
        </div>

        <!-- 3. 当前榜单 -->
        <div class="board fade-up" :key="`${active}_${cycle}`">
            <!-- 榜头：圆底自绘 SVG 图标 + 榜名 + 周期说明 -->
            <div class="bhead">
                <span class="bico" :style="{ background: cur.color }">
                    <!-- 人气榜：日历勾 -->
                    <svg v-if="cur.icon === 'calendar'" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#FFFDF5" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M8 3v4M16 3v4M3.5 9.5h17"/><path d="M9 14.5l2.2 2.2 4-4.5"/></svg>
                    <!-- 口碑榜：星形 -->
                    <svg v-else-if="cur.icon === 'star'" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#FFFDF5" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.5l2.5 5.2 5.7.7-4.2 4 1.1 5.6-5.1-2.8-5.1 2.8 1.1-5.6-4.2-4 5.7-.7z"/></svg>
                    <!-- 点赞榜：奖杯 -->
                    <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#FFFDF5" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M8 4h8v6a4 4 0 0 1-8 0z"/><path d="M8 5H4.5a3.5 3.5 0 0 0 3.6 4M16 5h3.5a3.5 3.5 0 0 1-3.6 4"/><path d="M12 14v3.5M8.5 20.5h7"/></svg>
                </span>
                <b class="bname">{{ cur.name }}</b>
                <span class="bsub">{{ cur.sub }}（{{ PERIOD_LABEL[cycle] }}）</span>
            </div>

            <!-- 空态：该周期内没有足够的已发布评价（loading 中不渲染榜单，避免首行数据未就绪） -->
            <div v-if="!loading && rows.length === 0" class="empty-tip card">
                {{ cycle === 'all' ? '暂时还没有评价数据，去写一条点评吧' : '该周期内暂无新评价，切到「总」看累计口碑' }}
            </div>

            <template v-else-if="rows.length">
                <!-- 第一名：大图卡 -->
                <div class="card first" @click="go_station(first.id)">
                    <img v-if="first.cover" :src="first.cover" :alt="first.name">
                    <div v-else class="first-fb img-fallback">{{ first.name.slice(0, 1) }}</div>
                    <div class="finfo">
                        <span class="no gold big">1</span>
                        <div class="finfo-main">
                            <b>{{ first.name }}</b>
                            <div class="finfo-sub">{{ first.info }}</div>
                        </div>
                        <b class="fscore score-num">{{ first.score }}</b>
                    </div>
                </div>

                <!-- 2~N 名：榜单行卡 -->
                <div class="card rows-card">
                    <template v-for="(r, i) in rest" :key="r.id">
                        <div v-if="i > 0" class="hairline-dashed"></div>
                        <div class="rankrow" @click="go_station(r.id)">
                            <span class="no" :class="no_cls(i + 2)">{{ i + 2 }}</span>
                            <div class="rinfo">
                                <b>{{ r.name }}</b>
                                <div class="rsub">{{ r.info }}</div>
                            </div>
                            <b class="rscore score-num">{{ r.score }}</b>
                        </div>
                    </template>
                </div>
            </template>
        </div>
    </div>
</template>

<script setup>
/**
 * 校园口碑榜（P04 暖纸奶油风）：三榜 Tab 切换 + 周/日周期切换 + 榜单跳档口详情
 * 数据：全部来自 /rankings（后端按档口聚合期间内「已发布」评价的真实口径），
 * 周期与榜单切换均触发真实重新取数，无页内 mock。
 */
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { api_content } from '../api';
import { cover_url, fmt_score } from '../utils/format';

const router = useRouter();

/** 三榜配置：dim 与后端 /rankings 口径一致 */
const BOARDS = {
    hot: { name: '人气榜', sub: '按评价条数', dim: 'hot', icon: 'calendar', color: '#C98A1E' },
    score: { name: '口碑榜', sub: '按平均分', dim: 'score', icon: 'star', color: '#D89A2A' },
    like: { name: '点赞榜', sub: '按获赞数', dim: 'like', icon: 'trophy', color: '#5C4A2E' },
};

/** 周期 → 展示文案（与后端 period 一一对应） */
const PERIOD_LABEL = { day: '近 1 天', week: '近 7 天', all: '累计' };

const active = ref('hot');
/** 周期：day 近 1 天 / week 近 7 天 / all 累计（对应后端 period），切换即重新取数 */
const cycle = ref('week');
const rows = ref([]);
const loading = ref(false);

/** 当前榜单配置 */
const cur = computed(() => BOARDS[active.value]);
/** 第一名 / 2~N 名 */
const first = computed(() => rows.value[0] || null);
const rest = computed(() => rows.value.slice(1));

/**
 * 榜单接口行 → 展示结构
 * @param {Object} r 后端 /rankings 行
 * @param {Object} board 当前榜单配置
 * @returns {{id:number, name:string, info:string, score:string, cover:string}}
 */
function map_row(r, board) {
    // 4.5 轮十六批（E）：分数列按榜口径显示对应数值——人气榜显示评价条数、点赞榜显示获赞数，
    // 口碑榜显示真正的评分（不带文字单位，语义由榜单标题与副标说明）
    const score = board.dim === 'score'
        ? fmt_score(r.ratingAvg)
        : board.dim === 'like'
            ? `${r.likeCount}`
            : `${r.reviewCount}`;
    return {
        id: r.id,
        name: r.name,
        info: `${r.canteenName} · ${r.category} · 均分 ${fmt_score(r.ratingAvg)} · ${r.reviewCount} 条评价`,
        score,
        cover: cover_url(r.coverObjectKey),
    };
}

/**
 * 拉取当前榜单（周期 + 维度）；失败置空走空态
 */
async function load_rank() {
    loading.value = true;
    try {
        const list = await api_content.rankings({ period: cycle.value, dim: cur.value.dim });
        rows.value = (list || []).map((r) => map_row(r, cur.value));
    } catch {
        rows.value = [];
    } finally {
        loading.value = false;
    }
}

/**
 * 切换周期（周 / 日）并重新取数
 * @param {string} c week | day
 */
function set_cycle(c) {
    if (cycle.value === c) return;
    cycle.value = c;
    load_rank();
}

/**
 * 切换榜单并重新取数
 * @param {string} k 榜单键
 */
function set_board(k) {
    if (active.value === k) return;
    active.value = k;
    load_rank();
}

/**
 * 名次圆号配色：1 金 2 银 3 铜渐变，其余淡纸底
 * @param {number} n - 名次
 */
function no_cls(n) {
    return n === 1 ? 'gold' : n === 2 ? 'silver' : n === 3 ? 'bronze' : '';
}

/**
 * 榜单行 / 大图卡点击 → 档口详情
 * @param {number} id - 档口 id
 */
function go_station(id) {
    router.push(`/station/${id}`);
}

/** 返回上一页 */
function go_back() {
    router.back();
}

onMounted(load_rank);
</script>

<style scoped>
/* ===== 顶部标题栏：圆浮返回钮 + 居中标题 + 周期切换 ===== */
.titlebar {
    height: 48px;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
    margin-top: 8px;
}
.back { position: absolute; left: 0; }
.title { font-size: 16px; }
.cycle {
    position: absolute;
    right: 0;
    display: flex;
    background: var(--paper);
    border: 1px solid var(--line);
    border-radius: var(--radius-sm);
    overflow: hidden;
}
.cycle span {
    font-size: 11px;
    padding: 4px 12px;
    color: var(--ink-2);
    cursor: pointer;
    font-weight: 600;
}
.cycle span.on { background: var(--ink); color: var(--paper); }

/* ===== 三榜 Tab：卡面分段，选中墨底 ===== */
.tabbar2 {
    display: flex;
    gap: 4px;
    background: var(--paper);
    border-radius: var(--radius-sm);
    box-shadow: var(--shadow-soft);
    padding: 4px;
    margin-top: 14px;
}
.tab-item {
    flex: 1;
    text-align: center;
    font-size: 13px;
    font-weight: 600;
    color: var(--ink-2);
    padding: 8px 0;
    border-radius: 6px;
    cursor: pointer;
    transition: background .12s ease, color .12s ease;
}
.tab-item:hover { color: var(--brand-dark); }
.tab-item.on { background: var(--ink); color: var(--paper); font-weight: 700; }

/* ===== 榜单区 ===== */
.board { margin-top: 16px; }
.bhead { display: flex; align-items: center; gap: 8px; padding: 2px 4px 12px; }
.bico {
    width: 26px;
    height: 26px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
}
.bname { font-size: 14.5px; }
.bsub { font-size: 10px; color: var(--ink-2); }

/* 第一名大图卡 */
.first { overflow: hidden; cursor: pointer; margin-bottom: 12px; }
.first img { width: 100%; height: 118px; object-fit: cover; }
/* 无封面：首字占位，同高 */
.first-fb { width: 100%; height: 118px; font-size: 42px; }
.finfo { padding: 12px 14px; display: flex; align-items: center; gap: 10px; }
.no.big { width: 26px; height: 26px; font-size: 13px; }
.finfo-main { flex: 1; min-width: 0; }
.finfo-main b { font-size: 14px; }
.finfo-sub { font-size: 10px; color: var(--ink-2); margin-top: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.fscore { font-size: 15px; color: var(--star); flex-shrink: 0; }

/* 2~N 名榜单行卡 */
.rows-card { padding: 6px 12px; }
.rankrow { display: flex; align-items: center; gap: 10px; padding: 12px 4px; cursor: pointer; border-radius: var(--radius-sm); transition: background .12s ease; }
.rankrow:hover { background: #FBF3DC; }
.rows-card .hairline-dashed { margin: 0; }
.no {
    width: 22px;
    height: 22px;
    border-radius: 50%;
    color: #FFF;
    font-size: 11.5px;
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
.rscore { font-size: 15px; color: var(--star); flex-shrink: 0; }

.empty-tip { text-align: center; }

/* ===== 桌面适配（≥769）===== */
@media (min-width: 769px) {
    /* 榜单窄列更庄重：整页限宽 720 居中（覆盖 .page-wrap 桌面 1080 档，padding 沿用全局） */
    .rank-page { max-width: 720px; }
    /* 第一名大图卡封面桌面加高，突出榜首 */
    .first img, .first-fb { height: 160px; }
}
</style>
