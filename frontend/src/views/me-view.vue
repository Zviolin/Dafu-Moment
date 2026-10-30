<template>
    <div class="page-wrap">
        <!-- 顶部账号区（C16：删除左上角返回键，位置留空不补；头像与导航栏共用 UserAvatar，随资料编辑实时同步） -->
        <div class="me-head">
            <user-avatar class="head-av" :user="auth.user" :size="44" />
            <b class="nick">{{ nick_text }}</b>
            <!-- 校内已认证签（C17 头像防压扁由 avatar-fix 保证） -->
            <span v-if="auth.user?.fzu_verified" class="vbadge" :title="`学号 ${auth.user?.fzu_uid || ''}`">校内已认证</span>
            <el-tag v-if="auth.user?.role === 1" size="small">管理员</el-tag>
            <button class="edit-btn" @click="open_profile">编辑资料</button>
        </div>

        <!-- 初始口令提示条（r80）：仍用统一初始口令时置顶提醒尽快改密 -->
        <div v-if="auth.user?.fzu_must_change_password" class="pwd-tip fade-up">
            <span class="pt-txt">当前仍在使用统一初始口令，为保障账号安全请尽快修改「统一身份口令」。</span>
            <button class="pt-btn" @click="open_fzu_pwd">立即修改</button>
        </div>

        <!-- 社交入口（关注 / 粉丝）：后端暂无关注关系数据，仅保留跳转入口，不展示数字 -->
        <div class="statrow">
            <router-link class="stat" to="/follows">
                <span>关注</span>
            </router-link>
            <router-link class="stat" :to="{ path: '/follows', query: { tab: 'fans' } }">
                <span>粉丝</span>
            </router-link>
        </div>

        <!-- 三功能入口（C21：纵向布局，图标 30px 在上、文字在下） -->
        <div class="fnrow">
            <router-link v-for="f in FN_ENTRIES" :key="f.label" class="fn-item fade-up" :to="f.to">
                <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#8A6A3A" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
                    <path v-for="(d, i) in f.d" :key="i" :d="d" />
                </svg>
                <span>{{ f.label }}</span>
            </router-link>
        </div>

        <!-- 列表行入口组：左 20px SVG 图标 + 名称 + 右箭头，1px 细线分隔 -->
        <div class="rowlist card fade-up">
            <template v-for="(r, i) in MENU_ROWS" :key="r.key">
                <router-link v-if="r.to" class="row" :to="r.to">
                    <span class="rico">
                        <!-- 宠物入口用福宝贴纸（17 号三宫格形象），其余为自绘 SVG 图标（G4：禁汉字图标） -->
                        <img v-if="r.icon === 'pet'" class="rico-img" src="/assets/icons/grid-avatar.png" alt="我的宠物" />
                        <svg v-else-if="r.icon === 'star'" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.9-5.2-2.8-5.2 2.8 1-5.9L3.5 9.7l5.9-.9z" /></svg>
                        <svg v-else-if="r.icon === 'doc'" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="3" /><path d="M8 9h8M8 13h8M8 17h5" /></svg>
                        <svg v-else-if="r.icon === 'medal'" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="9" r="5.5" /><path d="M8.5 13.5L7 21l5-2.6L17 21l-1.5-7.5" /></svg>
                        <svg v-else-if="r.icon === 'folder'" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 012-2h4l2 2.5h8a2 2 0 012 2V17a2 2 0 01-2 2H5a2 2 0 01-2-2z" /></svg>
                        <svg v-else-if="r.icon === 'bell'" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M18 9a6 6 0 10-12 0c0 5-2 6-2 6h16s-2-1-2-6" /><path d="M10 19a2 2 0 004 0" /></svg>
                        <svg v-else-if="r.icon === 'plus'" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="3" /><path d="M12 8.5v7M8.5 12h7" /></svg>
                        <svg v-else-if="r.icon === 'warn'" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4.5L2.8 19.5h18.4z" /><path d="M12 10.5v4M12 17.2h.01" /></svg>
                        <svg v-else-if="r.icon === 'pie'" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8" /><path d="M12 4v8l5.7 5.7" /></svg>
                        <svg v-else-if="r.icon === 'lock'" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 018 0v3" /></svg>
                        <svg v-else-if="r.icon === 'badge'" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="10" r="6" /><path d="M9.7 10l1.7 1.7 3-3.2M9.2 15.2L8.2 21l3.8-2 3.8 2-1-5.8" /></svg>
                        <svg v-else width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M5 8h14M5 16h14" /><circle cx="9.5" cy="8" r="2.2" /><circle cx="14.5" cy="16" r="2.2" /></svg>
                    </span>
                    <span class="row-name">{{ r.label }}</span>
                    <svg class="arrow" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7" /></svg>
                </router-link>
                <!-- 弹窗动作行（修改密码 / 福大认证 / 统一身份口令）：结构与跳转行一致 -->
                <a v-else class="row" @click="on_action(r)">
                    <span class="rico">
                        <svg v-if="r.icon === 'lock'" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 018 0v3" /></svg>
                        <svg v-else-if="r.icon === 'key'" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="7.5" cy="14.5" r="3.5" /><path d="M10 12l8-8M15.5 6.5l3 3M13 9l2.5 2.5" /></svg>
                        <svg v-else width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="10" r="6" /><path d="M9.7 10l1.7 1.7 3-3.2M9.2 15.2L8.2 21l3.8-2 3.8 2-1-5.8" /></svg>
                    </span>
                    <span class="row-name">{{ r.label }}</span>
                    <svg class="arrow" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7" /></svg>
                </a>
                <hr v-if="i < MENU_ROWS.length - 1" class="list-hairline" />
            </template>
        </div>

        <div class="foot-hint">大福食刻 · 福州大学校园点评</div>

        <!-- 编辑资料弹窗：预设头像九宫格 / 自定义上传 + 昵称 + 邮箱 -->
        <el-dialog v-model="pf_open" title="编辑资料" width="460px">
            <el-form ref="pf_ref" :model="pf_form" :rules="pf_rules" label-width="52px" @submit.prevent="save_profile">
                <el-form-item label="头像">
                    <div class="av-wrap">
                        <div class="av-picker">
                            <button
                                v-for="i in 8" :key="i" type="button"
                                class="av-opt" :class="{ on: !pf_form.avatarObjectKey && pf_form.avatar === i }"
                                :title="`预设头像 ${i}`"
                                @click="pick_avatar(i)"
                            >
                                <user-avatar :user="{ id: i - 1, avatar: i }" :size="30" />
                            </button>
                        </div>
                        <div class="av-custom">
                            <cover-uploader v-model="pf_form.avatarObjectKey" :ratio="1" :presets="false" tip="上传自定义头像（正方形裁切）" />
                        </div>
                    </div>
                </el-form-item>
                <el-form-item label="昵称" prop="nickname">
                    <el-input v-model="pf_form.nickname" maxlength="32" placeholder="展示名" />
                </el-form-item>
                <el-form-item label="邮箱" prop="email">
                    <el-input v-model="pf_form.email" maxlength="128" placeholder="选填" />
                </el-form-item>
            </el-form>
            <template #footer>
                <el-button @click="pf_open = false">取消</el-button>
                <el-button type="primary" :loading="pf_saving" @click="save_profile">保存</el-button>
            </template>
        </el-dialog>

        <!-- 修改密码弹窗：旧密码 + 新密码（强度条）+ 新密码确认 -->
        <el-dialog v-model="pwd_open" title="修改密码" width="400px">
            <el-form ref="pwd_ref" :model="pwd_form" :rules="pwd_rules" label-width="76px" @submit.prevent="save_password">
                <el-form-item label="旧密码" prop="oldPassword">
                    <el-input v-model="pwd_form.oldPassword" type="password" show-password placeholder="当前密码" />
                </el-form-item>
                <el-form-item label="新密码" prop="newPassword">
                    <el-input v-model="pwd_form.newPassword" type="password" show-password placeholder="至少 6 位，建议字母 + 数字" />
                    <div v-if="pwd_level > 0" class="pwd-meter" :class="`st-${pwd_level}`">
                        <i class="seg on" /><i class="seg" :class="{ on: pwd_level >= 2 }" /><i class="seg" :class="{ on: pwd_level >= 3 }" />
                        <em class="pwd-label">{{ PWD_STRENGTH_TEXT[pwd_level] }}</em>
                    </div>
                </el-form-item>
                <el-form-item label="新密码" prop="confirm">
                    <el-input v-model="pwd_form.confirm" type="password" show-password placeholder="再输一遍新密码" />
                </el-form-item>
            </el-form>
            <template #footer>
                <el-button @click="pwd_open = false">取消</el-button>
                <el-button type="primary" :loading="pwd_saving" @click="save_password">确认修改</el-button>
            </template>
        </el-dialog>

        <!-- 福大认证弹窗：已绑定态「认证信息」查看 + 解绑；绑定一律跳授权页 -->
        <el-dialog v-model="fzu_open" title="福大统一身份认证" width="420px">
            <div class="fzu-info card">
                <span class="fzu-badge-big">福大认证</span>
                <div class="fzu-rows">
                    <div><i>认证姓名</i><b>{{ auth.user?.fzu_name }}</b></div>
                    <div><i>学号</i><b>{{ auth.user?.fzu_uid }}</b></div>
                    <div><i>登录方式</i><b>学号 + 统一身份认证（SSO）</b></div>
                </div>
            </div>
            <template #footer>
                <el-button @click="fzu_open = false">关闭</el-button>
                <el-button type="danger" :loading="fzu_saving" @click="do_fzu_unbind">解绑认证</el-button>
            </template>
        </el-dialog>

        <!-- 统一身份口令（r80）：当前口令 + 新口令 + 确认新口令（双重输入，两次新口令必须一致） -->
        <el-dialog v-model="fpwd_open" title="修改统一身份口令" width="420px">
            <div class="fpwd-hint">
                <template v-if="auth.user?.fzu_must_change_password">
                    首次登录使用的是统一初始口令，请在此设置只属于自己的口令。
                </template>
                <template v-else>
                    修改后学号登录（统一身份认证）需使用新口令，本地账号密码不受影响。
                </template>
            </div>
            <el-form ref="fpwd_ref" :model="fpwd_form" :rules="fpwd_rules" label-width="92px" @submit.prevent="save_fzu_pwd">
                <el-form-item label="当前口令" prop="oldPassword">
                    <el-input v-model="fpwd_form.oldPassword" type="password" show-password placeholder="当前统一身份口令" />
                </el-form-item>
                <el-form-item label="新口令" prop="newPassword">
                    <el-input v-model="fpwd_form.newPassword" type="password" show-password placeholder="至少 6 位，建议字母 + 数字" />
                </el-form-item>
                <el-form-item label="确认新口令" prop="confirmPassword">
                    <el-input v-model="fpwd_form.confirmPassword" type="password" show-password placeholder="再输一遍新口令" />
                </el-form-item>
            </el-form>
            <template #footer>
                <el-button @click="fpwd_open = false">取消</el-button>
                <el-button type="primary" :loading="fpwd_saving" @click="save_fzu_pwd">确认修改</el-button>
            </template>
        </el-dialog>
    </div>
