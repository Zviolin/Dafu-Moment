<template>
    <div class="page-wrap pet-community">
        <!-- 顶部返回头：全服数量为 pet 表真实计数 -->
        <div class="topbar">
            <span class="icircle back" aria-label="返回" @click="go_back">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7" /></svg>
            </span>
            <b class="t-title">社区宠物中心</b>
            <span class="t-right">全服 {{ total }} 只福宝</span>
        </div>

        <!-- 我的宠物入口卡：真实等级/道具/金币 -->
        <div class="card mine-entry fade-up" @click="$router.push('/pet')">
            <span class="mine-stage">
                <img class="mine-pet base" :src="face_of(mine.mood)" alt="我家的福宝" />
                <img v-if="mine.dress_id" class="mine-dress" :src="`/assets/pet-dress/${mine.dress_id}.png${PET_DRESS_VER}`" alt="" decoding="async" />
            </span>
            <div class="mine-info">
                <b>{{ mine.pet_name || '小福宝' }}</b>
                <span class="mine-sat">
                    <i class="sat-bar"><em :style="{ width: mine_satiety + '%' }"></em></i>
                    {{ mood_text(mine.mood) }} · 点亮 {{ mine.lit_days }} 天
                </span>
                <span class="mine-sub">Lv.{{ mine.level }} · 道具 ×{{ mine.props ?? 0 }} · {{ mine.coins ?? 0 }} 金币 · 点进小窝看看</span>
                <span class="mine-rank">{{ mine_rank_text }}</span>
            </div>
            <i class="mine-arr">›</i>
        </div>

        <!-- 真实投喂榜 Top3：只收喂过至少 1 次的福宝（0 次不上榜） -->
        <div class="sec"><b>累计投喂榜</b><span>按真实喂食次数排序 · 喂过至少 1 次才上榜</span></div>
        <section v-if="ranking.length" class="top3 fade-up">
            <div v-for="t in ranking" :key="t.user_id" class="t-card">
                <span class="rank" :class="`r${t.rank}`">{{ t.rank }}</span>
                <img class="avatar-fix" :src="avatar_of(t)" :alt="t.nickname" />
                <b class="t-name">{{ t.nickname }}</b>
                <span class="t-count">喂了 {{ t.feed_total }} 次</span>
            </div>
        </section>
        <!-- 空态：全服还没有任何投喂记录时，不拿 0 次的福宝凑榜 -->
        <p v-else-if="loaded" class="rank-empty">还没有同学投喂过福宝，去「我的宠物」喂第一口吧～</p>

        <!-- 宠物广场：真实宠物卡流 -->
        <div class="sec"><b>宠物广场</b><span>每只福宝都来自真实账号</span></div>
        <section class="p-list">
            <div v-for="(p, i) in pets" :key="p.user_id" class="card p-card fade-up" :style="{ animationDelay: `${(i % 6) * 40}ms` }">
                <div class="p-pet-wrap">
                    <img class="p-pet base" :src="face_of(p.mood)" alt="福宝" />
                    <img v-if="p.dress_id" class="p-dress" :src="`/assets/pet-dress/${p.dress_id}.png${PET_DRESS_VER}`" alt="" loading="lazy" decoding="async" />
                    <span class="chip face-chip">{{ face_label(p.mood) }}</span>
                </div>
                <div class="p-body">
                    <div class="p-owner">
                        <img class="avatar-fix" :src="avatar_of(p)" style="width: 20px; height: 20px; border-radius: 50%;" alt="" />
                        <b>{{ p.nickname }}</b>
                        <span class="chip" v-if="p.is_me">我</span>
                    </div>
                    <p class="p-mood">{{ p.pet_name }} · {{ mood_text(p.mood) }}</p>
                    <div class="p-stats">
                        <span>Lv.<b>{{ p.level }}</b></span>
                        <span v-if="p.feed_total > 0">累计投喂 <b>{{ p.feed_total }}</b> 次</span>
                        <span v-else>还没投喂过</span>
                        <span>点亮 <b>{{ p.lit_days }}</b> 天</span>
                    </div>
                </div>
            </div>
        </section>
        <p v-if="loaded && pets.length === 0" class="list-empty">还没有同学养福宝，快去签到领养第一只吧～</p>
    </div>
</template>

