<template>
    <div class="page-wrap publish-post-page">
        <!-- 顶部栏：返回 / 标题 / 存草稿 -->
        <div class="topbar">
            <button class="icircle" aria-label="返回" @click="go_back">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7" /></svg>
            </button>
            <b class="title">发动态</b>
            <button class="draft-btn" @click="save_draft">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="4" y="4" width="16" height="16" rx="3" /><path d="M8 9h8M8 13h8M8 17h5" /></svg>
                存草稿
            </button>
        </div>

        <!-- 草稿提示条：检测到历史草稿时可恢复 -->
        <div v-if="draft_tip" class="draft-tip card">
            <span>检测到上次保存的草稿，要继续编辑吗？</span>
            <div class="tip-ops">
                <button class="tip-btn on" @click="restore_draft">恢复</button>
                <button class="tip-btn" @click="discard_draft">忽略</button>
            </div>
        </div>

        <!-- 图片九宫格上传（≤9 张） -->
        <div class="pics fade-up">
            <div v-for="(img, i) in previews" :key="i" class="p">
                <img :src="img.url" alt="" />
                <span class="del" @click="remove_img(i)">×</span>
            </div>
            <label v-if="previews.length < 9" class="p add">
                ＋
                <input type="file" accept="image/jpeg,image/png,image/webp" hidden @change="on_pick" />
            </label>
        </div>

        <!-- 正文 + 计数 -->
        <div class="body-input fade-up">
            <textarea v-model="form.content" maxlength="500" placeholder="分享今天的干饭瞬间…"></textarea>
            <div class="cnt score-num">{{ form.content.length }} / 500</div>
        </div>

        <!-- 话题 chips（可多选 + 支持手动自定义） -->
        <div class="sec-row">
            <div class="row-title">添加话题 <span class="hint">最多 8 个，可自定义</span></div>
            <div class="chip-row">
                <span
                    v-for="t in TOPICS" :key="t" class="chip topic-chip" :class="{ on: form.topics.includes(t) }"
                    @click="toggle_topic(t)"
                >{{ t }}</span>
                <span
                    v-for="t in custom_topics" :key="t" class="chip topic-chip custom" :class="{ on: form.topics.includes(t) }"
                    @click="toggle_topic(t)"
                >{{ t }}</span>
            </div>
            <div class="topic-add">
                <input
                    v-model="topic_input" class="topic-input" type="text" maxlength="14"
                    placeholder="自定义话题，如「宿舍夜宵」" @keyup.enter="add_topic"
                />
                <button class="topic-add-btn" type="button" @click="add_topic">添加</button>
            </div>
        </div>

        <!-- 关联点位 / 菜品：搜索选择，可多选，可删 chips -->
        <div class="sec-row">
            <div class="row-title">关联点位 / 菜品 <span class="hint">选填，最多 5 个</span></div>
            <div class="link-box">
                <input
                    v-model="keyword" class="link-input" type="text" placeholder="搜食堂、档口、菜品，如「麻辣香锅」"
                    @input="on_search" @focus="search_open = true" @blur="close_search"
                />
                <div v-if="search_open && search_results.length" class="link-panel card">
                    <div
                        v-for="item in search_results" :key="`${item.kind}_${item.id}`" class="link-item"
                        @mousedown.prevent="add_link(item)"
                    >
                        <span class="chip">{{ item.kind }}</span>
                        <b>{{ item.name }}</b>
                    </div>
                </div>
                <div v-if="form.links.length" class="link-chips">
                    <span v-for="l in form.links" :key="`${l.kind}_${l.id}`" class="chip link-chip">
                        {{ l.kind }} · {{ l.name }}
                        <i class="x" @click="remove_link(l)">×</i>
                    </span>
                </div>
            </div>
        </div>

        <!-- 可见范围 -->
        <div class="sec-row">
            <div class="row-title">谁能看</div>
            <div class="vis-row">
                <button
                    v-for="v in VISIBILITY" :key="v.key" class="vis-btn" :class="{ on: form.visibility === v.key }"
                    @click="form.visibility = v.key"
                >{{ v.name }}</button>
            </div>
        </div>

        <!-- 底部发布条 -->
        <div class="pubbar">
            <button class="pub-btn" :disabled="publishing" @click="do_publish">
                {{ publishing ? '发布中…' : '发布' }}
            </button>
        </div>
    </div>
