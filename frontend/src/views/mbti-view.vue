<template>
    <div class="page-wrap mbti-page">
        <!-- 顶部标题栏：返回 + 页名 -->
        <div class="titlebar">
            <span class="icircle back" role="button" aria-label="返回" @click="go_back">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3A2E1A" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>
            </span>
            <b class="tb-title">测一测 饭BTI</b>
        </div>

        <!-- ===== 未测：答题态 ===== -->
        <template v-if="!result">
            <!-- 头卡：功能插画 + 进度条 -->
            <div class="card head-card fade-up">
                <img class="head-ill" src="/assets/icons/ill-mbti.png" alt="饭MBTI" />
                <b class="head-title">答题生成你的口味画像</b>
                <p class="head-sub">12 道小题，从甜辣 / 浓淡 / 探索 / 预算 4 个维度，生成 16 型「饭BTI」口味画像</p>
                <div class="bar"><i :style="{ width: progress + '%' }"></i></div>
                <span class="bar-label">{{ answered_count }}/12 已答 · 至少答完 8 题生成</span>
            </div>

            <!-- 题目卡：辣度 / 口味 / 场景 / 预算 / 排队 -->
            <div v-for="(q, qi) in QUESTIONS" :key="q.key" class="card q-card fade-up" :style="{ animationDelay: qi * 0.04 + 's' }">
                <b class="q-title">{{ qi + 1 }}. {{ q.title }}</b>
                <div class="chips">
                    <span
                        v-for="(opt, oi) in q.options" :key="opt.label"
                        class="pchip" :class="{ on: answers[q.key] === oi }"
                        @click="pick(q.key, oi)"
                    >{{ opt.label }}</span>
                </div>
            </div>

            <div class="ops">
                <button class="btn-primary gen-btn" :disabled="generating" @click="generate">{{ generating ? '生成中…' : '生成我的饭BTI' }}</button>
            </div>
            <p v-if="hint_lack" class="lack-tip">画像数据还不够，再答 {{ 8 - answered_count }} 题就能生成啦~</p>
        </template>

        <!-- ===== 已测：结果态（同时承担「口味画像」输出） ===== -->
        <template v-else>
            <!-- 口味人格大卡（对齐 P17 结果卡） -->
            <div class="card result-card fade-up">
                <img class="res-img" :src="result.img" :alt="`${result.code} ${result.name}`" />
                <div class="res-cap">我的口味人格是</div>
                <div class="res-name">{{ result.name }}</div>
                <span class="tag res-code">{{ result.code }} · {{ result.sub }}</span>
                <p class="res-desc">{{ result.desc }}</p>
            </div>

            <!-- 五维口味画像（辣度/口味风格/消费倾向/常见场景/排队接受度） -->
            <div class="card trait-card fade-up" style="animation-delay:.06s">
                <b class="card-title">口味画像</b>
                <div v-for="t in result.traits" :key="t.label" class="trow">
                    <span class="tlabel">{{ t.label }}</span>
                    <span class="stars">
                        <svg v-for="n in 5" :key="n" viewBox="0 0 24 24" :fill="n <= t.stars ? '#D89A2A' : 'none'" :stroke="n <= t.stars ? 'none' : '#D8CBB0'" stroke-width="1.6"><path d="M12 2.6l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.5l-5.9 3.1 1.2-6.5L2.5 9.5l6.6-.9z"/></svg>
                    </span>
                    <span class="tval">{{ t.text }}</span>
                </div>
            </div>

            <!-- 操作：分享海报 / 重新测试 / 删除画像 -->
            <div class="ops fade-up" style="animation-delay:.12s">
                <button class="btn-primary op-main" @click="share_open = true">分享海报</button>
                <button class="btn-ghost" @click="retest">重新测试</button>
                <button class="btn-ghost danger" @click="remove_profile">删除画像</button>
            </div>
        </template>

        <!-- 分享海报弹窗：简洁分享卡（插画 + 类型名），可复制文案 / 保存图片 -->
        <el-dialog v-model="share_open" title="分享我的饭BTI" width="320px">
            <div v-if="result" class="poster">
                <span class="poster-brand">大福食刻 · 饭MBTI</span>
                <img class="poster-img" :src="result.img" :alt="result.name" />
                <b class="poster-name">{{ result.name }}</b>
                <span class="tag">{{ result.code }} · {{ result.sub }}</span>
                <p class="poster-line">我在大福食刻测出了饭BTI：{{ result.code }} {{ result.name }}</p>
                <p class="poster-url">{{ share_url }}</p>
            </div>
            <template #footer>
                <div class="share-ops">
                    <el-button @click="copy_share_text">复制文案</el-button>
                    <el-button type="primary" @click="save_poster">保存图片</el-button>
                </div>
            </template>
        </el-dialog>

        <!-- 合规声明（AC24；画像由本地问答规则即时计算，如实说明仅作娱乐参考） -->
        <p class="compliance">以上内容仅供参考，不替代专业医生、营养师的医疗诊断与营养方案。<br>画像由 4 维问答规则生成，仅作娱乐参考。</p>
    </div>
