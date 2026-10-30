<template>
    <div class="dish-item card" @click="go_detail">
        <!-- 推荐角标：左上贴纸小签（果酱橙底墨字，微旋转） -->
        <span v-if="is_reco" class="reco-badge">推荐</span>
        <div class="thumb img-fallback">
            <img v-if="cover" :src="cover" loading="lazy" decoding="async" alt="" />
            <span v-else class="fallback-char">{{ dish.name.slice(0, 1) }}</span>
        </div>
        <div class="info">
            <div class="line-1">
                <span class="name">{{ dish.name }}</span>
                <span v-if="rating_avg > 0" class="wr score-num" :style="{ color: wr_color }">
                    {{ fmt_score(rating_avg) }}<i>分</i>
                </span>
                <span v-else class="wr na">暂无评分</span>
            </div>
            <div class="line-2">
                <star-rating v-if="rating_avg > 0" :model-value="Math.round(rating_avg)" readonly />
                <span class="cnt">{{ dish.review_count > 0 ? `${dish.review_count} 条点评` : '还没有点评' }}</span>
            </div>
            <div class="line-3">{{ loc_text }}</div>
            <div class="line-4" v-if="tag_list.length">
                <span v-for="t in tag_list" :key="t" class="tag">{{ t }}</span>
            </div>
            <div class="line-5">
                <span class="price">
                    <i>¥</i><b class="score-num">{{ price_text }}</b><i class="per">/{{ unit_text }}</i>
                    <em v-if="is_est" class="est" title="价格依据公开人均与招牌菜估算，仅供参考">估算</em>
                </span>
                <button class="fav-btn" :class="{ on: fav === 0 }" @click.stop="toggle_fav">
                    <el-icon :size="11"><Check v-if="fav === 0" /><Plus v-else /></el-icon>{{ fav === 0 ? '已想吃' : '想吃' }}
                </button>
            </div>
        </div>
    </div>
</template>

<script setup>
/**
 * DishCard：点评式列表条目（左图 96px + 右信息四行，04 §四改版）
 * 行结构：菜名+分数 / 星级+点评数 / 窗口·食堂 / 口味标签 / 价格+想吃按钮
 */
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { Plus, Check } from '@element-plus/icons-vue';
import { api_favorite } from '../api';
import { useAuthStore } from '../stores/auth';
import { cover_url, score_color, fmt_score } from '../utils/format';
import StarRating from './star-rating.vue';
import { ElMessage } from 'element-plus';

const props = defineProps({
    dish: { type: Object, required: true },
    favorite: { type: Number, default: null },
});
const emit = defineEmits(['fav-changed']);

const router = useRouter();
const auth = useAuthStore();
const fav = ref(props.favorite);

const cover = computed(() => cover_url(props.dish.cover_object_key));
// 推荐菜角标（isRecommended 字段缺省防御）
const is_reco = computed(() => !!(props.dish.isRecommended ?? props.dish.is_recommended ?? props.dish.recommended));
// v2.0：聚合分只有 rating_avg（普通平均分）
const rating_avg = computed(() => Number(props.dish.rating_avg) || 0);
const wr_color = computed(() => score_color(rating_avg.value));
const tag_list = computed(() =>
    (props.dish.taste_tags || '').split(',').map((s) => s.trim()).filter(Boolean).slice(0, 2)
);
const price_text = computed(() => Number(props.dish.price).toFixed(1).replace(/\.0$/, ''));
// 价格单位与估算标记：兼容档口详情（camelCase）与菜品列表（snake_case）两种返回
const unit_text = computed(() => props.dish.price_unit || props.dish.priceUnit || '人');
const is_est = computed(() => !!(props.dish.is_estimated ?? props.dish.isEstimated));
const loc_text = computed(() => {
    const canteen = String(props.dish.canteen_name || '').replace('旗山校区·', '');
    const station = props.dish.station_name || '';
    return [canteen, station].filter(Boolean).join(' · ');
});

/**
 * 跳转：菜品统一进所属档口页（修改说明第四章口径），无档口 id 时回退菜品页
 */
