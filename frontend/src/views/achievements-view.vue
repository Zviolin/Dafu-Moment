<template>
    <div class="page-wrap achv">
        <!-- 顶部返回头 -->
        <div class="topbar">
            <span class="icircle back" aria-label="返回" @click="go_back">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7" /></svg>
            </span>
            <b class="t-title">成就与头衔</b>
            <i class="t-hold"></i>
        </div>

        <!-- 1. 头衔横幅：当前头衔徽章 + 已获得枚数 + 下一级进度差值 -->
        <div class="banner card fade-up">
            <img class="banner-ill" src="/assets/spare/R24.png" alt="" aria-hidden="true" />
            <img class="avatar-fix badge-img" :src="cur_badge.img" alt="当前头衔徽章" />
            <div class="bn-info">
                <b>当前头衔：{{ cur_badge.name }}</b>
                <span>已获得 {{ lit_count }} / {{ badge_list.length }} 枚</span>
                <!-- 下一枚徽章进度条与差值 -->
                <div v-if="next_prog" class="bn-bar">
                    <span class="bar"><i :style="{ width: next_prog.pct + '%' }"></i></span>
                    <i class="pv">{{ next_prog.tip }}</i>
                </div>
                <span v-else class="bn-full">三枚徽章已全部点亮</span>
            </div>
        </div>

        <!-- 2. 成就进度卡（四项口径，与任务中心成长任务同步） -->
        <div class="card prog fade-up">
            <div v-for="p in prows" :key="p.label" class="prow">
                <span class="pn">{{ p.label }}</span>
                <span class="bar"><i :style="{ width: p.pct + '%' }"></i></span>
                <span class="pv">{{ p.cur }} / {{ p.target }} {{ p.unit }}</span>
            </div>
        </div>

        <!-- 3. 头衔含义说明（需求 5.1.7：明示头衔不代表内容真实性） -->
        <p class="disclaim fade-up">头衔表示贡献与活跃情况，不代表内容真实性</p>

        <!-- 4. 分段 Tab：打卡 / 点评 / 获赞 -->
        <div class="seg3 fade-up">
            <span
                v-for="t in TABS" :key="t.key"
                :class="{ on: tab === t.key }"
                @click="tab = t.key"
            >{{ t.name }}</span>
        </div>

        <!-- 5. 里程碑成就列表：进度条 + 达成态 -->
        <div class="card mile fade-up">
            <div v-for="m in mile_list" :key="m.name" class="mrow">
                <div class="m-head">
                    <b>{{ m.name }}</b>
                    <span v-if="m.done" class="tag">已达成</span>
                    <span v-else class="mv score-num">{{ m.cur }} / {{ m.target }}</span>
                </div>
                <div class="bar"><i :style="{ width: m.pct + '%' }"></i></div>
            </div>
        </div>

        <!-- 6. 徽章墙：三枚徽章，未点亮灰态，附点亮条件与进度 -->
        <div class="sec"><b>徽章墙</b><span>点亮条件与进度</span></div>
        <div class="medgrid">
            <div v-for="b in badge_list" :key="b.name" class="med" :class="{ locked: !b.lit }">
                <img class="avatar-fix" :src="b.img" :alt="b.name + '徽章'" />
                <div class="nm">{{ b.name }}</div>
                <div class="cd" v-html="b.cd"></div>
            </div>
        </div>
        <p class="grid-tip">集齐徽章可在点评圈展示专属挂件 · 更多徽章陆续开放</p>
    </div>
</template>

<script setup>
/**
 * 成就与头衔页（对齐 P26）：
 * 头衔横幅（当前头衔 + 已获得枚数）→ 四项成就进度卡 → 头衔含义说明
 * （需求 5.1.7：头衔表示贡献与活跃情况，不代表内容真实性）→
 * 打卡/点评/获赞里程碑列表（分段 Tab）→ 徽章墙（未点亮灰态 + 点亮条件）。
 * 进度全部来自真实接口：/me/stats（打卡/点位/点评/获赞）+ /checkin/stats（连续天数），
 * 无记录时各口径为 0，避免「打卡 1 次就点亮探店达人」。
 */
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { api_me, api_checkin } from '../api';

const router = useRouter();

/* ---------------- 成就口径 ---------------- */

// 成就进度默认全 0，加载后由真实统计覆盖
const DEFAULT_ACHV = { checkins: 0, spots: 0, reviews: 0, likes: 0, streak: 0 };

// 四项进度卡口径
const PROW_DEFS = [
    { key: 'checkins', label: '打卡次数', target: 100, unit: '次' },
    { key: 'spots', label: '不同点位数', target: 30, unit: '个' },
    { key: 'reviews', label: '评价数量', target: 50, unit: '条' },
    { key: 'likes', label: '获赞数', target: 500, unit: '个' },
];

