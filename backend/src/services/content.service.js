/**
 * 内容底座服务：食堂/窗口/菜品浏览（筛选、排序、聚合摘要直读）、点位地图、推荐
 */
const config = require('../config');
const { query, query_one } = require('../db/pool');
const { err } = require('../utils/api-error');
const { page_int } = require('../utils/validate');

const N = config.numbers;

/** 点位列表排序合法值（03 §5.3）：comprehensive 综合 / 其余为单维均分排序 */
const POINT_SORTS = ['comprehensive', 'taste', 'portion', 'price', 'queue', 'env', 'delivery', 'package'];

/**
 * 单维均分排序表达式：均分 = dim_sums 该维求和 / 已发布评价数
 * dim_sums 结构为 {key: sum}（aggregation.service 写入口径，前端同口径消费），
 * 无该维数据的行 JSON_EXTRACT 返回 NULL，DESC 排序自然沉底；NULLIF 防除零
 */
const POINT_SORT_EXPR = {
    comprehensive: 'IFNULL(pts.rating_avg, 0) DESC',
    taste: "(CAST(JSON_UNQUOTE(JSON_EXTRACT(pts.dim_sums, '$.taste')) AS DECIMAL(10, 2)) / NULLIF(pts.review_count, 0)) DESC",
    portion: "(CAST(JSON_UNQUOTE(JSON_EXTRACT(pts.dim_sums, '$.portion')) AS DECIMAL(10, 2)) / NULLIF(pts.review_count, 0)) DESC",
    price: "(CAST(JSON_UNQUOTE(JSON_EXTRACT(pts.dim_sums, '$.price')) AS DECIMAL(10, 2)) / NULLIF(pts.review_count, 0)) DESC",
    queue: "(CAST(JSON_UNQUOTE(JSON_EXTRACT(pts.dim_sums, '$.queue')) AS DECIMAL(10, 2)) / NULLIF(pts.review_count, 0)) DESC",
    env: "(CAST(JSON_UNQUOTE(JSON_EXTRACT(pts.dim_sums, '$.env')) AS DECIMAL(10, 2)) / NULLIF(pts.review_count, 0)) DESC",
    delivery: "(CAST(JSON_UNQUOTE(JSON_EXTRACT(pts.dim_sums, '$.delivery')) AS DECIMAL(10, 2)) / NULLIF(pts.review_count, 0)) DESC",
    package: "(CAST(JSON_UNQUOTE(JSON_EXTRACT(pts.dim_sums, '$.package')) AS DECIMAL(10, 2)) / NULLIF(pts.review_count, 0)) DESC",
};

/**
 * tags JSON 防御解析：兼容 mysql2 已解析的数组与字符串两种形态，统一输出字符串数组
 * @param {*} v - JSON 列原始值
 * @returns {string[]}
 */
function parse_tags(v) {
    let arr = v;
    if (typeof arr === 'string') {
        try { arr = JSON.parse(arr); } catch { arr = []; }
    }
    if (!Array.isArray(arr)) return [];
    return arr.map((x) => String(x)).filter((x) => x.length > 0).slice(0, 8);
}

/**
 * 点位列表（03 §5.3）：type 筛选 + 维度排序 + 可选分页
 * 旧口径 GET /canteens 传 page=null 返回全量数组（保持前端兼容）；
 * 文档口径 GET /api/points 传 page 返回 {list, total, page, size}
 * @param {number|null} type - 点位类型：0 校内食堂 / 1 永嘉天地 / 2 学生街 / 3 周边其他 / 4 外卖
 * @param {string} sort - 排序键，见 POINT_SORTS
 * @param {number|null} page - null 不分页（旧接口）；数字则按每页 10 条分页
 * @returns {Promise<Array|{list: Array, total: number, page: number, size: number}>}
 */
