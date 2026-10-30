<template>
    <div class="page-wrap follows-page">
        <!-- 标题行：返回 + 居中标题 -->
        <div class="titlebar">
            <button class="icircle back" aria-label="返回" @click="go_back">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7" /></svg>
            </button>
            <b class="title">关注与粉丝</b>
        </div>

        <!-- 分类 Tab：可点击切换（修改说明 C19） -->
        <div class="utabs">
            <span :class="{ on: active_tab === 'follow' }" @click="switch_tab('follow')">关注 {{ follow_list.length }}</span>
            <span :class="{ on: active_tab === 'fans' }" @click="switch_tab('fans')">粉丝 {{ fans_list.length }}</span>
        </div>

        <!-- 用户列表：关注分栏 -->
        <div v-if="active_tab === 'follow'" class="user-list card fade-up">
            <div v-for="(u, i) in follow_list" :key="u.id" class="urow" :style="{ animationDelay: `${i * 0.04}s` }">
                <img class="avatar-fix uav" :src="u.avatar" alt="头像" />
                <div class="uinfo">
                    <div class="uname">
                        <!-- 昵称独立包裹：不换行 + 溢出省略，避免被认证签挤压成竖排一字一行 -->
                        <span class="uname-txt">{{ u.name }}</span>
                        <span v-if="u.verified" class="vbadge">校内已认证</span>
                    </div>
                    <div class="uintro">{{ u.intro }}</div>
                </div>
                <!-- 已关注 → 点击取关变「关注」，再点可重新关注 -->
                <button class="ubtn" :class="u.followed ? 'following' : 'back'" @click="toggle_follow(u)">
                    {{ u.followed ? '已关注' : '关注' }}
                </button>
            </div>
        </div>

        <!-- 用户列表：粉丝分栏 -->
        <div v-else class="user-list card fade-up">
            <div v-for="(u, i) in fans_list" :key="u.id" class="urow" :style="{ animationDelay: `${i * 0.04}s` }">
                <img class="avatar-fix uav" :src="u.avatar" alt="头像" />
                <div class="uinfo">
                    <div class="uname">
                        <span class="uname-txt">{{ u.name }}</span>
                        <span v-if="u.verified" class="vbadge">校内已认证</span>
                    </div>
                    <div class="uintro">{{ u.intro }}</div>
                </div>
                <!-- 回关 → 已互关 -->
                <button class="ubtn" :class="u.mutual ? 'mutual' : 'back'" @click="toggle_mutual(u)">
                    {{ u.mutual ? '已互关' : '回关' }}
                </button>
            </div>
        </div>

        <div class="foot-hint">点击「已关注」取消关注 · 取关后其内容将移出你的关注流</div>
    </div>
</template>

<script setup>
/**
 * 关注与粉丝（/follows）：对齐 P34 原型 + 修改说明 C19
 * - 两个分栏 Tab「关注 / 粉丝」可点击切换
 * - route.query.tab === 'fans' 时初始定位粉丝分栏（我的页粉丝数字跳入）
 * - 用户行：头像 / 昵称 / 一句话简介 / 右侧关系小按钮（可切换）
 * TODO: 待后端关注关系接口，数据为页内 mock
 */