// 里程碑定义：分段 Tab → 各档门槛
const MILE_DEFS = {
    checkins: [
        { name: '首次打卡', target: 1 },
        { name: '累计打卡 10 次', target: 10 },
        { name: '累计打卡 50 次', target: 50 },
        { name: '累计打卡 100 次', target: 100 },
    ],
    reviews: [
        { name: '发布首条点评', target: 1 },
        { name: '累计点评 10 条', target: 10 },
        { name: '累计点评 50 条', target: 50 },
    ],
    likes: [
        { name: '收获首个赞', target: 1 },
        { name: '累计获赞 50 次', target: 50 },
        { name: '累计获赞 200 次', target: 200 },
        { name: '累计获赞 500 次', target: 500 },
    ],
};

const TABS = [
    { key: 'checkins', name: '打卡' },
    { key: 'reviews', name: '点评' },
    { key: 'likes', name: '获赞' },
];



/* ---------------- 状态 ---------------- */

const achv = ref({ ...DEFAULT_ACHV }); // 四项进度（合并外部写入）
const tab = ref('checkins');

// 进度卡行：百分比截断到 100
const prows = computed(() =>
    PROW_DEFS.map((d) => {
        const cur = Math.min(d.target, Number(achv.value[d.key]) || 0);
        return { ...d, cur, pct: Math.round((cur / d.target) * 100) };
    })
);

// 当前分段下的里程碑列表
const mile_list = computed(() =>
    MILE_DEFS[tab.value].map((m) => {
        const cur = Math.min(m.target, Number(achv.value[tab.value]) || 0);
        return { ...m, cur, done: cur >= m.target, pct: Math.round((cur / m.target) * 100) };
    })
);

/**
 * 徽章定义：点亮条件 + 当前/目标进度 + 条件文案（含还差进度）
 */
const badge_list = computed(() => {
    const a = achv.value;
    const defs = [
        {
            name: '探店达人', img: '/assets/badges/tan.png',
            cond: '打卡 10 个不同点位', cur: a.spots, target: 10, unit: '个',
        },
        {
            name: '健康达人', img: '/assets/badges/jiankang.png',
            cond: '连续打卡 14 天', cur: a.streak, target: 14, unit: '天',
        },
        {
            name: '推荐达人', img: '/assets/badges/tuijian.png',
            cond: '点评获赞 500 次', cur: a.likes, target: 500, unit: '次',
        },
    ];
    return defs.map((d) => {
        const left = Math.max(0, d.target - d.cur);
        return {
            ...d,
            lit: d.cur >= d.target,
            // 未点亮时显示「还差 N」，点亮后显示「已达成」
            cd: `${d.cond}<br>${d.cur >= d.target ? '已达成' : `还差 ${left} ${d.unit}`}`,
        };
    });
});

// 已点亮徽章数与当前头衔（取第一枚已点亮徽章，无则「美食新客」）
const lit_count = computed(() => badge_list.value.filter((b) => b.lit).length);
const cur_badge = computed(() => {
    const lit = badge_list.value.find((b) => b.lit);
    return lit
        ? { name: lit.name, img: lit.img }
        : { name: '美食新客', img: '/assets/badges/tan.png' };
});

// 下一枚未点亮徽章：进度百分比 + 差值文案（头衔卡进度条）
const next_prog = computed(() => {
    const b = badge_list.value.find((x) => !x.lit);
    if (!b) return null;
    return {
        pct: Math.min(100, Math.round((b.cur / b.target) * 100)),
        tip: `距离「${b.name}」还差 ${b.target - b.cur} ${b.unit}`,
    };
});

/* ---------------- 生命周期 ---------------- */

onMounted(() => {
    load_real_stats();
});

/**
 * 加载真实成就统计：个人统计（打卡/点位/点评/获赞）+ 连续打卡天数
 */
async function load_real_stats() {
    try {
        const [me, ck] = await Promise.all([api_me.stats(), api_checkin.stats()]);
        const s = (me && me.stats) || {};
        achv.value = {
            checkins: Number(s.check_in_count) || 0,
            spots: Number(s.spot_count) || 0,
            reviews: Number(s.review_count) || 0,
            likes: Number(s.like_count) || 0,
            streak: Number(ck && ck.continuousDays) || 0,
        };
        // 清掉历史版本写入的伪进度，避免下次被误用
        localStorage.removeItem('dafu_achv_progress');
    } catch {
        // 未登录或接口不可用：保持全 0，不再展示虚构成就
        achv.value = { ...DEFAULT_ACHV };
    }
}

/* ---------------- 交互 ---------------- */

/**
 * 返回上一页
 */
function go_back() {
    router.back();
}
</script>

<style scoped>
/* 顶部返回头 */
.topbar { display: flex; align-items: center; justify-content: space-between; padding-top: 12px; min-height: 44px; }
.t-title { font-size: 15px; font-weight: 700; letter-spacing: 0.5px; }
.t-hold { width: 40px; flex-shrink: 0; }
.icircle.back { color: var(--ink); }

