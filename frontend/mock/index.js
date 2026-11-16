// 本地 mock：仅开发演示用，不依赖真实后端。
// 后端统一返回 {code,msg,data}，http.js 拦截器取 data 交给页面。
// 本模块只产出 data，由 vite 插件包成 {code:0,data}。
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/* 4.5 轮九批（E）：华为仓同步的真图（public/assets/dish-images 150 菜品图、store-images 18 店铺图，
   文件名即菜名/店名）按名称模糊匹配出图；未命中回落 food/* 素材轮换。真栈下 /img/* 由 MinIO 接管。 */
const IMG_DIRS = ['dish-images', 'store-images'];
let IMG_CACHE = null;
function list_images() {
    if (IMG_CACHE) return IMG_CACHE;
    try {
        const base = join(process.cwd(), 'public', 'assets');
        IMG_CACHE = IMG_DIRS.flatMap((d) =>
            readdirSync(join(base, d))
                .filter((f) => /\.(jpe?g|png|webp)$/i.test(f))
                .map((f) => ({ dir: d, file: f, stem: f.replace(/\.[^.]+$/, '') }))
        );
    } catch { IMG_CACHE = []; }
    return IMG_CACHE;
}
function match_local_image(key) {
    const stem = String(key).replace(/\.[^.]+$/, '');
    let best = null;
    let bestLen = 0;
    for (const it of list_images()) {
        if ((stem.includes(it.stem) || it.stem.includes(stem)) && it.stem.length > bestLen) {
            best = it;
            bestLen = it.stem.length;
        }
    }
    if (best) return `/assets/${best.dir}/${encodeURIComponent(best.file)}`;
    const h = [...stem].reduce((a, c) => a + c.codePointAt(0), 0);
    return `/assets/food/${FOODS[h % FOODS.length]}.png`;
}

/* ============ 工具 ============ */
const rnd = (a, b) => Math.round((a + Math.random() * (b - a)) * 10) / 10;
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const cover = (k) => `mock/${k}.jpg`;

// 4.5 轮预览（E）：food/* 素材键回落用素材轮换（见 match_local_image 未命中分支）
const FOODS = ['yangzhi', 'kuanfen', 'lamian', 'shoudamian', 'tangshui', 'xiangguo'];

// 4.5 轮十二批（E）：mock 全量改接仓库自带真实数据，不再自造菜名/标签/食堂
// - backend/src/seed/real-data.json      60 真食堂（坐标/评分/标签）+ 70 真档口（品类）
// - backend/src/seed/dish-image-map.json 158 真菜品（菜名+档口+华为仓图片文件名）
const REAL = (() => {
    try {
        return {
            places: JSON.parse(readFileSync(join(process.cwd(), '..', 'backend', 'src', 'seed', 'real-data.json'), 'utf8')).places || [],
            dishes: JSON.parse(readFileSync(join(process.cwd(), '..', 'backend', 'src', 'seed', 'dish-image-map.json'), 'utf8')).dishes || [],
        };
    } catch (e) {
        console.warn('[mock] 真实数据读取失败，回落占位:', e.message);
        return { places: [], dishes: [] };
    }
})();
const food_img = (i) => `food/${FOODS[((i % FOODS.length) + FOODS.length) % FOODS.length]}.png`;
const now = () => new Date().toISOString();

/* ============ 食堂（点位） ============ */
const CANTEENS = REAL.places.map((pl, i) => ({ // 全量 60 真食堂（真坐标，地图钉即真实位置）
    id: i + 1,
    name: pl.name,
    type: pl.type,
    avg_score: pl.rating ?? Math.round((4.0 + ((i * 29) % 9) / 10) * 10) / 10, // 无真实评分时按序号固定占位
    cover_object_key: `store/${pl.name}`, // 名称键 → /img/ 匹配华为仓店铺图
    location: pl.location || '',
    lat: pl.lat,
    lng: pl.lng,
    stations_count: (pl.stations || []).length,
    open_status: 1,
    description: (pl.tags || []).length ? `${pl.tags.join(' · ')} · 真实点位` : '真实点位数据',
    tags: (pl.tags || []).slice(0, 2),
}));
const canteenName = (id) => (CANTEENS.find((c) => c.id === id) || {}).name || '';

