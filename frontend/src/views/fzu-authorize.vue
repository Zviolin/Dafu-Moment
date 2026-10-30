<template>
    <div class="page">
        <div class="authz-card card fade-up">
            <!-- 授权头部：圆形图标位（自绘 SVG 盾牌）+ 统一身份认证标题 -->
            <div class="authz-head">
                <span class="authz-ico">
                    <!-- 自绘 SVG：认证盾牌（G4 禁止汉字图标） -->
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <path d="M12 3l7 3v5c0 4.4-2.9 7.7-7 10-4.1-2.3-7-5.6-7-10V6l7-3z" />
                        <path d="M9 12l2 2 4-4" />
                    </svg>
                </span>
                <div class="authz-title">
                    <h1>福州大学统一身份认证</h1>
                    <p>FZU Unified Identity Authentication · CAS</p>
                </div>
            </div>

            <div class="authz-app">
                <span class="app-name">大福食刻</span> 申请获取你的身份信息
            </div>

            <!-- 说明条：淡纸底 + 虚线描边（全站淡语言） -->
            <div class="authz-tip">
                <template v-if="intent === 'bind'">
                    授权后将把学号绑定到当前账号，获得「福大认证」身份头衔，并可随时使用学号免密登录。演示环境使用模拟校验桩。
                </template>
                <template v-else>
                    授权登录后自动获得「福大认证」身份头衔；首次授权将自动创建账号。演示环境使用模拟校验桩。
                </template>
            </div>

            <!-- 统一初始口令提示（r80，仅演示桩下发）：把「首次用统一口令」讲清楚，避免误以为口令可任意填 -->
            <div v-if="demo_hint" class="authz-init">
                <b>统一初始口令：{{ demo_hint.password }}</b>
                <span>{{ demo_hint.hint }}</span>
            </div>

            <el-form ref="authz_ref" :model="form" :rules="rules" label-position="top" @submit.prevent="do_authorize">
                <el-form-item prop="studentId">
                    <!-- 学号输入：placeholder 仅「学号」；已有认证学号/数字登录名自动预填（r51c）；福大学号固定 9 位 -->
                    <el-input v-model="form.studentId" placeholder="学号" size="large" maxlength="9" />
                </el-form-item>
                <el-form-item prop="password">
                    <el-input v-model="form.password" type="password" placeholder="统一身份认证口令" size="large" show-password />
                </el-form-item>
                <el-button type="primary" size="large" class="authz-btn" native-type="submit" :loading="saving">
                    同意并授权
                </el-button>
            </el-form>

            <div class="authz-foot">
                <router-link to="/login">遇到问题？返回登录页</router-link>
                <span class="dot">·</span>
                <span>授权即代表同意《用户协议》</span>
            </div>
        </div>
    </div>
</template>

<script setup>
/**
 * 福大统一身份认证 · 授权页（r51c）：demo 模式的「跳转授权页」形态，
 * 与真实 CAS 跳转流程视觉/交互一致（独立页面 → 授权 → 回跳），替代旧弹窗表单。
 * intent=login：SSO 授权登录（未绑定登录 / 全新学号自动建号）→ 跳 redirect 或首页；
 * intent=bind：把学号绑定到当前登录账号 → 回个人中心；学号已被他人绑定 → 409 提示。
 */