import { ref, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';

const route = useRoute();
const router = useRouter();

// 分栏计数直接取列表长度，避免与真实列表条数不符
const active_tab = ref('follow');

/** 关注分栏 mock（followed=true 为已关注） */
const follow_list = ref([
    { id: 'u1', name: '面面俱到', avatar: '/assets/avatar-user.png', verified: true, followed: true, intro: '兰州拉面十级品鉴员 · 京元常驻' },
    { id: 'u2', name: '碳水快乐星', avatar: '/assets/avatar-user.png', verified: false, followed: true, intro: '碳水即正义 · 丁香园三点半常客' },
    { id: 'u3', name: '干饭不语', avatar: '/assets/avatar-user.png', verified: true, followed: true, intro: '吃过 42 家档口的走读生' },
    { id: 'u4', name: '辣度试验员', avatar: '/assets/avatar-user.png', verified: false, followed: true, intro: '挑战全食堂魔鬼辣记录保持者' },
    { id: 'u5', name: '珍珍今天吃什么', avatar: '/assets/avatar-user.png', verified: false, followed: true, intro: '丁香园二楼常驻 · 点评 86 篇' },
]);

/** 粉丝分栏 mock（mutual=true 为已互关） */
const fans_list = ref([
    { id: 'u6', name: '珍珍今天吃什么', avatar: '/assets/avatar-user.png', verified: false, mutual: false, intro: '丁香园二楼常驻 · 点评 86 篇' },
    { id: 'u7', name: '阿伟不挑食', avatar: '/assets/avatar-user.png', verified: false, mutual: false, intro: '吃遍京元进行中 · 已打卡 31 家' },
    { id: 'u8', name: '小确幸食堂版', avatar: '/assets/avatar-user.png', verified: true, mutual: true, intro: '12 位共同关注 · 紫荆园常驻' },
    { id: 'u9', name: '深夜干饭人', avatar: '/assets/avatar-user.png', verified: false, mutual: false, intro: '晚上十点的学生街最懂我' },
]);

/**
 * 切换分栏
 * @param {string} k - follow / fans
 */
function switch_tab(k) {
    active_tab.value = k;
}

/**
 * 返回上一页
 */
function go_back() {
    router.back();
}

/**
 * 关注/取关切换
 * @param {Object} u
 */
function toggle_follow(u) {
    u.followed = !u.followed;
}

/**
 * 回关/已互关切换
 * @param {Object} u
 */
function toggle_mutual(u) {
    u.mutual = !u.mutual;
}

onMounted(() => {
    // C19：支持 ?tab=fans 直达粉丝分栏
    if (route.query.tab === 'fans') active_tab.value = 'fans';
});
</script>

<style scoped>
/* 标题行：返回浮钮 + 居中标题 + 1px 下描边 */
.titlebar {
    height: 48px;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
    border-bottom: 1px solid var(--line);
}
.back { position: absolute; left: 0; }
.title { font-size: 16px; font-weight: 700; }

/* 分类 Tab：两栏均分居中，琥珀下划指示 */
.utabs { display: flex; }
.utabs span {
    flex: 1;
    text-align: center;
    font-size: 13px;
    color: var(--ink-2);
    font-weight: 600;
    padding: 12px 0;
    position: relative;
    border-bottom: 1px solid var(--line);
    cursor: pointer;
}
.utabs span.on { color: var(--ink); font-weight: 800; }
.utabs span.on::after {
    content: '';
    position: absolute;
    left: 38%; right: 38%; bottom: 0;
    height: 2.5px;
    border-radius: 2px;
    background: var(--brand);
}

/* 用户列表：行间虚线分隔，行高留白充足 */
.user-list { margin-top: 20px; padding: 4px 0; }
.urow {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 14px 16px;
}
.urow + .urow { border-top: 1px dashed var(--line); }
.uav { width: 44px; height: 44px; border-radius: 50%; }
.uinfo { flex: 1; min-width: 0; }
/* 昵称行：允许认证签换行到下一行，但昵称本身永不折行（防竖排一字一行） */
.uname { font-size: 13px; font-weight: 700; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.uname-txt { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
.uintro { font-size: 10.5px; color: var(--ink-2); margin-top: 3px; font-weight: 400; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

/* 校内已认证小签 */
.vbadge {
    font-size: 9px;
    color: var(--brand);
    border: 1px solid var(--brand);
    padding: 1px 5px;
    border-radius: 5px;
    font-weight: 700;
    flex-shrink: 0;
}

/* 关系小按钮：微圆角三态 */
.ubtn {
    flex-shrink: 0;
    font-size: 11px;
    font-weight: 700;
    padding: 6px 14px;
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: background .12s ease, color .12s ease;
}
.ubtn.following { border: 1px solid var(--line); color: var(--ink-2); background: var(--paper); }
.ubtn.back { border: 1px solid var(--brand); color: var(--brand); background: var(--paper); }
.ubtn.back:hover { background: var(--brand-light); }
.ubtn.mutual { border: none; background: #EDE0C2; color: var(--ink-3); }

.foot-hint { text-align: center; font-size: 10.5px; color: var(--ink-2); margin-top: 20px; }

/* ===== 桌面适配（≥769）===== */
@media (min-width: 769px) {
    /* 用户卡桌面改 3 列网格：整卡仍是一个卡面，内部用户行分列排布
       列数上限锁 3：内容列宽 1032px，4 列后单列仅 250px，
       昵称会被「校内已认证」签挤成竖排一字一行 */
    .user-list {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 4px 16px;
        padding: 14px 16px;
        margin-top: 26px;
    }
    /* 行间虚线基于 DOM 相邻选择器，分列后视觉错乱，网格内取消改用留白 */
    .urow + .urow { border-top: none; }
    /* 单个用户行加淡金悬浮反馈与圆角，强化可点区 */
    .urow { border-radius: var(--radius-sm); transition: background .12s ease; }
    .urow:hover { background: #FBF3DC; }
    /* 桌面端字号放大一档，昵称与简介更易读 */
    .uname { font-size: 14px; }
    .uintro { font-size: 11px; }
    /* 底部提示与卡片拉开呼吸感 */
    .foot-hint { margin-top: 24px; font-size: 11px; }
}

/* ===== 桌面适配二档（≥1200）===== */
@media (min-width: 1200px) {
    /* 超宽屏：内容列宽受 .page-wrap 上限约束（仍 1032px），
       保持 3 列仅加大列间距；不再改 4 列，避免昵称被压窄 */
    .user-list { gap: 6px 24px; }
}
</style>
