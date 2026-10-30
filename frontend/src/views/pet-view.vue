<template>
    <div class="page-wrap pet">
        <!-- 顶部返回头 -->
        <div class="topbar">
            <span class="icircle back" aria-label="返回" @click="go_back">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7" /></svg>
            </span>
            <b class="t-title">我的宠物</b>
            <i class="t-hold"></i>
        </div>

        <!-- 1. 用户信息条：点亮天数来自 pet.created_at 真实计算 -->
        <div class="user-row fade-up">
            <img class="avatar-fix" :src="avatar_src" style="width: 38px; height: 38px; border-radius: 50%;" alt="头像" />
            <b class="nick">{{ nick }}</b>
            <div class="lit">
                <span class="lit-t">已点亮</span>
                <b class="lit-n score-num">{{ pet.lit_days }}</b>
                <span class="lit-t">天</span>
            </div>
        </div>

        <!-- 2. 宠物舞台：表情随真实饱腹状态切换 + 装扮叠加 -->
        <div class="petstage fade-up">
            <span class="tray"></span>
            <img class="pet" :class="{ bump: feed_bump }" :src="pet_face" alt="福宝" />
            <img v-if="pet.dress_id" class="pet dress" :class="{ bump: feed_bump }" :src="`/assets/pet-dress/${pet.dress_id}.png${PET_DRESS_VER}`" alt="装扮" decoding="async" />
            <span v-if="float_on" class="float-plus">经验 +10</span>
        </div>

        <!-- 3. 名称 + 成长值/等级行 -->
        <div class="pet-name">{{ pet.name || '小福宝' }}</div>
        <div class="lvrow">
            <span class="lvb">Lv.{{ pet.level }}</span>
            <span class="bar"><i :style="{ width: growth_pct + '%' }"></i></span>
            <span class="gift"><img :src="`/assets/pet-dress/d9.png${PET_DRESS_VER}`" alt="皇冠奖励" width="18" height="18" decoding="async" /></span>
        </div>
        <div class="lv-tip">{{ level_tip }}</div>

        <!-- 4. 饥饿引导：只影响外观，不扣数据；区分「从未投喂」与「超 24 小时未喂」 -->
        <div v-if="pet.mood === 'hungry'" class="hungry card fade-up">
            <b>{{ pet.fed_never ? '福宝还没开饭…' : '福宝饿肚子了…' }}</b>
            <p v-if="pet.fed_never">新领养的福宝还没投喂过——<b>只影响外观，不会扣任何数据</b>。每日首次打卡送 1 个喂养道具，或用 10 金币投喂。</p>
            <p v-else>超过 24 小时没喂食啦——<b>只影响外观，不会扣任何数据</b>。每日首次打卡送 1 个喂养道具，或用 10 金币投喂。</p>
            <button class="btn-primary hungry-btn" @click="$router.push('/checkin')">去打卡 · 领投喂道具</button>
        </div>

        <!-- 5. 饱腹度 + 投喂：道具优先，不足自动扣金币（后端真实结算） -->
        <div class="feed-zone fade-up">
            <div class="sat-row">
                <span class="sat-label">饱腹度</span>
                <span class="sat-bar"><i :style="{ width: satiety + '%' }"></i></span>
                <b class="sat-num">{{ satiety }}</b>
            </div>
            <!-- 投喂按钮只保留动作本身；金币余额与本次消耗放到按钮下方提示（r90） -->
            <button class="btn-primary feed-btn" :class="{ bumping: feed_bump }" @click="feed" :disabled="feeding">
                {{ feeding ? '投喂中…' : '投喂' }}
            </button>
            <div class="feed-tip">
                <template v-if="pet.props > 0">当前 {{ pet.coins }} 金币 · 道具 ×{{ pet.props }}（优先消耗，本次不扣金币）</template>
                <template v-else-if="!feed_lack">当前 {{ pet.coins }} 金币 · 本次投喂消耗 {{ feed_price }} 金币</template>
                <template v-else>当前 {{ pet.coins }} 金币</template>
                · <a @click="$router.push('/tasks')">去任务中心赚金币</a>
            </div>
            <!-- 金币不足且无道具时明确提示，不再把余额塞进按钮 -->
            <div v-if="feed_lack" class="feed-lack">没有金币（投喂需 {{ feed_price }} 金币）</div>
        </div>

        <!-- 5.5 三宫格入口 -->
        <div class="tri fade-up">
            <a class="tri-cell" @click="skin_open = true">
                <img src="/assets/icons/grid-avatar.png" alt="形象" />
                <span class="tt">形象</span>
                <span class="sub">基础 + {{ pet.dresses.length }} 款装扮</span>
            </a>
            <router-link class="tri-cell" to="/tasks">
                <img src="/assets/icons/grid-coin.png" alt="赚金币" />
                <span class="tt">赚金币</span>
                <span class="sub">{{ pet.coins }} 金币</span>
            </router-link>
            <router-link class="tri-cell" to="/pet-community">
                <img src="/assets/icons/grid-home.png" alt="社区" />
                <span class="tt">社区</span>
                <span class="sub">真实宠物墙</span>
            </router-link>
        </div>

        <!-- 6. 形象弹层 -->
        <div v-if="skin_open" class="skin-mask" @click.self="skin_open = false">
            <div class="skin-panel">
                <div class="sp-head">
                    <b>福宝的形象</b>
                    <span class="sp-close" aria-label="关闭" @click="skin_open = false">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
                    </span>
                </div>
                <div class="sp-sec">装扮橱窗 <span>未拥有会扣金币购买 · 已拥有可直接切换</span></div>
                <div class="face-grid">
                    <div
                        v-for="d in pet.dresses" :key="d.id"
                        class="sg" :class="{ on: pet.dress_id === d.id, locked: d.locked }"
                        @click="wear(d)"
                    >
                        <span v-if="pet.dress_id === d.id" class="using">使用中</span>
                        <span class="sg-img"><img :src="`/assets/pet-dress/${d.id}.png${PET_DRESS_VER}`" :alt="d.name" width="72" height="72" loading="lazy" decoding="async" /></span>
                        <div class="nm">{{ d.name }}</div>
                        <div class="tg">{{ dress_tag(d) }}</div>
                    </div>
                </div>
                <div class="sp-sec">表情图鉴 <span>不同状态有不同表情</span></div>
                <div class="face-grid">
                    <div v-for="f in FACES" :key="f.img" class="sg">
                        <span class="sg-img"><img :src="f.img" :alt="f.name" width="72" height="72" loading="lazy" decoding="async" /></span>
                        <div class="nm">{{ f.name }}</div>
                        <div class="tg">{{ f.when }}</div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup>