/* ============ 档口 ============ */
// 真档口：real-data 里每个食堂的 stations（名称+品类），归属其真食堂；封面用该档口首道菜的华为仓真图
const PLACE_OF = {};
REAL.places.forEach((pl, pi) => (pl.stations || []).forEach((st) => { PLACE_OF[st.name] = { pi, place: pl, category: st.category || '' }; }));
const DISH_STATIONS = [...new Set(REAL.dishes.map((d) => d.station))]; // 有真图的档口优先
const STATION_NAMES = DISH_STATIONS.filter((n) => PLACE_OF[n]).slice(0, 16);
const STATION_BY_NAME = {};
const STATIONS = STATION_NAMES.map((name, i) => {
    const info = PLACE_OF[name];
    return {
        id: i + 1,
        canteen_id: info.pi + 1,
        name,
        categories: info.category ? [info.category] : ['综合'],
        price_level: 1 + (i % 3),
        avg_score: info.place.rating ?? Math.round((3.8 + ((i * 23) % 11) / 10) * 10) / 10,
        cover_object_key: `dish/${(REAL.dishes.find((d) => d.station === name) || {}).file || info.place.name}`,
        open_status: 1,
        description: `${info.place.name} · ${info.category || '综合'}（真实档口数据）`,
    };
});
STATIONS.forEach((x) => { STATION_BY_NAME[x.name] = x; });

// 4.5 轮九批（E）：食堂/档口封面改名称键（store/<名称> → /img/ 匹配华为仓店铺真图）

/* ============ 菜品（程序化生成） ============ */
const DISH_POOL = {
    盖浇饭: ['红烧肉盖浇饭', '番茄牛腩盖浇饭'],
    香锅: ['麻辣香锅', '微辣香锅'],
    面食: ['阳春面', '牛肉拉面'],
    套餐: ['两荤一素套餐', '三荤套餐'],
    甜品: ['红豆双皮奶', '杨枝甘露'],
    小炒: ['青椒肉丝', '宫保鸡丁'],
    粥: ['皮蛋瘦肉粥', '南瓜小米粥'],
    快餐: ['黄焖鸡米饭', '卤肉饭'],
    火锅: ['番茄锅底', '麻辣锅底'],
    日料: ['三文鱼寿司', '鳗鱼寿司'],
    茶饮: ['珍珠奶茶', '葡萄柚茶'],
    咖啡: ['香草拿铁', '美式咖啡'],
    麻辣烫: ['经典麻辣烫', '番茄麻辣烫'],
    炸鸡: ['韩式炸鸡', '原味炸鸡'],
    小吃: ['沙县拌面', '鲜肉蒸饺'],
};
let dishId = 1;
// 真菜品：华为仓 158 道（菜名/档口/图片一一对应），归属真档口；评分/价格确定性占位
const DISHES = REAL.dishes
    .filter((d) => STATION_BY_NAME[d.station])
    .map((d, i) => {
        const st = STATION_BY_NAME[d.station];
        return {
            id: 101 + i,
            name: d.dish,
            station_id: st.id,
            station_name: st.name,
            canteen_id: st.canteen_id,
            canteen_name: canteenName(st.canteen_id),
            avg_score: st.avg_score, // 十六批：继承所属真食堂的真实评分（real-data rating；无评分食堂为确定性占位）
            cover_object_key: `dish/${d.file}`, // 华为仓真图（文件名即菜名）
            price: 6 + ((i * 13) % 22), // 估算价（真实菜价待菜单数据接入）
            categories: st.categories,
            review_count: 60 + ((i * 53) % 240), // 评价条数（与获赞数独立，十六批补）
            like_count: 30 + ((i * 17) % 170),
        };
    });