</template>

<script setup>
/**
 * 测一测 饭BTI（r78 修正）：
 * 按 4 个正交维度出 12 道题（每维 3 题）：
 *   S 甜食 / H 辣口；M 清淡 / R 重口；A 爱探索 / C 守旧；E 重性价比 / L 随心。
 * 每维取多数票生成 4 字母饭BTI 代码（如 SMAE），再映射到 16 型插画/昵称；
 * 结果包含 4 维画像、分享海报与可点击的测试网址，不再用 5 题硬套 ESFJ 等 MBTI 代码。
 */
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';

const router = useRouter();
const STORAGE_KEY = 'dafu_mbti';
const MIN_ANSWER = 8;

// 4 维定义：第一项为默认极（平票时取默认）
const DIMENSIONS = [
    { key: 'taste', poles: ['S', 'H'], labels: { S: '甜口', H: '辣口' }, name: '甜辣倾向' },
    { key: 'rich', poles: ['M', 'R'], labels: { M: '清淡', R: '重口' }, name: '浓淡偏好' },
    { key: 'explore', poles: ['A', 'C'], labels: { A: '爱探索', C: '守旧' }, name: '探索指数' },
    { key: 'budget', poles: ['E', 'L'], labels: { E: '重性价比', L: '随心' }, name: '消费风格' },
];

// 16 型档案：代码 → 插画/昵称（素材沿用 /assets/mbti）
const TYPE_BY_CODE = {
    HMCE: { name: '辣爽探险家', sub: '重辣爱好者', img: '/assets/mbti/03_ESTJ_辣爽探险家.png', desc: '无辣不欢，微辣在你这里等于没放，重口也拦不住你。' },
    HMCL: { name: '工程专家', sub: '干饭计划通', img: '/assets/mbti/06_ENTJ_工程专家.png', desc: '辣度、预算、排队时间全部提前算好，效率与美味兼得。' },
    HMAE: { name: '派对星光', sub: '聚餐气氛组', img: '/assets/mbti/04_ESFP_派对星光.png', desc: '无辣不欢又爱尝鲜，干饭必须呼朋引伴才热闹。' },
    HMAL: { name: '墨镜飞行者', sub: '说走就走型', img: '/assets/mbti/11_ESTP_墨镜飞行者.png', desc: '听说哪家辣得够劲就立刻出发，绝不内耗。' },
    HRCE: { name: '皇冠星星', sub: '效率干饭人', img: '/assets/mbti/14_INTJ_皇冠星星.png', desc: '重口也要讲究性价比，出餐速度和口味都在评分表里。' },
    HRCL: { name: '牛仔品鉴官', sub: '老字号忠实粉', img: '/assets/mbti/10_ISTJ_牛仔品鉴官.png', desc: '认准那几家重口老店，十年如一日地信任。' },
    HRAE: { name: '船长认证官', sub: '隐藏菜单猎人', img: '/assets/mbti/12_ENTP_船长认证官.png', desc: '专攻菜单上没有的重口隐藏吃法，越辣越兴奋。' },
    HRAL: { name: '好奇美食家', sub: '万物皆可试', img: '/assets/mbti/09_ENFP_好奇美食家.png', desc: '没吃过的重口味都想来一口，冒险精神满分。' },
    SMCE: { name: '清甜守护者', sub: '温柔甜品挂', img: '/assets/mbti/02_ISFJ_清甜守护者.png', desc: '胃的角落永远留给一份温柔清甜的甜品。' },
    SMCL: { name: '爱心厨师', sub: '投喂型选手', img: '/assets/mbti/15_ESFJ_爱心厨师.png', desc: '最大的快乐是看朋友吃光你推荐的清淡小菜。' },
    SMAE: { name: '花艺甜品', sub: '颜值至上者', img: '/assets/mbti/08_ISFP_花艺甜品.png', desc: '先拍照后开动，清甜又好看的甜品才是本命。' },
    SMAL: { name: '梦境云朵', sub: '氛围感食客', img: '/assets/mbti/07_INFP_梦境云朵.png', desc: '吃饭吃的是心情，窗边座位和一块小蛋糕缺一不可。' },
    SRCE: { name: '新菜灵感', sub: '新品首发官', img: '/assets/mbti/05_ENFJ_新菜灵感.png', desc: '档口一上新就冲，甜口新品必须第一个尝。' },
    SRCL: { name: '紫斗篷云朵', sub: '深夜食堂党', img: '/assets/mbti/13_INFJ_紫斗篷云朵.png', desc: '夜宵时段的灵魂食客，一份浓郁甜品越晚越清醒。' },
    SRAE: { name: '贝雷帽菜单', sub: '极简点单流', img: '/assets/mbti/16_ISTP_贝雷帽菜单.png', desc: '点单不超过三十秒，招牌甜口直接拿下。' },
    SRAL: { name: '分析家', sub: '冷静拆解派', img: '/assets/mbti/01_INTP_分析家.png', desc: '点单前先看遍测评，配料表都研究明白了。' },
};

