// 本地 mock：仅开发演示用，不依赖真实后端。
// 后端统一返回 {code,msg,data}，http.js 拦截器取 data 交给页面。
// 本模块只产出 data，由 vite 插件包成 {code:0,data}。

/* ============ 工具 ============ */
const rnd = (a, b) => Math.round((a + Math.random() * (b - a)) * 10) / 10;
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const cover = (k) => `mock/${k}.jpg`;
const now = () => new Date().toISOString();

/* ============ 食堂（点位） ============ */
const CANTEENS = [
    { id: 1, name: '紫荆园', type: 0, avg_score: 4.3, cover_object_key: cover('c-zijing'), location: '生活三区·捷祥餐厅', stations_count: 3, open_status: 1, lat: 26.0528, lng: 119.1926, description: '福大生活三区主食餐厅，平价家常，饭点人多。', tags: ['平价', '家常'] },
    { id: 2, name: '京元餐厅', type: 0, avg_score: 4.1, cover_object_key: cover('c-jingyuan'), location: '生活一区·京元', stations_count: 2, open_status: 1, lat: 26.0567, lng: 119.1927, description: '生活一区老牌餐厅，套餐和糖水都不错。', tags: ['套餐', '甜品'] },
    { id: 3, name: '玫瑰园', type: 0, avg_score: 4.0, cover_object_key: cover('c-meigui'), location: '生活三区·玫瑰园', stations_count: 2, open_status: 1, lat: 26.0523, lng: 119.1917, description: '小炒和粥类为主，适合慢慢吃。', tags: ['小炒', '粥'] },
    { id: 4, name: '丁香园', type: 0, avg_score: 3.9, cover_object_key: cover('c-dingxiang'), location: '生活一区·丁香园', stations_count: 1, open_status: 1, lat: 26.0559, lng: 119.1920, description: '快餐档口，出餐快。', tags: ['快餐'] },
    { id: 5, name: '永嘉·美食城', type: 1, avg_score: 4.2, cover_object_key: cover('c-yongjia'), location: '永嘉天地', stations_count: 2, open_status: 1, lat: 26.0501, lng: 119.1880, description: '永嘉天地里的美食集合，火锅日料都有。', tags: ['火锅', '日料'] },
    { id: 6, name: '永嘉·茶饮茶咖', type: 1, avg_score: 4.5, cover_object_key: cover('c-yongjiacha'), location: '永嘉天地', stations_count: 2, open_status: 1, lat: 26.0503, lng: 119.1882, description: '奶茶咖啡一条龙，环境好适合坐着。', tags: ['茶饮', '咖啡'] },
    { id: 7, name: '美岐学生街·食集', type: 2, avg_score: 4.0, cover_object_key: cover('c-meiqi'), location: '美岐学生街', stations_count: 2, open_status: 1, lat: 26.0595, lng: 119.1920, description: '学生街夜宵天堂，麻辣烫炸鸡管够。', tags: ['麻辣烫', '炸鸡'] },
    { id: 8, name: '西门·沙县小吃', type: 3, avg_score: 3.8, cover_object_key: cover('c-shaxian'), location: '学校西门外', stations_count: 1, open_status: 1, lat: 26.0580, lng: 119.1860, description: '西门外老牌沙县，拌面蒸饺yyds。', tags: ['小吃'] },
];
const canteenName = (id) => (CANTEENS.find((c) => c.id === id) || {}).name || '';