async function list_canteens(type, sort = 'comprehensive', page = null) {
    if (!POINT_SORTS.includes(sort)) throw err.invalid('sort 取值不合法');
    const where = ['c.enabled = 1'];
    const params = [];
    if (type !== null && type !== undefined && type !== '') {
        where.push('c.type = ?');
        params.push(Number(type));
    }
    // base：LEFT JOIN 点位级聚合（subject_type=2），排序/综合分使用；不影响行数
    const base = `FROM canteen c
        LEFT JOIN review_summary pts ON pts.subject_type = 2 AND pts.subject_id = c.id
        WHERE ${where.join(' AND ')}`;
    const select = `SELECT c.id, c.name, c.type, c.campus, c.location, c.avg_price, c.cover_object_key,
                c.lat, c.lng, c.tags,
                (SELECT COUNT(*) FROM station s WHERE s.canteen_id = c.id AND s.status < 2) AS station_count,
                (SELECT ROUND(AVG(sm.rating_avg), 2) FROM review_summary sm
                  JOIN dish d ON d.id = sm.subject_id
                  JOIN station s ON s.id = d.station_id
                  WHERE sm.subject_type = 0 AND sm.review_count > 0 AND s.canteen_id = c.id) AS avg_score,
                (SELECT SUM(sm.review_count) FROM review_summary sm
                  JOIN dish d ON d.id = sm.subject_id
                  JOIN station s ON s.id = d.station_id
                  WHERE sm.subject_type = 0 AND sm.review_count > 0 AND s.canteen_id = c.id) AS review_count,
                pts.rating_avg AS point_rating_avg`;
    // 排序：所选维度优先，同分按 type/id 稳定输出（与旧默认顺序一致）
    const orderBy = `ORDER BY ${POINT_SORT_EXPR[sort]}, c.type ASC, c.id ASC`;

    if (page === null) {
        const rows = await query(`${select} ${base} ${orderBy}`, params);
        return rows.map((r) => ({ ...r, tags: parse_tags(r.tags) }));
    }
    const totalRow = await query_one(`SELECT COUNT(*) c ${base}`, params);
    const rows = await query(
        `${select} ${base} ${orderBy} LIMIT ? OFFSET ?`,
        [...params, 10, (page - 1) * 10]
    );
    return {
        list: rows.map((r) => ({ ...r, tags: parse_tags(r.tags) })),
        total: Number(totalRow.c),
        page,
        size: 10,
    };
}

/**
 * 点位地图（03 §5.3 + T-31 档口级标记）：在架且有坐标的点位按 campus 分组，
 * 另有导览坐标的营业档口出档口级标记；标记带 kind（canteen/station），前端按 kind 分流详情页
 * @returns {Promise<Array<{area: string, points: Array<{id, name, lat, lng, type, kind, canteenId?}>}>>}
 */
async function points_map() {
    const rows = await query(
        `SELECT id, name, type, campus, lat, lng FROM canteen
         WHERE enabled = 1 AND lat IS NOT NULL AND lng IS NOT NULL
         ORDER BY campus, id`
    );
    const stations = await query(
        `SELECT s.id, s.name, s.lat, s.lng, s.canteen_id, c.campus, c.type
         FROM station s JOIN canteen c ON c.id = s.canteen_id
         WHERE s.status < 2 AND c.enabled = 1 AND s.lat IS NOT NULL AND s.lng IS NOT NULL
         ORDER BY s.id`
    );
    const areas = [];
    const byCampus = new Map();
    const group_of = (campus) => {
        if (!byCampus.has(campus)) {
            const group = { area: campus, points: [] };
            byCampus.set(campus, group);
            areas.push(group);
        }
        return byCampus.get(campus);
    };
    for (const r of rows) {
        group_of(r.campus).points.push({
            id: r.id, name: r.name, lat: Number(r.lat), lng: Number(r.lng), type: Number(r.type), kind: 'canteen',
        });
    }
    for (const s of stations) {
        group_of(s.campus).points.push({
            id: s.id, name: s.name, lat: Number(s.lat), lng: Number(s.lng),
            type: Number(s.type), kind: 'station', canteenId: s.canteen_id,
        });
    }
    return areas;
}