/* ============ 点评 ============ */
const REVIEWS = [
    { review_id: 1, user_name: '干饭王', avatar_object_key: cover('u1'), content: '紫荆盖浇饭红烧肉给得超实在，米也很香，强烈安利！', images: [cover('r1'), cover('r2')], score: 4.6, created_at: now(), dish_name: '红烧肉盖浇饭', canteen_name: '紫荆园', like_count: 32 },
    { review_id: 2, user_name: '柠檬不酸', avatar_object_key: cover('u2'), content: '永嘉奶茶的葡萄柚茶真的绝，比某茶好喝还便宜。', images: [cover('r3')], score: 4.8, created_at: now(), dish_name: '葡萄柚茶', canteen_name: '永嘉·茶饮茶咖', like_count: 51 },
    { review_id: 3, user_name: '夜宵选手', avatar_object_key: cover('u3'), content: '美岐麻辣烫yyds，加份宽粉快乐加倍。', images: [], score: 4.2, created_at: now(), dish_name: '经典麻辣烫', canteen_name: '美岐学生街·食集', like_count: 18 },
    { review_id: 4, user_name: '佛系吃饭', avatar_object_key: cover('u4'), content: '玫瑰园小炒分量足，青椒肉丝下饭神器。', images: [cover('r4')], score: 4.1, created_at: now(), dish_name: '青椒肉丝', canteen_name: '玫瑰园', like_count: 22 },
    { review_id: 5, user_name: '甜品胃', avatar_object_key: cover('u5'), content: '京元糖水的杨枝甘露料很足，椰子味浓。', images: [], score: 4.5, created_at: now(), dish_name: '杨枝甘露', canteen_name: '京元餐厅', like_count: 40 },
    { review_id: 6, user_name: '日料爱好者', avatar_object_key: cover('u6'), content: '永嘉寿司三文鱼新鲜，价格也合理。', images: [cover('r5')], score: 4.4, created_at: now(), dish_name: '三文鱼寿司', canteen_name: '永嘉·美食城', like_count: 27 },
    { review_id: 7, user_name: '炸鸡控', avatar_object_key: cover('u7'), content: '美岐炸鸡外脆里嫩，原味就很好吃。', images: [], score: 4.3, created_at: now(), dish_name: '原味炸鸡', canteen_name: '美岐学生街·食集', like_count: 15 },
    { review_id: 8, user_name: '拌面星人', avatar_object_key: cover('u8'), content: '西门外沙县拌面还是那个味，便宜大碗。', images: [cover('r6')], score: 4.0, created_at: now(), dish_name: '沙县拌面', canteen_name: '西门·沙县小吃', like_count: 12 },
];

/* ============ 帖子（点评圈） ============ */
const POSTS = [
    { post_id: 1, user_name: '干饭王', avatar_object_key: cover('u1'), title: '紫荆园今日测评', content: '今天把紫荆园三个档口都尝了，盖浇饭最顶，香锅偏咸，面馆中规中矩。', images: [cover('p1'), cover('p2')], created_at: now(), like_count: 33, comment_count: 9 },
    { post_id: 2, user_name: '奶茶续命', avatar_object_key: cover('u2'), title: '永嘉茶饮红黑榜', content: '葡萄柚茶必点！美式偏苦看个人，环境适合拍照。', images: [cover('p3')], created_at: now(), like_count: 61, comment_count: 14 },
    { post_id: 3, user_name: '夜猫子', avatar_object_key: cover('u3'), title: '学生街夜宵地图', content: '麻辣烫+炸鸡+烤串一条龙，凌晨还有人排队。', images: [cover('p4'), cover('p5')], created_at: now(), like_count: 48, comment_count: 21 },
    { post_id: 4, user_name: '养生达人', avatar_object_key: cover('u4'), title: '低卡也能吃好', content: '粥铺的南瓜小米粥配小菜，减脂期友好。', images: [], created_at: now(), like_count: 25, comment_count: 6 },
    { post_id: 5, user_name: '日料控', avatar_object_key: cover('u6'), title: '永嘉日料初体验', content: '寿司新鲜度在线，价位对学生党友好。', images: [cover('p6')], created_at: now(), like_count: 30, comment_count: 8 },
    { post_id: 6, user_name: '怀旧党', avatar_object_key: cover('u8'), title: '西门外老味道', content: '拌面蒸饺还是小时候的味道，路过必来一份。', images: [], created_at: now(), like_count: 19, comment_count: 4 },
];