// 12 道题：每维 3 题，每题两个选项分别命中维度两极
const QUESTIONS = [
    { key: 'q1', dim: 'taste', title: '心情低落时，你更想吃什么？', options: [{ label: '一份甜甜的蛋糕 / 糖水', pole: 'S' }, { label: '一碗麻辣烫 / 火锅', pole: 'H' }] },
    { key: 'q2', dim: 'taste', title: '早餐摊前你会选？', options: [{ label: '豆浆油条 / 芋泥包', pole: 'S' }, { label: '胡辣汤 / 辣汤面', pole: 'H' }] },
    { key: 'q3', dim: 'taste', title: '夜宵时间，你伸手拿的是？', options: [{ label: '双皮奶 / 红豆汤', pole: 'S' }, { label: '烤串加辣 / 小龙虾', pole: 'H' }] },
    { key: 'q4', dim: 'rich', title: '同一道菜，你偏爱哪种做法？', options: [{ label: '清蒸 / 白灼，吃本味', pole: 'M' }, { label: '红烧 / 干锅，要浓香', pole: 'R' }] },
    { key: 'q5', dim: 'rich', title: '点汤粉时，你的默认选项是？', options: [{ label: '清汤少油', pole: 'M' }, { label: '浓汤加料', pole: 'R' }] },
    { key: 'q6', dim: 'rich', title: '调味台上你会？', options: [{ label: '只加一点盐和葱', pole: 'M' }, { label: '辣油、酱料都来一勺', pole: 'R' }] },
    { key: 'q7', dim: 'explore', title: '站在没吃过的档口前，你会？', options: [{ label: '直接点招牌试试', pole: 'A' }, { label: '还是回常去的那家', pole: 'C' }] },
    { key: 'q8', dim: 'explore', title: '菜单上的「隐藏吃法」你会？', options: [{ label: '立刻问老板怎么点', pole: 'A' }, { label: '按常规点法就好', pole: 'C' }] },
    { key: 'q9', dim: 'explore', title: '新品上市时，你通常？', options: [{ label: '第一天就去尝', pole: 'A' }, { label: '等别人试过再说', pole: 'C' }] },
    { key: 'q10', dim: 'budget', title: '一顿饭的预算，你更接近？', options: [{ label: '15 元以内精打细算', pole: 'E' }, { label: '好吃就值得，价格不限', pole: 'L' }] },
    { key: 'q11', dim: 'budget', title: '点外卖时你会？', options: [{ label: '凑满减、比三家', pole: 'E' }, { label: '直接点最想吃的', pole: 'L' }] },
    { key: 'q12', dim: 'budget', title: '选店时你更看重？', options: [{ label: '性价比和份量', pole: 'E' }, { label: '环境和体验', pole: 'L' }] },
];

