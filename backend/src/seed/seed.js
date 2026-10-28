/**
 * 种子数据一键导入（v2.1 口径，v2.0 数据 + 点位中文标签）：
 * 数据口径：基于福州大学旗山校区真实食堂、美岐学生街与永嘉天地真实在营商户编写的「拟真数据集」
 * （菜品/价格贴近实际门店菜单，评价文本参考大众点评/美团真实点评语料风格人工撰写，
 * 非爬虫抓取，答辩如实说明）：
 * 10 点位（6 校内食堂 + 3 永嘉天地商户 + 美岐学生街）/ 52 窗口 / 330+ 菜品 / 管理员+12 学生 /
 * 180+ 条种子评价（按维度配置加权打分）/ 收藏（想吃）/ 窗口公告；随后聚合全量重算
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

/* ===== 点位：校内 6 食堂（type=0）+ 永嘉天地 3 商户（type=1）+ 美岐学生街（type=2） =====
 * 校内餐厅名全部取自福州大学后勤管理处官网营业通知（hqc.fzu.edu.cn，2026-07/2024-08/2023-07 公告）：
 * 生活一区：海棠园京元餐厅（一楼）、茉莉园聚誉餐厅（二楼）、丁香园品膳餐厅、丹桂园朝阳餐厅；
 * 生活三区：玫瑰园食惠餐厅、紫荆园捷祥餐厅（含麦当劳）；教学区：桃李园餐厅（教工接待）。
 * 位置描述为楼栋级口径（生活一/三区沿校园西侧，玫瑰园/紫荆园并排 serve 二三区）。
 * 坐标 GCJ-02 火星坐标：美岐用 poi86 火星坐标 119.191987,26.059497（早期误用大地坐标会偏约 500 米）；
 * 永嘉天地取 26.0600/119.1930 一带微错开。
 * tags：点位中文标签（03 §2 canteen.tags JSON），2-4 个按点位类型/主营合理分配
 */
const CANTEENS = [
    { name: '旗山校区·京元餐厅（海棠园）', type: 0, campus: '旗山校区', location: '生活一区一楼，近东门', avgPrice: 12, lat: 26.0567, lng: 119.1927, cover: 'preset:rice', tags: ['自选菜', '米饭套餐', '平价', '粉面'] },
    { name: '旗山校区·丁香园餐厅', type: 0, campus: '旗山校区', location: '生活一区，临青春广场', avgPrice: 13, lat: 26.0559, lng: 119.1920, cover: 'preset:dumpling', tags: ['面食', '粉面', '自选菜'] },
    { name: '旗山校区·朝阳餐厅（丹桂园）', type: 0, campus: '旗山校区', location: '生活一区，丁香园北侧（原丁香园二楼）', avgPrice: 11, lat: 26.0565, lng: 119.1914, cover: 'preset:wok', tags: ['自选菜', '平价', '家常菜'] },
    { name: '旗山校区·玫瑰园餐厅（食惠）', type: 0, campus: '旗山校区', location: '生活三区大门旁，临生活二区', avgPrice: 12, lat: 26.0523, lng: 119.1917, cover: 'preset:salad', tags: ['米饭套餐', '粉面', '自助'] },
    { name: '旗山校区·紫荆园餐厅（捷祥）', type: 0, campus: '旗山校区', location: '生活三区，含麦当劳', avgPrice: 15, lat: 26.0528, lng: 119.1926, cover: 'preset:burger', tags: ['汉堡', '奶茶', '西式快餐'] },
    { name: '旗山校区·桃李园餐厅', type: 0, campus: '旗山校区', location: '教学区东三教学楼旁（教工接待餐厅）', avgPrice: 16, lat: 26.0576, lng: 119.1962, cover: 'preset:noodle', tags: ['教工餐厅', '面食', '米饭套餐'] },
    { name: '永嘉天地·巷口麻辣烫', type: 1, campus: '周边商区', location: '永嘉天地 B1', avgPrice: 18, lat: 26.0602, lng: 119.1926, cover: 'preset:hotpot', tags: ['麻辣烫', '外卖', '微辣'], category: '麻辣烫', dishes: [['招牌骨汤麻辣烫', 18], ['番茄麻辣烫', 17], ['微辣套餐', 20], ['加宽粉', 2], ['加午餐肉', 5]] },
    { name: '永嘉天地·食光里轻食', type: 1, campus: '周边商区', location: '永嘉天地一层', avgPrice: 22, lat: 26.0597, lng: 119.1932, cover: 'preset:salad', tags: ['轻食', '沙拉', '素食'], category: '轻食', dishes: [['鸡胸肉沙拉', 16], ['牛油果沙拉', 19], ['全麦三明治', 13], ['藜麦碗', 17]] },
    { name: '永嘉天地·果遇鲜果茶', type: 1, campus: '周边商区', location: '永嘉天地一层中庭', avgPrice: 15, lat: 26.0601, lng: 119.1934, cover: 'preset:milktea', tags: ['奶茶', '甜品', '外卖'], category: '甜品饮品', dishes: [['满杯百香果', 12], ['杨枝甘露', 15], ['柠檬茶', 9], ['鲜橙四季春', 10]] },
    { name: '美岐学生街', type: 2, campus: '周边商区', location: '旗山校区西门·美岐商业街', avgPrice: 18, lat: 26.0595, lng: 119.1920, cover: 'preset:hotpot', tags: ['小吃街', '粉面', '汉堡', '麻辣烫'] },
];