/* ============ 档口 ============ */
const STATION_DEFS = [
    { id: 1, canteen_id: 1, name: '紫荆盖浇饭', categories: ['盖浇饭', '平价'], price_level: 1 },
    { id: 2, canteen_id: 1, name: '紫荆麻辣香锅', categories: ['香锅'], price_level: 2 },
    { id: 3, canteen_id: 1, name: '紫荆面馆', categories: ['面食'], price_level: 1 },
    { id: 4, canteen_id: 2, name: '京元套餐', categories: ['套餐'], price_level: 1 },
    { id: 5, canteen_id: 2, name: '京元糖水', categories: ['甜品'], price_level: 1 },
    { id: 6, canteen_id: 3, name: '玫瑰园小炒', categories: ['小炒'], price_level: 2 },
    { id: 7, canteen_id: 3, name: '玫瑰园粥铺', categories: ['粥'], price_level: 1 },
    { id: 8, canteen_id: 4, name: '丁香园快餐', categories: ['快餐'], price_level: 1 },
    { id: 9, canteen_id: 5, name: '永嘉火锅', categories: ['火锅'], price_level: 3 },
    { id: 10, canteen_id: 5, name: '永嘉寿司', categories: ['日料'], price_level: 3 },
    { id: 11, canteen_id: 6, name: '永嘉奶茶', categories: ['茶饮'], price_level: 2 },
    { id: 12, canteen_id: 6, name: '永嘉咖啡', categories: ['咖啡'], price_level: 2 },
    { id: 13, canteen_id: 7, name: '美岐麻辣烫', categories: ['麻辣烫'], price_level: 2 },
    { id: 14, canteen_id: 7, name: '美岐炸鸡', categories: ['炸鸡'], price_level: 2 },
    { id: 15, canteen_id: 8, name: '沙县小吃', categories: ['小吃'], price_level: 1 },
];
const STATIONS = STATION_DEFS.map((s) => ({
    ...s,
    avg_score: rnd(3.8, 4.8),
    cover_object_key: cover(`s-${s.id}`),
    open_status: 1,
    description: `${s.name}，主打${s.categories.join('、')}。`,
}));

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
const DISHES = [];
STATION_DEFS.forEach((s) => {
    const cats = s.categories;
    const pool = DISH_POOL[cats[0]] || ['招牌菜'];
    pool.forEach((name) => {
        DISHES.push({
            id: dishId++,
            name,
            station_id: s.id,
            station_name: s.name,
            canteen_name: canteenName(s.canteen_id),
            avg_score: rnd(3.8, 4.9),
            cover_object_key: cover(`d-${dishId}`),
            price: s.price_level * 8 + Math.round(rnd(2, 10)),
            categories: cats,
            like_count: Math.round(rnd(10, 200)),
        });
    });
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

/* ============ 路由处理 ============ */
function rankingRows() {
    return STATIONS.slice(0, 6).map((s) => ({
        id: s.id,
        name: s.name,
        canteenName: canteenName(s.canteen_id),
        category: s.categories[0],
        ratingAvg: s.avg_score,
        reviewCount: Math.round(rnd(50, 300)),
        avgPrice: s.price_level * 12,
        coverObjectKey: s.cover_object_key,
    }));
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
        if (!c) return { canteen: null, stations: [], reviews: [], stats: {} };
        return {
            canteen: { ...c },
            stations: STATIONS.filter((s) => s.canteen_id === id),
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
        if (!s) return { station: null, dishes: [], reviews: [], ratings: {} };
        return {
            station: { ...s, canteen_name: canteenName(s.canteen_id) },
            dishes: DISHES.filter((d) => d.station_id === id),
            reviews: REVIEWS.filter((r) => r.canteen_name === canteenName(s.canteen_id)).slice(0, 3),
            ratings: {},
        };
    }
    if (urlPath === '/api/stations') {
        return STATIONS.map((s) => ({ ...s, canteenName: canteenName(s.canteen_id), avgScore: s.avg_score }));
    }
    if ((m = urlPath.match(/^\/api\/dishes\/(\d+)$/))) {
        const id = Number(m[1]);
        const d = DISHES.find((x) => x.id === id);
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
            categories: Object.keys(DISH_POOL),
            openStatus: [{ value: 1, label: '营业中' }],
        };
    }
    if (urlPath === '/api/recommendations') {
        return { top: CANTEENS.slice(0, 4), forYou: CANTEENS.slice(2, 6) };
    }
    if (urlPath === '/api/rankings') return rankingRows();
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
                    res.setHeader('Content-Type', 'image/svg+xml');
                    res.end(placeholderSvg(url));
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
