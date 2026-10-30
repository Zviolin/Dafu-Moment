/**
 * 种子数据一键导入（r78 真实数据口径）：
 * - 点位 / 档口 / 菜品：来自 https://github.com/Zviolin/Dafu-Moment 最新提交的
 *   data/db3/sql/03_collected_places.sql + 06_estimated_menu_seed.sql（60 个真实点位、
 *   11 份明码菜单、37 道明码菜），并合并其公开数据源 qishan.geojson 的坐标/人均/评分/招牌菜。
 * - 没有公开逐菜标价的店铺按公开人均生成估算价，dish.is_estimated=1，前端标注「估」。
 * - 评价文本仍为演示语料（非爬虫），仅用于让页面有内容；用户数/福宝数等统计全部真实计数。
 * - 同时初始化成长任务 12 条与宠物装扮 3 件。
 */
const bcrypt = require('bcryptjs');
const { query, query_one } = require('../db/pool');
const aggregation = require('../services/aggregation.service');
const { of } = require('../utils/logger');

const log = of('[seed]');

// 简易可复现随机（LCG）
let _seed = 20260929;
/**
 * 取 0-1 随机数
 * @returns {number}
 */
function rand() {
    _seed = (_seed * 1103515245 + 12345) % 2147483648;
    return _seed / 2147483648;
}
/**
 * 取 [min, max] 整数
 * @param {number} min
 * @param {number} max
 */
function rand_int(min, max) {
    return min + Math.floor(rand() * (max - min + 1));
}
/**
 * 从数组随机取一个
 * @param {Array} arr
 */
function pick(arr) {
    return arr[rand_int(0, arr.length - 1)];
}

/* ===== 点位 / 档口 / 菜品：真实数据（Dafu-Moment data/db3 最新提交 + 公开 POI 坐标） =====
 * 来源：https://github.com/Zviolin/Dafu-Moment 的 data/db3/sql/03_collected_places.sql
 *      与 06_estimated_menu_seed.sql（60 个真实点位、11 份菜单、37 道明码菜）；
 *      坐标/评分/人均/招牌菜来自其公开数据源 qishan.geojson（经 data/db3 脚本引用）。
 * 说明：没有公开逐菜标价的店铺，用公开人均与招牌菜名生成「估算价」，dish.is_estimated=1。
 */
const REAL = require('./real-data.json');

/* ===== 真实菜品图映射表（r84）=====
 * 来源：华为云 CodeHub 仓库 dafu-shike 的 assets/dish-images/（150 张真实菜品图）
 * object_key 为 MinIO 对象键（cover/{yyyymm}/{内容哈希前16}.{ext}），内容寻址天然幂等
 * 无对应图片的菜品/档口/点位回退到 CATEGORY_COVER 的 preset 占位图
 */
const IMAGE_MAP = require('./dish-image-map.json');

/** 菜品封面键：档口名 + 空格 + 菜名 双键（避免重名菜品跨档口串图，须与下方查询处的拼接保持一致） */
const DISH_COVER = new Map(IMAGE_MAP.dishes.map((d) => [`${d.station} ${d.dish}`, d.object_key]));

const CATEGORY_COVER = {
    '自选菜': 'preset:rice', '米饭套餐': 'preset:rice', '套餐': 'preset:rice',
    '粉面': 'preset:noodle', '面食': 'preset:noodle', '面条': 'preset:noodle',
    '面点': 'preset:baozi', '小吃': 'preset:fries', '卤味': 'preset:fries',
    '轻食': 'preset:salad', '汉堡简餐': 'preset:burger', '铁板': 'preset:bbq',
    '韩式': 'preset:hotpot', '麻辣烫': 'preset:hotpot', '家常炒菜': 'preset:wok',
    '炒菜': 'preset:wok', '甜品饮品': 'preset:milktea', '甜品': 'preset:milktea',
    '福州小吃': 'preset:dumpling', '炸鸡小吃': 'preset:chicken', '炸物': 'preset:fries',
    '烧烤': 'preset:bbq', '烤鱼': 'preset:bbq', '烧鸟': 'preset:bbq', '综合': 'preset:rice',
};

/**
 * 依据真实菜名推断口味标签（用于筛选，不臆造具体口味强度）
 * @param {string} name
 * @returns {string}
 */