const answers = ref({});
const result = ref(null);
const generating = ref(false);
const hint_lack = ref(false);
const share_open = ref(false);

const answered_count = computed(() => QUESTIONS.filter((q) => answers.value[q.key] !== undefined).length);
const progress = computed(() => Math.round((answered_count.value / QUESTIONS.length) * 100));
const share_url = computed(() => `${window.location.origin}/ai/mbti`);

/**
 * 选择某题选项
 * @param {string} key
 * @param {number} idx
 */
function pick(key, idx) {
    answers.value[key] = idx;
    if (answered_count.value >= MIN_ANSWER) hint_lack.value = false;
}

/**
 * 统计每个维度的多数极
 * @returns {{code:string, counts:Object}}
 */
function calc_code() {
    let code = '';
    const counts = {};
    for (const d of DIMENSIONS) {
        let a = 0; let b = 0;
        for (const q of QUESTIONS.filter((x) => x.dim === d.key)) {
            const idx = answers.value[q.key];
            if (idx === undefined) continue;
            if (q.options[idx].pole === d.poles[0]) a += 1; else b += 1;
        }
        const pole = b > a ? d.poles[1] : d.poles[0];
        code += pole;
        counts[d.key] = { a, b, pole, total: a + b };
    }
    return { code, counts };
}

/**
 * 生成 4 维画像
 * @param {Object} counts
 * @returns {Array}
 */
function build_traits(counts) {
    return DIMENSIONS.map((d) => {
        const c = counts[d.key] || { a: 0, b: 0, pole: d.poles[0], total: 0 };
        const n = c.pole === d.poles[0] ? c.a : c.b;
        const stars = c.total ? Math.max(1, Math.min(5, 1 + Math.round((n / c.total) * 4))) : 3;
        return {
            label: d.name,
            stars,
            text: `${d.labels[c.pole]} ${n}/${c.total || 0}`,
        };
    });
}

/**
 * 生成饭BTI（至少答 8 题）
 */
function generate() {
    if (answered_count.value < MIN_ANSWER) {
        hint_lack.value = true;
        ElMessage.warning(`再答 ${MIN_ANSWER - answered_count.value} 题就能生成啦`);
        return;
    }
    generating.value = true;
    setTimeout(() => {
        const { code, counts } = calc_code();
        const t = TYPE_BY_CODE[code];
        if (!t) {
            generating.value = false;
            ElMessage.error('画像生成失败，请重试');
            return;
        }
        const sub = code.split('').map((ch, i) => DIMENSIONS[i].labels[ch]).join(' · ');
        result.value = { ...t, code, sub, traits: build_traits(counts), created_at: Date.now() };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(result.value));
        generating.value = false;
        ElMessage.success(`测出来啦：${t.name} ${code}`);
    }, 400);
}

/** 重新测试 */
function retest() {
    answers.value = {};
    result.value = null;
    hint_lack.value = false;
}

/** 删除画像 */
async function remove_profile() {
    try {
        await ElMessageBox.confirm('删除后画像与本地记录都会清空，需要重新测试。确定删除吗？', '删除口味画像', {
            confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning',
        });
    } catch { return; }
    localStorage.removeItem(STORAGE_KEY);
    result.value = null;
    answers.value = {};
    ElMessage.success('口味画像已删除');
}

/** 分享文案（带可点击测试网址） */
const share_text = computed(() => {
    if (!result.value) return '';
    return `我在大福食刻测出了饭BTI：${result.value.code} ${result.value.name}（${result.value.sub}）！你也来测测：${share_url.value}`;
});

/** 复制分享文案 */
async function copy_share_text() {
    try {
        await navigator.clipboard.writeText(share_text.value);
        ElMessage.success('文案已复制，去粘贴给同学吧');
    } catch {
        ElMessage.error('复制失败，请手动选择文字复制');
    }
}

