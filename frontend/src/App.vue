<template>
    <div class="app-shell" :class="{ wide: is_admin_route }">
        <!-- 顶部导航（对齐原型：卡面通栏 + 1px 淡描边 + 微圆角搜索框）；
             管理后台（/admin）隐藏前台顶栏，由 admin-layout 自管后台专用头部 -->
        <header v-if="!is_admin_route" class="topbar">
            <div class="topbar-inner">
                <router-link to="/" class="logo">
                    <brand-logo :size="30" />
                    <span class="logo-text">大福食刻</span>
                </router-link>
                <!-- 发现页（/search）：搜索框不删除、原位保留占位，仅透明且不可点击，
                     这样铃铛与头像仍在右上角原位，顶栏其余内容完全不变（r90） -->
                <div class="search-box" :class="{ ghost: !show_header_search }" @click="go_search">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#B0A18A" stroke-width="1.7" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>
                    <span class="search-placeholder">搜食堂、档口、菜品<span class="ph-tip">，如「闽菜」</span></span>
                </div>
                <nav class="nav-links">
                    <router-link to="/map">导览图</router-link>
                    <router-link to="/rank">口碑榜</router-link>
                    <router-link to="/circle">点评圈</router-link>
                    <router-link to="/ai">AI 助手</router-link>
                    <!-- 桌面端「我的」入口：与移动端底部 Tab 同目标；未登录由 go_me 引导去登录 -->
                    <a @click="go_me" class="me-link">我的</a>
                    <a @click="go_publish" class="publish-link">写点评</a>
                </nav>
                <div class="user-zone">
                    <template v-if="auth.is_login">
                        <el-badge :value="unread" :hidden="unread === 0" @click="open_notify">
                            <el-icon :size="19" class="bell"><Bell /></el-icon>
                        </el-badge>
                        <el-dropdown @command="on_user_cmd">
                            <span class="user-chip">
                                <user-avatar :user="auth.user" :size="28" />
                                <span class="nick">{{ auth.user.nickname }}</span>
                            </span>
                            <template #dropdown>
                                <el-dropdown-menu>
                                    <!-- 「我的档案」= 个人中心 /me；「我的主页」= 本人公开主页 /user/:id（与移动端底部「我的」Tab 同目标） -->
                                    <el-dropdown-item command="me">我的档案</el-dropdown-item>
                                    <el-dropdown-item command="home">我的主页</el-dropdown-item>
                                    <el-dropdown-item v-if="auth.is_admin" command="admin">管理后台</el-dropdown-item>
                                    <el-dropdown-item command="logout" divided>退出登录</el-dropdown-item>
                                </el-dropdown-menu>
                            </template>
                        </el-dropdown>
                    </template>
                    <template v-else>
                        <router-link to="/login" class="login-btn">登录 / 注册</router-link>
                    </template>
                </div>
            </div>
        </header>

        <main class="app-main">
            <router-view v-slot="{ Component }">
                <transition name="fade" mode="out-in">
                    <!-- 仅缓存 AI 助手页：跳详情/其他页再返回，对话、草稿与发送态原位保留 -->
                    <keep-alive include="AiView">
                        <component :is="Component" :key="$route.fullPath" />
                    </keep-alive>
                </transition>
            </router-view>
        </main>

        <!-- 页脚：一行淡色签名（后台不显示，后台有自管头部与侧栏布局） -->
        <footer v-if="!is_admin_route" class="footer">
            <span><b>大福食刻</b> · 「知食份子」出品 · 纯内容平台，不做交易</span>
        </footer>

        <!-- 移动端底部导航（对齐原型：通栏卡面 + 素材线稿图标 + 1px 上描边） -->
        <nav class="tabbar">
            <router-link to="/" class="tab" :class="{ on: is_tab('/') }">
                <img src="/assets/icons/tab-home.png" alt="首页"><span>首页</span>
            </router-link>
            <router-link to="/search" class="tab" :class="{ on: is_tab('/search') || is_tab('/list') }">
                <img src="/assets/icons/tab-find.png" alt="发现"><span>发现</span>
            </router-link>
            <router-link to="/circle" class="tab" :class="{ on: is_tab('/circle') || is_tab('/post') }">
                <img src="/assets/icons/tab-circle.png" alt="点评圈"><span>点评圈</span>
            </router-link>
            <router-link to="/ai" class="tab" :class="{ on: is_tab('/ai') }">
                <img src="/assets/icons/tab-ai.png" alt="AI助手"><span>AI 助手</span>
            </router-link>
            <a class="tab" :class="{ on: is_tab('/me') }" @click="go_me">
                <img src="/assets/icons/tab-me.png" alt="我的"><span>我的</span>
            </a>
        </nav>

        <!-- 通知抽屉 -->
        <el-drawer v-model="notify_open" title="通知" size="380px">
            <div v-if="notifications.length === 0" class="empty-tip">暂无通知</div>
            <div v-for="n in notifications" :key="n.id" class="notify-item">
                <div class="notify-title">
                    <span>{{ n.title }}</span>
                    <span class="notify-time">{{ time_ago(n.created_at) }}</span>
                </div>
                <div class="notify-content">{{ n.content }}</div>
            </div>
        </el-drawer>
    </div>
