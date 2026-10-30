<template>
    <div class="page-wrap tk">
        <!-- 顶部返回头 -->
        <div class="topbar">
            <span class="icircle back" aria-label="返回" @click="go_back">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7" /></svg>
            </span>
            <b class="t-title">任务中心</b>
            <i class="t-hold"></i>
        </div>

        <!-- 1. 金币卡：余额来自后端真实流水 -->
        <div class="card coinpanel fade-up">
            <div class="coin-row">
                <b class="cp-title">赚金币</b>
                <div class="coin-num">
                    <img class="avatar-fix" src="/assets/icons/ill-coin.png" alt="金币" />
                    <b class="score-num">{{ coins }}</b>
                </div>
            </div>
            <p class="cp-tip">金币用于喂食与装扮解锁 · 每日 0 点刷新 · 领取后实时入账</p>
        </div>

        <!-- 2. 任务分类 Tab -->
        <div class="ttabs fade-up">
            <span :class="{ on: tab === 'daily' }" @click="tab = 'daily'">每日任务</span>
            <span :class="{ on: tab === 'grow' }" @click="tab = 'grow'">成长任务</span>
        </div>

        <!-- 3a. 每日任务 -->
        <template v-if="tab === 'daily'">
            <div class="card task fade-up" v-for="t in tasks.daily" :key="t.id">
                <span class="tico">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" v-html="ICONS[icon_of(t.action_type)]"></svg>
                    <i class="coin">+{{ t.reward_coins }}</i>
                </span>
                <div class="tinfo">
                    <b>{{ t.name }}</b>
                    <span>{{ desc_of(t.action_type) }} · 今日 {{ t.current }}/{{ t.target }}</span>
                </div>
                <span v-if="t.claimable" class="tbtn go" @click="claim(t)">领取</span>
                <span v-else-if="t.claimed" class="tbtn done">已领取</span>
                <span v-else class="tbtn go" @click="router.push(route_of(t.action_type))">去完成</span>
            </div>
            <p class="list-tip">每日任务合计可得 {{ daily_total }} 金币 · 单项每日限领一次</p>
        </template>

        <!-- 3b. 成长任务 -->
        <template v-else>
            <div class="card task fade-up" v-for="g in tasks.growth" :key="g.id">
                <span class="tico">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" v-html="ICONS[icon_of(g.action_type)]"></svg>
                    <i class="coin">+{{ g.reward_coins }}</i>
                </span>
                <div class="tinfo">
                    <b>{{ g.name }}</b>
                    <span class="grow-bar"><i :style="{ width: pct(g) + '%' }"></i></span>
                    <span class="grow-val">{{ g.current }} / {{ g.target }}</span>
                </div>
                <span v-if="g.claimable" class="tbtn go" @click="claim(g)">领取</span>
                <span v-else-if="g.claimed" class="tbtn done">已领取</span>
                <span v-else class="tbtn go" @click="router.push(route_of(g.action_type))">去完成</span>
            </div>
            <p class="list-tip">成长任务一次性达成，不可重复领取 · 与成就口径一致，同步推进成就进度</p>
        </template>

        <p v-if="!tasks.available && loaded" class="list-tip">任务服务暂不可用，请确认数据库已执行 006 迁移</p>
    </div>
</template>

<script setup>
/**
 * 任务中心（r78 修正）：
 * 全部改为后端真实任务接口（/me/tasks、/tasks/:id/claim），金币余额取金币流水，
 * 任务进度实时统计打卡/点评/喂食/收藏/互动/分享，领取后立刻入账并刷新。
 * 不再使用 localStorage 假数据，避免「任务已完成但金币/道具不到账」。
 */
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { api_task } from '../api';

const router = useRouter();

// 自绘 SVG 图标表（打卡=日历勾、点评=星形笔、喂食=碗、收藏=书签、互动=气泡、分享=箭头）
const ICONS = {
    cal: '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M8 3v4M16 3v4M3.5 9.5h17"/><path d="M9 14.5l2.2 2.2 4-4.5"/>',
    starpen: '<path d="M12 3.5l2.5 5.2 5.7.7-4.2 4 1.1 5.6-5.1-2.8-5.1 2.8 1.1-5.6-4.2-4 5.7-.7z"/>',
    bowl: '<path d="M4 11h16a8 8 0 01-16 0z"/><path d="M9 7c0-1.5 1-2 1-3M13 7c0-1.5 1-2 1-3"/>',
    mark: '<path d="M7 3.5h10a1 1 0 011 1V21l-6-3.5L6 21V4.5a1 1 0 011-1z"/>',
    chat: '<path d="M21 12a8 8 0 01-8 8H4l1.5-3.5A8 8 0 1121 12z"/><path d="M8.5 10.5h7M8.5 13.5h4.5"/>',
    up: '<path d="M12 15V4"/><path d="M8 7.5L12 3.5l4 4"/><path d="M5 12v6a2 2 0 002 2h10a2 2 0 002-2v-6"/>',
    heart: '<path d="M12 20s-7-4.5-9-9a5 5 0 019-3 5 5 0 019 3c-2 4.5-9 9-9 9z"/>',
    pin: '<path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0113 0c0 5-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.2"/>',
    shirt: '<path d="M8.5 4L12 5.5 15.5 4l4.5 3.5-2.5 2.5-1.5-1V20h-8v-11l-1.5 1L4 7.5z"/>',
};

const ICON_BY_ACTION = { 1: 'cal', 2: 'starpen', 3: 'bowl', 4: 'mark', 5: 'chat', 6: 'up' };
const DESC_BY_ACTION = {
    1: '任意点位完成一次打卡',
    2: '发布 1 条有效点评',
    3: '宠物页完成一次投喂',
    4: '收藏任意菜品/档口',
    5: '点赞 / 评论 / 回复任意一次',
    6: '发布一条美食动态',
};
const ROUTE_BY_ACTION = { 1: '/checkin', 2: '/publish', 3: '/pet', 4: '/search', 5: '/circle', 6: '/post-publish' };