</template>

<script setup>
/**
 * 个人中心「我的」（/me）：对齐 P19 原型 + 修改说明 C16~C21
 * - C16 删除左上角返回键（位置留空不补）
 * - C17 头像 44px 正圆 + avatar-fix 防压扁
 * - C18 统计行去胶囊：纯文字，无外框
 * - C19 关注/粉丝 → /follows（粉丝带 ?tab=fans）；后端暂无关注关系数据，仅保留跳转入口不展示数字
 * - C21 三功能入口纵向：图标 30px 在上、文字在下
 * - 我的点评/收藏清单已拆分至 my-reviews-view / collection-view 独立页
 */
import { ref, computed, onMounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import UserAvatar from '../components/user-avatar.vue';
import CoverUploader from '../components/cover-uploader.vue';
import { api_auth } from '../api';
import { useAuthStore } from '../stores/auth';
import { pwd_strength, PWD_STRENGTH_TEXT } from '../utils/format';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();

/** 昵称（登录态数据，缺省兜底） */
const nick_text = computed(() => auth.user?.nickname || '福大食客');

/* ================= C21：三功能入口（收藏/足迹/任务，纵向） ================= */
const FN_ENTRIES = [
    {
        label: '收藏', to: '/collection',
        d: ['M7 3.5h10a1 1 0 011 1V21l-6-3.5L6 21V4.5a1 1 0 011-1z'],
    },
    {
        label: '足迹', to: '/footprint',
        d: ['M12 21s-7-5.2-7-11a7 7 0 0114 0c0 5.8-7 11-7 11z', 'M12 12.6a2.6 2.6 0 100-5.2 2.6 2.6 0 000 5.2z'],
    },
    {
        label: '任务', to: '/tasks',
        d: ['M7 4h10a3 3 0 013 3v10a3 3 0 01-3 3H7a3 3 0 01-3-3V7a3 3 0 013-3z', 'M9 12.5l2.2 2.2L15.5 10'],
    },
];

/* ================= 列表行入口组（图标 + 名称 + 右箭头，细线分隔） ================= */
const MENU_ROWS = [
    { key: 'reviews', label: '我的点评', icon: 'star', to: '/my-reviews' },
    { key: 'drafts', label: '草稿箱', icon: 'doc', to: '/drafts' },
    { key: 'achievements', label: '成就与头衔', icon: 'medal', to: '/achievements' },
    { key: 'diet', label: '饮食档案', icon: 'folder', to: '/ai/profile' },
    { key: 'notify', label: '通知中心', icon: 'bell', to: '/notifications' },
    { key: 'cobuild', label: '共建提交', icon: 'plus', to: '/cobuild' },
    { key: 'report', label: '举报记录', icon: 'warn', to: '/report' },
    { key: 'pet', label: '我的宠物', icon: 'pet', to: '/pet' },
    { key: 'wheel', label: '美食转盘', icon: 'pie', to: '/ai/wheel' },
    { key: 'pwd', label: '修改密码', icon: 'lock', action: 'pwd' },
    { key: 'fzu', label: '福大认证', icon: 'badge', action: 'fzu' },
    // 统一身份口令（r80）：学号登录用的 SSO 口令，与本地账号密码相互独立
    { key: 'fzu_pwd', label: '统一身份口令', icon: 'key', action: 'fzu_pwd' },
    { key: 'settings', label: '设置与隐私', icon: 'sliders', to: '/settings' },
];

/* ================= 编辑资料 ================= */
const pf_open = ref(false);
const pf_ref = ref(null);
const pf_saving = ref(false);
const pf_form = ref({ nickname: '', email: '', avatar: 0, avatarObjectKey: null });
const pf_rules = {
    nickname: [
        { required: true, message: '昵称不能为空', trigger: 'blur' },
        { max: 32, message: '昵称最长 32 个字符', trigger: 'blur' },
    ],
    email: [{ type: 'email', message: '邮箱格式不正确', trigger: 'blur' }],
};

/**
 * 打开编辑资料弹窗（回填当前用户信息）
 */
function open_profile() {
    pf_form.value = {
        nickname: auth.user?.nickname || '',
        email: auth.user?.email || '',
        avatar: auth.user?.avatar || 0,
        avatarObjectKey: auth.user?.avatar_object_key || auth.user?.avatarObjectKey || null,
    };
    pf_open.value = true;
}

/**
 * 选择预设头像（编号 1-8 显式生效；清除自定义头像引用）
 * @param {number} i - 预设编号 1-8（0 为「自动」未选状态）
 */
function pick_avatar(i) {
    pf_form.value.avatar = i;
    pf_form.value.avatarObjectKey = null;
}

/**
 * 保存资料：提交后合并进 auth store（顶栏/头部即时刷新）
 */
async function save_profile() {
    const valid = await pf_ref.value.validate().catch(() => false);
    if (!valid) return;
    pf_saving.value = true;
    try {
        const d = await api_auth.update_profile({
            nickname: pf_form.value.nickname,
            email: pf_form.value.email,
            avatar: pf_form.value.avatar,
            avatarObjectKey: pf_form.value.avatarObjectKey,
        });
        auth.apply_user(d);
        ElMessage.success('资料已更新');
        pf_open.value = false;
    } catch { /* 拦截器已提示 */ } finally {
        pf_saving.value = false;
    }
}

/* ================= 修改密码 ================= */
const pwd_open = ref(false);
const pwd_ref = ref(null);
const pwd_saving = ref(false);
const pwd_form = ref({ oldPassword: '', newPassword: '', confirm: '' });
const pwd_level = computed(() => pwd_strength(pwd_form.value.newPassword));
const pwd_rules = {
    oldPassword: [{ required: true, message: '请输入当前密码', trigger: 'blur' }],
    newPassword: [
        { required: true, message: '请设置新密码', trigger: 'blur' },
        { min: 6, message: '新密码至少 6 位', trigger: 'blur' },
        {
            validator: (_r, v, cb) => (v && v === pwd_form.value.oldPassword ? cb(new Error('新密码不能与旧密码相同')) : cb()),
            trigger: 'blur',
        },
    ],
    confirm: [
        { required: true, message: '请再次输入新密码', trigger: 'blur' },
        {
            validator: (_r, v, cb) => (v === pwd_form.value.newPassword ? cb() : cb(new Error('两次输入的密码不一致'))),
            trigger: 'blur',
        },
    ],
};

/**
 * 打开修改密码弹窗（清空表单）
 */
function open_pwd() {
    pwd_form.value = { oldPassword: '', newPassword: '', confirm: '' };
    pwd_open.value = true;
}

/**
 * 响应 ?dialog=pwd|fzu|fzu-pwd：从设置页「账号与安全」跳转后自动打开对应弹窗
 */
function open_by_query() {
    const d = route.query.dialog;
    if (d === 'pwd') open_pwd();
    else if (d === 'fzu') open_fzu();
    else if (d === 'fzu-pwd') open_fzu_pwd();
}

/**
 * 弹窗动作分发：修改密码 / 福大认证 / 统一身份口令
 * @param {Object} r - 菜单行配置（含 action 字段）
 */
function on_action(r) {
    if (r.action === 'pwd') return open_pwd();
    if (r.action === 'fzu') return open_fzu();
    if (r.action === 'fzu_pwd') return open_fzu_pwd();
}

/**
 * 挂载：拉一次 /auth/me 刷新认证态（初始口令标记 fzu_must_change_password 只在此接口下发）
 */
async function refresh_me() {
    if (!auth.token) return;
    try {
        const u = await api_auth.me();
        auth.apply_user(u);
    } catch { /* 静默降级：不影响页面其他内容 */ }
}

onMounted(() => {
    refresh_me();
    open_by_query();
});
watch(() => route.query.dialog, open_by_query);

/**
 * 保存新密码（后端验旧密码；成功后保持当前登录态）
 */
async function save_password() {
    const valid = await pwd_ref.value.validate().catch(() => false);
    if (!valid) return;
    pwd_saving.value = true;
    try {
        await api_auth.update_password({
            oldPassword: pwd_form.value.oldPassword,
            newPassword: pwd_form.value.newPassword,
        });
        ElMessage.success('密码已修改，下次登录请使用新密码');
        pwd_open.value = false;
    } catch { /* 拦截器已提示（旧密码不正确等） */ } finally {
        pwd_saving.value = false;
    }
}

/* ================= 福大统一身份认证（r50/r51c） ================= */
const fzu_open = ref(false);
const fzu_saving = ref(false);

/**
 * 打开福大认证：绑定一律走「跳转授权页」流程，与真实 CAS 体验一致——
 * real 模式 302 跳校方登录页（回调页按 intent=bind 完成绑定）；
 * demo 模式跳本站授权页 /auth/fzu/authorize?intent=bind（校方风格表单）。
 * 已绑定（认证信息查看）始终开弹窗，无需再走认证。
 */
async function open_fzu() {
    if (auth.user?.fzu_verified) {
        fzu_open.value = true;
        return;
    }
    const { mode, loginUrl } = await api_auth.fzu_cas_mode();
    if (mode === 'real') {
        sessionStorage.setItem('fk_fzu_intent', 'bind');
        window.location.href = loginUrl;
        return;
    }
    router.push({ path: '/auth/fzu/authorize', query: { intent: 'bind' } });
}

/**
 * 解绑认证：二次确认后清除认证身份，「校内已认证」头衔随之消失
 */
async function do_fzu_unbind() {
    try {
        await ElMessageBox.confirm(
            '解绑后将失去「校内已认证」头衔，且不能再使用统一身份认证登录。确定解绑吗？',
            '解绑福大认证',
            { type: 'warning', confirmButtonText: '确定解绑', cancelButtonText: '再想想' }
        );
    } catch { return; }
    fzu_saving.value = true;
    try {
        const d = await api_auth.fzu_unbind();
        auth.apply_user(d);
        ElMessage.success('已解绑福大认证');
        fzu_open.value = false;
    } catch { /* 拦截器已提示 */ } finally {
        fzu_saving.value = false;
    }
}

/* ================= 统一身份口令（r80） ================= */
const fpwd_open = ref(false);
const fpwd_ref = ref(null);
const fpwd_saving = ref(false);
const fpwd_form = ref({ oldPassword: '', newPassword: '', confirmPassword: '' });
const fpwd_rules = {
    oldPassword: [{ required: true, message: '请输入当前统一身份口令', trigger: 'blur' }],
    newPassword: [
        { required: true, message: '请设置新口令', trigger: 'blur' },
        { min: 6, message: '新口令至少 6 位', trigger: 'blur' },
        {
            validator: (_r, v, cb) => (v && v === fpwd_form.value.oldPassword ? cb(new Error('新口令不能与当前口令相同')) : cb()),
            trigger: 'blur',
        },
    ],
    confirmPassword: [
        { required: true, message: '请再次输入新口令', trigger: 'blur' },
        {
            validator: (_r, v, cb) => (v === fpwd_form.value.newPassword ? cb() : cb(new Error('两次输入的新口令不一致'))),
            trigger: 'blur',
        },
    ],
};

/**
 * 打开「统一身份口令」弹窗：未绑定统一身份认证的账号先提示去绑定
 * （口令随学号托管在 fzu_account，没有学号就没有可改的对象）
 */
function open_fzu_pwd() {
    if (!auth.user?.fzu_verified) {
        ElMessage.warning('请先完成福大统一身份认证绑定，再修改统一身份口令');
        return;
    }
    fpwd_form.value = { oldPassword: '', newPassword: '', confirmPassword: '' };
    fpwd_open.value = true;
}

/**
 * 保存统一身份口令：三重输入（当前 + 新 + 确认），后端二次校验并清除初始口令标记
 */
async function save_fzu_pwd() {
    const valid = await fpwd_ref.value.validate().catch(() => false);
    if (!valid) return;
    fpwd_saving.value = true;
    try {
        const d = await api_auth.fzu_update_password({
            oldPassword: fpwd_form.value.oldPassword,
            newPassword: fpwd_form.value.newPassword,
            confirmPassword: fpwd_form.value.confirmPassword,
        });
        // 口令已改：本地标记同步清除，顶部初始口令提示条随之消失
        auth.apply_user({ fzu_must_change_password: !!d.must_change });
        ElMessage.success('统一身份口令已更新，下次学号登录请使用新口令');
        fpwd_open.value = false;
    } catch { /* 拦截器已提示（当前口令错误 / 两次不一致等） */ } finally {
        fpwd_saving.value = false;
    }
}
</script>

<style scoped>
/* ===== 顶部账号区（C16 无返回键；C17 头像 44px 正圆防压扁） ===== */
.me-head {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 0 0;
}
.head-av { width: 44px; height: 44px; border-radius: 50%; }
.nick { font-size: 17px; font-weight: 700; }
/* 校内已认证签：琥珀实底白字微圆角（禁胶囊） */
.vbadge {
    font-size: 9px;
    color: var(--paper);
    background: var(--brand);
    padding: 3px 8px;
    border-radius: 6px;
    font-weight: 700;
    flex-shrink: 0;
}
.edit-btn {
    margin-left: auto;
    font-size: 11px;
    font-weight: 600;
    color: var(--ink-3);
    background: var(--paper);
    border: 1px solid var(--line);
    border-radius: var(--radius-sm);
    padding: 5px 12px;
    cursor: pointer;
    flex-shrink: 0;
    transition: background .12s ease, color .12s ease;
}
.edit-btn:hover { background: var(--brand-light); color: var(--brand-dark); }

/* ===== 初始口令提示条（r80）：淡纸底 + 虚线描边，与全站提示语言一致 ===== */
.pwd-tip {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-top: 12px;
    padding: 9px 12px;
    font-size: 12px;
    line-height: 1.6;
    color: var(--ink-2);
    background: var(--page);
    border: 1px dashed var(--line);
    border-radius: var(--radius-sm);
}
.pt-txt { flex: 1; }
.pt-btn {
    flex-shrink: 0;
    font-size: 11.5px;
    font-weight: 700;
    color: var(--brand-dark);
    background: var(--brand-light);
    border: none;
    border-radius: var(--radius-sm);
    padding: 5px 12px;
    cursor: pointer;
}
.pt-btn:hover { color: var(--paper); background: var(--brand); }
/* 统一身份口令弹窗说明条 */
.fpwd-hint {
    margin-bottom: 14px;
    padding: 9px 12px;
    font-size: 12px;
    line-height: 1.7;
    color: var(--ink-2);
    background: var(--page);
    border: 1px dashed var(--line);
    border-radius: var(--radius-sm);
}

/* ===== 社交入口（C18 去胶囊、去数字：纯文字留白分隔） ===== */
.statrow {
    display: flex;
    justify-content: space-around;
    padding: 16px 8px 0;
}
.stat { text-align: center; cursor: pointer; text-decoration: none; }
.stat span {
    display: block;
    font-size: 10.5px;
    color: var(--ink-2);
    font-weight: 400;
    margin-top: 2px;
}

/* ===== 三功能入口（C21：纵向，图标 30px 在上、文字在下，间距加大） ===== */
.fnrow {
    display: flex;
    gap: 14px;
    margin-top: 16px;
}
.fn-item {
    flex: 1;
    background: var(--paper);
    border-radius: var(--radius);
    box-shadow: var(--shadow-soft);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 7px;
    padding: 14px 0;
    font-size: 11px;
    color: var(--ink);
    font-weight: 600;
    text-decoration: none;
}

/* ===== 列表行入口组：1px 细线分隔，右箭头 ===== */
.rowlist { margin-top: 16px; padding: 2px 14px; }
.row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 13px 2px;
    cursor: pointer;
    text-decoration: none;
    color: var(--ink);
}
.list-hairline { border: none; border-top: 1px solid var(--line); margin: 0; }
.rico {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: var(--brand-light);
    color: var(--ink-3);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
}
/* 宠物入口福宝贴纸（替代爪印 SVG） */
.rico-img { width: 22px; height: 22px; object-fit: contain; }
.row-name { flex: 1; font-size: 13px; font-weight: 600; }
.row:hover .row-name { color: var(--brand-dark); }
.arrow { color: var(--ink-2); flex-shrink: 0; }