/**
 * 食堂详情（窗口列表 + 动态公告聚合）
 * @param {number} id
 */
async function canteen_detail(id) {
    const canteen = await query_one(
        'SELECT id, name, type, campus, location, avg_price, cover_object_key, tags FROM canteen WHERE id = ? AND enabled = 1',
        [id]
    );
    if (!canteen) throw err.not_found('食堂不存在');
    // tags JSON 防御解析后输出字符串数组
    canteen.tags = parse_tags(canteen.tags);
    const stations = await query(
        `SELECT s.id, s.name, s.category, s.status,
                sm.rating_avg, sm.review_count
         FROM station s
         LEFT JOIN review_summary sm ON sm.subject_type = 1 AND sm.subject_id = s.id
         WHERE s.canteen_id = ? AND s.status < 2 ORDER BY s.id`,
        [id]
    );
    const posts = await query(
        `SELECT p.id, p.station_id, s.name AS station_name, p.type, p.content, p.created_at
         FROM station_post p JOIN station s ON s.id = p.station_id
         WHERE s.canteen_id = ? AND (p.ends_at IS NULL OR p.ends_at > NOW())
         ORDER BY p.created_at DESC LIMIT 20`,
        [id]
    );
    return { canteen, stations, posts };
}

/**
 * 窗口详情（菜品列表 + summary + 公告）
 * @param {number} id
 */
async function station_detail(id) {
    const station = await query_one(
        `SELECT s.id, s.canteen_id, s.name, s.category, s.status, s.cover_object_key,
                c.name AS canteen_name, c.type AS canteen_type
         FROM station s JOIN canteen c ON c.id = s.canteen_id
         WHERE s.id = ? AND s.status < 2`,
        [id]
    );
    if (!station) throw err.not_found('窗口不存在或已下架');
    const summaryRow = await query_one(
        'SELECT review_count, rating_avg, dim_sums, hist_1, hist_2, hist_3, hist_4, hist_5 FROM review_summary WHERE subject_type = 1 AND subject_id = ?',
        [id]
    );
    const summary = parse_summary(summaryRow);
    const dishes = await query(
        `SELECT d.id, d.name, d.price, d.taste_tags, d.taboo_tags, d.cover_object_key,
                d.is_recommended AS isRecommended, sm.rating_avg, sm.review_count
         FROM dish d LEFT JOIN review_summary sm ON sm.subject_type = 0 AND sm.subject_id = d.id
         WHERE d.station_id = ? AND d.status = 0 ORDER BY d.id`,
        [id]
    );
    // 推荐菜（03 §5.3）：is_recommended=1 优先（按均分排），不足 3 个按 rating_avg 补齐，无评价按 id 取前 3
    const recommendedRows = await query(
        `SELECT d.id, d.name, d.price, d.cover_object_key, d.is_recommended AS isRecommended,
                IFNULL(sm.rating_avg, 0) AS rating_avg, IFNULL(sm.review_count, 0) AS review_count
         FROM dish d LEFT JOIN review_summary sm ON sm.subject_type = 0 AND sm.subject_id = d.id
         WHERE d.station_id = ? AND d.status = 0
         ORDER BY d.is_recommended DESC, sm.rating_avg DESC, sm.review_count DESC, d.id ASC
         LIMIT 3`,
        [id]
    );
    const recommended = recommendedRows.map((d) => ({
        id: d.id,
        name: d.name,
        price: Number(d.price),
        coverObjectKey: d.cover_object_key,
        isRecommended: Number(d.isRecommended) === 1,
        ratingAvg: Number(d.rating_avg),
        reviewCount: Number(d.review_count),
    }));
    const posts = await query(
        `SELECT id, type, content, created_at FROM station_post
         WHERE station_id = ? AND (ends_at IS NULL OR ends_at > NOW())
         ORDER BY created_at DESC LIMIT 10`,
        [id]
    );
    return { station, summary, dishes, posts, recommended };
}

