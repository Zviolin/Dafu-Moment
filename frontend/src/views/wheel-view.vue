<template>
    <div class="page-wrap wheel-page">
        <!-- 顶部标题栏：返回 + 页名 -->
        <div class="titlebar">
            <span class="icircle back" role="button" aria-label="返回" @click="go_back">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3A2E1A" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>
            </span>
            <b class="tb-title">餐品转盘</b>
        </div>

        <!-- 结果卡（对齐 P16a 店铺卡；图片 object-fit:contain 完整显示，修改说明 C14） -->
        <div ref="result_card" class="card shop-card fade-up">
            <span class="cap">今晚吃什么 · 转一下</span>
            <template v-if="result">
                <img v-if="result.img" class="dish-img" :src="result.img" :alt="result.name" />
                <span v-else class="dish-img img-fallback">{{ result.name[0] }}</span>
                <b class="dish-name">{{ result.name }}</b>
                <div class="dish-sub">
                    <template v-if="result.station">{{ result.station }} · </template><span class="rate">★ {{ result.rating }}</span>
                </div>
                <button class="btn-primary go-station" :disabled="!can_go" @click="go_result">去看看</button>
            </template>
            <template v-else>
                <img class="dish-img ill-idle" src="/assets/spare/R25.png" alt="待开转" />
                <b class="dish-name">{{ spinning ? '转动中…' : '等你来转' }}</b>
                <div class="dish-sub">点击下方「开转」试试手气</div>
            </template>
        </div>

        <div class="tip-row">点击中心「开转」开始 · 转完自动带到结果</div>

        <!-- 转盘：conic-gradient 动态分区（随候选数量变化）+ transform rotate 缓动停针 -->
        <div class="wheelwrap">
            <span class="pin"></span>
            <div class="wheel" :style="{ background: `conic-gradient(from ${-SEG / 2}deg, ${sectors})`, transform: `rotate(${deg}deg)` }">
                <span v-for="(it, i) in items" :key="it.name + i" class="wlabel" :style="label_pos(i)">{{ it.name }}</span>
            </div>
            <button class="go" :disabled="spinning" aria-label="开转" @click="spin">{{ spinning ? '…' : '开转' }}</button>
        </div>

        <!-- 候选管理 + 再转一次 -->
        <div class="ops">
            <button class="btn-ghost mgr-btn" @click="open_mgr">管理转盘 · 自定义候选</button>
            <button class="btn-ghost" :disabled="spinning" @click="spin">再转一次</button>
        </div>

        <p class="compliance-note">转盘结果由本地随机生成，仅供选择困难时娱乐参考</p>

        <!-- 候选管理弹层：当前候选可删 + 从收藏夹添加（层级高于 tabbar，整层竖滚、滚动条隐藏） -->
        <div v-if="mgr_open" class="mgr-mask" @click.self="mgr_open = false">
            <div class="mgr-panel">
                <div class="sp-head">
                    <b>转盘候选</b>
                    <span class="sp-close" aria-label="关闭" @click="mgr_open = false">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
                    </span>
                </div>
                <div class="sp-sec">当前候选 <span>{{ items.length }}/12 · 至少保留 2 个</span></div>
                <div class="face-grid">
                    <div v-for="(it, i) in items" :key="it.name + i" class="sg">
                        <span v-if="items.length > 2" class="sg-del" title="移出转盘" @click="del_item(i)">
                            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
                        </span>
                        <span class="sg-img">
                            <img v-if="it.img" :src="it.img" :alt="it.name" />
                            <span v-else class="sg-ph">{{ it.name[0] }}</span>
                        </span>
                        <div class="nm">{{ it.name }}</div>
                        <div class="tg">★ {{ it.rating }}</div>
                    </div>
                </div>
                <div class="sp-sec">从收藏夹添加 <a class="sp-act" @click.prevent="reset_items">恢复默认</a></div>
                <div v-if="fav_list.length" class="face-grid fav-grid">
                    <div
                        v-for="f in fav_list" :key="`${f.subject_type}-${f.subject_id}`"
                        class="sg" :class="{ on: in_wheel(f) }" @click="add_fav(f)"
                    >
                        <span class="sg-img"><span class="sg-ph">{{ f.subject_name[0] }}</span></span>
                        <div class="nm">{{ f.subject_name }}</div>
                        <div class="tg">{{ type_text(f.subject_type) }} · ★ {{ f.rating_avg }}</div>
                    </div>
                </div>
                <div v-else class="fav-empty">暂无收藏，去菜品 / 档口页收藏后回来添加</div>
            </div>
        </div>
    </div>
