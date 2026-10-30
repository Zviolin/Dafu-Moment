<template>
    <div class="page-wrap va">
        <!-- 顶部返回头 -->
        <div class="topbar">
            <span class="icircle back" aria-label="返回" @click="go_back">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7" /></svg>
            </span>
            <b class="t-title">我是档口</b>
            <i class="t-hold"></i>
        </div>

        <!-- 说明卡 -->
        <div class="card intro fade-up">
            <b>档口入驻申请</b>
            <p>提交真实档口信息后由平台人工审核；审核通过后运营同学会联系你开通档口后台，用于维护菜品、发布档口动态与回复点评。</p>
        </div>

        <!-- 入驻申请表 -->
        <div class="card form-card fade-up">
            <label class="f-label">档口名称<i> · 必填</i></label>
            <el-input v-model="form.name" placeholder="例：京元食堂三楼 · 老陈麻辣烫" maxlength="64" />

            <label class="f-label">联系人<i> · 必填</i></label>
            <el-input v-model="form.contact" placeholder="填写负责人姓名" maxlength="32" />

            <label class="f-label">手机号<i> · 必填</i></label>
            <el-input v-model="form.phone" placeholder="用于审核结果通知" maxlength="11" />

            <label class="f-label">所在位置<i> · 选填</i></label>
            <el-input v-model="form.position" placeholder="例：旗山校区 · 京元食堂三楼 12 号窗口" maxlength="128" />

            <label class="f-label">经营简介<i> · 选填</i></label>
            <el-input v-model="form.intro" type="textarea" :rows="3" maxlength="300" show-word-limit
                placeholder="主营品类、营业时间、招牌菜等，便于运营快速了解" />
        </div>

        <!-- 我的入驻申请记录 -->
        <div class="rec-head">
            <b>我的入驻申请</b><span>{{ records.length }} 条</span>
        </div>
        <div v-for="r in records" :key="r.id" class="card rec fade-up">
            <div class="rec-info">
                <b>{{ r.name }}</b>
                <span>提交于 {{ r.time }}<template v-if="r.comment"> · 审核意见：{{ r.comment }}</template></span>
            </div>
            <span class="state" :class="`s${r.status}`">{{ STATE_TEXT[r.status] }}</span>
        </div>
        <p v-if="records.length === 0" class="rec-tip">还没有提交过入驻申请。</p>

        <div class="hold"></div>

        <!-- 底部固定提交条 -->
        <div class="subbar">
            <button class="sub-btn" :disabled="submitting" @click="submit_form">
                {{ submitting ? '提交中…' : '提交审核' }}
            </button>
        </div>
    </div>
</template>

<script setup>
/**
 * 档口入驻申请页（/vendor/apply）：
 * 真实提交到 point_submit（submit_type=3，payload 留痕），后台审核后回写状态；
 * 页面下方展示本人入驻申请记录与审核意见，避免「我是档口」按钮无落点。
 */
import { ref, reactive, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { api_content } from '../api';
import { time_ago } from '../utils/format';

const router = useRouter();

/** 审核状态文案 */
const STATE_TEXT = { 0: '待审核', 1: '已通过', 2: '已驳回' };

const form = reactive({ name: '', contact: '', phone: '', position: '', intro: '' });
const submitting = ref(false);
const records = ref([]);

/**
 * 返回上一页
 */
function go_back() {
    router.back();
}

/**
 * 拉取本人档口入驻申请（过滤 submit_type=3）
 */
async function load_records() {
    try {
        const d = await api_content.my_point_submits({ page: 1, size: 50 });
        const rows = d && Array.isArray(d.list) ? d.list : (Array.isArray(d) ? d : []);
        records.value = rows
            .filter((r) => Number(r.submit_type) === 3)
            .map((r) => ({
                id: r.id,
                name: (r.payload && r.payload.name) || '档口入驻申请',
                time: time_ago(r.created_at),
                status: Number(r.audit_status) || 0,
                comment: r.audit_comment || '',
            }));
    } catch {
        // 接口不可用时保持空列表，不阻塞表单提交
    }
}

/**
 * 校验并提交入驻申请
 */
async function submit_form() {
    if (!form.name.trim()) return ElMessage.warning('请填写档口名称');
    if (!form.contact.trim()) return ElMessage.warning('请填写联系人');
    if (!/^1\d{10}$/.test(form.phone.trim())) return ElMessage.warning('请填写 11 位手机号');
    submitting.value = true;
    try {
        await api_content.submit_point({
            submitType: 3,
            payload: {
                name: form.name.trim(),
                contact: form.contact.trim(),
                phone: form.phone.trim(),
                position: form.position.trim(),
                intro: form.intro.trim(),
            },
        });
        ElMessage.success('已提交，审核结果将通过通知中心告知');
        form.name = '';
        form.contact = '';
        form.phone = '';
        form.position = '';
        form.intro = '';
        await load_records();
    } catch { /* 拦截器已提示错误 */ } finally {
        submitting.value = false;
    }
}

onMounted(load_records);
</script>

<style scoped>
/* 顶部返回头 */
.topbar { display: flex; align-items: center; justify-content: space-between; padding-top: 12px; min-height: 44px; }
.t-title { font-size: 15px; font-weight: 700; letter-spacing: 0.5px; }
.t-hold { width: 40px; flex-shrink: 0; }
.icircle.back { color: var(--ink); }

/* 说明卡 */
.intro { margin-top: 12px; padding: 14px; }
.intro b { font-size: 13.5px; font-weight: 800; }
.intro p { margin: 8px 0 0; font-size: 12px; line-height: 1.8; color: #5C4A2E; }

/* 表单 */
.form-card { margin-top: 12px; padding: 14px; }
.f-label { display: block; font-size: 12px; font-weight: 700; margin: 12px 0 7px; }
.f-label:first-child { margin-top: 0; }
.f-label i { font-style: normal; font-size: 10px; color: var(--bad); font-weight: 400; }

/* 申请记录 */
.rec-head { display: flex; align-items: baseline; justify-content: space-between; margin: 18px 2px 8px; }
.rec-head b { font-size: 13px; font-weight: 800; }
.rec-head span { font-size: 10.5px; color: var(--ink-2); }
.rec { margin-top: 8px; padding: 12px 14px; display: flex; align-items: center; gap: 10px; }
.rec-info { flex: 1; min-width: 0; }
.rec-info b { display: block; font-size: 12.5px; font-weight: 700; }
.rec-info span { display: block; font-size: 10.5px; color: var(--ink-2); margin-top: 3px; line-height: 1.6; }
.state {
    flex-shrink: 0; font-size: 10px; font-weight: 700;
    padding: 2px 8px; border-radius: var(--radius-sm);
    background: #F1E7D0; color: var(--ink-2);
}
.state.s1 { background: #E8F3E4; color: #3E7C3A; }
.state.s2 { background: #fdecec; color: var(--bad); }
.rec-tip { text-align: center; font-size: 11px; color: var(--ink-2); padding: 16px 0; }

/* 底部固定提交条 */
.hold { height: 84px; }
.subbar {
    position: fixed; left: 50%; transform: translateX(-50%);
    bottom: calc(72px + env(safe-area-inset-bottom));
    width: 100%; max-width: 480px;
    padding: 9px 14px; background: var(--paper);
    border-top: 1px solid var(--line);
    z-index: 60;
}
.sub-btn {
    width: 100%; height: 44px; border: none; border-radius: var(--radius-sm);
    background: var(--brand); color: #fff; font-size: 14px; font-weight: 800;
    cursor: pointer;
}
.sub-btn:disabled { opacity: .6; cursor: default; }
</style>
