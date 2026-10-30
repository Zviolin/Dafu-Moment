<template>
    <div class="page-wrap checkin">
        <!-- 顶部返回头 -->
        <div class="topbar">
            <span class="icircle back" aria-label="返回" @click="go_back">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7" /></svg>
            </span>
            <b class="t-title">今天吃什么 · 打个卡</b>
            <i class="t-hold"></i>
        </div>

        <!-- 顶部打卡插画 -->
        <div class="hero fade-up">
            <img src="/assets/icons/ill-checkin.png" alt="打卡插画" />
        </div>

        <!-- 表单：通栏分组 + hairline 分隔（G3-1 去封闭卡） -->
        <section class="form-sec fade-up">
            <!-- 选点位 -->
            <div class="f-row">
                <label class="f-label">今天在哪吃</label>
                <el-select v-model="form.canteenId" placeholder="选择食堂 / 点位" style="width: 100%" @change="on_canteen_change">
                    <el-option v-for="c in canteen_options" :key="c.value" :label="c.label" :value="c.value" />
                </el-select>
            </div>

            <hr class="hairline" />

            <!-- 选实际消费菜品（随点位联动；无可选菜品时可自定义填写，避免「什么都选不了」） -->
            <div class="f-row">
                <label class="f-label">吃了什么（可多选）</label>
                <div v-if="dish_options.length || custom_dishes.length" class="dish-chips">
                    <span
                        v-for="d in dish_options" :key="d.name"
                        class="chip dish-chip" :class="{ on: form.dish_names.includes(d.name) }"
                        @click="toggle_dish(d)"
                    >{{ d.name }}<i class="dish-price">¥{{ d.price }}</i></span>
                    <!-- 手动填写的菜品：点位没有在售菜品记录时（如校外餐厅/外卖）的唯一入口 -->
                    <span
                        v-for="n in custom_dishes" :key="'c-' + n"
                        class="chip dish-chip custom" :class="{ on: form.dish_names.includes(n) }"
                        @click="toggle_dish({ name: n })"
                    >{{ n }}<i class="dish-price">自填</i></span>
                </div>
                <div v-else class="f-hint">{{ form.canteenId ? '这个点位暂时没有在售菜品，可在下方手动填写' : '先选一个点位，看看这里有什么好吃的' }}</div>
                <div class="add-row">
                    <el-input
                        v-model="dish_input"
                        size="small"
                        maxlength="20"
                        :placeholder="dish_options.length ? '没找到？手动添加你吃到的' : '手动填写你吃到的，如「牛肉面」'"
                        @keyup.enter="add_dish"
                    />
                    <button class="add-btn" type="button" @click="add_dish">添加</button>
                </div>
            </div>

            <hr class="hairline" />

            <!-- 日期 -->
            <div class="f-row">
                <label class="f-label">哪一天的</label>
                <el-date-picker
                    v-model="form.date" type="date" value-format="YYYY-MM-DD"
                    :clearable="false" placeholder="选择日期" style="width: 100%"
                />
            </div>

            <hr class="hairline" />

            <!-- 照片上传（本地预览多图） -->
            <div class="f-row">
                <label class="f-label">拍几张</label>
                <div class="photos">
                    <div v-for="(p, i) in form.photos" :key="i" class="ph">
                        <img :src="p.url" alt="打卡照片" />
                        <span class="ph-x" aria-label="删除照片" @click="remove_photo(i)">×</span>
                    </div>
                    <label v-if="form.photos.length < 9" class="ph add">
                        <input type="file" accept="image/*" multiple hidden @change="on_pick_photos" />
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M12 5v14M5 12h14" /></svg>
                    </label>
                </div>
            </div>

            <hr class="hairline" />

            <!-- 随笔 -->
            <div class="f-row">
                <label class="f-label">随笔一句</label>
                <el-input
                    v-model="form.note" type="textarea" :rows="3" maxlength="200"
                    show-word-limit placeholder="今天这顿怎么样？排队久吗？阿姨手抖了吗……"
                />
            </div>

            <hr class="hairline" />

            <!-- 可见范围 -->
            <div class="f-row">
                <label class="f-label">谁能看到</label>
                <div class="vis-seg">
                    <span :class="{ on: form.visibility === 'public' }" @click="form.visibility = 'public'">公开</span>
                    <span :class="{ on: form.visibility === 'private' }" @click="form.visibility = 'private'">仅自己</span>
                </div>
                <div class="f-hint">手账默认仅自己可见，转社区帖子后会进入审核</div>
            </div>
        </section>

        <!-- 操作按钮：仅记录 / 发布打卡 -->
        <div class="ops fade-up">
            <button class="ghost-btn" :disabled="saving" @click="save(false)">仅记录</button>
            <button class="btn-primary main-btn" :disabled="saving" @click="save(true)">{{ saving ? '发布中…' : '发布打卡' }}</button>
        </div>
        <p class="ops-tip">发布打卡会写入后端打卡日历、推进「每日签到」任务，并在每日首次打卡时获得投喂道具；仅记录只保存在本机</p>

        <!-- 成功反馈弹层：一次打卡联动清单（需求 5.1.4） -->
        <div v-if="success_open" class="mask" @click.self="success_open = false">
            <div class="success-card fade-up">
                <img class="suc-pet" src="/assets/pet/e-calm2.png" alt="福宝很满足" />
                <b class="suc-title">打卡成功！</b>
                <div class="suc-list">
                    <div class="suc-item">
                        <svg class="ck" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4L19 7" /></svg>
                        写入打卡日历
                    </div>
                    <div class="suc-item">
                        <svg class="ck" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4L19 7" /></svg>
                        {{ lit_text }}
                    </div>
                    <div class="suc-item">
                        <svg class="ck" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4L19 7" /></svg>
                        记入「每日签到」任务进度
                    </div>
                    <div class="suc-item">
                        <svg class="ck" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4L19 7" /></svg>
                        每日首次打卡获得宠物投喂道具 ×1
                    </div>
                </div>
                <button class="btn-primary suc-btn" @click="$router.push('/pet')">去喂福宝 ›</button>
                <span class="suc-later" @click="success_open = false">留在本页</span>
            </div>
        </div>
    </div>