</template>

<script setup>
/**
 * 发动态（/post-publish）：对齐 P10a 原型
 * - 正文 textarea（500 字计数）、图片九宫格上传（api_upload.image，失败本地预览占位）
 * - 话题：6 个预设 + 手动自定义（去重、最多 8 个，后端再次规范化）
 * - 关联点位/菜品：api_content.search_all 搜索多选，展示为可删 chips
 * - 可见范围（公开/仅关注）；存草稿（localStorage）+ 恢复提示
 * - 发布成功 → /circle（真实写入 post 表）
 */
import { ref, reactive, computed, onMounted, onBeforeUnmount } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { api_content, api_upload, api_post } from '../api';
import { compress_image } from '../utils/compress';

const router = useRouter();

/** 话题候选（贴合原型与校园场景） */
const TOPICS = ['#下午茶#', '#糖水局#', '#深夜食堂#', '#排队实录#', '#食堂测评#', '#甜品雷达#'];
/** 可见范围定义 */
const VISIBILITY = [
    { key: 'public', name: '公开' },
    { key: 'follow', name: '仅关注' },
];

const DRAFT_KEY = 'fk_post_draft';
/** 话题数量上限（与后端 normalize_topics 保持一致） */
const TOPICS_MAX = 8;
/** 话题名（去掉 # 后）最大字数 */
const TOPIC_NAME_MAX = 12;

const form = reactive({
    content: '',
    topics: [],
    links: [],
    visibility: 'public',
});
const previews = ref([]); // [{key, url, local}] key 为 objectKey，local 表示本地占位
const publishing = ref(false);
const draft_tip = ref(false);

// 自定义话题输入框 + 已自定义话题（不在预设列表里的）
const topic_input = ref('');
const custom_topics = computed(() => form.topics.filter((t) => !TOPICS.includes(t)));

const keyword = ref('');
const search_open = ref(false);
const search_results = ref([]);
let search_timer = null;

/**
 * 返回点评圈
 */
function go_back() {
    router.push('/circle');
}

/**
 * 选择图片：压缩 → 上传（失败回落本地 blob 预览占位）
 * @param {Event} e
 */
async function on_pick(e) {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) {
        ElMessage.warning('图片不能超过 3MB');
        return;
    }
    try {
        const blob = await compress_image(file);
        try {
            const fd = new FormData();
            fd.append('file', blob, 'upload.jpg');
            fd.append('scene', 'review');
            const data = await api_upload.image(fd);
            previews.value.push({ key: data.objectKey, url: data.url || `/img/${data.objectKey}`, local: false });
        } catch {
            // 上传失败：本地预览占位，发布时仅作展示
            previews.value.push({ key: null, url: URL.createObjectURL(blob), local: true });
        }
    } catch { /* 压缩失败静默 */ }
}

/**
 * 移除已选图片
 * @param {number} i
 */
function remove_img(i) {
    const img = previews.value[i];
    if (img?.local && img.url.startsWith('blob:')) URL.revokeObjectURL(img.url);
    previews.value.splice(i, 1);
}

/**
 * 话题选中/取消
 * @param {string} t
 */
function toggle_topic(t) {
    const i = form.topics.indexOf(t);
    if (i >= 0) form.topics.splice(i, 1);
    else form.topics.push(t);
}

/**
 * 手动添加自定义话题：统一 #xxx# 形态、去重、上限 8 个
 */
