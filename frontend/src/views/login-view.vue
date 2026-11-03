<template>
    <div class="login-page">
        <div class="login-wrap">
            <!-- 品牌区：IP 形象 + 品牌名 + slogan（P20 对齐） -->
            <header class="brand-head fade-up">
                <img src="/assets/pet/base.png" class="pet" alt="大福食刻 IP 形象" />
                <h1>大福食刻</h1>
                <p class="slogan">吃前查一查，好吃看得见</p>
                <p class="slogan-en">DAFU MOMENT · 校园干饭点评</p>
            </header>

            <!-- 登录 / 注册双 Tab 卡面（保留全部字段与校验逻辑） -->
            <div class="card login-card fade-up">
                <el-tabs v-model="tab" stretch>
                    <!-- 登录 -->
                    <el-tab-pane label="登录" name="login">
                        <el-form ref="login_ref" :model="login_form" :rules="login_rules" @submit.prevent="do_login">
                            <el-form-item prop="username">
                                <el-input v-model="login_form.username" placeholder="用户名 / 学号" size="large" />
                            </el-form-item>
                            <el-form-item prop="password">
                                <el-input v-model="login_form.password" type="password" placeholder="密码" size="large" show-password />
                            </el-form-item>
                            <el-form-item prop="captchaCode">
                                <div class="captcha-row">
                                    <!-- 回车提交走 form 隐式提交（r51c）：去掉 @keyup.enter 避免双触发并发请求 -->
                                    <el-input v-model="login_form.captchaCode" placeholder="验证码" size="large" maxlength="6" />
                                    <img
                                        v-if="captcha.img" :src="captcha.img" class="captcha-img"
                                        title="看不清？点击刷新" alt="图形验证码" @click="refresh_captcha"
                                    />
                                    <span v-else class="captcha-img captcha-empty" :title="captcha_failed ? '获取失败，点这里重试' : '点击获取'" @click="refresh_captcha">{{ captcha_failed ? '获取失败·重试' : '点击获取' }}</span>
                                </div>
                            </el-form-item>
                            <div class="aux-row">
                                <el-checkbox v-model="remember">记住用户名</el-checkbox>
                                <span class="forgot" @click="do_forgot">忘记密码？</span>
                            </div>
                            <el-button type="primary" size="large" class="submit-btn" native-type="submit" :loading="loading">登 录</el-button>
                            <!-- 福大 SSO 授权登录入口（r50）：贴合校园场景，认证后获「福大认证」头衔 -->
                            <div class="sso-divider"><span>或</span></div>
                            <button type="button" class="sso-btn" @click="on_sso">
                                <!-- 自绘 SVG：认证盾牌（G4 禁止汉字图标） -->
                                <svg class="sso-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                                    <path d="M12 3l7 3v5c0 4.4-2.9 7.7-7 10-4.1-2.3-7-5.6-7-10V6l7-3z" />
                                    <path d="M9 12l2 2 4-4" />
                                </svg>
                                使用福大统一身份认证登录
                            </button>
                        </el-form>
                    </el-tab-pane>

                    <!-- 注册 -->
                    <el-tab-pane label="注册" name="register">
                        <el-form ref="reg_ref" :model="reg_form" :rules="reg_rules" @submit.prevent="do_register">
                            <el-form-item prop="username">
                                <el-input v-model="reg_form.username" placeholder="用户名（3-32 位字母数字下划线）" size="large" />
                            </el-form-item>
                            <el-form-item prop="nickname">
                                <el-input v-model="reg_form.nickname" placeholder="昵称（选填，默认同用户名）" size="large" />
                            </el-form-item>
                            <el-form-item prop="password">
                                <el-input v-model="reg_form.password" type="password" placeholder="设置密码（至少 6 位）" size="large" show-password />
                                <!-- 密码强度条：弱 / 中 / 强 三段（参考美团注册）；不足 6 位（strength=0）时不渲染，改显提示 -->
                                <div v-if="strength > 0" class="pwd-meter" :class="`st-${strength}`">
                                    <i class="seg on" /><i class="seg" :class="{ on: strength >= 2 }" /><i class="seg" :class="{ on: strength >= 3 }" />
                                    <em class="pwd-label">{{ PWD_STRENGTH_TEXT[strength] }}</em>
                                </div>
                                <div v-else class="pwd-tip">建议字母 + 数字组合，更安全</div>
                            </el-form-item>
                            <el-form-item prop="confirm">
                                <el-input v-model="reg_form.confirm" type="password" placeholder="确认密码（再输一遍）" size="large" show-password />
                            </el-form-item>
                            <el-form-item prop="captchaCode">
                                <div class="captcha-row">
                                    <el-input v-model="reg_form.captchaCode" placeholder="验证码" size="large" maxlength="6" />
                                    <img
                                        v-if="captcha.img" :src="captcha.img" class="captcha-img"
                                        title="看不清？点击刷新" alt="图形验证码" @click="refresh_captcha"
                                    />
                                    <span v-else class="captcha-img captcha-empty" :title="captcha_failed ? '获取失败，点这里重试' : '点击获取'" @click="refresh_captcha">{{ captcha_failed ? '获取失败·重试' : '点击获取' }}</span>
                                </div>
                            </el-form-item>
                            <el-button type="primary" size="large" class="submit-btn" native-type="submit" :loading="loading">注 册</el-button>
                        </el-form>
                    </el-tab-pane>
                </el-tabs>
            </div>

            <!-- 校园身份认证说明（需求 5.1.1(1)/AC23：标识不关联、不展示学号姓名） -->
            <div class="card auth-note fade-up">
                <div class="an-head">
                    <span class="an-badge">校内已认证</span>
                    <b>校园身份认证</b>
                </div>
                <p class="an-text">
                    登录后可用学号完成校园身份认证。认证通过后，你的点评将展示「校内已认证」标识，评价更可信。认证标识不会关联或展示你的学号、姓名等个人信息。
                </p>
                <p class="an-demo">模拟校园身份认证 · 学号数据集比对 · 仅演示</p>
            </div>

            <p class="foot-tip fade-up">登录即代表同意《用户协议》与《隐私政策》</p>
        </div>
    </div>