const tab = ref('daily');
const loaded = ref(false);
const tasks = ref({ available: true, daily: [], growth: [], coin_balance: 0 });

const coins = computed(() => Number(tasks.value.coin_balance) || 0);
const daily_total = computed(() => (tasks.value.daily || []).reduce((s, t) => s + (Number(t.reward_coins) || 0), 0));

/** 动作类型 → 图标 */
function icon_of(action) { return ICON_BY_ACTION[action] || 'starpen'; }
/** 动作类型 → 说明 */
function desc_of(action) { return DESC_BY_ACTION[action] || '完成任务'; }
/** 动作类型 → 去完成跳转 */
function route_of(action) { return ROUTE_BY_ACTION[action] || '/'; }
/** 成长任务百分比 */
function pct(g) { return g.target ? Math.min(100, Math.round((g.current / g.target) * 100)) : 0; }

/**
 * 加载任务列表
 */
async function load() {
    try {
        const data = await api_task.mine();
        tasks.value = data;
    } catch {
        tasks.value = { available: false, daily: [], growth: [], coin_balance: 0 };
    } finally {
        loaded.value = true;
    }
}

/**
 * 领取奖励并刷新余额
 * @param {Object} t
 */
async function claim(t) {
    try {
        const data = await api_task.claim(t.id);
        ElMessage.success(`已领取 ${t.reward_coins} 金币`);
        if (data && (data.coin_balance !== undefined || data.balance !== undefined)) {
            tasks.value.coin_balance = data.coin_balance ?? data.balance;
            await load();
        } else {
            await load();
        }
    } catch {
        await load();
    }
}

/**
 * 返回上一页
 */
function go_back() { router.back(); }

onMounted(load);
</script>

<style scoped>
/* 顶部返回头 */
.topbar { display: flex; align-items: center; justify-content: space-between; padding-top: 12px; min-height: 44px; }
.t-title { font-size: 15px; font-weight: 700; letter-spacing: 0.5px; }
.t-hold { width: 40px; flex-shrink: 0; }
.icircle.back { color: var(--ink); }

/* 金币卡 */
.coinpanel { margin-top: 10px; }
.coin-row { display: flex; align-items: center; }
.cp-title { font-size: 16px; }
.coin-num { margin-left: auto; display: flex; align-items: center; gap: 5px; }
.coin-num img { width: 24px; height: 24px; object-fit: contain; }
.coin-num b { font-size: 22px; color: #B85A2A; }
.cp-tip { font-size: 10px; color: var(--ink-2); margin: 4px 0 0; }

/* 任务分类 Tab */
.ttabs { display: flex; gap: 20px; padding: 16px 2px 0; }
.ttabs span { font-size: 13px; color: var(--ink-2); font-weight: 600; position: relative; padding-bottom: 6px; cursor: pointer; }
.ttabs span.on { color: var(--ink); font-weight: 800; }
.ttabs span.on::after { content: ''; position: absolute; left: 15%; right: 15%; bottom: 0; height: 2.5px; border-radius: 2px; background: var(--brand); }

/* 任务行 */
.task { margin-top: 10px; display: flex; align-items: center; gap: 11px; padding: 12px 13px; }
.task + .task { margin-top: 10px; }

/* 行首圆底图标：26px 淡金圆底 + 金币角标（C23） */
.tico {
    width: 26px; height: 26px; border-radius: 50%;
    background: #FBF0D8; color: var(--ink-3);
    display: flex; align-items: center; justify-content: center;
    position: relative; flex-shrink: 0;
}
.tico .coin {
    position: absolute; right: -6px; bottom: -5px; font-style: normal;
    font-size: 8px; font-weight: 800; color: #5C3A00;
    background: #E8B93C; padding: 1px 5px;
    border-radius: var(--radius-sm); border: 1.5px solid var(--paper);
}
.tinfo { flex: 1; min-width: 0; }
.tinfo b { display: block; font-size: 12.5px; }
.tinfo > span { display: block; font-size: 9.5px; color: var(--ink-2); margin-top: 3px; }

/* 成长任务进度条 */
.grow-bar { height: 5px; border-radius: 8px; background: #EDE0C2; overflow: hidden; margin-top: 6px; }
.grow-bar i { display: block; height: 100%; background: linear-gradient(90deg, #E8B93C, var(--star)); border-radius: 8px; transition: width .3s ease; }
.grow-val { font-variant-numeric: tabular-nums; }

/* 操作小按钮：领取（琥珀实底）/ 已领取（灰态） */
.tbtn { flex-shrink: 0; font-size: 11px; font-weight: 800; padding: 7px 15px; border-radius: var(--radius-sm); cursor: pointer; }
.tbtn.go { background: var(--brand); color: var(--paper); }
.tbtn.go:active { transform: translateY(1px); }
.tbtn.done { background: #EDE0C2; color: var(--ink-3); cursor: default; }

/* 列表底部提示 */
.list-tip { text-align: center; font-size: 9.5px; color: var(--ink-2); margin: 10px 0 0; }

/* ===== 桌面适配（≥769）===== */
@media (min-width: 769px) {
    /* 整页限宽 760 居中：任务行保持单列列表形态，不做双列 */
    .page-wrap.tk { max-width: 760px; }
    /* 金币卡与任务行桌面字号放大一档 */
    .coin-num b { font-size: 26px; }
    .tinfo b { font-size: 13.5px; }
    .tinfo > span { font-size: 10.5px; }
    .tbtn { font-size: 12px; padding: 8px 18px; }
}
</style>