/** 手绘圆角矩形 */
function round_rect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
}

/** canvas 合成分享海报（含测试网址） */
function draw_poster() {
    return new Promise((resolve, reject) => {
        const c = document.createElement('canvas');
        c.width = 640;
        c.height = 860;
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#FAF4E3';
        ctx.fillRect(0, 0, 640, 860);
        ctx.fillStyle = '#FFFDF5';
        round_rect(ctx, 40, 50, 560, 660, 24);
        ctx.fill();
        const img = new Image();
        img.onload = () => {
            ctx.drawImage(img, 200, 90, 240, 240);
            ctx.textAlign = 'center';
            ctx.fillStyle = '#B0A18A';
            ctx.font = '24px "PingFang SC","Microsoft YaHei",sans-serif';
            ctx.fillText('我的饭BTI是', 320, 390);
            ctx.fillStyle = '#3A2E1A';
            ctx.font = '800 50px "PingFang SC","Microsoft YaHei",sans-serif';
            ctx.fillText(result.value.name, 320, 458);
            ctx.fillStyle = '#8A6A3A';
            ctx.font = '600 26px "PingFang SC","Microsoft YaHei",sans-serif';
            ctx.fillText(`${result.value.code} · ${result.value.sub}`, 320, 510);
            ctx.fillStyle = '#B0A18A';
            ctx.font = '22px "PingFang SC","Microsoft YaHei",sans-serif';
            ctx.fillText('大福食刻 · 饭BTI', 320, 590);
            ctx.fillStyle = '#8A6A3A';
            ctx.font = '600 18px "PingFang SC","Microsoft YaHei",sans-serif';
            ctx.fillText(`来测测你的：${share_url.value}`, 320, 660);
            ctx.fillStyle = '#B0A18A';
            ctx.font = '18px "PingFang SC","Microsoft YaHei",sans-serif';
            ctx.fillText('以上内容仅供参考，不替代专业建议', 320, 800);
            resolve(c.toDataURL('image/png'));
        };
        img.onerror = reject;
        img.src = result.value.img;
    });
}

/** 保存海报 */
async function save_poster() {
    try {
        const url = await draw_poster();
        const a = document.createElement('a');
        a.href = url;
        a.download = `饭BTI_${result.value.code}.png`;
        a.click();
        ElMessage.success('海报已保存');
    } catch {
        ElMessage.error('海报生成失败，试试复制文案分享');
    }
}

/** 返回 AI 助手主页 */
function go_back() {
    router.push('/ai');
}

onMounted(() => {
    try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
        if (saved && saved.code && TYPE_BY_CODE[saved.code] && saved.traits) result.value = saved;
    } catch { /* 忽略损坏数据 */ }
});
</script>

<style scoped>
.mbti-page { padding-bottom: 8px; }

/* 顶部标题栏 */
.titlebar { height: 48px; display: flex; align-items: center; gap: 10px; margin-top: 10px; }
.tb-title { font-size: 16px; font-weight: 700; }

/* ===== 头卡：插画 + 进度条 ===== */
.head-card { text-align: center; margin-top: 6px; }
.head-ill { width: 84px; height: 84px; object-fit: contain; margin: 0 auto; }
.head-title { display: block; font-size: 15px; font-weight: 700; margin-top: 6px; }
.head-sub { margin: 5px auto 0; font-size: 11.5px; color: var(--ink-2); line-height: 1.7; font-weight: 400; max-width: 280px; }
.bar { height: 4px; border-radius: 4px; background: var(--line); overflow: hidden; margin-top: 14px; }
.bar i { display: block; height: 100%; background: linear-gradient(90deg, var(--sun), var(--star)); border-radius: 4px; transition: width .25s ease; }
.bar-label { display: block; font-size: 10px; color: var(--ink-2); margin-top: 6px; font-weight: 400; }