function taste_of(name) {
    if (/辣|麻|椒|川|湘/.test(name)) return '偏辣';
    if (/甜|奶|糖|蛋糕|泡芙|蛋挞|冰|芋泥|栗/.test(name)) return '甜香';
    if (/汤|粥|蒸|清|豆花/.test(name)) return '清淡';
    if (/炸|烤|酥|脆|鸡排|鸡腿/.test(name)) return '香脆';
    return '咸鲜';
}

/* 真实点位 → 种子结构；只保留公开数据里真实存在的档口，没有菜单数据的点位不造「默认档口」 */
const CANTEENS = REAL.places.map((p) => {
    const stations = (p.stations || []).map((st) => ({
        name: String(st.name || '默认档口').slice(0, 64),
        category: String(st.category || '综合').slice(0, 32),
        dishes: (st.dishes || []).map((d) => [
            String(d.name || '').slice(0, 64),
            Number(d.price) || 0,
            String(d.unit || '元').slice(0, 16),
            d.estimated ? 1 : 0,
        ]),
    }));
    return {
        name: String(p.name).slice(0, 64),
        type: Number(p.type),
        campus: p.campus || '旗山校区',
        location: String(p.location || '').slice(0, 128),
        avgPrice: p.avg_price == null ? null : Number(p.avg_price),
        businessHours: p.business_hours == null ? null : String(p.business_hours).slice(0, 64),
        lat: p.lat == null ? null : Number(p.lat),
        lng: p.lng == null ? null : Number(p.lng),
        rating: p.rating == null ? null : Number(p.rating),
        cover: IMAGE_MAP.canteens[String(p.name)]
            || CATEGORY_COVER[(stations[0] && stations[0].category) || '']
            || 'preset:rice',
        tags: (p.tags || []).slice(0, 8),
        stations,
    };
});

const TASTE = ['偏辣', '清淡', '少油', '香辣', '咸鲜', '酸甜', '浓郁', '爽口', '微麻'];
const TABOO = ['清真', '素食', '无香菜', '无葱蒜'];

/* ===== 评分维度配置（与 review_dimension 表口径一致，seed 时参数化插入） ===== */
/* AC01：外卖（type=4）适用口味/份量/价格/配送/包装，不适用排队/环境（堂食维度） */
const DIMENSIONS = [
    { key: 'taste', name: '口味', weight: 1.5, types: [0, 1, 2, 3, 4], sort: 1 },
    { key: 'portion', name: '份量', weight: 1.0, types: [0, 1, 2, 3, 4], sort: 2 },
    { key: 'price', name: '价格实惠', weight: 1.0, types: [0, 1, 2, 3, 4], sort: 3 },
    { key: 'queue', name: '排队时间', weight: 1.0, types: [0], sort: 4 },
    { key: 'env', name: '环境', weight: 1.0, types: [0], sort: 5 },
    { key: 'delivery', name: '配送速度', weight: 1.0, types: [1, 2, 3, 4], sort: 6 },
    { key: 'package', name: '包装', weight: 0.5, types: [1, 2, 3, 4], sort: 7 },
];