/* 头衔横幅 */
.banner { position: relative; margin-top: 10px; display: flex; align-items: center; gap: 12px; background: linear-gradient(120deg, #FFF6E0, var(--paper)); overflow: hidden; }
/* 横幅右上装饰插画（备用精修 R24） */
.banner-ill { position: absolute; right: -8px; bottom: -12px; width: 92px; opacity: .92; pointer-events: none; }
.badge-img { width: 56px; height: 56px; border: 1.5px solid #E8D5C0; border-radius: var(--radius); }
.bn-info { flex: 1; min-width: 0; }
.bn-info b { display: block; font-size: 14px; }
.bn-info > span { display: block; font-size: 10.5px; color: var(--ink-2); margin-top: 3px; }

/* 下一枚徽章进度条 + 差值 */
.bn-bar { display: flex; align-items: center; gap: 8px; margin-top: 7px; }
.bn-bar .bar { flex: 1; height: 6px; border-radius: 8px; background: #EDE0C2; overflow: hidden; }
.bn-bar .bar i { display: block; height: 100%; background: linear-gradient(90deg, #E8B93C, var(--star)); border-radius: 8px; transition: width .3s ease; }
.bn-bar .pv { font-style: normal; font-size: 9.5px; color: var(--ink-2); white-space: nowrap; flex-shrink: 0; }
.bn-info .bn-full { font-size: 9.5px; color: var(--brand-dark); margin-top: 6px; display: block; }

/* 成就进度卡（四项，虚线分隔） */
.prog { margin-top: 12px; padding: 2px 0; }
.prow { display: flex; align-items: center; gap: 10px; padding: 12px 14px; }
.prow + .prow { border-top: 1px dashed var(--line); }
.prow .pn { width: 66px; font-size: 11px; color: #5C4A2E; font-weight: 600; flex-shrink: 0; }
.prow .bar { flex: 1; height: 6px; border-radius: 8px; background: #EDE0C2; overflow: hidden; }
.prow .bar i { display: block; height: 100%; background: linear-gradient(90deg, #E8B93C, var(--star)); border-radius: 8px; transition: width .3s ease; }
.prow .pv { width: 70px; text-align: right; font-size: 10px; color: var(--ink-2); flex-shrink: 0; }

/* 头衔含义说明（需求 5.1.7） */
.disclaim { text-align: center; font-size: 9.5px; color: var(--ink-2); margin: 10px 0 0; }

/* 分段 Tab（打卡/点评/获赞） */
.seg3 { display: flex; gap: 22px; padding: 16px 2px 0; }
.seg3 span { font-size: 13px; color: var(--ink-2); font-weight: 600; position: relative; padding-bottom: 6px; cursor: pointer; }
.seg3 span.on { color: var(--ink); font-weight: 800; }
.seg3 span.on::after { content: ''; position: absolute; left: 15%; right: 15%; bottom: 0; height: 2.5px; border-radius: 2px; background: var(--brand); }

/* 里程碑列表 */
.mile { margin-top: 2px; padding: 4px 14px; }
.mrow { padding: 12px 0; }
.mrow + .mrow { border-top: 1px solid var(--line); }
.m-head { display: flex; align-items: center; gap: 8px; }
.m-head b { font-size: 12px; flex: 1; }
.m-head .mv { font-size: 10.5px; color: var(--ink-2); }
.mrow .bar { height: 6px; border-radius: 8px; background: #EDE0C2; overflow: hidden; margin-top: 8px; }
.mrow .bar i { display: block; height: 100%; background: linear-gradient(90deg, #EBCF9C, var(--star)); border-radius: 8px; transition: width .3s ease; }

/* 徽章墙（三宫格，未点亮灰态） */
.medgrid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px 14px; padding: 2px 6px; }
.med { text-align: center; }
.med img { width: 80px; height: 80px; object-fit: cover; margin: 0 auto; border: 1.5px solid #E8D5C0; border-radius: var(--radius); }
.med.locked img { opacity: .4; filter: grayscale(1); }
.med .nm { font-size: 11px; font-weight: 800; margin-top: 5px; }
.med .cd { font-size: 9px; color: var(--ink-2); margin-top: 2px; line-height: 1.5; }
.grid-tip { text-align: center; font-size: 9.5px; color: var(--ink-2); margin: 12px 0 0; }

/* ===== 桌面适配（≥769）：横幅/进度/里程碑放大，徽章墙桌面 4 列舒展 ===== */
@media (min-width: 769px) {
    /* 徽章墙：桌面 4 列（当前 3 枚徽章，预留后续扩展位），徽章图同步放大 */
    .medgrid { grid-template-columns: repeat(4, 1fr); gap: 28px 20px; }
    .med img { width: 104px; height: 104px; }
    .med .nm { font-size: 12.5px; }
    .med .cd { font-size: 10px; }
    /* 横幅与进度行桌面字号放大一档 */
    .bn-info b { font-size: 15px; }
    .prow .pn { font-size: 12px; }
    .prow .pv { font-size: 11px; }
    .m-head b { font-size: 13px; }
}

/* ===== 桌面适配（≥1200）：宽屏徽章墙 6 列 ===== */
@media (min-width: 1200px) {
    .medgrid { grid-template-columns: repeat(6, 1fr); }
}
</style>