</template>

<script setup>
/**
 * 一体化打卡页（需求 5.1.4 / AC10-AC13）：
 * 发布打卡 → 写后端 /api/checkin（打卡日历 + 每日签到任务计数 + 宠物投喂道具）；
 * 同日同点位重复打卡走 409 确认后「另记一条」；「仅记录」只存本机手账不入后端。
 */
import { ref, reactive, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { api_content, api_checkin, api_upload } from '../api';
import { useAuthStore } from '../stores/auth';
import { img_url } from '../utils/format';
import { load_json, save_json } from '../utils/storage.js';

const router = useRouter();
const auth = useAuthStore();

/* ---------------- 状态 ---------------- */

// 点位下拉选项：来自后端 /canteens；拉取失败则留空并提示（不再回退假点位）
const canteen_options = ref([]);
const checkins = ref([]); // 本机打卡流水（用于重复检测与足迹页留档）
const success_open = ref(false);
const lit_text = ref('点亮足迹');
// 发布中（防重复点击，照片上传期间按钮禁用）
const saving = ref(false);

const form = reactive({
    canteenId: null,
    date: '',
    dish_names: [],
    photos: [], // [{url, file}]：url 本地预览，file 上传用
    note: '',
    visibility: 'private', // 手账默认私有
});

// 当前所选点位的在售菜品：选点位后从后端 /dishes 拉取
const dish_options = ref([]);
// 手动填写的菜品输入框（点位无在售菜品时的兜底入口）
const dish_input = ref('');

/**
 * 已手动填写、但不在点位在售列表中的菜品名（单独渲染为「自填」chip）
 */
const custom_dishes = computed(() =>
    form.dish_names.filter((n) => !dish_options.value.some((d) => d.name === n))
);

/* ---------------- 生命周期 ---------------- */

onMounted(() => {
    form.date = fmt_date(new Date()); // 日期默认今天
    load_canteens();
    checkins.value = load_json('dafu_checkins', []);
});

/* ---------------- 数据加载 ---------------- */

/**
 * 拉取点位列表：api_content.canteens()；失败留空并提示（不回退假点位）
 */
async function load_canteens() {
    try {
        const res = await api_content.canteens();
        // 兼容三种解包形态：数组直返 / {data:[...]} / {data:{list:[...]}}
        const list = Array.isArray(res) ? res : res?.data?.list || res?.data || [];
        if (Array.isArray(list) && list.length) {
            canteen_options.value = list.map((c) => ({ value: c.id, label: c.name }));
            return;
        }
        throw new Error('empty');
    } catch {
        canteen_options.value = [];
        ElMessage.warning('点位加载失败，请稍后重试');
    }
}

/**
 * 拉取所选点位的在售菜品：/dishes?canteenId=，供「吃了什么」chips 使用
 */
async function load_dishes() {
    dish_options.value = [];
    if (!form.canteenId) return;
    try {
        const res = await api_content.dishes({ canteenId: form.canteenId, pageSize: 60 });
        const list = Array.isArray(res) ? res : res?.list || [];
        dish_options.value = list.map((d) => ({
            id: d.id,
            name: d.name,
            price: Number(d.price) || 0,
            img: d.cover_object_key ? img_url(d.cover_object_key) : '',
        }));
    } catch { /* 错误提示由 http 拦截器统一处理 */ }
}

/* ---------------- 表单交互 ---------------- */

/**
 * 返回上一页
 */
function go_back() {
    router.back();
}

/**
 * 切换点位后清空已选菜品并重新拉取该点位菜品
 */
function on_canteen_change() {
    form.dish_names = [];
    load_dishes();
}

/**
 * 勾选 / 取消一道菜
 * @param {{name: string}} dish 菜品对象
 */
function toggle_dish(dish) {
    const i = form.dish_names.indexOf(dish.name);
    if (i >= 0) form.dish_names.splice(i, 1);
    else form.dish_names.push(dish.name);
}

/**
 * 手动添加「吃了什么」：点位没有在售菜品（校外餐厅 / 外卖 / 临时档口）时也能打卡
 * 去重、最多 20 字；添加即选中，再点 chip 可取消
 */
function add_dish() {
    const v = (dish_input.value || '').trim();
    if (!v) return;
    if (form.dish_names.includes(v)) {
        ElMessage.info('这道菜已经选上了');
        dish_input.value = '';
        return;
    }
    form.dish_names.push(v);
    dish_input.value = '';
    ElMessage.success(`已添加「${v}」`);
}

/**
 * 选择照片：生成本地预览地址并保留文件对象（发布时上传 MinIO），最多 9 张
 * @param {Event} e 文件选择事件
 */
function on_pick_photos(e) {
    const files = Array.from(e.target.files || []);
    for (const f of files) {
        if (form.photos.length >= 9) break;
        form.photos.push({ url: URL.createObjectURL(f), file: f });
    }
    e.target.value = ''; // 允许重复选择同一文件
}

/**
 * 移除一张预览照片（同时释放本地预览 URL）
 * @param {number} i 下标
 */
function remove_photo(i) {
    const p = form.photos[i];
    if (p && p.url) URL.revokeObjectURL(p.url);
    form.photos.splice(i, 1);
}

/* ---------------- 保存与联动 ---------------- */

/**
 * 组装本机手账记录（足迹/手账页数据源）
 * @param {string} canteen_label 点位名
 * @param {string} visibility 可见范围 public/private
 * @param {string[]} [photo_urls] 展示用照片地址（缺省取本地预览地址）
 * @returns {Object} 打卡流水记录
 */
function build_record(canteen_label, visibility, photo_urls) {
    // 在售菜品取完整信息，手动填写的菜品补一条最小记录（price 记 0）
    const dishes = form.dish_names.map((name) => {
        const hit = dish_options.value.find((d) => d.name === name);
        return hit || { id: null, name, price: 0, img: '' };
    });
    return {
        id: `ck_${Date.now()}`,
        date: form.date,
        meal: guess_meal(),
        canteenId: form.canteenId,
        canteenName: canteen_label,
        dishes,
        photos: photo_urls || form.photos.map((p) => p.url),
        note: form.note.trim(),
        visibility,
        createdAt: new Date().toISOString(),
    };
}

/**
 * 保存打卡
 * @param {boolean} publish true=发布打卡（写后端并联动任务/宠物）；false=仅记录（只存本机）
 */
async function save(publish) {
    if (saving.value) return;
    if (!form.canteenId) { ElMessage.warning('先选一个点位'); return; }
    if (form.dish_names.length === 0) { ElMessage.warning('至少选一样今天吃到的'); return; }

    const canteen_label = canteen_options.value.find((c) => c.value === form.canteenId)?.label || '该点位';

    // ---- 仅记录：只写本机手账，不触发任何后端联动 ----
    if (!publish) {
        const rec = build_record(canteen_label, 'private');
        checkins.value.unshift(rec);
        save_json('dafu_checkins', checkins.value);
        ElMessage.success('已记到本机手账（仅自己可见）');
        return;
    }

    // ---- 发布打卡：先校验登录与日期口径（后端按「当天」落库）----
    if (!auth.is_login) {
        ElMessage.warning('发布打卡需要先登录');
        router.push('/login');
        return;
    }
    const today = fmt_date(new Date());
    if (form.date !== today) {
        ElMessage.warning('「发布打卡」只支持当天，历史日期请用「仅记录」保存到本机手账');
        return;
    }

    saving.value = true;
    try {
        // 1) 照片先上传，拿 MinIO objectKey；任一张失败即中止，避免留下半条打卡
        const photo_keys = [];
        for (const p of form.photos) {
            if (!p.file) continue;
            const fd = new FormData();
            fd.append('file', p.file);
            const up = await api_upload.image(fd);
            if (up && up.objectKey) photo_keys.push(up.objectKey);
        }
        // 2) 在售菜品带 dishIds（自填菜品无 id，仅留档本机手账）
        const dish_ids = form.dish_names
            .map((n) => dish_options.value.find((d) => d.name === n)?.id)
            .filter((x) => Number.isInteger(x) && x > 0);
        const payload = {
            canteenId: form.canteenId,
            // 后端口径：1 公开 / 2 仅自己 / 3 匿名
            visibility: form.visibility === 'public' ? 1 : 2,
            note: form.note.trim(),
            photos: photo_keys,
            dishIds: dish_ids,
        };
        let res;
        try {
            res = await api_checkin.create(payload);
        } catch (e) {
            // 409：当天同点位已有打卡 → 二次确认后「另记一条」（追加菜品/照片）
            if (e?.response?.status === 409) {
                try {
                    await ElMessageBox.confirm(
                        `${today} 已经在「${canteen_label}」打过卡啦，再记一条吗？`,
                        '重复打卡确认',
                        { confirmButtonText: '继续打卡', cancelButtonText: '再想想', type: 'warning' },
                    );
                } catch {
                    return; // 用户取消
                }
                res = await api_checkin.create({ ...payload, again: true });
            } else {
                throw e;
            }
        }
        // 3) 本机手账留档（足迹/手账页数据源），并记录服务端打卡 id
        const rec = build_record(
            canteen_label,
            form.visibility,
            photo_keys.length ? photo_keys.map((k) => img_url(k)) : undefined,
        );
        rec.serverId = res?.checkinId || null;
        rec.photoKeys = photo_keys;
        checkins.value.unshift(rec);
        save_json('dafu_checkins', checkins.value);

        // 4) 足迹文案：该点位本机首次打卡 → 「点亮」，否则 +1
        const first_lit = !checkins.value.some((c) => c.id !== rec.id && c.canteenId === rec.canteenId);
        lit_text.value = first_lit ? `点亮足迹 · ${rec.canteenName}` : '足迹打卡 +1';
        success_open.value = true;
    } catch {
        /* 错误提示由 http 拦截器统一给出，保留表单内容供重试 */
    } finally {
        saving.value = false;
    }
}

/* ---------------- 工具函数 ---------------- */

/**
 * 日期格式化 YYYY-MM-DD（本地时区）
 * @param {Date} d 日期对象
 * @returns {string} 格式化结果
 */
function fmt_date(d) {
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${m}-${day}`;
}

/**
 * 按当前时段猜餐次
 * @returns {string} 早餐/午餐/下午茶/晚餐/夜宵
 */
function guess_meal() {
    const h = new Date().getHours();
    if (h < 10) return '早餐';
    if (h < 14) return '午餐';
    if (h < 17) return '下午茶';
    if (h < 21) return '晚餐';
    return '夜宵';
}
</script>

<style scoped>
/* 顶部返回头 */
.topbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-top: 12px;
    min-height: 44px;
}
.t-title { font-size: 15px; font-weight: 700; letter-spacing: 0.5px; }
.t-hold { width: 40px; flex-shrink: 0; }
.icircle.back { color: var(--ink); }

/* 插画区 */
.hero { display: flex; justify-content: center; padding: 14px 0 2px; }
.hero img { height: 104px; object-fit: contain; }

/* 表单分组：通栏 + hairline，行距放大（G2-2） */
.form-sec { padding-top: 14px; }
.f-row { padding: 10px 0 4px; }
.f-label {
    display: block;
    font-size: 10.5px;
    color: var(--ink-2);
    font-weight: 400;
    margin-bottom: 9px;
    letter-spacing: 1px;
}
.f-hint { font-size: 10px; color: var(--ink-2); margin-top: 7px; line-height: 1.7; }

/* 菜品 chips（去胶囊：8px 圆角） */
.dish-chips { display: flex; flex-wrap: wrap; gap: 8px; }
.dish-chip { font-size: 11.5px; padding: 7px 12px; cursor: pointer; background: var(--paper); border: 1px solid var(--line); font-weight: 600; transition: background .12s ease, color .12s ease, border-color .12s ease; }
.dish-chip .dish-price { font-style: normal; font-size: 10px; color: var(--ink-2); margin-left: 5px; font-weight: 400; }
.dish-chip.on { background: var(--brand); border-color: var(--brand); color: #FFFDF5; }
.dish-chip.on .dish-price { color: rgba(255, 253, 245, 0.8); }
/* 手动填写 chip：虚线描边区分「自填」，选中同样高亮 */
.dish-chip.custom { border-style: dashed; }
/* 自定义添加行（与饮食档案口径一致） */
.add-row { display: flex; gap: 8px; margin-top: 10px; align-items: center; }
.add-row .el-input { flex: 1; }
.add-btn {
    flex: none; padding: 6px 14px; border-radius: var(--radius-sm); border: 1px solid var(--line);
    background: var(--brand); color: #FFFDF5; font-size: 12px; font-weight: 700; cursor: pointer;
}

/* 照片九宫格 */
.photos { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
.ph { position: relative; width: 100%; aspect-ratio: 1; border-radius: var(--radius-sm); overflow: hidden; }
.ph img { width: 100%; height: 100%; object-fit: cover; display: block; }
.ph.add {
    display: flex; align-items: center; justify-content: center;
    background: var(--paper); border: 1px dashed var(--line); color: var(--ink-2);
    cursor: pointer;
}
.ph-x {
    position: absolute; top: 0; right: 0; width: 20px; height: 20px;
    background: rgba(58, 46, 26, 0.72); color: #FFFDF5;
    display: flex; align-items: center; justify-content: center;
    font-size: 13px; cursor: pointer; border-radius: 0 0 0 8px;
}

/* 可见范围分段（8px 微圆角，无胶囊） */
.vis-seg { display: flex; background: var(--paper); border: 1px solid var(--line); border-radius: var(--radius-sm); padding: 3px; gap: 3px; }
.vis-seg span {
    flex: 1; text-align: center; font-size: 12px; font-weight: 600;
    padding: 7px 0; border-radius: 6px; color: var(--ink-2); cursor: pointer;
    transition: background .12s ease, color .12s ease;
}
.vis-seg span.on { background: var(--brand); color: #FFFDF5; }

/* 操作按钮 */
.ops { display: flex; gap: 10px; margin-top: 26px; }
.ghost-btn {
    flex: 1; height: 45px; border-radius: var(--radius-sm);
    background: var(--paper); color: var(--ink-3);
    border: 1px solid var(--line); font-size: 13px; font-weight: 700; cursor: pointer;
    transition: background .12s ease;
}
.ghost-btn:hover { background: #FBF3DC; }
.main-btn { flex: 1.6; height: 45px; font-size: 14px; }
.ops-tip { font-size: 10px; color: var(--ink-2); text-align: center; line-height: 1.7; margin: 10px 0 0; }

/* 成功反馈弹层 */
.mask { position: fixed; inset: 0; background: rgba(58, 46, 26, 0.4); z-index: 30; display: flex; align-items: center; justify-content: center; padding: 20px; }
.success-card { width: 309px; max-width: 100%; background: var(--paper); border-radius: var(--radius); box-shadow: 0 8px 30px rgba(58, 46, 26, 0.3); padding: 18px; text-align: center; }
.suc-pet { width: 92px; height: 92px; object-fit: contain; margin: 0 auto; }
.suc-title { display: block; font-size: 16px; font-weight: 800; margin-top: 4px; }
.suc-list { margin: 14px 0 16px; text-align: left; display: flex; flex-direction: column; gap: 9px; }
.suc-item { display: flex; align-items: center; gap: 8px; font-size: 12px; color: #5C4A2E; }
.suc-item .ck { width: 16px; height: 16px; flex-shrink: 0; color: var(--brand); background: var(--brand-light); border-radius: 50%; padding: 2.5px; }
.suc-btn { width: 100%; height: 42px; }
.suc-later { display: inline-block; font-size: 11px; color: var(--ink-2); margin-top: 11px; cursor: pointer; }
.suc-later:hover { color: var(--brand-dark); }

/* ===== 桌面适配（≥769）===== */
@media (min-width: 769px) {
    /* 打卡表单页限宽 720 居中：长表单在宽幅下更易填写（页面为表单流，无日历/统计卡可分栏） */
    .page-wrap.checkin { max-width: 720px; }
    /* 照片九宫格桌面 4 列改 6 列，减少纵向占用 */
    .photos { grid-template-columns: repeat(6, 1fr); }
}
</style>