/**
 * 聚合摘要行规范化：dim_sums 为 JSON 列（mysql2 返回字符串），解析为对象后输出
 * @param {Object|null} row - review_summary 行
 * @returns {Object|null}
 */
function parse_summary(row) {
    if (!row) return null;
    let dimSums = row.dim_sums;
    if (typeof dimSums === 'string') {
        try { dimSums = JSON.parse(dimSums); } catch { dimSums = {}; }
    }
    return { ...row, dim_sums: dimSums || {} };
}

/**
 * 菜品多维筛选列表
 * @param {Object} f - {canteenId, stationId, q, taste[], taboo[], priceMin, priceMax, ratingMin, sort, businessStatus, page, pageSize}
 */
async function filter_dishes(f) {
    const page = page_int(f.page, 1);
    const pageSize = Math.min(page_int(f.pageSize, 12), 50);
    // 营业状态：open 仅营业中（status=0）/ closed 仅休息中（status=1）/ all 或缺省为未下架（status<2）
    const businessStatus = (f.businessStatus === undefined || f.businessStatus === null || f.businessStatus === '')
        ? 'all' : String(f.businessStatus);
    if (!['open', 'closed', 'all'].includes(businessStatus)) throw err.invalid('businessStatus 取值不合法');
    const stationCond = businessStatus === 'open'
        ? 's.status = 0'
        : (businessStatus === 'closed' ? 's.status = 1' : 's.status < 2');
    const where = ['d.status = 0'];
    const params = [];
    if (f.stationId) {
        where.push('d.station_id = ?');
        params.push(f.stationId);
    }
    if (f.canteenId) {
        where.push('s.canteen_id = ?');
        params.push(f.canteenId);
    }
    if (f.category) {
        where.push('s.category = ?');
        params.push(f.category);
    }
    if (f.q) {
        where.push('(d.name LIKE ? OR s.name LIKE ?)');
        params.push(`%${f.q}%`, `%${f.q}%`);
    }
    for (const t of f.taste || []) {
        where.push('FIND_IN_SET(?, REPLACE(d.taste_tags, " ", ""))');
        params.push(t);
    }
    for (const t of f.taboo || []) {
        where.push('FIND_IN_SET(?, REPLACE(d.taboo_tags, " ", ""))');
        params.push(t);
    }
    if (f.priceMin !== undefined && f.priceMin !== null && f.priceMin !== '') {
        where.push('d.price >= ?');
        params.push(Number(f.priceMin));
    }
    if (f.priceMax !== undefined && f.priceMax !== null && f.priceMax !== '') {
        where.push('d.price <= ?');
        params.push(Number(f.priceMax));
    }
    if (f.ratingMin) {
        where.push('sm.rating_avg >= ? AND sm.review_count >= 3');
        params.push(Number(f.ratingMin));
    }

    const orderBy = {
        comprehensive: 'sm.rating_avg DESC, sm.review_count DESC',
        new: 'd.first_seen_at DESC',
        hot: 'sm.review_count DESC',
        priceAsc: 'd.price ASC',
        priceDesc: 'd.price DESC',
    }[f.sort || 'comprehensive'] || 'sm.rating_avg DESC, sm.review_count DESC';

    const base = `FROM dish d
        JOIN station s ON s.id = d.station_id AND ${stationCond}
        JOIN canteen c ON c.id = s.canteen_id
        LEFT JOIN review_summary sm ON sm.subject_type = 0 AND sm.subject_id = d.id
        WHERE ${where.join(' AND ')}`;

    const total = await query_one(`SELECT COUNT(*) c ${base}`, params);
    const list = await query(
        `SELECT d.id, d.name, d.price, d.taste_tags, d.taboo_tags, d.cover_object_key,
                d.is_recommended AS isRecommended,
                d.first_seen_at, s.name AS station_name, s.id AS station_id, c.id AS canteen_id, c.name AS canteen_name,
                IFNULL(sm.rating_avg, 0) AS rating_avg, IFNULL(sm.review_count, 0) AS review_count
         ${base}
         ORDER BY ${orderBy}
         LIMIT ? OFFSET ?`,
        [...params, pageSize, (page - 1) * pageSize]
    );
    return { list, total: Number(total.c), page, pageSize };
}