/**
 * 宠物成长页（r78 修正）：
 * - 全部状态来自 /me/pet：点亮天数按 pet.created_at 真实计算，不再写死 128 天
 * - 喂食调用 /me/pet/feed：道具优先，无道具扣 10 金币；金币不足给出明确引导
 * - 装扮调用 /me/pet/dress：未拥有先扣金币，已拥有才可直接切换
 * - 表情按后端 mood 切换；图片已统一抠成透明底
 */
import { ref, reactive, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { api_pet, api_auth } from '../api';
import { load_json } from '../utils/storage.js';
// 贴纸缓存版本号（r81）：图片体积优化后换缓存键，避免命中年缓存旧大图
import { PET_DRESS_VER } from '../utils/asset-version.js';
import { avatar_url } from '../utils/format';

const router = useRouter();

// 表情图鉴（与后端 mood 对应；全部透明底）
const FACES = [
    { img: '/assets/pet/base.png', name: '基础款', when: '初始形象' },
    { img: '/assets/pet/e-happy.png', name: '开心', when: '12 小时内喂食' },
    { img: '/assets/pet/e-calm2.png', name: '满足', when: '刚被投喂' },
    { img: '/assets/pet/e-calm.png', name: '平静', when: '日常待机' },
    { img: '/assets/pet/e-sleep.png', name: '打瞌睡', when: '12~24 小时未喂' },
    { img: '/assets/pet/e-wrong.png', name: '委屈', when: '超过 24 小时未喂' },
    { img: '/assets/pet/e-angry.png', name: '生气', when: '连续 3 天未喂' },
    { img: '/assets/pet/e-shy.png', name: '吃饱', when: '投喂后摸摸' },
    { img: '/assets/pet/e-cry1.png', name: '哭泣', when: '连续 5 天未喂' },
    { img: '/assets/pet/e-cry2.png', name: '水晶天使', when: '长期未登录' },
];

const nick = ref('知食小王');
const avatar_src = ref('/assets/avatar-user.png');
const feeding = ref(false);
const feed_bump = ref(false);
const float_on = ref(false);
const skin_open = ref(false);
const pet = reactive({
    name: '小福宝', level: 1, exp: 0, exp_next: 50, exp_level_base: 0,
    props: 0, coins: 0, lit_days: 1, feed_total: 0, mood: 'normal',
    feed_price: 10,
    fed_never: true,
    dress_id: null, dresses: [],
});

/** 本次投喂金币价（后端 state 里给 feed_price，未返回时按 10 兜底） */
const feed_price = computed(() => Number(pet.feed_price) || 10);

/** 金币不足：没有道具且余额不够一次投喂（用于按钮下方「没有金币」提示） */
const feed_lack = computed(() => Number(pet.props) <= 0 && Number(pet.coins) < feed_price.value);

// 投喂瞬间短暂切「满足」，随后回真实心情
const pet_face = computed(() => {
    if (feed_bump.value) return '/assets/pet/e-calm2.png';
    if (pet.mood === 'happy') return '/assets/pet/e-happy.png';
    if (pet.mood === 'normal') return '/assets/pet/e-calm.png';
    return '/assets/pet/e-wrong.png';
});

// 饱腹度由真实心情映射（仅展示，不影响后端数据）
const satiety = computed(() => (feed_bump.value ? 95 : (pet.mood === 'happy' ? 90 : (pet.mood === 'normal' ? 60 : 25))));

// 当前等级内成长进度
const growth_pct = computed(() => {
    if (!pet.exp_next) return 100;
    const span = pet.exp_next - pet.exp_level_base;
    return span > 0 ? Math.min(100, Math.round(((pet.exp - pet.exp_level_base) / span) * 100)) : 100;
});

// 等级提示
const level_tip = computed(() => {
    if (pet.level >= 20) return 'Lv.20 满级 · 福宝已经是校园元老啦';
    const need = Math.max(0, pet.exp_next - pet.exp);
    return `升到 Lv.${pet.level + 1} 还需 ${need} 经验（约 ${Math.ceil(need / 10)} 次投喂）`;
});

/**
 * 装扮角标：锁定 / 已拥有 / 价格
 * @param {Object} d
 * @returns {string}
 */
function dress_tag(d) {
    if (d.locked) return `Lv.${d.min_level} 解锁`;
    if (d.owned) return d.active ? '使用中' : '已拥有';
    return d.price ? `${d.price} 金币` : '免费解锁';
}

/**
 * 拉取真实宠物状态
 */
async function load() {
    const data = await api_pet.state();
    Object.assign(pet, data);
}

/**
 * 加载用户昵称/头像
 */
async function load_user() {
    try {
        const me = await api_auth.me();
        if (me?.nickname) nick.value = me.nickname;
        if (me?.avatar_object_key) avatar_src.value = avatar_url(me.avatar_object_key);
    } catch {
        const u = load_json('fk_user', null);
        if (u?.nickname) nick.value = u.nickname;
    }
}

/**
 * 返回上一页
 */
function go_back() {
    router.back();
}

/**
 * 投喂（后端结算，失败提示原因）
 */
async function feed() {
    if (feeding.value) return;
    // 金币不足且无道具：直接明确提示「没有金币」，不发请求（r90）
    if (feed_lack.value) {
        ElMessageBox.confirm(`没有金币（投喂 1 次需要 ${feed_price.value} 金币，签到可领 1 个道具）`, '暂时无法投喂', {
            confirmButtonText: '去签到领道具', cancelButtonText: '去任务中心', type: 'warning',
        }).then(() => router.push('/checkin')).catch(() => router.push('/tasks'));
        return;
    }
    feeding.value = true;
    try {
        const data = await api_pet.feed();
        Object.assign(pet, data);
        const how = data.fed_cost_type === 'coin' ? `消耗 ${data.fed_cost_amount} 金币` : '消耗 1 个道具';
        ElMessage.success(`投喂成功，${how}，经验 +10`);
        feed_bump.value = true;
        float_on.value = true;
        setTimeout(() => { feed_bump.value = false; }, 1400);
        setTimeout(() => { float_on.value = false; }, 1000);
    } catch (e) {
        ElMessageBox.confirm(e?.message || '投喂失败', '暂时无法投喂', {
            confirmButtonText: '去签到领道具', cancelButtonText: '去任务中心', type: 'warning',
        }).then(() => router.push('/checkin')).catch(() => router.push('/tasks'));
    } finally {
        feeding.value = false;
    }
}

/**
 * 穿戴/购买装扮
 * @param {Object} d
 */
async function wear(d) {
    if (d.active) return ElMessage.info('福宝正穿着这件装扮');
    if (d.locked) return ElMessage.warning(`需要 Lv.${d.min_level} 才能解锁「${d.name}」`);
    try {
        if (!d.owned && d.price > 0) {
            await ElMessageBox.confirm(`「${d.name}」尚未拥有，要花费 ${d.price} 金币购买并穿上吗？`, '购买装扮', {
                confirmButtonText: '购买并穿戴', cancelButtonText: '再想想', type: 'warning',
            });
        }
        const data = await api_pet.wear(d.id);
        Object.assign(pet, data);
        ElMessage.success(data.dress_bought ? `已购买「${d.name}」并穿戴` : `已换上「${d.name}」`);
    } catch (e) {
        if (e === 'cancel' || e === 'close') return;
        ElMessage.warning(e?.message || '装扮操作失败');
    }
}

onMounted(async () => {
    await load_user();
    try { await load(); } catch (e) { ElMessage.error(e?.message || '宠物状态加载失败'); }
});
</script>

<style scoped>
/* 顶部返回头 */
.topbar { display: flex; align-items: center; justify-content: space-between; padding-top: 12px; min-height: 44px; }
.t-title { font-size: 15px; font-weight: 700; letter-spacing: 0.5px; }
.t-hold { width: 40px; flex-shrink: 0; }
.icircle.back { color: var(--ink); }

/* 用户信息条 */
.user-row { display: flex; align-items: center; gap: 9px; padding-top: 10px; }
.nick { font-size: 14px; flex: 1; }
/* C13：已点亮 128 天 —— 小字 + 数字强调同行 */
.lit { display: flex; align-items: baseline; gap: 4px; }
.lit-t { font-size: 10.5px; color: var(--ink-2); }
.lit-n { font-size: 16px; color: var(--brand); }

/* 宠物舞台 */
.petstage { position: relative; height: 224px; display: flex; align-items: flex-end; justify-content: center; }
.tray {
    position: absolute; bottom: 6px; left: 50%; transform: translateX(-50%);
    width: 210px; height: 26px; border-radius: 50%;
    background: radial-gradient(ellipse at center, #D9C69A 0%, rgba(217, 198, 154, 0) 72%);
}
/* 注意：根元素类名含 pet（page-wrap pet），图片规则必须限定在 .petstage 内，
   否则 .pet 会命中根容器导致整页被压成 168px（历史事故） */
.petstage .pet { width: 168px; height: 168px; object-fit: contain; position: relative; z-index: 2; transition: opacity .2s ease; }
/* 装扮叠加层：与宠物图同位覆盖（用 left 偏移定位，避免与 bump 动画的 transform 冲突） */
.petstage .pet.dress { position: absolute; left: calc(50% - 84px); bottom: 0; z-index: 3; pointer-events: none; }
.petstage .pet.bump { animation: bump .5s ease; }
@keyframes bump {
    0%, 100% { transform: translateY(0); }
    35% { transform: translateY(-10px) scale(1.04); }
    70% { transform: translateY(0); }
}
.float-plus {
    position: absolute; top: 34px; left: 50%; transform: translateX(-50%); z-index: 4;
    font-size: 12px; font-weight: 700; color: var(--brand-dark);
    background: var(--brand-light); border-radius: var(--radius-sm); padding: 3px 10px;
    animation: float_up 1s ease both;
}
@keyframes float_up {
    from { opacity: 0; transform: translate(-50%, 6px); }
    30% { opacity: 1; }
    to { opacity: 0; transform: translate(-50%, -22px); }
}

/* 名称 + 等级行 */
.pet-name { text-align: center; font-size: 16px; font-weight: 700; }
.lvrow { display: flex; align-items: center; justify-content: center; gap: 9px; margin-top: 10px; }
.lvb { width: 32px; height: 32px; border-radius: 50%; background: var(--brand); color: #FFFDF5; font-size: 10.5px; font-weight: 800; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.bar { width: 150px; height: 12px; border-radius: 8px; background: #EDE0C2; overflow: hidden; }
.bar i { display: block; height: 100%; background: linear-gradient(90deg, #EBCF9C, var(--star)); border-radius: 8px; transition: width .3s ease; }
.gift { width: 28px; height: 28px; border-radius: 50%; background: var(--paper); border: 1px solid var(--line); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.gift img { width: 18px; height: 18px; object-fit: contain; }
.lv-tip { text-align: center; font-size: 9.5px; color: var(--ink-2); margin-top: 6px; }

/* 饥饿引导卡 */
.hungry { margin-top: 18px; }
.hungry b { font-size: 13px; }
.hungry p { font-size: 11px; color: #5C4A2E; line-height: 1.8; margin: 6px 0 12px; }
.hungry p b { font-size: 11px; color: var(--brand-dark); }
.hungry-btn { width: 100%; height: 40px; }

/* 饱腹度 + 投喂 */
.feed-zone { margin-top: 24px; }
.sat-row { display: flex; align-items: center; gap: 9px; }
.sat-label { font-size: 10.5px; color: var(--ink-2); flex-shrink: 0; }
.sat-bar { flex: 1; height: 10px; border-radius: 8px; background: #EDE0C2; overflow: hidden; }
.sat-bar i { display: block; height: 100%; background: linear-gradient(90deg, #EBCF9C, var(--star)); border-radius: 8px; transition: width .3s ease; }
.sat-num { font-size: 13px; min-width: 26px; text-align: right; }
.feed-btn { display: flex; width: 200px; height: 42px; margin: 14px auto 0; font-size: 14px; font-weight: 800; }
.feed-btn.bumping { animation: bump .5s ease; }
.feed-tip { text-align: center; font-size: 10px; color: var(--ink-2); margin-top: 9px; line-height: 1.7; }
.feed-tip a { color: var(--brand); font-weight: 700; cursor: pointer; }
/* 金币不足提示：淡红底小条，位置在提示行之下（r90） */
.feed-lack {
    width: fit-content; margin: 6px auto 0; padding: 3px 10px;
    border-radius: 999px; background: #FBEAE5; color: #C0533E;
    font-size: 10.5px; font-weight: 700; line-height: 1.6;
}

/* 三宫格入口：形象 / 赚金币 / 社区（复刻 P14 .tri：3 列白卡 + 44px contain 贴纸） */
.tri { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; margin-top: 14px; }
.tri-cell {
    background: var(--paper); border-radius: 14px; box-shadow: var(--shadow-soft);
    display: flex; flex-direction: column; align-items: center; padding: 14px 0 12px; gap: 6px;
    cursor: pointer; transition: transform .08s ease;
    text-decoration: none; color: inherit; /* router-link 渲染为 a，去掉默认下划线与链接色 */
}
.tri-cell:active { transform: translateY(1px); }
.tri-cell img { width: 44px; height: 44px; object-fit: contain; }
.tri-cell .tt { font-size: 11.5px; font-weight: 700; color: var(--ink); }
.tri-cell .sub { font-size: 9px; color: var(--ink-2); }

.sg { position: relative; flex: 0 0 76px; text-align: center; }
/* 方形图外框：圆润描边容器 + overflow hidden，贴纸 contain 完整显示 */
.sg-img {
    display: block; width: 64px; height: 64px; margin: 0 auto;
    border-radius: 14px; border: 1.5px solid var(--line); background: var(--paper);
    overflow: hidden; transition: border-color .12s ease;
}
.sg-img img {
    /* 完整贴纸 contain 显示，不放大裁切（与原型一致的查看比例） */
    width: 100%; height: 100%; object-fit: contain;
}
.sg.on .sg-img { border-color: var(--brand); background: var(--brand-light); }
.sg .using {
    position: absolute; top: -5px; left: 2px; font-size: 8px;
    background: var(--brand); color: #FFF; padding: 1px 5px; border-radius: 6px; z-index: 1;
}
.sg .nm { font-size: 9.5px; font-weight: 600; margin-top: 4px; }
.sg .tg { font-size: 8.5px; color: var(--ink-2); }

/* 形象弹层：遮罩 + 底部弹出卡（层级高于 tabbar，装扮/表情网格平铺，整层竖直滚动） */
.skin-mask {
    position: fixed; inset: 0; z-index: 300; /* 高于 tabbar(200)，底部内容不被导航遮挡 */
    background: rgba(58, 46, 26, .4);
    display: flex; align-items: flex-end; justify-content: center;
    animation: fade_in .18s ease;
}
@keyframes fade_in { from { opacity: 0; } to { opacity: 1; } }
.skin-panel {
    width: 100%; max-height: 82vh; overflow-y: auto;
    background: var(--page); border-radius: 20px 20px 0 0;
    padding: 16px 16px 28px; animation: slide_up .22s ease;
    /* 整层竖直滚动，滚动轴全部隐藏 */
    scrollbar-width: none;
    -ms-overflow-style: none;
}
.skin-panel::-webkit-scrollbar { display: none; }
@keyframes slide_up { from { transform: translateY(40px); opacity: .4; } to { transform: none; opacity: 1; } }
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
/* 装扮 + 表情统一网格平铺（4 列） */
.face-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px 6px; }
.face-grid .sg { flex: none; }

/* ===== 桌面适配（≥769）===== */
@media (min-width: 769px) {
    /* 整页限宽 860 居中（限定根组合类，避免命中 .petstage 内的 .pet 图片） */
    .page-wrap.pet { max-width: 860px; }
    /* 宠物舞台居中放大：宠物图 168 → 210，舞台高度随行 */
    .petstage { height: 272px; }
    .petstage .pet { width: 210px; height: 210px; }
    /* 装扮叠加层随放大后的宠物图同位对齐（半宽偏移 84 → 105） */
    .petstage .pet.dress { left: calc(50% - 105px); }
    /* 投喂区桌面横排：饱腹度条占左、投喂按钮占右，提示行跨两列 */
    .feed-zone {
        display: grid; grid-template-columns: 1fr auto;
        align-items: center; column-gap: 24px;
    }
    .sat-row { grid-column: 1; }
    .feed-btn { grid-column: 2; grid-row: 1; width: 220px; margin: 0; }
    .feed-tip { grid-column: 1 / -1; }
    /* 形象弹层：桌面限宽居中，格子加大 */
    .skin-panel { max-width: 560px; margin: 0 auto; }
    .sg-img { width: 72px; height: 72px; }
}

/* ===== 桌面适配（≥1200）===== */
</style>