function add_topic() {
    // 去掉用户输入的首尾空白与 # / ＃，限制话题名 12 字
    const name = String(topic_input.value || '').replace(/[#＃]/g, '').trim().slice(0, TOPIC_NAME_MAX);
    if (!name) {
        ElMessage.warning('请输入话题名');
        return;
    }
    const tag = `#${name}#`;
    if (form.topics.includes(tag)) {
        ElMessage.info('这个话题已经添加了');
        topic_input.value = '';
        return;
    }
    if (form.topics.length >= TOPICS_MAX) {
        ElMessage.warning(`最多添加 ${TOPICS_MAX} 个话题`);
        return;
    }
    form.topics.push(tag);
    topic_input.value = '';
    ElMessage.success(`已添加话题「${tag}」`);
}

/**
 * 搜索关联点位/菜品（300ms 防抖，调统一搜索接口）
 */
function on_search() {
    clearTimeout(search_timer);
    const q = keyword.value.trim();
    if (!q) {
        search_results.value = [];
        return;
    }
    search_timer = setTimeout(async () => {
        try {
            const d = await api_content.search_all(q);
            // /search 返回 {points, stations, dishes} 三分组（与 search-view 口径一致）
            const rows = [
                ...(d.points || []).map((p) => ({ kind: '食堂', id: `p${p.id}`, name: p.name })),
                ...(d.stations || []).map((s) => ({ kind: '档口', id: `s${s.id}`, name: s.name })),
                ...(d.dishes || []).map((x) => ({ kind: '菜品', id: `d${x.id}`, name: x.name })),
            ];
            // 已选的不再出现在候选里
            search_results.value = rows.filter((r) => !form.links.some((l) => l.id === r.id)).slice(0, 8);
            search_open.value = true;
        } catch { /* 拦截器已提示 */ }
    }, 300);
}

/**
 * 失焦延迟收起候选面板（避免与点选冲突）
 */
function close_search() {
    setTimeout(() => { search_open.value = false; }, 150);
}

/**
 * 加入关联（上限 5 个）
 * @param {{kind:string,id:string,name:string}} item
 */
function add_link(item) {
    if (form.links.length >= 5) {
        ElMessage.warning('最多关联 5 个点位/菜品');
        return;
    }
    form.links.push({ ...item });
    keyword.value = '';
    search_results.value = [];
}

/**
 * 移除关联
 * @param {Object} l
 */
function remove_link(l) {
    form.links = form.links.filter((x) => x.id !== l.id);
}

/**
 * 存草稿（localStorage）：图片仅保留已上传的 objectKey
 */
function save_draft() {
    const data = {
        content: form.content,
        topics: form.topics,
        links: form.links,
        visibility: form.visibility,
        images: previews.value.filter((p) => !p.local && p.key).map((p) => ({ key: p.key, url: p.url })),
    };
    localStorage.setItem(DRAFT_KEY, JSON.stringify(data));
    draft_tip.value = true;
    ElMessage.success('草稿已保存');
}

/**
 * 恢复草稿：回填正文/话题/关联/可见范围与已上传图片
 */
function restore_draft() {
    try {
        const d = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
        if (!d) return;
        form.content = d.content || '';
        form.topics = d.topics || [];
        form.links = d.links || [];
        form.visibility = d.visibility || 'public';
        previews.value = (d.images || []).map((p) => ({ key: p.key, url: p.url, local: false }));
    } catch { /* 草稿损坏则忽略 */ }
    draft_tip.value = false;
}

/**
 * 忽略草稿：清空存储与提示
 */
function discard_draft() {
    localStorage.removeItem(DRAFT_KEY);
    draft_tip.value = false;
}

/**
 * 发布：真实写入 post 表（分享任务据此计数）
 * 仅提交上传成功的 objectKey；上传失败的本地占位图不写库
 */
async function do_publish() {
    const images = previews.value.filter((p) => p.key && !p.local).map((p) => p.key);
    if (!form.content.trim() && images.length === 0) {
        ElMessage.warning('写点什么或成功上传一张图再发布吧');
        return;
    }
    if (!form.content.trim() && previews.value.length && !images.length) {
        ElMessage.warning('图片上传未成功，请重试或只发文字');
        return;
    }
    publishing.value = true;
    try {
        await api_post.create({
            content: form.content.trim(),
            images,
            topics: form.topics.slice(0, TOPICS_MAX),
            links: form.links,
        });
        localStorage.removeItem(DRAFT_KEY);
        ElMessage.success('发布成功，已进入点评圈');
        router.push('/circle');
    } finally {
        publishing.value = false;
    }
}

onMounted(() => {
    // 进入页面时检测历史草稿，展示恢复提示
    draft_tip.value = !!localStorage.getItem(DRAFT_KEY);
});

onBeforeUnmount(() => {
    clearTimeout(search_timer);
});
</script>

<style scoped>
/* 顶部栏：返回 + 标题 + 存草稿 */
.topbar { display: flex; align-items: center; justify-content: space-between; padding: 8px 0 4px; }
.title { font-size: 15px; font-weight: 700; }
.draft-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 11px;
    font-weight: 700;
    color: var(--ink-3);
    background: var(--paper);
    border: 1px solid var(--line);
    padding: 6px 11px;
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: background .12s ease;
}
.draft-btn:hover { background: #FBF3DC; }

/* 草稿提示条 */
.draft-tip {
    margin-top: 12px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 10px 14px;
    font-size: 11.5px;
    color: var(--ink-2);
}
.tip-ops { display: flex; gap: 8px; flex-shrink: 0; }
.tip-btn {
    font-size: 11px;
    font-weight: 700;
    padding: 4px 12px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--line);
    background: var(--paper);
    color: var(--ink-2);
    cursor: pointer;
}
.tip-btn.on { background: var(--brand); border-color: var(--brand); color: #FFFDF5; }

/* 图片九宫格 */
.pics { display: grid; grid-template-columns: repeat(3, 1fr); gap: 9px; padding-top: 14px; }
.p { position: relative; width: 100%; aspect-ratio: 1 / 1; border-radius: var(--radius); overflow: hidden; }
.p img { width: 100%; height: 100%; object-fit: cover; display: block; }
.p .del {
    position: absolute;
    top: 3px; right: 3px;
    width: 17px; height: 17px;
    border-radius: 50%;
    background: rgba(58, 46, 26, .62);
    color: #FFFDF5;
    font-size: 11px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
}
.p.add {
    border: 1.5px dashed #D8CBB0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 26px;
    color: #D8CBB0;
    font-weight: 300;
    cursor: pointer;
    transition: border-color .12s ease, color .12s ease;
}
.p.add:hover { border-color: var(--brand); color: var(--brand); }

/* 正文输入 */
.body-input { margin-top: 14px; }
.body-input textarea {
    width: 100%;
    height: 118px;
    border: none;
    background: transparent;
    resize: none;
    font-family: inherit;
    font-size: 13px;
    color: var(--ink);
    outline: none;
    line-height: 1.75;
}
.body-input textarea::placeholder { color: #8A7A5E; }
.cnt { text-align: right; font-size: 10.5px; color: var(--ink-2); }

/* 分组行：模块间距 32px 节奏 */
.sec-row { margin-top: 30px; }
.row-title { font-size: 13px; font-weight: 700; margin-bottom: 10px; }
.row-title .hint { font-size: 10.5px; color: var(--ink-2); font-weight: 400; margin-left: 6px; }
.chip-row { display: flex; gap: 8px; flex-wrap: wrap; }
.topic-chip { cursor: pointer; padding: 5px 11px; font-size: 10.5px; transition: background .12s ease, color .12s ease; }
.topic-chip.on { background: var(--ink); color: #FFFDF5; }
/* 自定义话题：虚线描边区分预设 */
.topic-chip.custom { border-style: dashed; }
/* 自定义话题输入行 */
.topic-add { display: flex; gap: 8px; margin-top: 10px; }
.topic-input {
    flex: 1; min-width: 0; height: 34px;
    border: 1px solid var(--line); border-radius: var(--radius-sm);
    background: var(--paper); padding: 0 12px;
    font-size: 12px; color: var(--ink); outline: none; font-family: inherit;
}
.topic-input::placeholder { color: var(--ink-2); }
.topic-input:focus { border-color: var(--brand); }
.topic-add-btn {
    flex: none; padding: 0 16px; height: 34px;
    border-radius: var(--radius-sm); border: 1px solid var(--line);
    background: var(--brand); color: #FFFDF5; font-size: 12px; font-weight: 700; cursor: pointer;
}

/* 关联搜索 */
.link-box { position: relative; }
.link-input {
    width: 100%;
    height: 38px;
    border: 1px solid var(--line);
    border-radius: var(--radius-sm);
    background: var(--paper);
    padding: 0 13px;
    font-size: 12.5px;
    color: var(--ink);
    outline: none;
    font-family: inherit;
}
.link-input::placeholder { color: var(--ink-2); }
.link-input:focus { border-color: var(--brand); }
.link-panel {
    position: absolute;
    left: 0; right: 0; top: 44px;
    z-index: 20;
    padding: 6px;
    max-height: 220px;
    overflow: auto;
}
.link-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    border-radius: var(--radius-sm);
    cursor: pointer;
    font-size: 12.5px;
}
.link-item:hover { background: #FBF3DC; }
.link-item b { font-weight: 700; }
.link-chips { display: flex; gap: 7px; flex-wrap: wrap; margin-top: 10px; }
.link-chip { display: inline-flex; align-items: center; gap: 5px; padding: 5px 10px; font-size: 10.5px; }
.link-chip .x { font-style: normal; cursor: pointer; font-size: 12px; line-height: 1; opacity: .7; }
.link-chip .x:hover { opacity: 1; }

/* 可见范围 */
.vis-row { display: flex; gap: 9px; }
.vis-btn {
    font-size: 12px;
    font-weight: 700;
    padding: 8px 20px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--line);
    background: var(--paper);
    color: var(--ink-2);
    cursor: pointer;
    transition: background .12s ease, color .12s ease, border-color .12s ease;
}
.vis-btn.on { background: var(--brand); border-color: var(--brand); color: #FFFDF5; }

/* 底部发布条：抬升至 tabbar 上方（tabbar 高约 62px），避免被盖住 */
.publish-post-page { padding-bottom: 150px; } /* 页尾让位 发布条 + tabbar */
.pubbar {
    position: fixed;
    left: 50%;
    transform: translateX(-50%);
    bottom: calc(72px + env(safe-area-inset-bottom));
    width: 100%;
    max-width: 480px;
    padding: 10px 16px;
    background: linear-gradient(transparent, var(--page) 30%);
    z-index: 60;
}
.pub-btn {
    display: block;
    width: 100%;
    height: 44px;
    border: none;
    border-radius: var(--radius-sm);
    background: var(--ink);
    color: #FFFDF5;
    font-size: 15px;
    font-weight: 800;
    cursor: pointer;
    transition: background .12s ease, transform .08s ease;
}
.pub-btn:hover { background: #4a3b24; }
.pub-btn:active { transform: translateY(1px); }
.pub-btn:disabled { opacity: .6; cursor: not-allowed; }

@media (max-width: 768px) {
    .pubbar { bottom: calc(66px + env(safe-area-inset-bottom)); }
}

/* ===== 桌面适配（≥769）===== */
@media (min-width: 769px) {
    /* 桌面：发帖列收窄至 720px 并保持居中 */
    .publish-post-page { max-width: 720px; }
    /* 桌面：底部固定发布条与 720 内容列对齐（移动端仍为 480 手机档） */
    .pubbar { max-width: 720px; }
}
</style>