<script setup>
/**
 * 社区宠物中心（r78 修正）：
 * - 全服福宝数 = pet 表 COUNT(*)，不再写死 1,208
 * - 榜单与广场均为真实用户宠物；无数据时展示空状态，不编造他人昵称
 * - 我的宠物卡读取 /me/pet 的真实等级、道具、金币、点亮天数
 */
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { api_pet } from '../api';
// 贴纸缓存版本号（r81）：与宠物页共用，避免图片优化后仍命中旧缓存
import { PET_DRESS_VER } from '../utils/asset-version.js';
import { avatar_url } from '../utils/format';

const router = useRouter();
const total = ref(0);
const pets = ref([]);
// 累计投喂榜（后端只返回喂过至少 1 次的 Top3）
const ranking = ref([]);
const my_rank = ref(null);
const my_pet = ref({});
const loaded = ref(false);

const mine = computed(() => ({
    ...(my_pet.value || {}),
    ...(pets.value.find((p) => p.is_me) || {}),
}));
const mine_satiety = computed(() => (mine.value.mood === 'happy' ? 90 : (mine.value.mood === 'normal' ? 60 : 25)));

/**
 * 我的投喂榜文案：进榜显示名次；喂过但未进前三 / 从未投喂分别给引导
 * @returns {string}
 */
const mine_rank_text = computed(() => {
    if (my_rank.value) return `累计投喂榜第 ${my_rank.value.rank} 名 · 已喂 ${my_rank.value.feed_total} 次`;
    const fed = Number(mine.value.feed_total) || 0;
    if (fed > 0) return `已投喂 ${fed} 次 · 暂未进入前三`;
    return '还没投喂过 · 喂第一口就能上榜';
});

/**
 * 头像地址
 * @param {Object} p
 * @returns {string}
 */
function avatar_of(p) { return avatar_url(p.avatar_object_key); }

/**
 * 心情 → 表情图
 * @param {string} mood
 * @returns {string}
 */
function face_of(mood) {
    if (mood === 'happy') return '/assets/pet/e-happy.png';
    if (mood === 'normal') return '/assets/pet/e-calm.png';
    return '/assets/pet/e-wrong.png';
}

/**
 * 心情 → 表情签
 * @param {string} mood
 * @returns {string}
 */
function face_label(mood) {
    if (mood === 'happy') return '开心';
    if (mood === 'normal') return '平静';
    return '饿肚子';
}

/**
 * 心情 → 文案
 * @param {string} mood
 * @returns {string}
 */
function mood_text(mood) {
    if (mood === 'happy') return '刚吃饱，心情很好';
    if (mood === 'normal') return '在安静地待机';
    return '有点饿了，等投喂';
}

/**
 * 返回上一页
 */
function go_back() { router.back(); }

onMounted(async () => {
    try {
        const [community, state] = await Promise.all([api_pet.community(), api_pet.state()]);
        total.value = community.total;
        pets.value = community.list;
        ranking.value = community.ranking || [];
        my_rank.value = community.my_rank || null;
        my_pet.value = state;
    } catch (e) {
        ElMessage.error(e?.message || '宠物广场加载失败');
    } finally {
        loaded.value = true;
    }
});
</script>

<style scoped>
/* 顶部返回头 */
.topbar { display: flex; align-items: center; justify-content: space-between; padding-top: 12px; min-height: 44px; }
.t-title { font-size: 15px; font-weight: 700; letter-spacing: 0.5px; }
.t-right { font-size: 10px; color: var(--ink-2); }
.icircle.back { color: var(--ink); }

/* 我的宠物入口卡：舞台式（大贴纸 + 饱腹度条），与宠物页 UI 同源 */
.mine-entry { margin-top: 16px; display: flex; align-items: center; gap: 14px; cursor: pointer; padding: 14px 16px; }
.mine-stage {
    flex-shrink: 0; width: 84px; height: 84px; border-radius: 18px;
    background: var(--paper); border: 1.5px solid var(--line);
    display: flex; align-items: center; justify-content: center; overflow: hidden;
}
.mine-pet { width: 68px; height: 68px; object-fit: contain; }
.mine-info { flex: 1; min-width: 0; }
.mine-info b { display: block; font-size: 14.5px; }
.mine-sat { display: flex; align-items: center; gap: 7px; font-size: 10.5px; color: var(--ink-2); margin-top: 6px; }
.mine-sat .sat-bar { flex: 1; max-width: 130px; }
.mine-sub { display: block; font-size: 10.5px; color: var(--ink-2); margin-top: 4px; }
.mine-rank { display: block; font-size: 10.5px; color: var(--brand); margin-top: 4px; }
.mine-arr { font-style: normal; font-size: 15px; color: var(--ink-2); flex-shrink: 0; }
/* 饱腹度小进度条（与宠物页 sat-bar 同款口径） */
.mine-sat .sat-bar { display: inline-block; height: 7px; border-radius: 4px; background: rgba(201, 138, 30, .14); overflow: hidden; }
.mine-sat .sat-bar em { display: block; height: 100%; border-radius: 4px; background: var(--brand); }