</template>

<script setup>
/**
 * App 壳：顶部导航 + 通知抽屉 + 全局布局
 * 视觉对齐原型定稿：卡面通栏 / 淡描边 / 琥珀强调 / 底部五 Tab 素材线稿图标
 */
import { ref, computed, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { Bell } from '@element-plus/icons-vue';
import { useAuthStore } from './stores/auth';
import { api_notification } from './api';
import UserAvatar from './components/user-avatar.vue';
import BrandLogo from './components/brand-logo.vue';
import { time_ago } from './utils/format';

const router = useRouter();
const route = useRoute();
const auth = useAuthStore();
const notify_open = ref(false);
const notifications = ref([]);
const unread = ref(0);

/** 管理后台路由：桌面端不套「手机机身」外壳，保持宽幅全屏布局 */
const is_admin_route = computed(() => route.path.startsWith('/admin'));

/**
 * 顶栏搜索框是否可见：发现页（/search）页面自带搜索条，
 * 顶栏搜索框改为透明占位（见 .search-box.ghost），不再重复出现（r90）
 */
const show_header_search = computed(() => route.path !== '/search');


/**
 * 去搜索页
 */
function go_search() {
    router.push('/search');
}

/**
 * 底部导航选中态（首页精确匹配，其余前缀匹配）
 * @param {string} p
 */
function is_tab(p) {
    return p === '/' ? route.path === '/' : route.path.startsWith(p);
}

/**
 * 底部「我的」入口（未登录去登录）
 */
function go_me() {
    if (!auth.is_login) {
        router.push({ path: '/login', query: { redirect: '/me' } });
        return;
    }
    router.push('/me');
}

/**
 * 写点评（未登录先去登录，保留回跳）
 */
function go_publish() {
    if (!auth.is_login) {
        router.push({ path: '/login', query: { redirect: '/publish' } });
        return;
    }
    router.push('/publish');
}

/**
 * 打开通知抽屉并拉取
 */
async function open_notify() {
    notify_open.value = true;
    const data = await api_notification.mine();
    notifications.value = data.list;
    unread.value = data.unread;
    if (data.unread > 0) await api_notification.read_all();
}

/**
 * 用户菜单指令
 * @param {string} cmd
 */
function on_user_cmd(cmd) {
    // 「我的档案」：跳个人中心（/me），与移动端底部「我的」Tab 目标一致
    if (cmd === 'me') router.push('/me');
    // 「我的主页」：本人公开主页（/user/:id）；无 id 时回落到「我的」
    else if (cmd === 'home') router.push(auth.user?.id ? `/user/${auth.user.id}` : '/me');
    else if (cmd === 'admin') router.push('/admin');
    else if (cmd === 'logout') {
        auth.logout();
        router.push('/');
    }
}

onMounted(async () => {
    if (auth.is_login) {
        try {
            const data = await api_notification.mine();
            unread.value = data.unread;
        } catch { /* 静默 */ }
    }
});
</script>

<style scoped>
.app-shell { min-height: 100vh; display: flex; flex-direction: column; }
/* 顶栏：卡面通栏 + 1px 淡描边（去重墨线） */
.topbar {
    background: var(--paper);
    border-bottom: 1px solid var(--line);
    position: sticky; top: 0; z-index: 100;
}
.topbar-inner {
    max-width: 1080px; margin: 0 auto; padding: 10px 16px;
    display: flex; align-items: center; gap: 16px;
}
.logo { display: flex; align-items: center; gap: 8px; text-decoration: none; }
.logo-text { font-size: 18px; font-weight: 800; color: var(--ink); letter-spacing: 1px; }
/* 搜索框：微圆角 + 极淡弥散阴影（去胶囊去墨描边） */
.search-box {
    flex: 1; max-width: 360px; min-width: 0; display: flex; align-items: center; gap: 8px;
    background: var(--paper); border-radius: var(--radius-sm); padding: 8px 14px;
    box-shadow: var(--shadow-soft);
    color: var(--ink-2); cursor: pointer; font-size: 12.5px;
    transition: background .12s ease;
}
.search-box:hover { background: #FBF3DC; }
/* 透明占位（发现页）：保留原宽度与位置，让右侧铃铛/头像仍在右上角；
   visibility:hidden 同时屏蔽点击，pointer-events:none 再兜一层（r90） */
.search-box.ghost { visibility: hidden; pointer-events: none; }
.search-placeholder { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.nav-links { display: flex; gap: 16px; margin-left: auto; font-size: 13.5px; font-weight: 600; }
.nav-links a {
    color: var(--ink); text-decoration: none; cursor: pointer;
    white-space: nowrap; /* 禁折行：过渡宽度下宁可收缩搜索框也不让导航文字竖排 */
}
.nav-links a:hover { color: var(--brand); }
.publish-link { color: var(--brand) !important; font-weight: 700; }
.user-zone { display: flex; align-items: center; gap: 14px; }
.user-zone :deep(.el-badge) { display: inline-flex; align-items: center; vertical-align: middle; }
.bell { display: block; cursor: pointer; color: var(--ink-2); }
.user-chip { display: flex; align-items: center; gap: 6px; cursor: pointer; font-size: 13.5px; color: var(--ink); }
.user-chip .nick { max-width: 90px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
/* 登录按钮：琥珀实底微圆角（去胶囊去投影） */
.login-btn {
    background: var(--brand); color: #FFFDF5; text-decoration: none;
    padding: 6px 16px; border-radius: var(--radius-sm); font-size: 13px; font-weight: 700;
}
.login-btn:hover { background: var(--brand-dark); }
/* flex 列容器：填充型页面以 flex:1 吃掉剩余高度 */
.app-main { flex: 1; display: flex; flex-direction: column; }
.app-main > * { width: 100%; }
/* 页脚：一行淡色签名（去卡片化，G3-1 通栏留白） */
.footer {
    display: flex;
    justify-content: center;
    padding: 24px 12px 30px;
    font-size: 12px;
    color: var(--ink-2);
}
.footer b { color: var(--ink); font-weight: 700; }
/* ===== 移动端底部导航（默认隐藏，≤768 显示）：通栏卡面 + 素材线稿图标 ===== */
.tabbar { display: none; }
/* 管理后台（/admin）全宽度隐藏前台 tabbar：桌面端有独立侧栏布局；
   移动端抽屉自带「返回前台」入口，且后台壳底部留白不足，前台 tabbar 会遮住表格末行 */
.app-shell.wide .tabbar { display: none; }
.empty-tip {
    color: var(--ink-2); text-align: center; padding: 36px 12px;
    background: var(--page); border: 1px dashed var(--line); border-radius: var(--radius);
}
/* 通知项：无框卡 + 极淡阴影（去微旋转贴纸感） */
.notify-item {
    background: var(--paper);
    border-radius: var(--radius);
    box-shadow: var(--shadow-soft);
    padding: 12px 14px;
    margin-bottom: 10px;
}
.notify-title { display: flex; justify-content: space-between; font-weight: 700; font-size: 14px; color: var(--ink); }
.notify-time { color: var(--ink-2); font-weight: 400; font-size: 12px; }
.notify-content { color: var(--ink-2); font-size: 13px; margin-top: 4px; }
@media (max-width: 768px) {
    .topbar-inner { padding: 8px 12px; gap: 10px; }
    .search-box { flex: 1; max-width: none; min-width: 0; padding: 7px 12px; } /* min-width:0 允许收缩，防 nowrap 占位文本撑破窄屏 */
    .ph-tip { display: none; } /* 窄屏占位文案收短 */
    .nav-links { display: none; } /* 顶部链接由底部导航接管 */
    .user-zone { gap: 10px; }
    .user-chip .nick { display: none; } /* 窄屏只留头像 */
    .logo-text { font-size: 15px; }
    .footer { padding-bottom: 96px; } /* 让位悬浮 tabbar */
    /* 通栏 tabbar：卡面 + 1px 上描边（对齐原型，去悬浮胶囊） */
    .tabbar {
        display: flex; position: fixed;
        left: 0; right: 0;
        bottom: 0;
        background: var(--paper);
        border-top: 1px solid var(--line);
        padding: 6px 0 calc(6px + env(safe-area-inset-bottom));
        z-index: 200;
    }
    .tab {
        flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px;
        font-size: 10px; color: var(--ink-2); text-decoration: none; cursor: pointer;
        font-weight: 600; padding: 2px 0;
    }
    /* 素材线稿图标：34px（验收项「Tab 图标放大」），未选中 60% 透明度 */
    .tab img { width: 34px; height: 34px; object-fit: contain; opacity: .6; }
    .tab.on { color: var(--brand); }
    .tab.on img { opacity: 1; }

    /* 发现页（/search）：顶栏所有元素保持原位，仅顶栏搜索框透明不可点（.search-box.ghost），
       铃铛与头像因此仍在右上角；此处无需额外规则（r90） */
}
/* 超窄屏（≤380）：只留 Logo 图标，把宽度让给搜索框 */
@media (max-width: 380px) {
    .logo-text { display: none; }
}
/* 桌面过渡档（≤950）：搜索框收缩后示例提示显示不全，纯装饰文案直接隐藏 */
@media (max-width: 950px) {
    .ph-tip { display: none; }
}
/* ============================================================
   桌面端（≥769）：真正的宽幅桌面布局（与移动端同源设计语言）
   - 顶部导航链接恢复显示（导航走顶栏：导览图/口碑榜/点评圈/AI/写点评）
   - 底部 tabbar 回落基础态 display:none（移动端专属导航，桌面不渲染形态）
   - 页脚保持常规留白（无悬浮条让位需求）
   - 管理后台（/admin）宽幅全屏：前台顶栏/页脚已由模板 v-if 隐藏，
     后台头部与侧栏由 admin-layout 自管
   ============================================================ */
@media (min-width: 769px) {
    .app-shell { min-height: 100vh; }
}
</style>