/**
 * 菜品详情（summary 直读 + 标签聚合 + 封面）
 * @param {number} id
 */
async function dish_detail(id) {
    const dish = await query_one(
        `SELECT d.*, s.name AS station_name, s.id AS station_id, c.id AS canteen_id, c.name AS canteen_name, c.type AS canteen_type
         FROM dish d JOIN station s ON s.id = d.station_id JOIN canteen c ON c.id = s.canteen_id
         WHERE d.id = ? AND d.status = 0`,
        [id]
    );
    if (!dish) throw err.not_found('菜品不存在或已下架');
    // 推荐菜标记输出（d.* 含 snake_case 原始列，camelCase 副本供前端直用）
    dish.isRecommended = Number(dish.is_recommended) === 1;
    const summary = parse_summary(await query_one(
        'SELECT * FROM review_summary WHERE subject_type = 0 AND subject_id = ?',
        [id]
    ));
    // 标签云：评价 tags 频次 Top8
    const tagRows = await query(
        `SELECT tag, COUNT(*) c FROM (
            SELECT SUBSTRING_INDEX(SUBSTRING_INDEX(tags, ',', numbers.n), ',', -1) AS tag
            FROM review
            JOIN (SELECT 1 n UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5) numbers
              ON numbers.n <= LENGTH(tags) - LENGTH(REPLACE(tags, ',', '')) + 1
            WHERE subject_type = 0 AND subject_id = ? AND status = 0 AND tags <> ''
         ) t GROUP BY tag ORDER BY c DESC LIMIT 8`,
        [id]
    );
    // 首评实拍兜底封面
    const firstImg = await query_one(
        'SELECT object_key FROM review_image ri JOIN review r ON r.id = ri.review_id WHERE r.subject_type = 0 AND r.subject_id = ? AND ri.status = 0 LIMIT 1',
        [id]
    );
    return { dish, summary, tags: tagRows, fallbackCover: firstImg ? firstImg.object_key : null };
}

/**
 * 品类聚合（首页分类导航）：有在售菜品的窗口品类 + 菜品数
 * @returns {Promise<Array<{name:string,count:number}>>}
 */
async function list_categories() {
    const rows = await query(
        `SELECT s.category AS name, COUNT(*) AS count
         FROM station s
         JOIN dish d ON d.station_id = s.id AND d.status = 0
         WHERE s.status < 2 AND s.category <> ''
         GROUP BY s.category ORDER BY count DESC, name`
    );
    return rows.map((r) => ({ name: r.name, count: Number(r.count) }));
}

/**
 * 统一关键词搜索：点位/档口/菜品三组匹配（每组各设数量上限）
 * @param {string} q - 关键词（已去空白）
 * @returns {Promise<{points: Array, stations: Array, dishes: Array}>}
 */