/* 品类 → 预设封面（preset: 前缀存库，前端 cover_url 映射 /preset-cover/ 贴纸 SVG） */
const CATEGORY_COVER = {
    '自选菜': 'preset:rice', '米饭套餐': 'preset:rice', '套餐': 'preset:rice',
    '粉面': 'preset:noodle', '面食': 'preset:noodle',
    '面点': 'preset:baozi', '小吃': 'preset:fries', '卤味': 'preset:fries',
    '轻食': 'preset:salad', '汉堡简餐': 'preset:burger', '铁板': 'preset:bbq',
    '韩式': 'preset:hotpot', '麻辣烫': 'preset:hotpot', '家常炒菜': 'preset:wok',
    '甜品饮品': 'preset:milktea', '福州小吃': 'preset:dumpling', '炸鸡小吃': 'preset:chicken',
};

/* 校内窗口模板（品类名即窗口名，随机洗牌分配） */
const STATION_TPL = [
    ['麻辣香锅', '自选菜'], ['黄焖鸡米饭', '米饭套餐'], ['兰州拉面', '面食'], ['沙县小吃', '粉面'],
    ['重庆小面', '面食'], ['广式煲仔饭', '米饭套餐'], ['卤味熟食', '卤味'], ['铁板烧', '铁板'],
    ['石锅拌饭', '韩式'], ['手工水饺', '面点'], ['烧腊饭', '米饭套餐'], ['自选快餐', '自选菜'],
    ['日式定食', '套餐'], ['麻辣烫', '自选菜'], ['炸鸡汉堡', '小吃'], ['粥粉面档', '粉面'],
    ['轻食沙拉', '轻食'], ['台湾卤肉饭', '米饭套餐'], ['烤肉拌饭', '米饭套餐'], ['螺蛳粉', '粉面'],
];

/* 美岐学生街：真实在营商户 + 贴近门店菜单的招牌菜 */
const OFF_CAMPUS_STATIONS = [
    { name: '周麻婆·川菜小馆', category: '家常炒菜', dishes: [['周麻婆豆腐', 14], ['水煮肉片', 22], ['宫保鸡丁', 18], ['鱼香肉丝', 17], ['酸汤肥牛', 26], ['干锅花菜', 14], ['番茄蛋汤', 6]] },
    { name: '塔斯汀·中国汉堡', category: '汉堡简餐', dishes: [['板烧凤梨中国堡', 16], ['香辣鸡腿堡', 13], ['北京烤鸭中国堡', 17], ['藤椒鸡排堡', 14], ['双层牛肉堡', 19], ['经典薯条', 7]] },
    { name: '华莱士·全鸡汉堡', category: '汉堡简餐', dishes: [['香辣鸡腿堡', 10], ['全鸡汉堡', 9], ['黄金鸡米花', 8], ['香酥鸡排', 11], ['蛋挞', 4], ['可乐', 3]] },
    { name: '蜜雪冰城', category: '甜品饮品', dishes: [['冰鲜柠檬水', 4], ['珍珠奶茶', 6], ['摇摇奶昔', 7], ['圣代', 5], ['满杯百香果', 7], ['柠檬芦荟', 6]] },
    { name: '张亮麻辣烫', category: '麻辣烫', dishes: [['招牌骨汤麻辣烫', 20], ['番茄麻辣烫', 19], ['微辣套餐', 22], ['加宽粉', 2], ['加午餐肉', 5]] },
    { name: '老福洲·拌面扁肉', category: '福州小吃', dishes: [['花生酱拌面', 7], ['扁肉', 7], ['拌面扁肉套餐', 13], ['卤蛋', 2], ['罗汉肉', 10], ['炸春卷', 6]] },
    { name: '正新鸡排·美岐店', category: '炸鸡小吃', dishes: [['大鸡排', 12], ['摇滚鱿鱼', 13], ['鸡米花', 9], ['甘梅地瓜条', 8], ['柠檬茶', 6]] },
];