import { ref, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { useAuthStore } from '../stores/auth';
import { api_auth } from '../api';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const authz_ref = ref(null);
const saving = ref(false);
const intent = route.query.intent === 'bind' ? 'bind' : 'login';
const form = ref({ studentId: '', password: '' });
/** 演示桩初始口令提示（r80）：real 模式接口不下发，恒为 null */
const demo_hint = ref(null);
const rules = {
    studentId: [
        { required: true, message: '请输入学号', trigger: 'blur' },
        // 与后端 assert_uid 同口径：福州大学学号为 9 位纯数字（如 102400207）
        { pattern: /^\d{9}$/, message: '学号需为 9 位数字（福州大学学号，如 102400207）', trigger: 'blur' },
    ],
    password: [{ required: true, message: '请输入统一身份认证口令', trigger: 'blur' }],
};

onMounted(() => {
    // 预填已有学号：已认证用户的 fzu_uid，或登录名本身是学号的账号（SSO 建号）
    const u = auth.user || {};
    form.value.studentId = u.fzu_uid || (/^\d{9}$/.test(u.username || '') ? u.username : '');
    // 绑定意图必须带登录态，否则转登录页
    if (intent === 'bind' && !auth.token) {
        ElMessage.warning('请先登录后再绑定认证');
        router.replace('/login');
    }
    load_mode();
});

/**
 * 探测 CAS 模式：demo 模式下发统一初始口令提示，real 模式无任何口令信息
 */
async function load_mode() {
    try {
        const d = await api_auth.fzu_cas_mode();
        if (d.mode === 'demo' && d.initialPassword) {
            demo_hint.value = {
                password: d.initialPassword,
                hint: d.initialPasswordHint || '首次登录使用统一初始口令，登录后请自行修改',
            };
            // 首次登录默认帮用户填好统一初始口令，减少演示时的输入成本
            if (!form.value.password) form.value.password = d.initialPassword;
        }
    } catch { /* 静默降级：不阻塞授权流程 */ }
}

/**
 * 提交授权：防重入锁与登录页同款（loading 先于 await 置位）；
 * 前端格式校验与后端 CAS 桩同口径
 */
async function do_authorize() {
    if (saving.value) return;
    saving.value = true;
    try {
        const valid = await authz_ref.value.validate().catch(() => false);
        if (!valid) return;
        const sid = form.value.studentId.trim();
        if (!/^\d{9}$/.test(sid)) { ElMessage.warning('学号需为 9 位数字（福州大学学号，如 102400207）'); return; }
        if (form.value.password.length < 6) { ElMessage.warning('统一身份认证口令至少 6 位'); return; }

        if (intent === 'bind') {
            const d = await api_auth.fzu_bind({ studentId: sid, password: form.value.password });
            auth.apply_user(d);
            ElMessage.success(`认证成功：${d.fzu_name}`);
            if (d.fzu_must_change_password) {
                ElMessage.warning('当前仍在使用统一初始口令，请到「我的 → 统一身份口令」修改');
            }
            router.replace('/me');
        } else {
            await auth.sso_login(sid, form.value.password);
            ElMessage.success('统一身份认证成功，欢迎回来！');
            // 首次登录仍用统一初始口令：登录后立即引导本人设置专属口令（r80）
            if (auth.user?.fzu_must_change_password) {
                const go = await ElMessageBox.confirm(
                    '你正在使用统一初始口令登录，建议立即设置只属于自己的口令。',
                    '设置统一身份口令',
                    { confirmButtonText: '去设置', cancelButtonText: '稍后再说', type: 'warning' }
                ).then(() => true).catch(() => false);
                if (go) {
                    router.replace({ path: '/me', query: { dialog: 'fzu-pwd' } });
                    return;
                }
            }
            router.replace(route.query.redirect || '/');
        }
    } catch { /* 拦截器已提示（如学号被占用 409） */ } finally {
        saving.value = false;
    }
}
</script>

<style scoped>
.page { display: flex; justify-content: center; padding: 48px 16px 64px; }
.authz-card {
    width: min(420px, 100%);
    padding: 0 0 22px;
    overflow: hidden;
}

/* 授权头部：圆形淡金图标位 + 标题（去实底横条，改暖纸语言） */
.authz-head {
    display: flex; align-items: center; gap: 12px;
    padding: 20px 20px 14px;
    border-bottom: 1px solid var(--line);
}
.authz-ico {
    width: 44px; height: 44px; flex-shrink: 0;
    display: grid; place-items: center;
    background: var(--brand-light); color: var(--ink-3);
    border-radius: 50%;
}
.authz-ico svg { width: 24px; height: 24px; }
.authz-title h1 { margin: 0; font-size: 16px; font-weight: 800; letter-spacing: 0.5px; }
.authz-title p { margin: 3px 0 0; font-size: 11px; color: var(--ink-2); }

/* 申请应用行 */
.authz-app {
    padding: 16px 20px 0; font-size: 13.5px; color: var(--ink-2);
}
.app-name { font-weight: 800; color: var(--ink); }

/* 说明条：淡纸底 + 虚线描边 */
.authz-tip {
    margin: 12px 20px; font-size: 12.5px; line-height: 1.7; color: var(--ink-2);
    background: var(--page); border: 1px dashed var(--line);
    border-radius: var(--radius-sm); padding: 10px 12px;
}
/* 统一初始口令提示条（r80，仅演示桩）：淡金底，把初始口令与改密引导放在一起 */
.authz-init {
    margin: 0 20px 12px; padding: 9px 12px;
    display: flex; flex-direction: column; gap: 3px;
    font-size: 12px; line-height: 1.6; color: var(--ink-2);
    background: var(--brand-light);
    border-radius: var(--radius-sm);
}
.authz-init b { font-size: 12.5px; color: var(--brand-dark); letter-spacing: 0.4px; }

.authz-card :deep(.el-form) { padding: 0 20px; }
.authz-card :deep(.el-form-item) { margin-bottom: 16px; }
.authz-btn { width: 100%; margin-top: 2px; }
.authz-foot {
    margin-top: 14px; padding: 0 20px;
    font-size: 12px; color: var(--ink-2);
    display: flex; justify-content: center; gap: 6px; flex-wrap: wrap;
}
.authz-foot a { color: var(--brand); text-decoration: none; }
.authz-foot a:hover { color: var(--brand-dark); text-decoration: underline; }

/* ===== 桌面适配（≥769）：过渡页保持居中美观，改动从简 ===== */
@media (min-width: 769px) {
    /* 授权卡桌面垂直下沉：顶部留 10vh，贴近真实 CAS 授权页观感 */
    .page { padding-top: 10vh; }
    /* 卡片限宽 440 居中（flex 已水平居中，仅放宽一档） */
    .authz-card { width: min(440px, 100%); }
}
</style>