async function search_all(q) {
    const kw = `%${q}%`;
    // 点位：名称命中且在架
    const points = await query(
        `SELECT c.id, c.name, c.type, c.location,
                (SELECT COUNT(*) FROM station s WHERE s.canteen_id = c.id AND s.status < 2) AS station_count,
                (SELECT ROUND(AVG(sm.rating_avg), 2) FROM review_summary sm
                  JOIN dish d ON d.id = sm.subject_id
                  JOIN station s ON s.id = d.station_id
                 WHERE sm.subject_type = 0 AND sm.review_count > 0 AND s.canteen_id = c.id) AS avg_score
         FROM canteen c WHERE c.enabled = 1 AND c.name LIKE ? ORDER BY c.type, c.id LIMIT 8`,
        [kw]
    );
    // 档口：名称命中且未下架
    const stations = await query(
        `SELECT s.id, s.name, s.category, c.name AS canteen_name, sm.rating_avg, sm.review_count
         FROM station s
         JOIN canteen c ON c.id = s.canteen_id
         LEFT JOIN review_summary sm ON sm.subject_type = 1 AND sm.subject_id = s.id
         WHERE s.status < 2 AND s.name LIKE ? ORDER BY s.id LIMIT 8`,
        [kw]
    );
    // 菜品：名称命中且在售
    const dishes = await query(
        `SELECT d.id, d.name, d.price, s.name AS station_name, c.name AS canteen_name,
                sm.rating_avg, sm.review_count
         FROM dish d
         JOIN station s ON s.id = d.station_id AND s.status < 2
         JOIN canteen c ON c.id = s.canteen_id
         LEFT JOIN review_summary sm ON sm.subject_type = 0 AND sm.subject_id = d.id
         WHERE d.status = 0 AND d.name LIKE ? ORDER BY d.id LIMIT 12`,
        [kw]
    );
    return { points, stations, dishes };
}

/**
 * 推荐映射：summary 联查行 → 前端推荐卡片结构（含推荐理由）
 * @param {Object} r - station + review_summary 联查行
 * @param {string} reasonCode - top_score / pref_category / hot_fallback
 * @param {string} reason - 用户可读推荐理由
 * @returns {Object} {subjectType, subjectId, name, subtitle, cover, avgScore, reviewCount, reasonCode, reason}
 */
function map_recommend_row(r, reasonCode, reason) {
    return {
        subjectType: 1,
        subjectId: r.id,
        name: r.name,
        subtitle: `${r.canteen_name} · ${r.category}`,
        cover: r.cover_object_key,
        avgScore: Number(r.rating_avg),
        reviewCount: Number(r.review_count),
        reasonCode,
        reason,
    };
}

/**
 * 首页推荐两块：top 高分口碑（样本 ≥ MIN_SAMPLES 按 rating_avg）/ forYou 为你推荐
 * forYou：登录用户按收藏对象的品类偏好匹配；无收藏或命中不足 3 个时回退全站热度；未登录直接全站热度
 * @param {number|null} userId
 * @returns {Promise<{top: Array, forYou: Array}>}
 */
async function recommendations(userId) {
    // top：档口级评价数达标（MIN_SAMPLES），按均分取前 8
    const topRows = await query(
        `SELECT s.id, s.name, s.category, s.cover_object_key, c.name AS canteen_name, sm.rating_avg, sm.review_count
         FROM station s
         JOIN canteen c ON c.id = s.canteen_id
         JOIN review_summary sm ON sm.subject_type = 1 AND sm.subject_id = s.id
         WHERE s.status < 2 AND sm.review_count >= ?
         ORDER BY sm.rating_avg DESC LIMIT 8`,
        [N.MIN_SAMPLES]
    );
    const top = topRows.map((r) => map_recommend_row(
        r, 'top_score',
        `${Number(r.review_count)} 条真实评价，均分 ${Number(r.rating_avg)}`
    ));

    // 偏好品类集合：收藏档口直取 category；收藏菜品经 dish→station 取 category
    let forYou;
    let prefCategories = [];
    if (userId) {
        const favRows = await query(
            `SELECT DISTINCT CASE f.subject_type
                WHEN 1 THEN (SELECT category FROM station WHERE id = f.subject_id)
                WHEN 0 THEN (SELECT s2.category FROM dish d JOIN station s2 ON s2.id = d.station_id WHERE d.id = f.subject_id)
                ELSE NULL END AS category
             FROM favorite f WHERE f.user_id = ?`,
            [userId]
        );
        prefCategories = favRows.map((r) => r.category).filter((c) => c);
    }
    if (prefCategories.length > 0) {
        // 命中偏好品类的在架档口，按均分取前 8
        const placeholders = prefCategories.map(() => '?').join(',');
        const matched = await query(
            `SELECT s.id, s.name, s.category, s.cover_object_key, c.name AS canteen_name, sm.rating_avg, sm.review_count
             FROM station s
             JOIN canteen c ON c.id = s.canteen_id
             JOIN review_summary sm ON sm.subject_type = 1 AND sm.subject_id = s.id
             WHERE s.status < 2 AND s.category IN (${placeholders}) AND sm.review_count > 0
             ORDER BY sm.rating_avg DESC LIMIT 8`,
            prefCategories
        );
        forYou = matched.length >= 3
            ? matched.map((r) => map_recommend_row(
                r, 'pref_category', `你收藏过「${r.category}」类`
            ))
            : null;
    } else {
        forYou = null;
    }
    if (!forYou) {
        // 回退：全站热度（评价数优先）
        const hotRows = await query(
            `SELECT s.id, s.name, s.category, s.cover_object_key, c.name AS canteen_name, sm.rating_avg, sm.review_count
             FROM station s
             JOIN canteen c ON c.id = s.canteen_id
             JOIN review_summary sm ON sm.subject_type = 1 AND sm.subject_id = s.id
             WHERE s.status < 2 AND sm.review_count > 0
             ORDER BY sm.review_count DESC LIMIT 8`
        );
        forYou = hotRows.map((r, index) => map_recommend_row(
            r, 'hot_fallback', `近期人气第 ${index + 1}`
        ));
    }
    return { top, forYou };
}