.foot-hint { text-align: center; font-size: 10px; color: var(--ink-2); margin-top: 20px; }

/* ===== 编辑资料：预设九宫格 + 自定义上传 ===== */
.av-wrap { width: 100%; }
.av-picker { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px; }
.av-opt {
    padding: 2px; border: 2px solid transparent; background: none;
    border-radius: 50%; cursor: pointer; line-height: 0; transition: transform .1s ease;
}
.av-opt:hover { transform: translateY(-2px); }
.av-opt.on { border-color: var(--brand); background: var(--brand-light); }
/* 自定义上传占满表单内容行：避免窄容器内文字竖排溢出重叠 */
.av-custom { width: 100%; }

/* ===== 福大认证信息卡 ===== */
.fzu-info { display: flex; align-items: flex-start; gap: 16px; padding: 16px; box-shadow: none; background: var(--page); }
.fzu-badge-big {
    font-size: 13px; padding: 3px 12px; font-weight: 700;
    border-radius: var(--radius-sm); background: var(--brand-light); color: var(--ink-3);
    flex-shrink: 0;
}
.fzu-rows { flex: 1; display: flex; flex-direction: column; gap: 8px; }
.fzu-rows div { display: flex; align-items: center; gap: 12px; font-size: 13px; }
.fzu-rows i { font-style: normal; color: var(--ink-2); width: 60px; flex-shrink: 0; }
.fzu-rows b { font-weight: 700; }