/* ===== 评价语料：参考大众点评/美团真实点评风格人工撰写（拟真口径） ===== */
const GOOD_TEXTS = [
    '份量给得很实在，味道也在线，下课过来吃一顿很满足，人均十几块很值。',
    '出餐比想象中快，饭点排了几分钟就拿到了，热气腾腾的，冬天吃特别舒服。',
    '老板人很热情，还提醒我小心烫。味道不是那种重口调料味，吃完不口干。',
    '第一次来随便点的，结果意外好吃，已经安利给室友了，下次还来。',
    '价格和份量很匹配，学生党友好。小料可以自己加，这点很加分。',
    '堂食环境比照片看起来干净，桌面收得挺勤，翻台快不用等太久。',
    '口味比较稳，连着吃了好几次都没翻车，属于不知道吃啥时的安全牌。',
    '打包回去也没有坨，汤汁分开装的，细节做得不错，配送也快。',
    '招牌菜确实有东西，香味很足但不齁，配米饭刚刚好。',
    '阿姨手不抖，给的量对学生很友好，一顿顶两顿，性价比拉满。',
];
const MID_TEXTS = [
    '说实话就那样吧，胜在便宜，赶时间可以吃，专门过去没必要。',
    '味道不稳定，上次咸到齁，这次刚好，看师傅当天心情吧。',
    '排了二十分钟就吃上这？期望太高了，普普通通一顿。',
    '环境一般，桌子擦得不勤快，但饭本身没什么问题，给个中间分。',
    '米饭有点硬，菜量对学生党算友好，勉强及格。',
    '中午十二点去就是纯排队，建议错峰，味道中规中矩。',
    '汤太淡了，自己加了两回酱油，肉倒是还可以。',
    '吃了一次没想吃第二次，但也没到难吃的程度，就是没记忆点。',
    '点了三分糖还是偏甜，冰倒给得足，主要是排队太长，降一星。',
    '价格涨了五毛，分量没变，还是那个味道，说不上好坏。',
    '配菜随机性太强，有时候有青菜有时候没有，像开盲盒。',
    '能吃饱，不算好吃也不难吃，食堂平均水准。',
];
const BAD_TEXTS = [
    '避雷！土豆是早上切的，现在都氧化发红了，跟阿姨反映还嘴硬说是刚切的，服了。',
    '鸡排外面糊了里面还是凉的，吃了两口肚子就不舒服，这钱不如去对面买正新。',
    '图片和实物差了十万八千里，肉就三小块，底下全是土豆垫的，太会省了。',
    '饭是夹生的！！咬下去芯还是硬的，跟窗口说了还爱答不理，再也不来了。',
    '汤面上一层厚油，喝一口直接腻住，面也坨了，高峰期出品就这样糊弄人？',
    '等了25分钟，就这？汉堡是凉的，薯条软塌塌的，打包回去全扔了。',
    '卫生堪忧，看见打菜的阿姨摸完头发没换手套继续打菜，当场没胃口。',
    '称完发现比标牌贵，问就是"汤汁算重量"，行吧，最后一次来。',
    '麻婆豆腐咸得发苦，疑似盐撒了两遍，同行同学点的鱼香肉丝也齁甜，端上来就后悔。',
    '奶茶喝出一圈结块，摇都摇不开，当场反胃，品控不行了。',
];

/* 评价标签池（贴近真实点评习惯，短词） */
const TAG_GOOD = ['回头客', '分量足', '性价比', '阿姨手不抖', '出餐快'];
const TAG_BAD = ['踩雷', '排队久', '卫生堪忧', '不值'];
const TASTE_TAG = ['偏辣', '少油'];

/* 校园风格昵称 */
const STUDENTS = [
    ['zhangwl', '旗山干饭王'], ['wangfr', '今天也想吃麻辣烫'], ['chenxy', '三点五食堂'],
    ['linfoodie', '图书馆钉子户'], ['huangjj', '黄小饱'], ['wudd', '多多的胃是无底洞'],
    ['zhengkp', '京元一楼常驻选手'], ['liu_cat', '泡面头姐妹'], ['sunmm', '减肥失败第N天'],
    ['zhouhr', '西红柿不炒蛋'], ['xieaa', '课间冲刺选手'], ['luojiang', '紫荆园蹲点人'],
];

/* 敏感词库（幂等写入：参数化插入避免 initdb 通道 latin1 损坏中文） */
const BANNED_WORDS = [
    ['不好吃死全家', 3], ['加我微信', 3], ['代刷好评', 3], ['扫码进群', 3],
    ['傻逼', 2], ['垃圾窗口', 2], ['黑心商家', 2], ['厨师吃过的', 2],
    ['难吃', 1], ['踩雷', 1],
];

/**
 * 单维随机打分：60% 概率 4-5、30% 概率 3、10% 概率 2（总体偏正面）
 * @returns {number} 1-5 整数
 */
function rand_dim_score() {
    const r = rand();
    if (r < 0.6) return rand_int(4, 5);
    if (r < 0.9) return 3;
    return 2;
}

/**
 * 按点位类型生成一套分项得分与加权总分（overall = Σ(score×weight)/Σweight，四舍五入 1 位）
 * @param {number} canteenType - 点位类型：0 校内食堂 / 1 永嘉天地 / 2 学生街 / 3 周边其他 / 4 外卖
 * @returns {{scores: Object, overall: number}}
 */
function gen_scores(canteenType) {
    const dims = DIMENSIONS.filter((d) => d.types.includes(Number(canteenType)));
    const scores = {};
    let sumW = 0;
    let sumSW = 0;
    for (const d of dims) {
        const v = rand_dim_score();
        scores[d.key] = v;
        sumW += d.weight;
        sumSW += v * d.weight;
    }
    const overall = Math.min(5, Math.max(1, Number((sumSW / sumW).toFixed(1))));
    return { scores, overall };
}

/**
 * 库为空时导入种子数据
 * @returns {Promise<void>}
 */