/* 周投喂榜 Top3 */
.top3 { display: flex; gap: 10px; }
.t-card { flex: 1; background: var(--paper); border-radius: var(--radius); box-shadow: var(--shadow-soft); padding: 18px 8px 14px; text-align: center; position: relative; }
.rank {
    position: absolute; top: 8px; left: 8px; width: 20px; height: 20px; border-radius: 50%;
    font-size: 11px; font-weight: 800; display: flex; align-items: center; justify-content: center;
    background: var(--brand-light); color: var(--ink-3);
}
.rank.r1 { background: var(--brand); color: #FFFDF5; }
.rank.r2 { background: #EBCF9C; color: #7A5514; }
.rank.r3 { background: #F1E7D0; color: #A08550; }
.t-card img { width: 44px; height: 44px; border-radius: 50%; margin: 6px auto 0; display: block; }
.t-name { display: block; font-size: 11.5px; margin-top: 8px; }
.t-count { display: block; font-size: 9.5px; color: var(--ink-2); margin-top: 3px; }

/* 宠物广场卡流 */
.p-list { display: flex; flex-direction: column; gap: 12px; }
.p-card { display: flex; gap: 12px; }
/* 宠物广场方形图：圆润外框 + 贴纸 contain 完整显示（复刻 P33 .pcell 比例） */
.p-pet-wrap {
    position: relative; flex-shrink: 0; width: 88px; height: 88px;
    border-radius: 16px; border: 1.5px solid var(--line); background: var(--paper);
    overflow: hidden;
}
.p-pet { width: 100%; height: 100%; object-fit: contain; }
.face-chip { position: absolute; left: 50%; transform: translateX(-50%); bottom: -2px; white-space: nowrap; }
.p-body { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.p-owner { display: flex; align-items: center; gap: 7px; }
.p-owner b { font-size: 12.5px; }
.p-mood {
    font-size: 11px; color: #5C4A2E; line-height: 1.7; margin: 6px 0 0;
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}
.p-ops { display: flex; gap: 8px; margin-top: auto; padding-top: 8px; }
.op-btn {
    display: inline-flex; align-items: center; gap: 5px;
    height: 28px; padding: 0 11px; border-radius: var(--radius-sm);
    background: var(--brand-light); color: var(--ink-3);
    border: none; font-size: 11px; font-weight: 600; cursor: pointer;
    transition: background .12s ease, color .12s ease;
}
.op-btn svg { width: 13px; height: 13px; }
.op-btn:not(:disabled):hover { background: var(--brand); color: #FFFDF5; }
.op-btn.done { background: #F1E7D0; color: var(--ink-2); cursor: default; }

/* ===== 桌面适配（≥769）===== */
@media (min-width: 769px) {
    /* 宠物广场卡流：单列改 2 列网格（minmax(0,1fr) 防内容撑破列宽） */
    .p-list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
}

/* ===== 桌面适配（≥1200）===== */
@media (min-width: 1200px) {
    /* 宽屏三列铺开 */
    .p-list { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}
.p-pet-wrap .p-pet.base { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; }
.p-pet-wrap .p-dress { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; }
.p-stats { display: flex; gap: 10px; flex-wrap: wrap; font-size: 10px; color: var(--ink-2); padding-top: 8px; margin-top: auto; }
.p-stats b { color: var(--brand); }
.mine-stage { position: relative; }
.mine-stage .mine-dress { position: absolute; inset: 4px; width: calc(100% - 8px); height: calc(100% - 8px); object-fit: contain; }
.list-empty { text-align: center; font-size: 11.5px; color: var(--ink-2); padding: 20px 0; }
/* 投喂榜空态（未有一笔真实投喂时不凑榜） */
.rank-empty { text-align: center; font-size: 11.5px; color: var(--ink-2); padding: 14px 0 4px; }
</style>
