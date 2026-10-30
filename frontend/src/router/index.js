/**
 * 路由表（对齐原型 34 页口径）+ 登录守卫 + 管理员守卫
 * 找吃：/ /search /list /rank /compare /map /canteen/:id /station/:id /dish/:id
 * 点评：/publish /circle /post/:id /post-publish
 * 记饮食：/checkin /footprint /journal/:id
 * AI：/ai /ai/mbti /ai/wheel /ai/plan /ai/profile
 * 我的：/me /collection /my-reviews /notifications /achievements /settings /tasks /drafts /follows /user/:id
 * 共建：/cobuild /vendor/apply /report
 * 宠物：/pet /pet-community
 */
import { createRouter, createWebHistory } from 'vue-router';

const routes = [
    // ---- 找吃的 ----
    { path: '/', name: 'home', component: () => import('../views/home-view.vue') },
    { path: '/search', name: 'search', component: () => import('../views/search-view.vue') },
    { path: '/list', name: 'list', component: () => import('../views/list-view.vue') },
    { path: '/rank', name: 'rank', component: () => import('../views/rank-view.vue') },
    { path: '/compare', name: 'compare', component: () => import('../views/compare-view.vue') },
    { path: '/map', name: 'map', component: () => import('../views/map-view.vue') },
    { path: '/canteen/:id', name: 'canteen', component: () => import('../views/canteen-detail-view.vue') },
    { path: '/station/:id', name: 'station', component: () => import('../views/station-detail-view.vue') },
    { path: '/dish/:id', name: 'dish', component: () => import('../views/dish-detail-view.vue') },
    // ---- 点评 ----
    { path: '/publish', name: 'publish', component: () => import('../views/publish-view.vue'), meta: { auth: true } },
    { path: '/circle', name: 'circle', component: () => import('../views/circle-view.vue') },
    { path: '/post/:id', name: 'post-detail', component: () => import('../views/post-detail-view.vue') },
    { path: '/post-publish', name: 'post-publish', component: () => import('../views/post-publish-view.vue'), meta: { auth: true } },
    // ---- 记饮食 ----
    { path: '/checkin', name: 'checkin', component: () => import('../views/checkin-view.vue'), meta: { auth: true } },
    { path: '/footprint', name: 'footprint', component: () => import('../views/footprint-view.vue'), meta: { auth: true } },
    // 手账编辑器（r52）：/journal/edit 新建；/journal/:id 先匹配 edit 再匹配数字 id
    { path: '/journal/edit', name: 'journal-editor', component: () => import('../views/journal-editor-view.vue'), meta: { auth: true } },
    { path: '/journal/edit/:id', name: 'journal-editor-edit', component: () => import('../views/journal-editor-view.vue'), meta: { auth: true } },
    { path: '/journal/:id', name: 'journal-detail', component: () => import('../views/journal-detail-view.vue') },
    // ---- AI 助手 ----
    { path: '/ai', name: 'ai', component: () => import('../views/ai-view.vue') },
    { path: '/ai/mbti', name: 'mbti', component: () => import('../views/mbti-view.vue') },
    { path: '/ai/wheel', name: 'wheel', component: () => import('../views/wheel-view.vue') },
    { path: '/ai/plan', name: 'diet-plan', component: () => import('../views/diet-plan-view.vue') },
    { path: '/ai/profile', name: 'diet-profile', component: () => import('../views/diet-profile-view.vue'), meta: { auth: true } },
    // ---- 我的 ----
    { path: '/me', name: 'me', component: () => import('../views/me-view.vue'), meta: { auth: true } },
    { path: '/collection', name: 'collection', component: () => import('../views/collection-view.vue'), meta: { auth: true } },
    { path: '/my-reviews', name: 'my-reviews', component: () => import('../views/my-reviews-view.vue'), meta: { auth: true } },
    { path: '/notifications', name: 'notifications', component: () => import('../views/notifications-view.vue'), meta: { auth: true } },
    { path: '/achievements', name: 'achievements', component: () => import('../views/achievements-view.vue'), meta: { auth: true } },
    { path: '/settings', name: 'settings', component: () => import('../views/settings-view.vue'), meta: { auth: true } },
    { path: '/tasks', name: 'tasks', component: () => import('../views/tasks-view.vue'), meta: { auth: true } },
    { path: '/drafts', name: 'drafts', component: () => import('../views/drafts-view.vue'), meta: { auth: true } },
    { path: '/follows', name: 'follows', component: () => import('../views/follows-view.vue'), meta: { auth: true } },
    { path: '/user/:id', name: 'user-profile', component: () => import('../views/user-profile-view.vue') },
    // ---- 内容共建 ----
    { path: '/cobuild', name: 'cobuild', component: () => import('../views/cobuild-view.vue'), meta: { auth: true } },
    { path: '/vendor/apply', name: 'vendor-apply', component: () => import('../views/vendor-apply-view.vue'), meta: { auth: true } },
    { path: '/report', name: 'report', component: () => import('../views/report-view.vue'), meta: { auth: true } },
    // ---- 宠物 ----
    { path: '/pet', name: 'pet', component: () => import('../views/pet-view.vue'), meta: { auth: true } },
    { path: '/pet-community', name: 'pet-community', component: () => import('../views/pet-community-view.vue') },
    // ---- 登录 / 注册（守卫重定向与顶栏「登录 / 注册」入口统一落此页） ----
    { path: '/login', name: 'login', component: () => import('../views/login-view.vue') },
    // ---- 福大 CAS 回调页（r51，真实模式）：校方 302 回 service 时落在此处 ----
    { path: '/auth/fzu/callback', name: 'fzu-callback', component: () => import('../views/fzu-callback.vue') },
    // 福大统一身份认证 · 授权页（r51c，demo 模式）：与真实 CAS 跳转流程形态一致
    { path: '/auth/fzu/authorize', name: 'fzu-authorize', component: () => import('../views/fzu-authorize.vue') },
    {
        path: '/admin',
        component: () => import('../views/admin/admin-layout.vue'),
        meta: { auth: true, admin: true },
        children: [
            { path: '', redirect: '/admin/dashboard' },
            { path: 'dashboard', name: 'admin-dashboard', component: () => import('../views/admin/dashboard-view.vue') },
            { path: 'audit', name: 'admin-audit', component: () => import('../views/admin/audit-view.vue') },
            { path: 'content', name: 'admin-content', component: () => import('../views/admin/content-view.vue') },
            { path: 'governance', name: 'admin-governance', component: () => import('../views/admin/governance-view.vue') },
            { path: 'ai-providers', name: 'admin-ai-providers', component: () => import('../views/admin/ai-providers-view.vue') },
            // 统一身份账号（r80）：SSO 口令托管的重置 / 指定新口令
            { path: 'fzu-accounts', name: 'admin-fzu-accounts', component: () => import('../views/admin/fzu-accounts-view.vue') },
        ],
    },
];

const router = createRouter({ history: createWebHistory(), routes });

// 守卫：登录 / 管理员
router.beforeEach((to) => {
    const token = localStorage.getItem('fk_token');
    const user = JSON.parse(localStorage.getItem('fk_user') || 'null');
    if (to.meta.auth && !token) {
        return { path: '/login', query: { redirect: to.fullPath } };
    }
    if (to.meta.admin && (!user || user.role !== 1)) {
        return { path: '/' };
    }
    return true;
});

export default router;