async function seed_if_empty() {
    const row = await query_one('SELECT COUNT(*) c FROM `user`');
    if (Number(row.c) > 0) {
        log.info('[seed] 库中已有数据，跳过种子导入');
        return;
    }
    log.info('[seed] ===== 开始导入种子数据 =====');
    const t0 = Date.now();

    /* 1. 用户 */
    const adminHash = await bcrypt.hash('admin123', 10);
    await query(
        "INSERT INTO `user` (username, password, nickname, role, created_at) VALUES ('admin', ?, '管理员小福', 1, NOW() - INTERVAL 60 DAY)",
        [adminHash]
    );
    const stuHash = await bcrypt.hash('123456', 10);
    const userIds = [];
    for (const [username, nickname] of STUDENTS) {
        const r = await query(
            'INSERT INTO `user` (username, password, nickname, created_at) VALUES (?, ?, ?, NOW() - INTERVAL ? DAY)',
            [username, stuHash, nickname, rand_int(25, 90)]
        );
        userIds.push(r.insertId);
    }

    /* 2. 敏感词库（幂等参数化插入） */
    for (const [w, lv] of BANNED_WORDS) {
        await query(
            'INSERT INTO banned_word (word, level) VALUES (?, ?) ON DUPLICATE KEY UPDATE level = VALUES(level)',
            [w, lv]
        );
    }

    /* 3. 评分维度配置（7 维，JSON 列 stringify 后参数化插入） */
    for (const d of DIMENSIONS) {
        await query(
            'INSERT INTO review_dimension (dimension_key, dimension_name, applicable_types, weight, sort) VALUES (?, ?, ?, ?, ?)',
            [d.key, d.name, JSON.stringify(d.types), d.weight, d.sort]
        );
    }
    log.info(`[seed] 评分维度配置 ${DIMENSIONS.length} 条`);

    /* 4. 点位 / 档口 / 菜品（全部来自真实 POI 数据；无公开菜单的档口保留空菜单） */
    const dishRows = []; // {id, canteenType}
    for (const c of CANTEENS) {
        const r = await query(
            'INSERT INTO canteen (name, type, campus, location, avg_price, business_hours, lat, lng, cover_object_key, tags) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [c.name, c.type, c.campus, c.location, c.avgPrice, c.businessHours, c.lat, c.lng, c.cover, JSON.stringify(c.tags || [])]
        );
        const canteenId = r.insertId;
        const stations = c.stations;
        for (const [si, st] of stations.entries()) {
            // 档口导览坐标：承所属点位坐标 + 确定性小偏移，避免多个点位标记重叠
            const stLat = c.lat == null ? null : Number(c.lat) + ((si % 5) - 2) * 0.0004;
            const stLng = c.lng == null ? null : Number(c.lng) + ((Math.floor(si / 5) % 5) - 2) * 0.0004;
            const cover = IMAGE_MAP.stations[st.name] || CATEGORY_COVER[st.category] || c.cover || 'preset:rice';
            const rs = await query(
                'INSERT INTO station (canteen_id, name, category, cover_object_key, lat, lng) VALUES (?, ?, ?, ?, ?, ?)',
                [canteenId, st.name, st.category, cover, stLat, stLng]
            );
            const stationId = rs.insertId;
            for (const [dName, basePrice, unit, estimated] of st.dishes) {
                if (!dName) continue;
                const price = Number(basePrice).toFixed(1);
                const isNew = rand() < 0.15;
                // 菜品封面优先取真实菜品图，无图回退档口封面
                const dishCover = DISH_COVER.get(`${st.name} ${dName}`) || cover;
                const rd = await query(
                    `INSERT INTO dish (station_id, name, price, price_unit, is_estimated, taste_tags, taboo_tags, cover_object_key, first_seen_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ${isNew ? 'NOW() - INTERVAL 5 DAY' : 'NOW() - INTERVAL 60 DAY'})`,
                    [stationId, dName, price, unit || '元', estimated ? 1 : 0, taste_of(dName), '', dishCover]
                );
                dishRows.push({ id: rd.insertId, canteenType: c.type });
            }
        }
    }

    /* 5. 种子评价（覆盖全部菜品中的 ~60%，重点菜品 5-7 条保证高分口碑样本） */
    const reviewTargets = [];
    const hotCount = Math.min(15, dishRows.length); // 前 15 道为「口碑」主力
    for (let i = 0; i < dishRows.length; i++) {
        let cnt;
        if (i < hotCount) cnt = rand_int(5, 7);
        else if (rand() < 0.6) cnt = rand_int(1, 3);
        else continue;
        reviewTargets.push({ dish: dishRows[i], cnt });
    }
    let reviewCount = 0;
    for (const t of reviewTargets) {
        for (let k = 0; k < t.cnt; k++) {
            const uid = pick(userIds);
            // 一人一对象一条（UNIQUE 约束）：同一菜品避免重复用户
            const dup = await query_one(
                'SELECT id FROM review WHERE user_id = ? AND subject_type = 0 AND subject_id = ?',
                [uid, t.dish.id]
            );
            if (dup) continue;
            // 按被评对象点位类型取适用维度集，每维随机打分并算加权总分
            const { scores, overall } = gen_scores(t.dish.canteenType);
            // 语料按总分搭配：≥4 好评语料 / ≥3 中评语料 / 其余差评语料
            const content = overall >= 4 ? pick(GOOD_TEXTS) : (overall >= 3 ? pick(MID_TEXTS) : pick(BAD_TEXTS));
            const tags = [];
            tags.push(overall >= 4 ? pick(TAG_GOOD) : pick(TAG_BAD));
            if (rand() < 0.3) tags.push(pick(TASTE_TAG));
            // 20% 匿名；时间分布在近 20 天
            const daysAgo = rand_int(0, 20);
            // 机审：正常评价直接发布；一条演示待人工（含二级敏感词）
            const isPendingDemo = reviewCount === 5;
            const finalContent = isPendingDemo ? '这窗口简直是垃圾窗口，再也不会来了，大家避雷。' : content;
            await query(
                `INSERT INTO review
                    (user_id, subject_type, subject_id, overall_score, dimension_scores,
                     content, is_anonymous, tags, status, status_reason, created_at)
                 VALUES (?, 0, ?, ?, ?, ?, ?, ?, ?, ?, NOW() - INTERVAL ? DAY)`,
                [uid, t.dish.id, overall, JSON.stringify(scores), finalContent,
                    rand() < 0.2 ? 1 : 0, tags.join(','),
                    isPendingDemo ? 1 : 0, isPendingDemo ? '包含待人工确认的敏感词' : '', daysAgo]
            );
            reviewCount++;
        }
    }
    log.info(`[seed] 评价 ${reviewCount} 条（含 1 条待审演示）`);

    /* 5.5 档口级评价：每档口 3-6 条（不同用户），保证首页「高分口碑」top 样本达标（review_count >= MIN_SAMPLES） */
    const stRows = await query(
        'SELECT s.id, c.type AS canteen_type FROM station s JOIN canteen c ON c.id = s.canteen_id'
    );
    let stReviewCount = 0;
    for (const st of stRows) {
        const cnt = rand_int(3, 6);
        const used = new Set(); // 一人一对象一条（UNIQUE 约束）
        for (let k = 0; k < cnt; k++) {
            const uid = pick(userIds);
            if (used.has(uid)) continue;
            used.add(uid);
            const { scores, overall } = gen_scores(st.canteen_type);
            const content = overall >= 4 ? pick(GOOD_TEXTS) : (overall >= 3 ? pick(MID_TEXTS) : pick(BAD_TEXTS));
            const tags = [];
            tags.push(overall >= 4 ? pick(TAG_GOOD) : pick(TAG_BAD));
            if (rand() < 0.3) tags.push(pick(TASTE_TAG));
            await query(
                `INSERT INTO review
                    (user_id, subject_type, subject_id, overall_score, dimension_scores,
                     content, is_anonymous, tags, status, status_reason, created_at)
                 VALUES (?, 1, ?, ?, ?, ?, ?, ?, 0, '', NOW() - INTERVAL ? DAY)`,
                [uid, st.id, overall, JSON.stringify(scores), content,
                    rand() < 0.2 ? 1 : 0, tags.join(','), rand_int(0, 20)]
            );
            stReviewCount++;
        }
    }
    log.info(`[seed] 档口级评价 ${stReviewCount} 条`);

    /* 6. 收藏（想吃）：每生随机收藏 2-4 个对象，list_type 恒 0 */
    const allStations = await query('SELECT id FROM station');
    const allDishes = await query('SELECT id FROM dish');
    let favCount = 0;
    for (const uid of userIds) {
        const cnt = rand_int(2, 4);
        for (let k = 0; k < cnt; k++) {
            // 主要收藏档口，偶尔收藏菜品
            const useStation = rand() < 0.7;
            const target = pick(useStation ? allStations : allDishes);
            const r = await query(
                'INSERT IGNORE INTO favorite (user_id, subject_type, subject_id, list_type) VALUES (?, ?, ?, 0)',
                [uid, useStation ? 1 : 0, target.id]
            );
            favCount += r.affectedRows;
        }
    }
    log.info(`[seed] 收藏（想吃）${favCount} 条`);

    /* 7. 窗口公告（校内上新 + 校外商户优惠各一条） */
    const stFirst = await query_one('SELECT id FROM station LIMIT 1');
    await query(
        "INSERT INTO station_post (station_id, author_id, type, content, starts_at, ends_at) VALUES (?, 1, 'new_dish', '本店本周上新「牛肉拌面」，到店出示校园卡立减 2 元，欢迎品尝！', NOW(), DATE_ADD(NOW(), INTERVAL 7 DAY))",
        [stFirst.id]
    );
    const stTas = await query_one("SELECT id FROM station WHERE name LIKE '重庆小面%' LIMIT 1");
    if (stTas) {
        await query(
            "INSERT INTO station_post (station_id, author_id, type, content, starts_at, ends_at) VALUES (?, 1, 'promo', '学生到店点任意主食 +3 元换购冰豆浆，出示校园卡即可。', NOW(), DATE_ADD(NOW(), INTERVAL 14 DAY))",
            [stTas.id]
        );
    }

    /* 7.5 成长任务与宠物装扮目录（真实可领取，不再使用前端假数据） */
    const TASKS = [
        [1, 1, '每日签到', '打开签到页完成一次打卡', 1, 10, 1],
        [2, 1, '发布一条点评', '真实发布一条菜品/档口/点位评价', 2, 15, 2],
        [3, 1, '给福宝喂食一次', '使用道具或金币喂养一次宠物', 3, 10, 3],
        [4, 1, '收藏一道菜', '把想吃的菜品加入收藏', 4, 5, 4],
        [5, 1, '点赞/评论/回复任意一次', '在点评圈完成一次互动', 5, 5, 5],
        [6, 1, '分享一条美食动态', '发布一条带图或带话题的动态', 6, 15, 6],
        [7, 2, '探店新星', '累计打卡 10 次', 1, 50, 7],
        [8, 2, '点评达人', '累计发布 20 条点评', 2, 80, 8],
        [9, 2, '喂养达人', '累计喂食 3 次', 3, 30, 9],
        [10, 2, '收藏家', '累计收藏 8 个对象', 4, 50, 10],
        [11, 2, '互动达人', '累计互动 50 次', 5, 80, 11],
        [12, 2, '分享达人', '累计发布 3 条动态', 6, 60, 12],
    ];
    for (const t of TASKS) {
        await query(
            'INSERT INTO `task` (id, task_type, name, description, action_type, reward_coins, enabled, sort) VALUES (?, ?, ?, ?, ?, ?, 1, ?)',
            t
        );
    }
    // 与前端 /assets/pet-dress/d1~d9.png 一一对应；d9 为 Lv.7 成就装扮（价格 0，仅等级解锁）
    const DRESSES = [
        ['d1', '砂锅蒸笼', 80, 1, '', 1],
        ['d2', '草莓罩', 60, 1, '', 2],
        ['d3', '饭团', 60, 1, '', 3],
        ['d4', '寿司卷', 80, 1, '', 4],
        ['d5', '汉堡', 80, 1, '', 5],
        ['d6', '草莓奶油', 100, 1, '', 6],
        ['d7', '红披风', 120, 1, '', 7],
        ['d8', '辣椒罩', 80, 1, '', 8],
        ['d9', '皇冠', 0, 7, '', 9],
    ];
    for (const d of DRESSES) {
        await query(
            'INSERT INTO pet_dress (id, name, price, min_level, image, sort) VALUES (?, ?, ?, ?, ?, ?)',
            d
        );
    }
    log.info(`[seed] 成长任务 ${TASKS.length} 条 / 宠物装扮 ${DRESSES.length} 件`);

    /* 8. 聚合预热：全量重算摘要（overall_score 已按维度权重写入，此处只做平均与分项求和） */
    await aggregation.recalc_all();

    log.info(`[seed] ===== 种子导入完成（${((Date.now() - t0) / 1000).toFixed(1)}s）=====
[seed] 演示账号：admin / admin123（管理员）  zhangwl / 123456（学生）`);
}

module.exports = { seed_if_empty };