/* ===== 题目卡 ===== */
.q-card { margin-top: 12px; }
.q-title { display: block; font-size: 13.5px; font-weight: 700; }
.chips { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 11px; }
/* 选项 chip：微圆角 + 墨色选中（对齐 P21 chips） */
.pchip {
    font-size: 12px; padding: 6px 14px; border-radius: var(--radius-sm);
    border: 1px solid var(--line); background: var(--paper); color: var(--ink-3);
    font-weight: 600; cursor: pointer; transition: background .12s ease, color .12s ease;
}
.pchip:hover { background: #FBF3DC; }
.pchip.on { background: var(--ink); color: var(--paper); border-color: var(--ink); }

/* 生成按钮 */
.ops { display: flex; gap: 10px; margin-top: 20px; }
.ops .btn-primary, .ops .btn-ghost { flex: 1; }
.gen-btn { width: 100%; padding: 12px 18px; font-size: 14px; }
.lack-tip { text-align: center; font-size: 11.5px; color: #a06a10; margin-top: 10px; font-weight: 400; }

/* ===== 结果卡 ===== */
.result-card { text-align: center; margin-top: 6px; }
.res-img { width: 108px; height: 108px; object-fit: cover; border-radius: var(--radius); margin: 0 auto; display: block; }
.res-cap { font-size: 11px; color: var(--ink-2); margin-top: 8px; font-weight: 400; }
.res-name { font-size: 26px; font-weight: 800; letter-spacing: 2px; margin-top: 2px; }
.res-code { margin-top: 8px; }
.res-desc { margin: 8px 0 0; font-size: 11.5px; color: var(--ink-2); font-weight: 400; }

/* ===== 五维画像卡 ===== */
.trait-card { margin-top: 12px; }
.card-title { display: block; font-size: 14px; font-weight: 700; margin-bottom: 4px; }
.trow { display: flex; align-items: center; gap: 10px; padding: 9px 0; }
.trow + .trow { border-top: 1px solid var(--line); }
.tlabel { width: 74px; flex-shrink: 0; font-size: 11.5px; color: var(--ink-3); font-weight: 600; }
.stars { display: flex; gap: 3px; flex: 1; }
.stars svg { width: 14px; height: 14px; flex-shrink: 0; }
.tval { width: 108px; flex-shrink: 0; text-align: right; font-size: 11px; color: var(--ink-2); font-weight: 400; }

/* 结果操作行 */
.ops .op-main { flex: 1.4; }
.btn-ghost {
    background: var(--paper); border: 1px solid var(--line); color: var(--ink-3);
    border-radius: var(--radius-sm); font-size: 13px; font-weight: 600; padding: 10px 14px; cursor: pointer;
    transition: background .12s ease, color .12s ease;
}
.btn-ghost:hover { background: #FBF3DC; color: var(--brand-dark); }
.btn-ghost.danger { background: #fde8e8; border-color: #fde8e8; color: var(--bad); }
.btn-ghost.danger:hover { background: #fbdcdc; color: var(--bad); }

/* ===== 分享海报卡 ===== */
.poster { text-align: center; background: var(--page); border-radius: var(--radius); padding: 18px; }
.poster-brand { display: block; font-size: 10.5px; color: var(--ink-2); letter-spacing: 1px; }
.poster-img { width: 120px; height: 120px; object-fit: cover; border-radius: var(--radius); margin: 12px auto 0; display: block; }
.poster-name { display: block; font-size: 22px; font-weight: 800; margin-top: 8px; }
.poster-url { margin: 6px 0 0; font-size: 10.5px; color: #8A6A3A; word-break: break-all; }
.poster-line { margin: 10px 0 0; font-size: 11px; color: var(--ink-2); font-weight: 400; }
.share-ops { display: flex; justify-content: flex-end; gap: 8px; }

/* 合规声明（AC24） */
.compliance { text-align: center; font-size: 10.5px; color: var(--ink-2); margin: 26px 0 8px; line-height: 1.7; }

/* ===== 桌面适配（≥769）===== */
@media (min-width: 769px) {
    /* 整页限宽 720 居中：题目卡与结果卡同列宽，选项 chips 保持横排换行 */
    .mbti-page { max-width: 720px; }
    /* 题目与选项桌面字号放大一档 */
    .q-title { font-size: 15px; }
    .pchip { font-size: 13px; padding: 8px 18px; }
    /* 结果卡标题与描述同步放大 */
    .res-name { font-size: 30px; }
    .res-desc { font-size: 12.5px; }
}
</style>