/* ================= 校园口碑榜（按档口，真实评价聚合） ================= */

/** 榜单周期 → 回看天数（null 为全部历史） */
const RANK_PERIOD_DAYS = { day: 1, week: 7, all: null };

/** 榜单维度 → 排序表达式（全部基于 review 表真实聚合，无预置数据） */
const RANK_SORT_EXPR = {
    hot: 'review_count DESC, rating_avg DESC',
    score: 'rating_avg DESC, review_count DESC',
    like: 'like_count DESC, review_count DESC',
};

/**
 * 校园口碑榜（按档口）：统计期间内「已发布」评价的真实聚合（评价数 / 均分 / 点赞数）
 * @param {string} period - day 近 1 天 / week 近 7 天 / all 全部
 * @param {string} dim - hot 人气（评价数）/ score 口碑（均分）/ like 点赞
 * @param {number} limit - 返回条数
 * @returns {Promise<Array<{id, name, category, coverObjectKey, canteenId, canteenName, reviewCount, ratingAvg, likeCount}>>}
 */
async function rankings(period = 'week', dim = 'hot', limit = 10) {
    const days = Object.prototype.hasOwnProperty.call(RANK_PERIOD_DAYS, period) ? RANK_PERIOD_DAYS[period] : 7;
    const where = ['r.subject_type = 1', 'r.status = 0', 's.status < 2', 'c.enabled = 1'];
    const params = [];
    if (days !== null) {
        where.push('r.created_at >= NOW() - INTERVAL ? DAY');
        params.push(days);
    }
    const orderBy = RANK_SORT_EXPR[dim] || RANK_SORT_EXPR.hot;
    const rows = await query(
        `SELECT s.id, s.name, s.category, s.cover_object_key,
                c.id AS canteen_id, c.name AS canteen_name,
                COUNT(r.id) AS review_count,
                ROUND(AVG(r.overall_score), 2) AS rating_avg,
                SUM(r.like_count) AS like_count
         FROM review r
         JOIN station s ON s.id = r.subject_id
         JOIN canteen c ON c.id = s.canteen_id
         WHERE ${where.join(' AND ')}
         GROUP BY s.id, s.name, s.category, s.cover_object_key, c.id, c.name
         ORDER BY ${orderBy}, s.id ASC
         LIMIT ?`,
        [...params, Number(limit)]
    );
    return rows.map((r) => ({
        id: r.id,
        name: r.name,
        category: r.category,
        coverObjectKey: r.cover_object_key,
        canteenId: r.canteen_id,
        canteenName: r.canteen_name,
        reviewCount: Number(r.review_count),
        ratingAvg: Number(r.rating_avg),
        likeCount: Number(r.like_count),
    }));
}