</template>

<script setup>
/**
 * 餐品转盘（对齐 P16a-餐品转盘.html，r48 起支持自定义候选）
 * CSS 转盘：conic-gradient 动态分区（随候选数量 2-12 变化）+ transform rotate 缓动停针 + 中心「开转」；
 * 候选可自定义：管理弹层内删除 / 从收藏夹添加（菜品/档口/点位），localStorage 持久化；
 * 转完自动平滑滚到结果卡（页面竖直顺序阅读结果）；结果按收藏类型跳对应详情。
 */
import { ref, computed, nextTick, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { api_favorite, api_content } from '../api';

const router = useRouter();

/* ---------------- 候选数据（默认 8 项 + localStorage 持久化） ---------------- */

// 兜底候选：真实菜品接口不可用时使用；无详情 id，结果跳搜索
const DEFAULT_ITEMS = [
    { name: '香锅宽粉', img: '/assets/food/kuanfen.png', station: '川味麻辣香锅 · 紫荆园二层12号', rating: 4.9 },
    { name: '兰州拉面', img: '/assets/food/lamian.png', station: '京元食堂 · 一楼', rating: 4.7 },
    { name: '杨枝甘露', img: '/assets/food/yangzhi.png', station: '粤式糖水铺 · 丁香园一楼', rating: 4.6 },
    { name: '三巷手打面', img: '/assets/food/shoudamian.png', station: '学生街 · 巷口第三家', rating: 4.5 },
    { name: '双皮奶', img: '/assets/food/tangshui.png', station: '甜心坊 · 丁香园一楼', rating: 4.4 },
    { name: '麻辣香锅', img: '/assets/food/xiangguo.png', station: '紫荆园食堂 · 二层', rating: 4.8 },
    { name: '牛肉粉', img: '', station: '京元食堂 · 一楼', rating: 4.5 },
    { name: '轻食沙拉', img: '', station: '永嘉天地 · 轻食站', rating: 4.3 },
];
const LS_KEY = 'dafu_wheel_items';

/**
 * 读取本地候选：无效 / 少于 2 项时回落默认
 */
function load_items() {
    try {
        const arr = JSON.parse(localStorage.getItem(LS_KEY) || 'null');
        return Array.isArray(arr) && arr.length >= 2 ? arr : [...DEFAULT_ITEMS];
    } catch {
        return [...DEFAULT_ITEMS];
    }
}

const items = ref(load_items());

/**
 * 持久化候选到 localStorage
 */
function save_items() {
    localStorage.setItem(LS_KEY, JSON.stringify(items.value));
}

/**
 * 图片地址归一：对象键走 /img 代理
 * @param {string|null} key
 * @returns {string}
 */
function img_url(key) {
    if (!key) return '';
    const s = String(key);
    return s.startsWith('/') || s.startsWith('http') ? s : `/img/${s}`;
}

/**
 * 首次进入且用户未自定义时，用真实菜品接口填充候选（带 dish id，结果可直达详情）
 */
async function load_real_items() {
    if (localStorage.getItem(LS_KEY)) return; // 用户自定义候选优先，不覆盖
    try {
        const res = await api_content.dishes({ pageSize: 12, sort: 'comprehensive', businessStatus: 'open' });
        const rows = res && Array.isArray(res.list) ? res.list : (Array.isArray(res) ? res : []);
        const real = rows.map((d) => ({
            name: d.name,
            img: img_url(d.cover_object_key),
            station: d.station_name || d.canteen_name || '',
            rating: Number(d.rating_avg) > 0 ? Number(d.rating_avg).toFixed(1) : '—',
            fav_type: 0,
            fav_id: d.id,
        }));
        if (real.length >= 2) {
            items.value = real.slice(0, 12);
            save_items();
        }
    } catch { /* 接口不可用时保留兜底候选 */ }
}

/* ---------------- 转盘几何（随候选数量动态变化） ---------------- */

const SEG = computed(() => 360 / items.value.length); // 每分区角度
// 分区交替淡金/卡面：from -SEG/2 保证分区 i 中心位于 i*SEG°
const sectors = computed(() =>
    items.value.map((_, i) => `${i % 2 ? 'var(--paper)' : 'var(--brand-light)'} ${(i * SEG.value).toFixed(3)}deg ${((i + 1) * SEG.value).toFixed(3)}deg`).join(', ')
);

const deg = ref(0);
const spinning = ref(false);
const result = ref(null);
const result_card = ref(null); // 结果卡引用：转完平滑滚到此处

/**
 * 分区标签定位：按扇区中心角极坐标换算（0 号分区中心固定在正上方）；
 * 候选较多时半径外移避免文字重叠
 * @param {number} i - 分区序号
 */
function label_pos(i) {
    const r = items.value.length > 8 ? 116 : 104;
    const angle = ((i * SEG.value - 90) * Math.PI) / 180;
    return {
        left: `${157 + r * Math.cos(angle)}px`,
        top: `${157 + r * Math.sin(angle)}px`,
    };
}

/**
 * 开转：随机目标分区，累计 5 整圈后停在指针处；停稳后出结果并平滑滚到结果卡（竖直顺序阅读）
 */
function spin() {
    if (spinning.value) return;
    spinning.value = true;
    result.value = null;
    const seg = Math.floor(Math.random() * items.value.length);
    // 按当前累计角度求增量，保证最终绝对角度恰好把目标扇区中心停在指针下方
    // （旧实现直接累加 360 - seg*SEG，多转几次后余数与目标扇区不一致，导致指针与结果卡不符）
    const cur = ((deg.value % 360) + 360) % 360;
    const target = ((360 - seg * SEG.value) % 360 + 360) % 360;
    deg.value += 5 * 360 + ((target - cur + 360) % 360);
    // 与 CSS transition 3s 对齐，停稳后再出结果卡
    setTimeout(() => {
        result.value = items.value[seg];
        spinning.value = false;
        nextTick(() => result_card.value?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
    }, 3100);
}

/**
 * 结果是否可跳转：真实收藏/菜品走详情，兜底候选走搜索
 */
const can_go = computed(() => !!result.value);

/**
 * 结果跳转：有真实 id 时按类型跳详情（0 菜品 / 1 档口 / 2 点位）；否则按菜名搜索
 */
function go_result() {
    const r = result.value;
    if (!r) return;
    if (r.fav_type != null && r.fav_id != null) {
        const path = [`/dish/${r.fav_id}`, `/station/${r.fav_id}`, `/canteen/${r.fav_id}`][r.fav_type];
        if (path) {
            router.push(path);
            return;
        }
    }
    router.push({ path: '/search', query: { kw: r.name } });
}

/**
 * 返回 AI 助手主页
 */
function go_back() {
    router.push('/ai');
}

/* ---------------- 候选管理（删除 / 收藏夹添加 / 恢复默认） ---------------- */

const mgr_open = ref(false);
const fav_list = ref([]); // 收藏列表（首次打开拉取缓存）
const fav_loaded = ref(false);

/**
 * 收藏对象类型文案（0 菜品 / 1 档口 / 2 点位）
 */
function type_text(t) {
    return ['菜品', '档口', '点位'][t] || '点位';
}

/**
 * 打开管理弹层：首次拉取我的收藏（GET /me/favorites，含类型/评分）
 */
async function open_mgr() {
    mgr_open.value = true;
    if (!fav_loaded.value) {
        try {
            // http 拦截器已解包 {code,msg,data}，这里直接拿 rows（数组或分页对象）
            const res = await api_favorite.mine();
            const rows = Array.isArray(res) ? res : (res && res.list) || [];
            fav_list.value = rows.filter((f) => f.subject_name);
        } catch {
            fav_list.value = [];
        }
        fav_loaded.value = true;
    }
}

/**
 * 收藏是否已加入转盘
 */
function in_wheel(f) {
    return items.value.some((it) => it.fav_type === f.subject_type && it.fav_id === f.subject_id);
}

/**
 * 加入收藏项到转盘（上限 12，去重）
 */
function add_fav(f) {
    if (items.value.length >= 12 || in_wheel(f)) return;
    items.value.push({
        name: f.subject_name,
        img: '',
        fav_type: f.subject_type,
        fav_id: f.subject_id,
        rating: Number(f.rating_avg || 0),
    });
    save_items();
}

/**
 * 移出候选（至少保留 2 个）
 */
function del_item(i) {
    if (items.value.length <= 2) return;
    items.value.splice(i, 1);
    save_items();
}

/**
 * 恢复默认候选
 */
function reset_items() {
    items.value = [...DEFAULT_ITEMS];
    save_items();
}

onMounted(load_real_items);
</script>

<style scoped>
.wheel-page { padding-bottom: 8px; }

/* 顶部标题栏 */
.titlebar { height: 48px; display: flex; align-items: center; gap: 10px; margin-top: 10px; }
.tb-title { font-size: 16px; font-weight: 700; }

/* ===== 结果卡：居中店铺卡 ===== */
.shop-card { margin-top: 6px; text-align: center; }
.cap { display: block; font-size: 10px; color: var(--ink-2); letter-spacing: 1px; font-weight: 400; }
/* 图片 contain 完整显示（C14），无图用淡纸首字占位 */
.dish-img { width: 180px; height: 140px; object-fit: contain; border-radius: var(--radius); margin: 10px auto 0; display: block; }
/* 待开转装饰插画（备用精修 R25），保持 contain 完整显示 */
.dish-img.ill-idle { opacity: .95; }
.dish-name { display: block; font-size: 19px; font-weight: 800; margin-top: 6px; }
.dish-sub { font-size: 10.5px; color: var(--ink-2); margin-top: 5px; font-weight: 400; }
.rate { color: var(--star); font-weight: 700; }
.go-station { margin-top: 12px; }
/* 默认候选无真实详情 id：置灰不可点，且悬停不变化 */
.go-station:disabled { opacity: .5; cursor: not-allowed; }
.go-station:disabled:hover { background: var(--brand); }

.tip-row { text-align: center; font-size: 11px; color: var(--ink-3); margin-top: 16px; font-weight: 400; }

/* ===== 转盘 ===== */
.wheelwrap { position: relative; width: 314px; height: 314px; margin: 18px auto 0; }
.wheel {
    width: 314px; height: 314px; border-radius: 50%;
    border: 8px solid var(--paper);
    box-shadow: 0 8px 40px rgba(140, 110, 60, 0.16);
    position: relative;
    transition: transform 3s cubic-bezier(.15, .9, .2, 1);
    /* 8 分区交替淡金/卡面，from -22.5deg 使分区中心对准指针 */
    background: conic-gradient(from -22.5deg, var(--brand-light) 0 45deg, var(--paper) 45deg 90deg, var(--brand-light) 90deg 135deg, var(--paper) 135deg 180deg, var(--brand-light) 180deg 225deg, var(--paper) 225deg 270deg, var(--brand-light) 270deg 315deg, var(--paper) 315deg 360deg);
}
/* 分区标签：环形水平排布 */
.wlabel {
    position: absolute; font-size: 10.5px; font-weight: 700; color: #5C4A2E;
    transform: translate(-50%, -50%);
    background: rgba(255, 253, 245, 0.78); padding: 2px 7px; border-radius: var(--radius-sm);
    white-space: nowrap;
}
/* 中心「开转」按钮：正圆图标钮（规范允许） */
.go {
    position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%);
    width: 58px; height: 58px; border-radius: 50%;
    background: var(--brand); color: #FFFDF5;
    display: flex; align-items: center; justify-content: center;
    font-size: 16px; font-weight: 800; font-family: inherit;
    border: 4px solid var(--paper); cursor: pointer; z-index: 3;
    box-shadow: 0 4px 14px rgba(140, 110, 60, 0.35);
    transition: background .12s ease;
}
.go:hover:not(:disabled) { background: var(--brand-dark); }
.go:disabled { opacity: .7; cursor: default; }
/* 顶部指针 */
.pin {
    position: absolute; left: 50%; top: -9px; transform: translateX(-50%);
    width: 0; height: 0; z-index: 3;
    border-left: 9px solid transparent; border-right: 9px solid transparent;
    border-top: 16px solid var(--ink);
}

/* 再转一次 */
.ops { display: flex; margin-top: 20px; }
.btn-ghost {
    width: 100%; background: var(--paper); border: 1px solid var(--line); color: var(--ink-3);
    border-radius: var(--radius-sm); font-size: 13px; font-weight: 600; padding: 11px 14px; cursor: pointer;
    font-family: inherit; transition: background .12s ease, color .12s ease;
}
.btn-ghost:hover:not(:disabled) { background: #FBF3DC; color: var(--brand-dark); }
.btn-ghost:disabled { opacity: .6; cursor: default; }
/* 候选管理按钮：与「再转一次」并排 */
.ops .mgr-btn { flex: 1; margin-right: 10px; }
.ops .btn-ghost:nth-child(2) { flex: 1; }

/* ===== 候选管理弹层：遮罩 + 底部弹出卡（层级高于 tabbar，整层竖滚、滚动条隐藏） ===== */
.mgr-mask {
    position: fixed; inset: 0; z-index: 300; /* 高于 tabbar(200) */
    background: rgba(58, 46, 26, .4);
    display: flex; align-items: flex-end; justify-content: center;
    animation: mgr_fade .18s ease;
}
@keyframes mgr_fade { from { opacity: 0; } to { opacity: 1; } }
.mgr-panel {
    width: 100%; max-height: 82vh; overflow-y: auto;
    background: var(--page); border-radius: 20px 20px 0 0;
    padding: 16px 16px 28px; animation: mgr_up .22s ease;
    /* 整层竖直滚动，滚动轴全部隐藏 */
    scrollbar-width: none;
    -ms-overflow-style: none;
}
.mgr-panel::-webkit-scrollbar { display: none; }
@keyframes mgr_up { from { transform: translateY(40px); opacity: .4; } to { transform: none; opacity: 1; } }
.sp-head { display: flex; align-items: center; margin-bottom: 4px; }
.sp-head b { font-size: 15px; }
.sp-close {
    margin-left: auto; width: 30px; height: 30px; border-radius: 50%;
    background: var(--paper); box-shadow: var(--shadow-soft);
    display: flex; align-items: center; justify-content: center;
    color: var(--ink-2); cursor: pointer;
}
.sp-sec { font-size: 13px; font-weight: 800; margin: 14px 0 10px; display: flex; align-items: baseline; gap: 8px; }
.sp-sec span { font-size: 10px; font-weight: 400; color: var(--ink-2); }
.sp-act { margin-left: auto; font-size: 10.5px; color: var(--brand-dark); font-weight: 600; cursor: pointer; }
/* 候选网格（与形象弹层同款 4 列格子） */
.face-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px 6px; }
/* 当前候选不可点（仅右上删除可点）；从收藏夹添加的格子才可点选，故手型仅落在收藏格子 */
.face-grid .sg { flex: none; }
.fav-grid .sg { cursor: pointer; }
.face-grid .sg.on .sg-img { border-color: var(--brand); background: var(--brand-light); }
.sg { position: relative; text-align: center; }
.sg-img {
    display: block; width: 64px; height: 64px; margin: 0 auto;
    border-radius: 14px; border: 1.5px solid var(--line); background: var(--paper);
    overflow: hidden; transition: border-color .12s ease;
    display: flex; align-items: center; justify-content: center;
}
.sg-img img { width: 100%; height: 100%; object-fit: contain; }
.sg-ph { font-size: 22px; font-weight: 800; color: var(--ink-3); }
.sg .nm { font-size: 9.5px; font-weight: 600; margin-top: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sg .tg { font-size: 8.5px; color: var(--ink-2); }
/* 候选右上删除小叉 */
.sg-del {
    position: absolute; top: -5px; right: 4px; z-index: 1;
    width: 17px; height: 17px; border-radius: 50%;
    background: var(--ink); color: #FFFDF5;
    display: flex; align-items: center; justify-content: center;
    cursor: pointer; box-shadow: 0 1px 4px rgba(58, 46, 26, .3);
}
.fav-empty { text-align: center; font-size: 11px; color: var(--ink-3); padding: 18px 0 8px; }

/* 淡色备注 */
.compliance-note { text-align: center; font-size: 10.5px; color: var(--ink-2); margin: 26px 0 8px; line-height: 1.7; }

/* ===== 桌面适配（≥769）===== */
@media (min-width: 769px) {
    /* 整页限宽 720 居中 */
    .wheel-page { max-width: 720px; }
    /* 转盘整体放大（314 → 约 364）：分区标签为脚本内联像素定位，
       直接改宽高会错位，故用等比 scale；origin 顶部居中向下扩展 */
    .wheelwrap { transform: scale(1.16); transform-origin: top center; margin-top: 24px; }
    /* 补偿 scale 溢出的约 50px 高度，避免压住「再转一次」按钮 */
    .ops { margin-top: 74px; justify-content: center; }
    /* 再转按钮桌面限宽居中，避免 720 宽下通栏过长 */
    .btn-ghost { width: auto; min-width: 260px; padding: 12px 32px; }
}
</style>