function go_detail() {
    const sid = props.dish.station_id || props.dish.stationId;
    router.push(sid ? `/station/${sid}` : `/dish/${props.dish.id}`);
}

/**
 * 想吃快捷收藏（未登录跳登录）
 */
async function toggle_fav() {
    if (!auth.is_login) {
        router.push({ path: '/login', query: { redirect: router.currentRoute.value.fullPath } });
        return;
    }
    const next = fav.value === 0 ? null : 0;
    try {
        await api_favorite.set({ subjectType: 0, subjectId: props.dish.id, listType: next });
        fav.value = next;
        ElMessage.success(next === 0 ? '已加入「想吃」' : '已取消想吃');
        emit('fav-changed');
    } catch { /* 拦截器已提示 */ }
}
</script>

<style scoped>
.dish-item { display: flex; gap: 12px; padding: 12px; cursor: pointer; transition: transform 0.12s ease, box-shadow 0.12s ease; position: relative; }
.dish-item:hover { transform: translateY(-2px); box-shadow: 0 7px 0 rgba(61, 47, 30, 0.16); }
/* 推荐贴纸角标：果酱橙底墨字，微旋转 -3deg 贴在左上角（贴纸语言） */
.reco-badge {
    position: absolute; top: -7px; left: -7px; z-index: 1;
    padding: 2px 9px; border-radius: 6px;
    background: var(--brand); color: var(--ink);
    border: 2px solid var(--ink); box-shadow: 0 2px 0 var(--ink);
    font-size: 11px; font-weight: 800; letter-spacing: 1px;
    transform: rotate(-3deg); pointer-events: none;
}
.thumb { width: 96px; height: 96px; border-radius: 10px; border: 2px solid var(--ink); overflow: hidden; flex-shrink: 0; }
.thumb img { width: 100%; height: 100%; object-fit: cover; }
.fallback-char { font-size: 34px; }
.info { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.line-1 { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
.name { font-weight: 700; font-size: 15px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.wr { font-size: 18px; flex-shrink: 0; }
.wr i { font-style: normal; font-size: 11px; font-weight: 400; margin-left: 1px; }
.wr.na { font-size: 12px; color: var(--ink-2); font-weight: 400; }
.line-2 { display: flex; align-items: center; gap: 6px; margin-top: 3px; }
.cnt { font-size: 12px; color: var(--ink-2); }
.line-3 { font-size: 12px; color: var(--ink-2); margin-top: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.line-4 { display: flex; gap: 5px; margin-top: 5px; flex-wrap: wrap; }
.line-5 { display: flex; align-items: center; justify-content: space-between; margin-top: auto; padding-top: 4px; }
.price { color: var(--brand); }
.price i { font-style: normal; font-size: 12px; }
.price b { font-size: 18px; }
.price .per { color: var(--ink-2); font-size: 11px; margin-left: 1px; }
.price .est {
    font-style: normal; font-size: 9px; font-weight: 700;
    color: var(--ink-2); background: #F1E7D0;
    border-radius: 3px; padding: 1px 4px; margin-left: 5px;
    vertical-align: 2px;
}
.fav-btn {
    display: inline-flex; align-items: center; gap: 3px;
    font-size: 12px; font-weight: 700; padding: 4px 12px; border-radius: var(--radius-sm);
    border: 1px solid var(--brand); background: var(--brand-light); color: var(--brand-dark);
    cursor: pointer;
    transition: all 0.12s ease; user-select: none; flex-shrink: 0;
}
/* 悬停翻转淡橙纸底 + 橙字（不用白字悬停） */
.fav-btn:hover { background: var(--brand-light); color: var(--brand-dark); }
.fav-btn:active { transform: translateY(2px); box-shadow: 0 0 0 var(--ink); }
.fav-btn.on { background: var(--paper); color: var(--ink-2); }
.fav-btn.on:hover { background: #fff6df; }
@media (max-width: 480px) {
    .thumb { width: 84px; height: 84px; }
}
</style>