/* ===== 桌面适配（≥769）：头卡横向舒展 + 统计/宫格/列表放大 =====
   视觉对齐：关注/粉丝行、三功能宫格、列表入口组共用同一套 3 列栅格
   （repeat(3, 1fr) + gap 20px），三行左边缘逐列对齐、内容按列中心对齐 */
@media (min-width: 769px) {
    /* 头卡保持现状（横向布局天然适配宽屏），仅加大顶部呼吸感 */
    .me-head { padding: 16px 0 0; }
    /* 社交入口：改用与下方一致的 3 列栅格，「关注」对齐「收藏」列、「粉丝」对齐「足迹」列 */
    .statrow {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 4px 20px;
        justify-content: stretch;
        justify-items: center;
        padding: 20px 0 0;
    }
    /* 功能入口（fnrow 横向三项）桌面改同款栅格，列宽与列表入口组逐列对齐 */
    .fnrow {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 4px 20px;
        margin-top: 22px;
    }
    .fn-item { padding: 18px 0; font-size: 12px; }
    /* 列表行入口组：桌面由纵向列表改 3 列网格；行间 hr 分隔线分列后失去意义，隐藏改用网格留白。
       横向内边距下移到行内，使三行（关注/粉丝、功能宫格、列表入口）列边界完全一致 */
    .rowlist { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px 20px; padding: 12px 0; margin-top: 22px; }
    .rowlist .list-hairline { display: none; }
    /* 网格内每行加淡金悬浮反馈，强化可点区 */
    .row { border-radius: var(--radius-sm); padding: 12px 14px; transition: background .12s ease; }
    .row:hover { background: #FBF3DC; }
    /* 底部签名与列表卡拉开呼吸感 */
    .foot-hint { margin-top: 26px; }
}

/* ===== 桌面适配（≥1200）：超宽档进一步舒展 ===== */
@media (min-width: 1200px) {
    /* 超宽屏：列表行入口列距加大，网格更疏朗 */
    .rowlist { gap: 6px 26px; }
}
</style>
