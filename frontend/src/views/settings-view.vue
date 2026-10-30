<template>
    <div class="page-wrap st">
        <!-- 顶部返回头 -->
        <div class="topbar">
            <span class="icircle back" aria-label="返回" @click="go_back">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7" /></svg>
            </span>
            <b class="t-title">设置和隐私</b>
            <i class="t-hold"></i>
        </div>

        <!-- ① 通用 -->
        <div class="card group fade-up">
            <div class="gt">通用</div>
            <div class="row static">
                <span class="rico" v-html="ICONS.bell"></span>
                <span class="rn">系统通知</span>
                <el-switch v-model="notify_on" @change="save_notify" />
            </div>
            <div class="row" @click="clear_cache">
                <span class="rico" v-html="ICONS.refresh"></span>
                <span class="rn">清理缓存</span><span class="arr">›</span>
            </div>
        </div>

        <!-- ② 隐私（需求 5.1.1(2)：授权可查看、可撤回） -->
        <div class="card group fade-up">
            <div class="gt">隐私</div>
            <div class="row" @click="open_grant('diet')">
                <span class="rico" v-html="ICONS.box"></span>
                <span class="rn">饮食档案授权</span>
                <span class="grant-tag" :class="{ off: !grants.diet }">{{ grants.diet ? '已授权' : '未授权' }}</span>
                <span class="arr">›</span>
            </div>
            <div class="row" @click="open_grant('behavior')">
                <span class="rico" v-html="ICONS.box"></span>
                <span class="rn">行为数据授权</span>
                <span class="grant-tag" :class="{ off: !grants.behavior }">{{ grants.behavior ? '已授权' : '未授权' }}</span>
                <span class="arr">›</span>
            </div>
            <div class="row" @click="export_data">
                <span class="rico" v-html="ICONS.download"></span>
                <span class="rn">导出我的数据</span><span class="arr">›</span>
            </div>
            <div class="row" @click="delete_extra">
                <span class="rico" v-html="ICONS.trash"></span>
                <span class="rn">删除非必要数据</span><span class="arr">›</span>
            </div>
        </div>

        <!-- ④ 关于 -->
        <div class="card group fade-up">
            <div class="gt">关于</div>
            <div class="row" @click="router.push('/cobuild')">
                <span class="rico" v-html="ICONS.doc"></span>
                <span class="rn">内容共建规范</span><span class="arr">›</span>
            </div>
            <div class="row" @click="acct_dlg_on = true">
                <span class="rico" v-html="ICONS.lock"></span>
                <span class="rn">账号与安全</span><span class="arr">›</span>
            </div>
            <div class="row" @click="router.push('/vendor/apply')">
                <span class="rico" v-html="ICONS.medal"></span>
                <span class="rn">我是档口</span><span class="arr">›</span>
            </div>
            <div class="row" @click="open_terms">
                <span class="rico" v-html="ICONS.doc"></span>
                <span class="rn">协议与条款</span><span class="arr">›</span>
            </div>
            <div class="row" @click="about_app">
                <span class="rico" v-html="ICONS.info"></span>
                <span class="rn">关于大福食刻</span><span class="arr">›</span>
            </div>
        </div>

        <!-- ⑤ 退出登录（确认后清 token → /login） -->
        <button class="logout fade-up" @click="do_logout">退出登录</button>
        <p class="ver">大福食刻 v1.0.0 · 福州大学校园点评</p>

        <!-- 账号与安全：从设置进入后直达具体操作，而不是跳到「我的」首页 -->
        <el-dialog v-model="acct_dlg_on" title="账号与安全" width="320px" append-to-body>
            <div class="acct-row" @click="go_account('pwd')">
                <span>修改密码</span><span class="arr">›</span>
            </div>
            <div class="acct-row" @click="go_account('fzu')">
                <span>福大认证</span><span class="arr">›</span>
            </div>
            <!-- 统一身份口令（r80）：学号登录使用，与本地账号密码相互独立 -->
            <div class="acct-row" @click="go_account('fzu-pwd')">
                <span>统一身份口令</span><span class="arr">›</span>
            </div>
        </el-dialog>

        <!-- 授权管理层弹窗：用途说明 + 撤回 / 重新授权 -->
        <el-dialog v-model="grant_dlg_on" :title="grant_cfg.title" width="320px" append-to-body>
            <div class="grant-body">
                <p class="gb-use">{{ grant_cfg.use }}</p>
                <div class="gb-scope">
                    <b>收集范围</b>
                    <span>{{ grant_cfg.scope }}</span>
                </div>
                <p class="gb-note">撤回后相关功能将退化为通用推荐，历史数据 30 日内删除。</p>
            </div>
            <template #footer>
                <el-button v-if="grants[grant_key]" type="danger" plain @click="revoke_grant">撤回授权</el-button>
                <el-button v-else type="primary" @click="grant_again">重新授权</el-button>
            </template>
        </el-dialog>
    </div>