</template>

<script setup>
/**
 * 登录/注册双 Tab（P20 高保真对齐 + r27/r51 强化）：
 * - 居中单列卡面：顶部 IP 形象 + 品牌名 + slogan；下方登录/注册 Tab 与认证说明卡
 * - 注册：确认密码（两次一致硬校验）+ 密码强度条（弱/中/强）+ 行内规则提示
 * - 登录：记住用户名（localStorage）+ 忘记密码引导；回车提交
 * - 图形验证码：登录/注册共用一张（点击刷新）；验证码一次性消费（提交即失效），
 *   任何提交失败都自动换新图并清空输入（r51b）
 * - 福大 SSO：跳转独立授权页 /auth/fzu/authorize；登录后回跳 redirect
 */
import { ref, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { useAuthStore } from '../stores/auth';
import { api_auth } from '../api';
import { pwd_strength, PWD_STRENGTH_TEXT } from '../utils/format';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();

const tab = ref('login');
const loading = ref(false);
const login_ref = ref(null);
const reg_ref = ref(null);
const login_form = ref({ username: '', password: '', captchaCode: '' });
const reg_form = ref({ username: '', nickname: '', password: '', confirm: '', captchaCode: '' });
const remember = ref(false);

// 图形验证码（登录/注册共用）：imageBase64 为完整 data URL，可直接绑 img src
const captcha = ref({ id: '', img: '' });
// 出图失败标记：接口挂了还能提示「获取失败·重试」，不然只有一个「点击获取」让人误以为没反应
const captcha_failed = ref(false);

/**
 * 拉取/刷新图形验证码（换图后旧输入必然失效，同步清空两个验证码输入框）
 */
async function refresh_captcha() {
    try {
        const d = await api_auth.get_captcha();
        captcha.value = { id: d.captchaId, img: d.imageBase64 };
        captcha_failed.value = false;
        login_form.value.captchaCode = '';
        reg_form.value.captchaCode = '';
    } catch {
        captcha_failed.value = true;
    }
}

/**
 * 验证码报错兜底（r51b）：验证码读后即删（提交一次即消费），
 * 因此登录/注册任何失败都无条件换新图并清空输入——否则密码错误后旧图失效，
 * 用户改对密码重提会莫名弹「验证码错误或已过期」（提示与结果矛盾）
 */
function handle_captcha_error() {
    refresh_captcha();
}

const login_rules = {
    username: [{ required: true, message: '请输入用户名 / 学号', trigger: 'blur' }],
    password: [{ required: true, message: '请输入密码', trigger: 'blur' }],
    captchaCode: [{ required: true, message: '请输入验证码', trigger: 'blur' }],
};
const reg_rules = {
    username: [
        { required: true, message: '请输入用户名', trigger: 'blur' },
        { pattern: /^[a-zA-Z0-9_]{3,32}$/, message: '需 3-32 位字母/数字/下划线', trigger: 'blur' },
    ],
    password: [
        { required: true, message: '请设置密码', trigger: 'blur' },
        { min: 6, message: '密码至少 6 位', trigger: 'blur' },
    ],
    confirm: [
        { required: true, message: '请再次输入密码', trigger: 'blur' },
        {
            validator: (_rule, v, cb) => (v === reg_form.value.password ? cb() : cb(new Error('两次输入的密码不一致'))),
            trigger: 'blur',
        },
    ],
    captchaCode: [{ required: true, message: '请输入验证码', trigger: 'blur' }],
};

const strength = computed(() => pwd_strength(reg_form.value.password));

/**
 * 登录（记住用户名持久化 + 图形验证码；验证码一次性消费，任何失败自动换图）
 * 防重入（r51c）：loading 锁在 validate 的 await 之前同步置位——
 * 回车与 form 提交双触发、快速双击都只放行第一个请求；否则并发第二请求
 * 会报「验证码错误或已过期」，与第一请求的「用户名或密码错误」同时弹出（提示矛盾 bug）
 */
async function do_login() {
    if (loading.value) return;
    loading.value = true;
    const valid = await login_ref.value.validate().catch(() => false);
    if (!valid) { loading.value = false; return; }
    try {
        if (remember.value) localStorage.setItem('fk_remember_user', login_form.value.username);
        else localStorage.removeItem('fk_remember_user');
        await auth.login(login_form.value.username, login_form.value.password, {
            captchaId: captcha.value.id,
            captchaCode: login_form.value.captchaCode,
        });
        ElMessage.success('欢迎回来！');
        router.push(route.query.redirect || '/');
    } catch (e) {
        handle_captcha_error(e);
    } finally {
        loading.value = false;
    }
}

/**
 * 注册（确认密码 + 强度软提示：强度 1 时提醒但不强制拦截，兼容简单密码习惯 + 图形验证码）
 */
async function do_register() {
    if (loading.value) return;
    loading.value = true;
    const valid = await reg_ref.value.validate().catch(() => false);
    if (!valid) { loading.value = false; return; }
    if (strength.value === 1 && !(await confirm_weak())) { loading.value = false; return; }
    try {
        await auth.register({
            username: reg_form.value.username,
            nickname: reg_form.value.nickname,
            password: reg_form.value.password,
            captchaId: captcha.value.id,
            captchaCode: reg_form.value.captchaCode,
        });
        ElMessage.success('注册成功！');
        router.push(route.query.redirect || '/');
    } catch (e) {
        handle_captcha_error(e);
    } finally {
        loading.value = false;
    }
}

/**
 * 弱密码确认弹窗（参考大众点评：提示风险，允许坚持）
 */
async function confirm_weak() {
    try {
        await ElMessageBox.confirm('密码强度较弱，可能容易被猜到。仍要使用这个密码吗？', '密码强度提示', {
            confirmButtonText: '继续使用',
            cancelButtonText: '换一个',
            type: 'warning',
        });
        return true;
    } catch {
        return false;
    }
}

/**
 * 忘记密码引导（演示环境无邮件服务，如实说明）
 */
function do_forgot() {
    ElMessageBox.alert(
        '演示环境未接入邮件服务：学生账号请联系管理员重置密码；演示号可直接使用 zhangwl / 123456。',
        '找回密码',
        { confirmButtonText: '知道了' }
    );
}

/* ---------------- 福大统一身份认证（SSO，r51c 统一跳转授权页） ---------------- */

/**
 * SSO 入口分流：real 模式（env 已配学校 CAS 凭证）302 跳校方登录页；
 * demo 模式同样走「跳转授权页」形态（/auth/fzu/authorize，与真实 CAS 流程一致），
 * 弃用旧弹窗表单——授权必须经独立授权页完成
 */
async function on_sso() {
    const { mode, loginUrl } = await api_auth.fzu_cas_mode();
    if (mode === 'real') {
        // 回调页凭此区分「登录」与「绑定」意图（service 地址校方注册后不可带动态参数）
        sessionStorage.setItem('fk_fzu_intent', 'login');
        window.location.href = loginUrl;
        return;
    }
    router.push({ path: '/auth/fzu/authorize', query: { intent: 'login', redirect: route.query.redirect || '' } });
}

onMounted(() => {
    refresh_captcha();
    const saved = localStorage.getItem('fk_remember_user');
    if (saved) {
        login_form.value.username = saved;
        remember.value = true;
    }
});
</script>

<style scoped>
/* 居中单列（P20 画板 375，桌面以 480 列呈现） */
.login-page { display: flex; justify-content: center; padding: 32px 16px 64px; }
.login-wrap { width: min(480px, 100%); }

/* ===== 品牌区：IP 形象 88px + 品牌名 + slogan ===== */
.brand-head { text-align: center; padding: 8px 0 26px; }
.pet { display: block; width: 88px; height: 88px; object-fit: contain; margin: 0 auto; }
.brand-head h1 { margin: 10px 0 0; font-size: 22px; font-weight: 800; letter-spacing: 2px; }
.slogan { margin: 7px 0 0; font-size: 13px; color: var(--ink); }
.slogan-en { margin: 4px 0 0; font-size: 10px; color: var(--ink-2); letter-spacing: 3px; }

/* ===== 登录/注册卡面 ===== */
.login-card { padding: 6px 20px 20px; }
.login-card :deep(.el-tabs__item) { font-size: 14px; font-weight: 700; }
.login-card :deep(.el-form-item) { margin-bottom: 16px; }
.login-card :deep(.el-form-item__error) { padding-top: 2px; }

/* 记住用户名 + 忘记密码行 */
.aux-row { display: flex; align-items: center; justify-content: space-between; margin: -6px 0 10px; }
.aux-row :deep(.el-checkbox__label) { font-size: 13px; color: var(--ink-2); }
.forgot { font-size: 13px; color: var(--brand); cursor: pointer; }
.forgot:hover { color: var(--brand-dark); text-decoration: underline; }

.submit-btn { width: 100%; margin-top: 4px; }

/* ===== 福大 SSO 次按钮：淡描边 + 琥珀悬停（去墨线/去错位阴影/去胶囊） ===== */
.sso-divider { display: flex; align-items: center; gap: 10px; margin: 2px 0 12px; color: var(--ink-2); font-size: 12px; }
.sso-divider::before, .sso-divider::after { content: ''; flex: 1; border-top: 1px dashed var(--line); }
.sso-btn {
    width: 100%; display: flex; align-items: center; justify-content: center; gap: 8px;
    height: 42px; border-radius: var(--radius-sm); border: 1px solid var(--line);
    background: var(--paper); font-weight: 700; font-size: 13px; color: var(--ink);
    cursor: pointer; transition: background .12s ease, color .12s ease, transform .08s ease;
}
.sso-btn:hover { background: var(--brand-light); color: var(--brand-dark); }
.sso-btn:active { transform: translateY(1px); }
/* 认证盾牌图标：自绘 SVG 线性风格 */
.sso-ico { width: 18px; height: 18px; color: var(--brand); flex-shrink: 0; }

/* 验证码行：输入框 + 右侧验证码图（点击刷新，淡描边微圆角） */
.captcha-row { display: flex; gap: 10px; width: 100%; align-items: center; }
.captcha-img {
    width: 122px; height: 44px; flex-shrink: 0;
    border: 1px solid var(--line); border-radius: var(--radius-sm);
    background: var(--paper); cursor: pointer; user-select: none;
    transition: background .12s ease;
}
.captcha-img:hover { background: #FBF3DC; }
/* 验证码加载失败/未加载时的占位小签 */
.captcha-empty {
    display: inline-flex; align-items: center; justify-content: center;
    font-size: 12px; font-weight: 700; color: var(--ink-2); letter-spacing: 1px;
}

/* ===== 校园身份认证说明（淡签 + 演示口径） ===== */
.auth-note { margin-top: 14px; padding: 14px 16px; }
.an-head { display: flex; align-items: center; gap: 7px; }
.an-badge {
    display: inline-block; font-size: 9px; line-height: 16px; padding: 1px 8px;
    border-radius: 6px; background: var(--brand); color: #FFFDF5; font-weight: 700;
}
.an-head b { font-size: 13px; }
.an-text { margin: 8px 0 0; font-size: 11.5px; line-height: 1.75; color: var(--ink-3); }
.an-demo { margin: 7px 0 0; font-size: 10.5px; color: var(--ink-2); }

.foot-tip { margin: 18px 0 0; text-align: center; font-size: 10.5px; color: var(--ink-2); line-height: 1.8; }

.pwd-tip { font-size: 11px; color: var(--ink-2); margin-top: 6px; width: 100%; }

@media (max-width: 480px) {
    /* 底部留出 tabbar 高度，否则「登录即代表同意…」会被底部导航压住 */
    .login-page { padding: 20px 12px 100px; }
    .brand-head { padding-bottom: 20px; }
}

/* ===== 桌面适配（≥769）===== */
@media (min-width: 769px) {
    /* 桌面：吃掉主区剩余高度，品牌区+登录卡整体垂直居中，顶部加 8vh 微调视觉重心 */
    .login-page { flex: 1; align-items: center; padding: 8vh 16px 48px; }
    /* 桌面：登录卡列收窄至 440px 居中 */
    .login-wrap { width: min(440px, 100%); }
    /* 卡面阴影保持全局极淡弥散档（--shadow-soft），桌面不加重 */
    .login-card { box-shadow: var(--shadow-soft); }
}
</style>
