/**
 * 评分维度配置服务（03 §2.7/§2.13）：维度读取 + 适用性校验 + 加权总分计算
 * 维度集合由 review_dimension 配置表驱动，前端按点位类型动态渲染表单
 */
const config = require('../config');
const { query } = require('../db/pool');
const { err } = require('../utils/api-error');

// 维度配置内存缓存（60s，配置变更低频）
let cache = null;

/**
 * 读取全部维度配置（带缓存）
 * @returns {Promise<Array<{id,key,name,applicableTypes:number[],weight,sort}>>}
 */
async function all_dimensions() {
    if (cache && Date.now() - cache.at < config.numbers.DIM_CACHE_TTL_MS) return cache.rows;
    const rows = await query(
        `SELECT id, dimension_key, dimension_name, applicable_types, weight, sort
         FROM review_dimension ORDER BY sort, id`
    );
    const dims = rows.map((r) => ({
        id: r.id,
        key: r.dimension_key,
        name: r.dimension_name,
        applicableTypes: typeof r.applicable_types === 'string'
            ? JSON.parse(r.applicable_types)
            : (r.applicable_types || []),
        weight: Number(r.weight),
        sort: r.sort,
    }));
    cache = { rows: dims, at: Date.now() };
    return dims;
}

/**
 * 按点位类型取适用维度（有序，表单渲染用）
 * @param {number} canteenType - 0 校内食堂 / 1 永嘉天地 / 2 学生街 / 3 周边其他 / 4 外卖
 */
async function dims_for_type(canteenType) {
    const dims = await all_dimensions();
    return dims.filter((d) => (d.applicableTypes || []).includes(Number(canteenType)));
}

/**
 * 校验分项得分并计算加权总分
 * 规则：提交的维度键集合必须与该点位类型的适用维度完全一致（必填齐 + 禁填拒）
 *       overall = Σ(score×weight)/Σweight，四舍五入到 0.1，clamp 1.0-5.0
 * @param {number} canteenType
 * @param {Object} inputScores - 如 {taste:5, portion:4}
 * @returns {Promise<{overall:number, dimensionScores:Object}>}
 */
async function validate_and_score(canteenType, inputScores) {
    const dims = await dims_for_type(canteenType);
    if (dims.length === 0) throw err.invalid('该点位类型未配置评分维度');
    const input = inputScores && typeof inputScores === 'object' ? inputScores : {};
    const scores = {};
    let sumW = 0;
    let sumSW = 0;
    for (const d of dims) {
        const v = Number(input[d.key]);
        if (!Number.isInteger(v) || v < 1 || v > 5) {
            throw err.invalid(`分项「${d.name}」需为 1-5 的整数`);
        }
        scores[d.key] = v;
        sumW += d.weight;
        sumSW += v * d.weight;
    }
    // 禁填维度校验：提交了不适用的键直接拒绝
    const all = await all_dimensions();
    const allowedKeys = new Set(dims.map((d) => d.key));
    for (const k of Object.keys(input)) {
        if (!allowedKeys.has(k) && all.some((d) => d.key === k)) {
            const banned = all.find((d) => d.key === k);
            throw err.invalid(`分项「${banned.name}」不适用于该点位类型`);
        }
    }
    const overall = Math.min(5, Math.max(1, Number((sumSW / sumW).toFixed(1))));
    return { overall, dimensionScores: scores };
}

module.exports = { all_dimensions, dims_for_type, validate_and_score };