/* ================= 档口级横向对比（15-差距文档 AC07） ================= */

/**
 * 档口轻量列表（AC07 对比选择器池）：在架档口全量，带所属点位名与聚合摘要
 * @returns {Promise<Array<{id,name,category,status,canteenId,canteenName,ratingAvg,reviewCount}>>}
 */
async function list_stations() {
    const rows = await query(
        `SELECT s.id, s.name, s.category, s.status, s.canteen_id,
                c.name AS canteen_name,
                IFNULL(sm.rating_avg, 0) AS rating_avg, IFNULL(sm.review_count, 0) AS review_count
         FROM station s JOIN canteen c ON c.id = s.canteen_id
         LEFT JOIN review_summary sm ON sm.subject_type = 1 AND sm.subject_id = s.id
         WHERE s.status < 2 AND c.enabled = 1
         ORDER BY s.id`
    );
    return rows.map((r) => ({
        id: r.id,
        name: r.name,
        category: r.category,
        status: Number(r.status),
        canteenId: r.canteen_id,
        canteenName: r.canteen_name,
        ratingAvg: Number(r.rating_avg),
        reviewCount: Number(r.review_count),
    }));
}

/**
 * 档口横向对比（AC07）：按 ids 批量取档口 + 聚合摘要，返回顺序与入参一致
 * 分项均分 dimScores = dim_sums[k] / review_count（两位小数，与点位维度排序同口径）；
 * 维度键为动态集合（校内档口天然含 queue 排队分，外卖档口无），无评价档口 dimScores={}
 * @param {number[]} ids - 2~4 个档口 id（路由层已校验格式与个数）
 * @returns {Promise<Array>}
 */
async function compare_stations(ids) {
    const placeholders = ids.map(() => '?').join(',');
    const rows = await query(
        `SELECT s.id, s.name, s.category, s.status, s.cover_object_key, s.canteen_id,
                c.name AS canteen_name, c.type AS canteen_type,
                sm.rating_avg, sm.review_count, sm.dim_sums
         FROM station s JOIN canteen c ON c.id = s.canteen_id
         LEFT JOIN review_summary sm ON sm.subject_type = 1 AND sm.subject_id = s.id
         WHERE s.id IN (${placeholders}) AND s.status < 2`,
        ids
    );
    const byId = new Map(rows.map((r) => [r.id, r]));
    // 任一不存在或已下架 → 404（不部分返回，避免误导对比）
    for (const id of ids) {
        if (!byId.has(id)) throw err.not_found(`档口 ${id} 不存在或已下架`);
    }
    return ids.map((id) => {
        const r = byId.get(id);
        const reviewCount = Number(r.review_count) || 0;
        let dimSums = r.dim_sums;
        if (typeof dimSums === 'string') {
            try { dimSums = JSON.parse(dimSums); } catch { dimSums = {}; }
        }
        const dimScores = {};
        if (reviewCount > 0 && dimSums) {
            for (const [k, v] of Object.entries(dimSums)) {
                dimScores[k] = Number((Number(v) / reviewCount).toFixed(2));
            }
        }
        return {
            id: r.id,
            name: r.name,
            category: r.category,
            status: Number(r.status),
            coverObjectKey: r.cover_object_key || null,
            canteenId: r.canteen_id,
            canteenName: r.canteen_name,
            canteenType: Number(r.canteen_type),
            ratingAvg: Number(r.rating_avg) || 0,
            reviewCount,
            dimScores,
        };
    });
}

module.exports = {
    list_canteens, points_map, canteen_detail, station_detail,
    filter_dishes, dish_detail, list_categories, search_all, recommendations, rankings,
    list_stations, compare_stations,
};