const DISH_TPL = {
    自选菜: [['香锅牛肉', 18], ['香锅鸡柳', 15], ['香锅豆腐', 10], ['香锅土豆片', 8], ['香锅宽粉', 8], ['时蔬拼盘', 7], ['香锅鸡翅', 16], ['午餐肉拼盘', 12]],
    米饭套餐: [['黄焖鸡米饭', 15], ['卤肉饭', 13], ['烧鸭饭', 18], ['叉烧饭', 17], ['烤肉拌饭', 15], ['咖喱鸡饭', 13], ['排骨饭', 16]],
    面食: [['牛肉拉面', 14], ['刀削面', 12], ['炸酱面', 11], ['番茄鸡蛋面', 10], ['酸辣粉', 10], ['重庆小面', 12]],
    粉面: [['拌粉', 8], ['扁肉', 7], ['炖罐套餐', 14], ['蒸饺', 8], ['炒粉', 10], ['云吞面', 12]],
    卤味: [['卤鸡腿', 8], ['卤鸭翅', 9], ['卤蛋', 2], ['卤豆干', 4], ['卤牛肉', 20], ['凉拌卤味拼盘', 15]],
    铁板: [['铁板牛柳', 19], ['铁板鱿鱼', 18], ['铁板鸡排', 15], ['铁板豆腐', 10]],
    韩式: [['石锅拌饭', 15], ['泡菜肥牛石锅', 18], ['韩式炸鸡', 20], ['芝士年糕', 14]],
    面点: [['猪肉水饺', 10], ['玉米猪肉饺', 11], ['韭菜盒', 5], ['蒸包', 6], ['煎饺', 9]],
    套餐: [['照烧鸡定食', 18], ['猪排定食', 19], ['三文鱼亲子饭', 25], ['味噌拉面套餐', 17]],
    小吃: [['香辣炸鸡', 13], ['汉堡套餐', 16], ['薯条', 6], ['鸡米花', 9]],
    轻食: [['鸡胸肉沙拉', 15], ['牛油果沙拉', 18], ['全麦三明治', 12], ['藜麦碗', 16]],
};

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
    '京元这家香锅真的百吃不腻，土豆片边缘炸得焦焦的，宽粉吸满汤汁，每次都忍不住多点两个菜，人均14吃到扶墙。',
    '阿姨手不抖！鸡腿给得满满当当，酱汁拌饭一绝，十二点下课跑过去也就排了五分钟。',
    '排队十分钟，出餐巨快。牛肉拉面汤头很鲜，面条是现拉的，加个卤蛋完美，一周吃了三回。',
    '黄焖鸡汤汁浓，土豆炖得粉粉的，米饭给得多，还送免费例汤，15块钱讲良心了。',
    '这个拌面是花生酱的魂！福州人从小吃到大的味道，扁肉皮薄肉实，13块的套餐学生党狂喜。',
    '柠檬水4块钱一大杯，冰给得很实在，上完体育课来一杯，救命神器。',
    '麻辣烫选菜区很干净，骨汤是能直接喝的那种，不是味精水，阿姨还提醒我别拿太多怕浪费。',
    '石锅拌饭锅巴绝了，滋滋响着端上来，酱料够味，就是泡菜给得有点少，扣半星哈哈。',
    '叉烧肥瘦刚好，酱汁渗到饭底，这个窗口撑起了整个食堂的排队长度。',
    '新出的藤椒味麻得刚刚好不抢戏，鸡肉腌得入味，感觉得连吃一周才能戒掉。',
    '水煮肉片麻而不燥，肉片很嫩，就是中午人超多要拼桌，早点来。',
    '打饭阿姨已经认识我了，每次都多给一勺土豆，救命，这窗口我能吃到大四。',
    '期末周连吃四天，包水饺的大姐手速惊人，玉米猪肉馅清清甜甜的，热乎。',
    '汉堡胚是现烤的软乎的那种，凤梨片很解腻，比隔壁强不少，就是饭点要等一刻钟。',
    '铁板鱿鱼火候正好，酱料是自己炒的那种，吃完盘底都想刮干净，就是吃完一身味别去上课了哈哈哈。',
    '打包回宿舍打开还是热乎的，盒子扎得严实一点没洒，配送速度也快，好评。',
    '人均二十出头吃这么一大盆，性价比在永嘉这一圈里真的很能打。',
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

    /* 4. 点位 / 窗口 / 菜品 */
    const dishRows = []; // {id, canteenType}——评价生成按点位类型取适用维度
    for (const c of CANTEENS) {
        const r = await query(
            'INSERT INTO canteen (name, type, campus, location, avg_price, lat, lng, cover_object_key, tags) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [c.name, c.type, c.campus, c.location, c.avgPrice, c.lat, c.lng, c.cover, JSON.stringify(c.tags || [])]
        );
        const canteenId = r.insertId;
        // 窗口来源：永嘉商户 → 与店铺同名的默认档口；美岐 → 固定真实商户；校内 → 模板洗牌取 7 窗口
        const stations = c.category
            ? [{ name: c.name, category: c.category, dishes: c.dishes }]
            : (c.type === 2
                ? OFF_CAMPUS_STATIONS
                : [...STATION_TPL].sort(() => rand() - 0.5).slice(0, 7).map(([stName, category]) => ({ name: stName, category, dishes: null })));
        for (const [si, st] of stations.entries()) {
            // 档口导览坐标（T-31/AC08）：承所属点位坐标 + 按档口序号的确定性小偏移（±0.0008°≈±80m，防标记重叠）
            const stLat = c.lat == null ? null : Number(c.lat) + ((si % 5) - 2) * 0.0004;
            const stLng = c.lng == null ? null : Number(c.lng) + ((Math.floor(si / 5) % 5) - 2) * 0.0004;
            const rs = await query(
                'INSERT INTO station (canteen_id, name, category, cover_object_key, lat, lng) VALUES (?, ?, ?, ?, ?, ?)',
                [canteenId, st.name, st.category, CATEGORY_COVER[st.category] || 'preset:rice', stLat, stLng]
            );
            const stationId = rs.insertId;
            const dishes = st.dishes || (() => {
                // 校内按品类出 6-8 道
                const pool = DISH_TPL[st.category] || DISH_TPL['自选菜'];
                return [...pool].sort(() => rand() - 0.5).slice(0, Math.min(pool.length, rand_int(6, 8)));
            })();
            for (const [dName, basePrice] of dishes) {
                // 校内价格小幅浮动；校外商户按门店实价（不浮动）
                const price = (c.type === 0 ? basePrice + rand_int(-2, 3) : basePrice).toFixed(1);
                const taste = Array.from({ length: rand_int(1, 2) }, () => pick(TASTE)).filter((v, idx, a) => a.indexOf(v) === idx).join(',');
                const taboo = rand() < 0.25 ? pick(TABOO) : '';
                // ~15% 菜品为近 14 天上新
                const isNew = rand() < 0.15;
                const rd = await query(
                    `INSERT INTO dish (station_id, name, price, taste_tags, taboo_tags, cover_object_key, first_seen_at)
                     VALUES (?, ?, ?, ?, ?, ?, ${isNew ? 'NOW() - INTERVAL 5 DAY' : 'NOW() - INTERVAL 60 DAY'})`,
                    [stationId, dName, price, taste, taboo, CATEGORY_COVER[st.category] || 'preset:rice']
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
        "INSERT INTO station_post (station_id, author_id, type, content, starts_at, ends_at) VALUES (?, 1, 'new_dish', '本窗口周四上新「藤椒鸡排饭」，前 20 名半价，欢迎品尝！', NOW(), DATE_ADD(NOW(), INTERVAL 7 DAY))",
        [stFirst.id]
    );
    const stTas = await query_one("SELECT id FROM station WHERE name LIKE '塔斯汀%' LIMIT 1");
    if (stTas) {
        await query(
            "INSERT INTO station_post (station_id, author_id, type, content, starts_at, ends_at) VALUES (?, 1, 'promo', '学生认证任意堡 +3 元换购中杯柠檬水，出示校园卡即可。', NOW(), DATE_ADD(NOW(), INTERVAL 14 DAY))",
            [stTas.id]
        );
    }

    /* 8. 聚合预热：全量重算摘要（overall_score 已按维度权重写入，此处只做平均与分项求和） */
    await aggregation.recalc_all();

    log.info(`[seed] ===== 种子导入完成（${((Date.now() - t0) / 1000).toFixed(1)}s）=====
[seed] 演示账号：admin / admin123（管理员）  zhangwl / 123456（学生）`);
}

module.exports = { seed_if_empty };