/* ============ 当前用户（演示态） ============ */
const ME = { id: 1, name: '演示同学', role: 0, student_id: '20260001', avatar_object_key: cover('avatar'), bio: '爱在福大干饭的人' };

/* ============ 图形验证码（本地生成 SVG，5 分钟有效、用一次即失效） ============ */
// 没有真实后端时，登录页的验证码就靠这里出图；否则「点击获取」永远拿不到图，登录也走不通
const CAPTCHAS = new Map();

/**
 * 生成 4 位数字验证码的 SVG（浅奶油底 + 干扰线 + 轻微倾斜，保证肉眼能认）
 * @param {string} code - 4 位数字
 * @returns {string} data URL，可直接绑 img src
 */
function svg_captcha(code) {
    const w = 122;
    const h = 44;
    const lines = Array.from({ length: 4 }, () => {
        const x1 = Math.round(rnd(0, w));
        const y1 = Math.round(rnd(0, h));
        const x2 = Math.round(rnd(0, w));
        const y2 = Math.round(rnd(0, h));
        const stroke = pick(['#E3C98C', '#D9BC7A', '#C9A961']);
        return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="1" opacity="0.55"/>`;
    }).join('');
    const chars = code.split('').map((c, i) => {
        const x = 16 + i * 25;
        const rot = rnd(-11, 11).toFixed(1);
        const fill = pick(['#8a6520', '#7a5418', '#a06a10', '#6b4a12']);
        return `<text x="${x}" y="32" font-family="'Courier New',monospace" font-size="25" font-weight="700" fill="${fill}" transform="rotate(${rot} ${x} 24)">${c}</text>`;
    }).join('');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="100%" height="100%" fill="#FDF7E7"/>${lines}${chars}</svg>`;
    return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

/**
 * 签发一张新验证码（旧的不主动清理，各自 5 分钟后自然过期）
 * @returns {{captchaId: string, imageBase64: string}}
 */
function issue_captcha() {
    const code = String(Math.floor(1000 + Math.random() * 9000));
    const captchaId = `demo-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    CAPTCHAS.set(captchaId, { code, exp: Date.now() + 5 * 60 * 1000 });
    return { captchaId, imageBase64: svg_captcha(code) };
}

/**
 * 校验并消费验证码（读一次即删，和后端一次性消费口径一致）
 * @returns {string} 空串=通过；否则为中文错误原因
 */
function check_captcha(captchaId, captchaCode) {
    const key = String(captchaId || '');
    const rec = CAPTCHAS.get(key);
    if (!rec) return '验证码已过期，请点击图片刷新后重试';
    CAPTCHAS.delete(key);
    if (rec.exp < Date.now()) return '验证码已过期，请点击图片刷新后重试';
    if (String(captchaCode || '').trim().toLowerCase() !== rec.code) return '验证码错误，请按图片内容重新输入';
    return '';
}

/**
 * 演示态登录/注册：账号密码随便填（不接真实后端），只校验图形验证码
 * @returns {Object} 成功回 {token,user}；失败回 {__fail: 原因}
 */
function demo_auth(body) {
    const err = check_captcha(body.captchaId, body.captchaCode);
    if (err) return { __fail: err };
    const name = String(body.nickname || body.username || '演示同学').slice(0, 32);
    return {
        token: `demo-token-${Date.now().toString(36)}`,
        user: { ...ME, name },
    };
}

/* ============ 菜品池（4.5 轮预览：首页推荐用真菜品形态，封面接仓库素材图） ============ */
const DISH_REASONS = ['高分口碑 · 回购率高', '清淡不辣 · 适合正餐', '分量足 · 性价比高', '档口招牌 · 出餐快', '汤底浓郁 · 配菜实惠', '甜口解腻 · 饭后来一份'];

/* 口味标签（4.5 轮十三批）：与 backend/src/seed/seed.js 同规则——按菜名推导，恢复原版口径 */
function taste_of(name) {
    if (/辣|麻|椒|川|湘/.test(name)) return '偏辣';
    if (/甜|奶|糖|蛋糕|泡芙|蛋挞|冰|芋泥|栗/.test(name)) return '甜香';
    if (/汤|粥|蒸|清|豆花/.test(name)) return '清淡';
    if (/炸|烤|酥|脆|鸡排|鸡腿/.test(name)) return '香脆';
    return '咸鲜';
}
function flatten_dishes() {
    // 4.5 轮十二批（E）：全部来自真实数据池（华为仓 158 菜 + real-data 食堂/档口归属），不再自造
    return DISHES.map((d) => ({
        subjectType: 0,
        subjectId: d.id,
        name: d.name,
        subtitle: [d.canteen_name, (d.categories || [])[0]].filter(Boolean).join(' · '),
        avgScore: d.avg_score,
        reviewCount: d.review_count,
        likeCount: d.like_count,
        price: d.price,
        taste_tags: [taste_of(d.name)], // 口味标签（原版 taste_of 口径）
        station: d.station_name,
        canteen: d.canteen_name,
        category: (d.categories || [])[0] || '',
        reason: DISH_REASONS[d.id % DISH_REASONS.length],
        cover: d.cover_object_key,
    }));
}

/* ============ 路由处理 ============ */
function rankingRows(q) {
    // 4.5 轮十一批（E）：榜单改排真菜品（名图对应）；评分为确定性值（同菜品全站一致，不再每次随机）；
    // dim 口径对齐 /rank 三榜：hot=按评价条数 / score=按平均分（默认）/ like=按获赞数（确定性虚拟值）
    const rows = flatten_dishes().slice(0, 10).map((d, i) => {
        const st = STATIONS[i % STATIONS.length];
        return {
            subjectType: 0, // 菜品（口碑榜卡据此跳 /dish/:id）
            id: d.subjectId,
            name: d.name,
            canteenName: d.canteen,
            category: d.category,
            ratingAvg: d.avgScore,
            reviewCount: d.reviewCount,
            likeCount: d.likeCount, // 十六批修正：d 为 flatten 行（驼峰 likeCount），此前误写下划线字段名恒 undefined
            avgPrice: d.price,
            coverObjectKey: d.cover,
        };
    });
    const dim = (q && q.dim) || 'score';
    if (dim === 'hot') rows.sort((a, b) => b.reviewCount - a.reviewCount);
    else if (dim === 'like') rows.sort((a, b) => b.likeCount - a.likeCount);
    else rows.sort((a, b) => b.ratingAvg - a.ratingAvg);
    return rows.slice(0, 12); // 候选池 12（4.5 轮十六批：换一换需要更大池子）
}

export function mockData(urlPath, method, query, body) {
    const q = query || {};
    const b = body || {};
    if (method === 'POST') {
        if (urlPath === '/api/auth/login' || urlPath === '/api/auth/register') return demo_auth(b);
        if (urlPath === '/api/ai/ask') {
            return { answer: '（模拟回复）福宝暂时离线，这是本地演示数据。试试首页、地图、点评圈这些页面，数据都已经填充好啦～' };
        }
        // 点赞/收藏等写操作：返回成功结构，避免前端报错
        return { ok: true, liked: true, likeCount: Math.round(rnd(10, 80)), favored: true };
    }

    let m;
    if ((m = urlPath.match(/^\/api\/canteens\/(\d+)$/))) {
        const id = Number(m[1]);
        const c = CANTEENS.find((x) => x.id === id);
        if (!c) return { canteen: null, stations: [], posts: [], reviews: [], stats: {} };
        return {
            canteen: { ...c },
            stations: STATIONS.filter((s) => s.canteen_id === id),
            posts: [], // 契约对齐：后端 canteen_detail 返回 posts（食堂详情页动态条数据源）
            reviews: REVIEWS.filter((r) => r.canteen_name === c.name).slice(0, 3),
            stats: { reviewCount: 128, avgScore: c.avg_score },
        };
    }
    if (urlPath === '/api/canteens') {
        let list = CANTEENS.slice();
        if (q.type !== undefined && q.type !== '' && q.type !== 'all') list = list.filter((c) => String(c.type) === String(q.type));
        if (q.q) list = list.filter((c) => c.name.includes(q.q));
        return { list, total: list.length };
    }
    if ((m = urlPath.match(/^\/api\/stations\/(\d+)$/))) {
        const id = Number(m[1]);
        const s = STATIONS.find((x) => x.id === id);
        if (!s) return { station: null, summary: null, dishes: [], posts: [], recommended: [], reviews: [], ratings: {} };
        return {
            station: { ...s, canteen_name: canteenName(s.canteen_id) },
            summary: null, // 契约对齐：后端 station_detail 返回 summary / posts / recommended
            dishes: DISHES.filter((d) => d.station_id === id),
            posts: [],
            recommended: [],
            reviews: REVIEWS.filter((r) => r.canteen_name === canteenName(s.canteen_id)).slice(0, 3),
            ratings: {},
        };
    }
    if (urlPath === '/api/stations') {
        return STATIONS.map((s) => ({ ...s, canteenName: canteenName(s.canteen_id), avgScore: s.avg_score }));
    }
    if ((m = urlPath.match(/^\/api\/dishes\/(\d+)$/))) {
        const id = Number(m[1]);
        let d = DISHES.find((x) => x.id === id);
        // 4.5 轮十批（E）：口碑榜/推荐卡指向华为仓真菜品池（flatten_dishes，id 101+），查无时回退
        if (!d) {
            const f = flatten_dishes().find((x) => x.subjectId === id);
            if (f) {
                const ct = CANTEENS.find((c) => c.name === f.canteen);
                d = {
                    id: f.subjectId, name: f.name, price: st.price_level * 12,
                    avg_score: f.avgScore, cover_object_key: f.cover,
                    taste_tags: taste_of(f.name), taboo_tags: '', // 口味标签（seed.js taste_of 同规则）
                    description: '本地预览数据：菜品详情待真实数据接入。',
                    station_id: (STATION_BY_NAME[f.station] || {}).id ?? 0, station_name: f.station,
                    canteen_id: ct ? ct.id : 0, canteen_name: f.canteen, canteen_type: ct ? ct.type : 0,
                    like_count: f.reviewCount,
                };
            }
        }
        if (!d) return { dish: null, station: {}, canteen: {}, reviews: [], ratings: {} };
        return { dish: { ...d }, station: { name: d.station_name }, canteen: { name: d.canteen_name }, reviews: [], ratings: {} };
    }
    if (urlPath === '/api/dishes') {
        let list = DISHES.slice();
        if (q.q) list = list.filter((d) => d.name.includes(q.q) || d.station_name.includes(q.q));
        if (q.category) list = list.filter((d) => d.categories.includes(q.category));
        return { list: list.slice(0, 30), total: list.length };
    }
    if (urlPath === '/api/search') {
        const kw = (q.q || '').trim();
        const hit = (name) => !kw || name.includes(kw);
        return {
            points: CANTEENS.filter((c) => hit(c.name)).slice(0, 6),
            stations: STATIONS.filter((s) => hit(s.name)).slice(0, 6),
            dishes: DISHES.filter((d) => hit(d.name)).slice(0, 6),
        };
    }
    if (urlPath === '/api/search/hot') return ['紫荆园', '麻辣烫', '永嘉奶茶', '炸鸡', '沙县拌面', '京元糖水'];
    if (urlPath === '/api/filters/options') {
        return {
            canteenTypes: [{ value: 0, label: '校内食堂' }, { value: 1, label: '永嘉天地' }, { value: 2, label: '学生街' }, { value: 3, label: '周边其他' }],
            categories: [...new Set(STATIONS.flatMap((x) => x.categories))], // 真档口品类（过滤口径）
            openStatus: [{ value: 1, label: '营业中' }],
        };
    }
    if (urlPath === '/api/recommendations') {
        // 4.5 轮预览（E）：真菜品形态（top=口碑榜回落源、forYou=为你推荐）；真栈下由后端推荐接口接管
        const dishes = flatten_dishes();
        return { top: dishes.slice(0, 6), forYou: dishes.slice(2, 8) };
    }
    if (urlPath === '/api/rankings') return rankingRows(q);
    if (urlPath === '/api/reviews') {
        const page = Number(q.page || 1);
        const size = Number(q.size || 20);
        return { list: REVIEWS, total: REVIEWS.length, page, size };
    }
    if (urlPath === '/api/posts') return { list: POSTS, total: POSTS.length };
    if (urlPath === '/api/categories') {
        return Object.keys(DISH_POOL).map((k, i) => ({ id: i + 1, name: k }));
    }
    if (urlPath === '/api/dimensions') {
        return [{ key: 'taste', label: '口味' }, { key: 'price', label: '价格' }, { key: 'env', label: '环境' }];
    }
    if (urlPath === '/api/auth/me') return ME;
    // 图形验证码（登录/注册共用，点图可反复刷新）
    if (urlPath === '/api/auth/captcha') return issue_captcha();
    if (urlPath === '/api/ai/history') return [];
    if (urlPath === '/api/ai/providers') return [];
    if (urlPath === '/api/ai/models') return [];
    // 我的页 / 通知 / 任务 / 宠物等：返回安全空结构，避免页面崩溃
    if (urlPath.startsWith('/api/me')) return { list: [], total: 0, daily: [], growth: [], coins: 0 };
    if (urlPath.startsWith('/api/notifications')) return [];
    if (urlPath.startsWith('/api/checkin')) return { totalDays: 0, monthDays: 0, continuousDays: 0, monthCanteens: 0 };
    if (urlPath.startsWith('/api/pet')) return { level: 1, exp: 0, name: '福宝', dresses: [] };
    if (urlPath.startsWith('/api/tasks')) return { daily: [], growth: [], coins: 0 };
    if (urlPath === '/api/admin/dashboard') return { stats: {}, todos: [] };
    // 未命中：返回空对象，避免 404 弹窗
    return {};
}

/* ============ 占位图（SVG） ============ */
const PALETTE = ['#F4A259', '#E76F51', '#F6BD60', '#E9C46A', '#D9A566', '#BC6C25'];
export function placeholderSvg(seed = '') {
    const c = PALETTE[seed.length % PALETTE.length];
    return `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="100%" height="100%" fill="${c}"/><text x="50%" y="50%" fill="#fff8ee" font-family="sans-serif" font-size="22" font-weight="700" text-anchor="middle" dominant-baseline="middle">大福食刻</text></svg>`;
}

/* ============ vite 插件 ============ */
export default function dafuMockPlugin() {
    return {
        name: 'dafu-mock',
        configureServer(server) {
            server.middlewares.use((req, res, next) => {
                const url = req.url || '';
                if (url.startsWith('/img/')) {
                    // 4.5 轮九批（E）：封面键按名称模糊匹配华为仓真图 302 出图；未命中回落 food 素材；
                    // 真栈下 /img/* 由 MinIO 图片服务接管，此段不参与
                    let key = url.slice('/img/'.length);
                    try { key = decodeURIComponent(key); } catch { /* 保原样 */ }
                    res.writeHead(302, { Location: match_local_image(key) });
                    res.end();
                    return;
                }
                if (url.startsWith('/api/')) {
                    const u = new URL(req.url, 'http://localhost');
                    // POST/PUT 需要读请求体（登录、注册要带验证码），其余按空体处理
                    const take_body = (cb) => {
                        if (req.method !== 'POST' && req.method !== 'PUT') { cb({}); return; }
                        let raw = '';
                        req.on('data', (c) => { raw += c; });
                        req.on('end', () => {
                            try { cb(raw ? JSON.parse(raw) : {}); } catch { cb({}); }
                        });
                    };
                    take_body((body) => {
                        const data = mockData(u.pathname, req.method || 'GET', Object.fromEntries(u.searchParams), body);
                        res.setHeader('Content-Type', 'application/json');
                        // 业务失败（如验证码不对）：按后端同款 {code,msg} 口径返回，前端拦截器照常弹提示
                        if (data && data.__fail) {
                            res.end(JSON.stringify({ code: 400, msg: data.__fail, data: null }));
                            return;
                        }
                        res.end(JSON.stringify({ code: 0, msg: '', data }));
                    });
                    return;
                }
                next();
            });
        },
    };
}