</template>

<script setup>
/**
 * 设置与隐私页（对齐 P27 + C22）：
 * 分组列表（互动与内容 / 通用 / 隐私 / 关于 / 退出登录），
 * 行首图标按 G4 全部自绘 SVG（.rico 28px 淡金圆底），行间 1px 细线分隔。
 * 隐私组落实需求 5.1.1(2)：饮食档案 / 行为数据授权（用途说明 + 撤回）、
 * 导出我的数据、删除非必要数据（二次确认）。
 * 设置项与授权态 mock + localStorage（TODO: 待后端接口）
 */
import { ref, reactive, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { useAuthStore } from '../stores/auth';
import { load_json, save_json } from '../utils/storage.js';

const router = useRouter();
const auth = useAuthStore();

/* ---------------- 自绘 SVG 图标表（G4：viewBox 24、stroke 1.7、圆角线帽） ---------------- */

const ICONS = {
    warn: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4L21 19H3z"/><path d="M12 10v4M12 16.5v.5"/></svg>',
    bell: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M6 16v-5a6 6 0 0112 0v5l1.5 2.5h-15z"/><path d="M10 21a2 2 0 004 0"/></svg>',
    refresh: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12a8 8 0 11-2.3-5.6"/><path d="M20 4v4h-4"/></svg>',
    box: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="4" width="17" height="4.5" rx="1"/><path d="M5 8.5V19a1 1 0 001 1h12a1 1 0 001-1V8.5M10 12.5h4"/></svg>',
    download: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11"/><path d="M7.5 11L12 15.5 16.5 11"/><path d="M5 19.5h14"/></svg>',
    trash: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 7h15"/><path d="M9.5 7V4.5h5V7"/><path d="M6.5 7l1 13h9l1-13"/><path d="M10.5 11v5M13.5 11v5"/></svg>',
    doc: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M7 3h7l4 4v13a1 1 0 01-1 1H7a1 1 0 01-1-1V4a1 1 0 011-1z"/><path d="M14 3v4h4"/></svg>',
    lock: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="10.5" width="14" height="9.5" rx="2"/><path d="M8 10.5V7.5a4 4 0 018 0v3"/></svg>',
    medal: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="9" r="5"/><path d="M9 13.5L7.5 21l4.5-2.5L16.5 21 15 13.5"/></svg>',
    info: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 8v.5"/></svg>',
};

/* ---------------- 授权配置（需求 5.1.1(2)） ---------------- */

const GRANT_CFG = {
    diet: {
        title: '饮食档案授权',
        use: '用于生成你的口味画像、AI 推荐与饮食计划，让推荐更懂你；数据仅在本应用内使用，不会提供给第三方。',
        scope: '口味偏好、忌口与过敏原、健康目标',
    },
    behavior: {
        title: '行为数据授权',
        use: '用于优化搜索排序、热门榜单与个性化推荐；仅保留匿名统计所需的最小字段，不关联具体点评内容。',
        scope: '浏览、搜索、点赞等点击行为（匿名）',
    },
};



/* ---------------- 状态 ---------------- */

const notify_on = ref(true); // 系统通知开关
const grants = reactive({ diet: true, behavior: true }); // 授权态（需求 5.1.1(2)）
const grant_dlg_on = ref(false); // 授权管理弹窗
const grant_key = ref('diet'); // 当前操作的授权项
const acct_dlg_on = ref(false); // 账号与安全弹窗

// 当前授权项的文案配置（随弹窗目标切换）
const grant_cfg = computed(() => GRANT_CFG[grant_key.value] || {});

/* ---------------- 生命周期 ---------------- */

onMounted(() => {
    // 恢复设置与授权态（缺省全开）
    const st = load_json('dafu_settings', {});
    if (st.notify_on !== undefined) notify_on.value = !!st.notify_on;
    const g = load_json('dafu_grants', {});
    if (g.diet !== undefined) grants.diet = !!g.diet;
    if (g.behavior !== undefined) grants.behavior = !!g.behavior;
});

/* ---------------- 交互 ---------------- */

/**
 * 返回上一页
 */
function go_back() {
    router.back();
}

/**
 * 保存系统通知开关
 */
function save_notify() {
    save_json('dafu_settings', { notify_on: notify_on.value });
}

/**
 * 清理缓存：仅清体验类临时数据（含草稿），不动登录态与授权设置
 */
function clear_cache() {
    ElMessageBox.confirm('将清理本地缓存的草稿与临时记录，不会退出登录。', '清理缓存', {
        confirmButtonText: '清理', cancelButtonText: '取消', type: 'warning',
    }).then(() => {
        // 草稿键：fk_drafts（草稿箱）/ fk_post_draft（发动态草稿）
        ['dafu_tasks_claim', 'dafu_grow_claim', 'dafu_cobuild_records', 'dafu_report_records', 'fk_drafts', 'fk_post_draft'].forEach((k) => localStorage.removeItem(k));
        ElMessage.success('缓存已清理');
    }).catch(() => {});
}

/**
 * 打开授权管理层：用途说明 + 撤回 / 重新授权
 * @param {string} key 授权项（diet / behavior）
 */
function open_grant(key) {
    grant_key.value = key;
    grant_dlg_on.value = true;
}

/**
 * 撤回授权（二次确认后落库，行尾签变「未授权」）
 */
function revoke_grant() {
    const name = GRANT_CFG[grant_key.value].title;
    ElMessageBox.confirm(`撤回后将停止收集并删除相关数据，确定撤回「${name}」吗？`, '撤回授权', {
        confirmButtonText: '确定撤回', cancelButtonText: '再想想', type: 'warning',
    }).then(() => {
        grants[grant_key.value] = false;
        save_json('dafu_grants', { ...grants });
        grant_dlg_on.value = false;
        ElMessage.success('已撤回授权，相关推荐能力将不可用');
    }).catch(() => {});
}

/**
 * 重新授权
 */
function grant_again() {
    grants[grant_key.value] = true;
    save_json('dafu_grants', { ...grants });
    grant_dlg_on.value = false;
    ElMessage.success('授权成功，推荐体验已恢复');
}

/**
 * 导出我的数据：明示导出范围后模拟生成
 */
function export_data() {
    ElMessageBox.confirm('将导出你的手账、画像与非必要行为数据，文件生成后可下载查看。', '导出我的数据', {
        confirmButtonText: '开始导出', cancelButtonText: '取消', type: 'info',
    }).then(() => {
        ElMessage.success('导出任务已生成，稍后可在消息中下载');
    }).catch(() => {});
}

/**
 * 删除非必要数据：二次确认后模拟清理
 */
function delete_extra() {
    ElMessageBox.confirm('将删除浏览痕迹、临时缓存等非必要数据，点评与收藏不受影响，且不可恢复。', '删除非必要数据', {
        confirmButtonText: '确定删除', cancelButtonText: '取消', type: 'warning',
    }).then(() => {
        ElMessage.success('非必要数据已删除');
    }).catch(() => {});
}

/**
 * 协议与条款：集中展示用户协议与隐私政策要点
 */
function open_terms() {
    ElMessageBox.alert(
        '使用大福食刻即表示同意《用户协议》与《隐私政策》：平台仅收集提供点评、推荐与打卡服务所必需的数据；'
        + '饮食档案、行为数据等敏感信息须经你授权后使用，可随时在「隐私」分组中撤回；'
        + '点评内容需真实合规，违规内容将被下架处理。',
        '协议与条款', { confirmButtonText: '我知道了' }
    ).catch(() => {});
}

/**
 * 账号与安全：跳转到「我的」并自动打开对应弹窗（修改密码 / 福大认证 / 统一身份口令）
 * @param {string} kind - pwd | fzu | fzu-pwd
 */
function go_account(kind) {
    acct_dlg_on.value = false;
    router.push({ path: '/me', query: { dialog: kind } });
}

/**
 * 关于大福食刻：版本信息
 */
function about_app() {
    ElMessageBox.alert('大福食刻 v1.0.0 —— 福州大学校园点评社区，发现身边的好味道。', '关于大福食刻', {
        confirmButtonText: '关闭',
    }).catch(() => {});
}

/**
 * 退出登录：二次确认后清 token → /login
 */
function do_logout() {
    ElMessageBox.confirm('退出后将转为游客态，可继续浏览公开内容。', '退出登录', {
        confirmButtonText: '退出', cancelButtonText: '取消', type: 'warning',
    }).then(() => {
        auth.logout();
        router.push('/login');
    }).catch(() => {});
}
</script>

<style scoped>
/* 顶部返回头 */
.topbar { display: flex; align-items: center; justify-content: space-between; padding-top: 12px; min-height: 44px; }
.t-title { font-size: 15px; font-weight: 700; letter-spacing: 0.5px; }
.t-hold { width: 40px; flex-shrink: 0; }
.icircle.back { color: var(--ink); }

/* 分组卡：组间留白，行间 1px 细线 */
.group { margin-top: 12px; padding: 2px 14px; }
.group .gt { font-size: 10px; color: var(--ink-2); padding: 10px 0 2px; }
.row { display: flex; align-items: center; gap: 10px; padding: 13px 0; cursor: pointer; }
.row + .row { border-top: 1px solid var(--line); }
/* 无点击行为的行（如系统通知开关）：取消指针手势，避免假可点 */
.row.static { cursor: default; }

/* 行首圆底图标：28px 淡金圆底 + 自绘 SVG（C22） */
.rico {
    width: 28px; height: 28px; border-radius: 50%;
    background: #FBF0D8; color: var(--ink-3);
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0;
}
.row .rn { font-size: 12.5px; font-weight: 600; flex: 1; }
.row .arr { color: #D8CBB0; font-size: 13px; }

/* 账号与安全弹窗操作行 */
.acct-row {
    display: flex; align-items: center; justify-content: space-between;
    padding: 14px 2px; font-size: 13px; font-weight: 600; cursor: pointer;
}
.acct-row + .acct-row { border-top: 1px solid var(--line); }
.acct-row .arr { color: #D8CBB0; font-size: 13px; }

/* 授权状态签 */
.grant-tag {
    font-size: 10px; color: #3E7C3A; background: #E8F3E4;
    padding: 2px 8px; border-radius: var(--radius-sm); font-weight: 700; flex-shrink: 0;
}
.grant-tag.off { color: var(--ink-2); background: #F1E7D0; }

/* 退出登录：红字行（淡红底、无框、微圆角） */
.logout {
    display: block; width: 100%; height: 48px; margin-top: 24px;
    background: #fdecec; color: var(--bad);
    border: none; border-radius: var(--radius-sm);
    font-size: 14px; font-weight: 800; cursor: pointer;
    transition: background .12s ease;
}
.logout:active { transform: translateY(1px); }

/* 版本行 */
.ver { text-align: center; font-size: 9.5px; color: var(--ink-2); margin: 14px 0 0; }

/* 授权弹窗内容 */
.grant-body .gb-use { font-size: 12px; color: #5C4A2E; line-height: 1.8; margin: 0 0 12px; }
.grant-body .gb-scope { background: var(--brand-light); border-radius: var(--radius-sm); padding: 10px 12px; }
.grant-body .gb-scope b { display: block; font-size: 11px; color: var(--ink-3); }
.grant-body .gb-scope span { display: block; font-size: 11.5px; color: #5C4A2E; margin-top: 4px; }
.grant-body .gb-note { font-size: 10px; color: var(--ink-2); line-height: 1.7; margin: 12px 0 0; }

/* ===== 桌面适配（≥769）===== */
@media (min-width: 769px) {
    /* 桌面：设置列收窄至 680px 并保持居中（分组行为保持单列列表形态） */
    .st { max-width: 680px; }
}
</style>
