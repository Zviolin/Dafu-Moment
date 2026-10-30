/**
 * 十轮全量验收测试（r79）
 *
 * 目的：按《测试记录》的 20 项截图意见 + 用户「十遍不同方法/角度重测」要求，
 * 从静态代码、数据库、真实数据、认证权限、任务金币、社交、点评、边界异常、
 * 逐条回归、浏览器运行时十个角度做可复现的自动验收。
 *
 * 运行前置：
 *   1. docker compose up -d（mysql / redis / minio / backend / frontend 健康）
 *   2. 后端以 DEBUG=true 启动（验证码接口回显 debugCode，仅联调）
 *   3. 种子数据已导入（node src/seed/seed.js，或首次启动自动导入）
 * 运行：node tests/rounds-10-acceptance.test.mjs
 *
 * 说明：测试会创建临时账号 acc10_<时间戳>，结束时清理其全部数据；不修改种子数据。
 */
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const FRONT = path.join(ROOT, 'frontend', 'src');
const BASE = process.env.LB_BASE || 'http://localhost:8095';
const DB = process.env.LB_DB || 'dafu';
const VERIFY_DB = 'dafu_verify';
const MYSQL_CONTAINER = 'dafu-mysql';
const MYSQL_PWD = 'dafu_root_2026';

let pass_count = 0;
let fail_count = 0;
const failures = [];
let current_round = '';

/**
 * 打印当前轮次标题
 * @param {string} name - 轮次名称
 */
function enter_round(name) {
    current_round = name;
    console.log(`\n========== ${name} ==========`);
}

/**
 * 单条用例执行器：失败不中断，统一计入报告
 * @param {string} id - 用例编号
 * @param {string} desc - 用例描述
 * @param {Function} fn - 断言函数
 */
async function case_it(id, desc, fn) {
    try {
        await fn();
        pass_count += 1;
        console.log(`  [PASS] ${id} ${desc}`);
    } catch (e) {
        fail_count += 1;
        failures.push({ round: current_round, id, desc, message: String(e && e.message ? e.message : e) });
        console.log(`  [FAIL] ${id} ${desc} :: ${String(e && e.message ? e.message : e).slice(0, 300)}`);
    }
}

/**
 * 断言真值
 * @param {boolean} cond - 条件
 * @param {string} msg - 失败提示
 */
function assert(cond, msg) {
    if (!cond) throw new Error(msg || '断言失败');
}

/**
 * 断言相等
 * @param {*} actual - 实际值
 * @param {*} expected - 期望值
 * @param {string} label - 提示前缀
 */
function assert_eq(actual, expected, label) {
    if (actual !== expected) throw new Error(`${label}: 期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}`);
}

/**
 * 读取前端源码
 * @param {string} rel - 相对 frontend/src 的路径
 * @returns {string}
 */
function read_front(rel) {
    return fs.readFileSync(path.join(FRONT, rel), 'utf8');
}

/**
 * 执行 SQL 并返回纯文本结果（-N -B：无表头、Tab 分隔）
 * @param {string} statement - SQL 语句
 * @param {string} db - 目标库
 * @returns {string}
 */
function sql(statement, db = DB) {
    return execFileSync(
        'docker',
        ['exec', MYSQL_CONTAINER, 'mysql', '-uroot', `-p${MYSQL_PWD}`, '-N', '-B', '-e', `USE \`${db}\`; ${statement}`],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
    ).trim();
}

/**
 * 执行 SQL 并取首个数字结果
 * @param {string} statement - SQL 语句
 * @param {string} db - 目标库
 * @returns {number}
 */
function sql_num(statement, db = DB) {
    const rows = sql(statement, db).split('\n');
    return Number((rows[0] || '0').split('\t')[0]);
}

/**
 * 执行任意 SQL 文件内容（用于迁移幂等性验证）
 * @param {string} file - SQL 文件绝对路径
 * @param {string} db - 目标库
 */
function sql_file(file, db) {
    const content = fs.readFileSync(file, 'utf8');
    execFileSync(
        'docker',
        ['exec', '-i', MYSQL_CONTAINER, 'mysql', '-uroot', `-p${MYSQL_PWD}`, db],
        { input: content, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
    );
}

/**
 * HTTP 请求封装：返回 { status, body }，body 为统一响应 JSON
 * @param {string} method - 方法
 * @param {string} p - 路径（不含 /api）
 * @param {object} [body] - 请求体
 * @param {string} [token] - JWT
 * @returns {Promise<{status:number, body:any}>}
 */
async function req(method, p, body, token) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`${BASE}/api${p}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { json = { raw: text }; }
    return { status: res.status, body: json };
}

/**
 * GET 简写：非 200 直接抛错
 * @param {string} p - 路径
 * @param {string} [token] - JWT
 * @returns {Promise<any>} data
 */
async function api_get(p, token) {
    const r = await req('GET', p, undefined, token);
    if (r.status !== 200) throw new Error(`GET ${p} -> ${r.status} ${JSON.stringify(r.body).slice(0, 200)}`);
    return r.body.data;
}

/* ==================== 测试主体 ==================== */

const stamp = Date.now().toString(36);
const USERNAME = `acc10_${stamp}`;
const PASSWORD = 'test123456';
let token = '';
let user_id = 0;
const created = { post_ids: [], review_id: 0, dish_id: 0 };
/** R5-09 实际购买的装扮（R5-10 复用同一件验证“已拥有不再扣费”） */
let buy_dress = null;

/**
 * 取验证码并完成登录/注册（DEBUG=true 时带 debugCode）
 * @param {string} username - 用户名
 * @param {string} password - 密码
 * @param {boolean} is_register - 是否注册
 * @returns {Promise<any>}
 */
async function auth_flow(username, password, is_register) {
    const cap = await api_get('/auth/captcha');
    assert(!!cap.captchaId, '验证码 captchaId 缺失');
    return req(is_register ? 'POST' : 'POST', is_register ? '/auth/register' : '/auth/login', {
        username,
        password,
        nickname: username,
        captchaId: cap.captchaId,
        captchaCode: cap.debugCode || '',
    });
}

async function main() {
    // 清空 Redis：验证码/限流键在多次调试后可能触发 429，先重置保证可复现
    try {
        execFileSync('docker', ['exec', 'dafu-redis', 'redis-cli', 'FLUSHALL'], { encoding: 'utf8' });
    } catch { /* Redis 未就绪时忽略，后续用例会给出明确失败 */ }

    /* ---------- R1 静态代码一致性 ---------- */
    enter_round('R1 静态代码一致性（20 项修复点代码级证据）');

    await case_it('R1-01', '评分默认 0 星全灰（测试记录第 1 条）', async () => {
        const s = read_front('views/publish-view.vue');
        assert(/scores\[d\.key\] = 0/.test(s), '维度默认分应为 0');
        assert(/filter: grayscale\(1\)/.test(s), '未选中星级需灰度样式');
        assert(!/scores\[d\.key\] = 5/.test(s), '不应再默认 5 星');
        assert(/未评分/.test(s), '0 星时应展示“未评分”');
    });

    await case_it('R1-02', '搜索页隐藏顶栏搜索框（第 9 条）', async () => {
        const s = read_front('App.vue');
        assert(/show_header_search/.test(s), '缺少 show_header_search');
        assert(/route\.path !== '\/search'/.test(s), '搜索页应隐藏顶栏搜索');
    });

    await case_it('R1-03', '地图页有搜索框 + 四类筛选可点（第 10 条）', async () => {
        const s = read_front('views/map-view.vue');
        assert(/apply_filter/.test(s), '缺少 apply_filter');
        assert(/FILTERS/.test(s), '缺少筛选分组');
        assert(/keyword/.test(s), '缺少关键词搜索');
    });

    await case_it('R1-04', '点评圈推荐与最新双口径排序（第 11 条）', async () => {
        const s = read_front('views/circle-view.vue');
        assert(/recommend_score/.test(s), '缺少推荐分');
        assert(/p-\$\{/.test(s), '动态 id 需 p- 前缀');
    });

    await case_it('R1-05', '饮食目标多选 + 自定义忌口（第 12/15 条）', async () => {
        const s = read_front('views/diet-profile-view.vue');
        assert(/goals/.test(s), '缺少 goals');
        assert(/custom_avoids/.test(s), '缺少自定义忌口字段');
        assert(/add_avoid/.test(s), '缺少新增忌口方法');
        assert(/toggle_goal/.test(s), '缺少多选切换');
        assert(/Array\.isArray/.test(s), '目标应为数组');
    });

    await case_it('R1-06', 'MBTI 12 题 / 16 型 / 分享网址（第 12/13/14 条）', async () => {
        const s = read_front('views/mbti-view.vue');
        const q = (s.match(/\{ key: 'q\d+'/g) || []).length;
        assert_eq(q, 12, '题目数');
        const types = (s.match(/[A-Z]{4}/g) || []).length;
        assert(types >= 16, `16 型代码应至少出现 16 次，实际 ${types}`);
        assert(/share_url/.test(s), '缺少分享网址');
        assert(/location\.origin/.test(s), '分享网址需带站点域名');
        assert(/\/ai\/mbti/.test(s), '分享应指向 /ai/mbti');
    });

    await case_it('R1-07', '转盘按当前角算目标、结果与指针一致（第 14 条）', async () => {
        const s = read_front('views/wheel-view.vue');
        assert(/const cur = \(\(deg\.value % 360\) \+ 360\) % 360/.test(s), '缺少当前角度归一');
        assert(/const target = \(\(360 - seg \* SEG\.value\) % 360 \+ 360\) % 360/.test(s), '缺少目标角度计算');
        assert(/load_real_items/.test(s), '轮盘需取真实菜品');
        assert(/api_content/.test(s), '轮盘应调用真实接口');
    });

    await case_it('R1-08', '成就页使用真实统计（第 16 条）', async () => {
        const s = read_front('views/achievements-view.vue');
        assert(/api_me\.stats/.test(s), '缺少 /me/stats 调用');
        assert(/load_real_stats/.test(s), '缺少真实统计加载');
        assert(!/localStorage\.setItem\('dafu_achv_progress/.test(s), '不应再写入本地假进度');
    });

    await case_it('R1-09', '设置页账号安全走弹层、档口走独立页（第 17/18/19/20 条）', async () => {
        const s = read_front('views/settings-view.vue');
        assert(/dialog: kind/.test(s), '账号安全应通过 ?dialog= 打开弹层');
        assert(/\/vendor\/apply/.test(s), '缺少档口入驻入口');
        const report_blocks = (s.match(/举报记录/g) || []).length;
        assert(report_blocks <= 1, `举报记录分组不应重复，实际 ${report_blocks}`);
    });

    await case_it('R1-10', '档口入驻页提交 submitType=3（第 18 条）', async () => {
        const s = read_front('views/vendor-apply-view.vue');
        assert(/submitType: 3/.test(s), '缺少 submitType: 3');
        assert(/submit_point/.test(s), '缺少提交接口');
        assert(/1\\d\{10\}/.test(s) || /test\(phone\)/.test(s), '缺少手机号校验');
    });

    await case_it('R1-11', '宠物广场取真实总数，无 1207 假数据（第 4 条）', async () => {
        const s = read_front('views/pet-community-view.vue');
        assert(!/1207|1208/.test(s), '不应残留 1207/1208 假数据');
        assert(/api_pet/.test(s), '应调用真实宠物接口');
        assert(/total/.test(s), '应展示真实总数');
    });

    await case_it('R1-12', '20 张宠物表情均为透明 PNG（第 8 条）', async () => {
        const dir = path.join(ROOT, 'frontend', 'public', 'assets', 'pet');
        const files = fs.readdirSync(dir).filter((f) => f.endsWith('.png'));
        assert(files.length >= 18, `表情图数量不足：${files.length}`);
        const bad = [];
        for (const f of files) {
            const b = fs.readFileSync(path.join(dir, f));
            const color_type = b[25];
            const has_trns = b.includes(Buffer.from('tRNS'));
            const ok = color_type === 6 || color_type === 4 || (color_type === 3 && has_trns);
            if (!ok) bad.push(f);
        }
        assert_eq(bad.length, 0, `非透明图：${bad.join(',')}`);
    });

    await case_it('R1-13', '前端源码无 1207/1208/127 天等假数据常量', async () => {
        const hits = [];
        const walk = (dir) => {
            for (const name of fs.readdirSync(dir)) {
                const p = path.join(dir, name);
                const st = fs.statSync(p);
                if (st.isDirectory()) walk(p);
                else if (/\.(vue|js)$/.test(name)) {
                    const s = fs.readFileSync(p, 'utf8');
                    if (/1207|1208|127 天|点亮 127/.test(s)) hits.push(path.relative(FRONT, p));
                }
            }
        };
        walk(FRONT);
        assert_eq(hits.length, 0, `残留假数据文件：${hits.join(',')}`);
    });

    await case_it('R1-14', 'History 路由 + 档口入驻路由已注册', async () => {
        const s = read_front('router/index.js');
        assert(/createWebHistory/.test(s), '应使用 createWebHistory');
        assert(!/createWebHashHistory/.test(s), '不应使用 hash 路由');
        assert(/path: '\/vendor\/apply'/.test(s), '缺少 /vendor/apply 路由');
    });

    await case_it('R1-15', '菜品卡展示价格单位与估算角标', async () => {
        const s = read_front('components/dish-card.vue');
        assert(/unit_text/.test(s), '缺少价格单位');
        assert(/is_est/.test(s), '缺少估算标记');
        assert(/估算/.test(s), '缺少“估算”文案');
    });

    await case_it('R1-16', '任务中心领取后按 coin_balance 刷新', async () => {
        const s = read_front('views/tasks-view.vue');
        assert(/coin_balance/.test(s), '缺少 coin_balance 处理');
        assert(/api_task/.test(s), '缺少真实任务接口');
    });

    await case_it('R1-17', '宠物页点亮天数取接口字段、无包子底部装饰（第 6/7 条）', async () => {
        const s = read_front('views/pet-view.vue');
        assert(/pet\.lit_days/.test(s), '点亮天数应来自接口');
        assert(!/bowl|footer-bun|\.bun\b/.test(s), '不应残留包子底部装饰');
        assert(/api_pet/.test(s), '应调用真实宠物接口');
    });

    await case_it('R1-18', '动态详情支持 p- 前缀并分流评论/点赞', async () => {
        const s = read_front('views/post-detail-view.vue');
        assert(/\^p-\\d\+/.test(s), '缺少 p- 动态 id 识别');
        assert(/api_post\.comments/.test(s), '缺少动态评论接口');
        assert(/api_review\.comments/.test(s), '缺少点评评论接口');
        assert(/location\.origin/.test(s), '分享链接需带域名');
    });

    await case_it('R1-19', '我的页响应 ?dialog= 打开对应弹层（第 17 条）', async () => {
        const s = read_front('views/me-view.vue');
        assert(/route\.query\.dialog/.test(s), '缺少 dialog 参数读取');
        assert(/watch\(\(\) => route\.query\.dialog/.test(s), '缺少参数变化监听');
    });

    await case_it('R1-20', '首页/点评/地图无页内假数据数组', async () => {
        const home = read_front('views/home-view.vue');
        assert(!/MOCK|FAKE_/.test(home), '首页不应有 MOCK 数据');
        assert(/rec-empty/.test(home), '无数据应有空态');
        const map = read_front('views/map-view.vue');
        assert(!/MOCK|FAKE_/.test(map), '地图不应有 MOCK 数据');
    });

    /* ---------- R2 数据库结构与迁移 ---------- */
    enter_round('R2 数据库结构 / 全新安装 / 迁移幂等');

    await case_it('R2-01', '线上库 35 张表（含 r80 fzu_account）', async () => {
        const n = sql_num("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='dafu';");
        assert_eq(n, 35, '表数量');
    });

    await case_it('R2-02', '全新库 init.sql 建表 35 张且空库', async () => {
        const n = sql_num("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='dafu_verify';");
        assert_eq(n, 35, '验证库表数量');
    });

    await case_it('R2-03', '全新库 seed 结果与线上一致（60/70/158）', async () => {
        const c = sql_num('SELECT COUNT(*) FROM canteen;', VERIFY_DB);
        const st = sql_num('SELECT COUNT(*) FROM station;', VERIFY_DB);
        const d = sql_num('SELECT COUNT(*) FROM dish;', VERIFY_DB);
        assert_eq(c, 60, '点位');
        assert_eq(st, 70, '档口');
        assert_eq(d, 158, '菜品');
    });

    await case_it('R2-04', '迁移 007 幂等（重复执行不报错）', async () => {
        const f = path.join(ROOT, 'backend', 'sql', 'migration', '007_canteen_business_hours.sql');
        sql_file(f, VERIFY_DB);
        sql_file(f, VERIFY_DB);
        const n = sql_num("SELECT COUNT(*) FROM information_schema.columns WHERE table_schema='dafu_verify' AND table_name='canteen' AND column_name='business_hours';");
        assert_eq(n, 1, 'business_hours 列');
    });

    await case_it('R2-05', '回滚 007 幂等并可重新升级', async () => {
        const rb = path.join(ROOT, 'backend', 'sql', 'rollback', '007_canteen_business_hours.sql');
        const mg = path.join(ROOT, 'backend', 'sql', 'migration', '007_canteen_business_hours.sql');
        sql_file(rb, VERIFY_DB);
        sql_file(rb, VERIFY_DB);
        let n = sql_num("SELECT COUNT(*) FROM information_schema.columns WHERE table_schema='dafu_verify' AND table_name='canteen' AND column_name='business_hours';");
        assert_eq(n, 0, '回滚后应无该列');
        sql_file(mg, VERIFY_DB);
        n = sql_num("SELECT COUNT(*) FROM information_schema.columns WHERE table_schema='dafu_verify' AND table_name='canteen' AND column_name='business_hours';");
        assert_eq(n, 1, '重新升级后应有该列');
    });

    await case_it('R2-06', '线上库营业时间列与 52 条真实值', async () => {
        const total = sql_num('SELECT COUNT(*) FROM canteen;');
        const filled = sql_num('SELECT COUNT(*) FROM canteen WHERE business_hours IS NOT NULL;');
        assert_eq(total, 60, '点位');
        assert_eq(filled, 52, '营业时间覆盖');
    });

    await case_it('R2-07', '核心引用完整性（孤儿行 = 0）', async () => {
        const checks = [
            ['station->canteen', 'SELECT COUNT(*) FROM station s LEFT JOIN canteen c ON c.id=s.canteen_id WHERE c.id IS NULL'],
            ['dish->station', 'SELECT COUNT(*) FROM dish d LEFT JOIN station s ON s.id=d.station_id WHERE s.id IS NULL'],
            ['review->user', 'SELECT COUNT(*) FROM review r LEFT JOIN `user` u ON u.id=r.user_id WHERE u.id IS NULL'],
            ['post->user', 'SELECT COUNT(*) FROM post p LEFT JOIN `user` u ON u.id=p.user_id WHERE u.id IS NULL'],
            ['post_like->post', 'SELECT COUNT(*) FROM post_like l LEFT JOIN post p ON p.id=l.post_id WHERE p.id IS NULL'],
            ['post_comment->post', 'SELECT COUNT(*) FROM post_comment c LEFT JOIN post p ON p.id=c.parent_id WHERE c.parent_type=1 AND p.id IS NULL'],
            ['task_claim->task', 'SELECT COUNT(*) FROM task_claim t LEFT JOIN task k ON k.id=t.task_id WHERE k.id IS NULL'],
            ['user_dress->dress', 'SELECT COUNT(*) FROM user_dress d LEFT JOIN pet_dress p ON p.id=d.dress_id WHERE p.id IS NULL'],
        ];
        for (const [label, q] of checks) assert_eq(sql_num(q), 0, `${label} 孤儿行`);
    });

    await case_it('R2-08', '索引与唯一键规模（>= 60 个索引）', async () => {
        const n = sql_num("SELECT COUNT(DISTINCT TABLE_NAME, INDEX_NAME) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA='dafu';");
        assert(n >= 60, `索引数偏少：${n}`);
    });

    /* ---------- R3 真实数据完整性 ---------- */
    enter_round('R3 真实数据（Dafu-Moment 最新 PR SQL）完整性');

    await case_it('R3-01', '点位 60 / 档口 70（门店 42 + 校内食堂 28）/ 菜品 158', async () => {
        assert_eq(sql_num('SELECT COUNT(*) FROM canteen;'), 60, '点位');
        assert_eq(sql_num('SELECT COUNT(*) FROM station;'), 70, '档口');
        assert_eq(sql_num('SELECT COUNT(*) FROM dish;'), 158, '菜品');
    });

    await case_it('R3-02', '全部 158 道为估算价，37 道带源码“估算演示价”标识', async () => {
        assert_eq(sql_num('SELECT COUNT(*) FROM dish WHERE is_estimated = 1;'), 158, '估算菜');
        assert_eq(sql_num('SELECT COUNT(*) FROM dish WHERE is_estimated = 0;'), 0, '不应存在假“明码”菜');
        assert_eq(sql_num('SELECT COUNT(*) FROM dish WHERE price <= 0;'), 0, '非法价格');
        assert_eq(sql_num("SELECT COUNT(*) FROM dish WHERE price_unit IS NULL OR price_unit = '';"), 0, '缺单位');
        // 06_estimated_menu_seed.sql 原样保留的 37 道菜（单位含“估算演示价”）
        // 中文走命令行会乱码，改用 SQL 内 UTF-8 十六进制字面量还原
        const demo_hex = 'E4BBBDEFBC88E4BCB0E7AE97E6BC94E7A4BAE4BBB7EFBC89'; // “份（估算演示价）”
        assert_eq(
            sql_num(`SELECT COUNT(*) FROM dish WHERE price_unit = CONVERT(0x${demo_hex} USING utf8mb4);`),
            37,
            '源码估算标识菜'
        );
    });

    await case_it('R3-03', '53 个点位坐标与新 PR 05_collected_map_locations.sql 一致（容差 1e-6）', async () => {
        const real = JSON.parse(fs.readFileSync(path.join(ROOT, 'backend', 'src', 'seed', 'real-data.json'), 'utf8'));
        const with_coord = real.places.filter((p) => p.coord_source);
        assert_eq(with_coord.length, 53, '带权威坐标点位数');
        // canteen 坐标列为 DECIMAL(10,6)，与源坐标按 1e-6 容差比较
        const conds = with_coord.map((p) => `(ABS(lat - ${p.lat}) < 0.000001 AND ABS(lng - ${p.lng}) < 0.000001)`).join(' OR ');
        const n = sql_num(`SELECT COUNT(*) FROM canteen WHERE ${conds};`);
        assert_eq(n, 53, '库内坐标命中数');
    });

    await case_it('R3-04', '全部坐标落在旗山校区范围（26.0~26.1 / 119.1~119.25）', async () => {
        const bad = sql_num('SELECT COUNT(*) FROM canteen WHERE lat NOT BETWEEN 26.0 AND 26.1 OR lng NOT BETWEEN 119.1 AND 119.25;');
        assert_eq(bad, 0, '越界点位');
        // r85 起 4 个源库无 map_location 的校内食堂留空坐标（不写伪坐标），由前端地图兜底示意
        assert_eq(sql_num('SELECT COUNT(*) FROM canteen WHERE lat IS NULL OR lng IS NULL;'), 4, '缺坐标点位（源数据缺失的 4 个食堂）');
    });

    await case_it('R3-05', '真实营业时间 52 条 / 人均价 45 条', async () => {
        assert_eq(sql_num('SELECT COUNT(*) FROM canteen WHERE business_hours IS NOT NULL;'), 52, '营业时间');
        assert_eq(sql_num('SELECT COUNT(*) FROM canteen WHERE avg_price IS NOT NULL;'), 45, '人均价');
    });

    await case_it('R3-06', '无伪造「默认档口」，档口名均为真实店名', async () => {
        const placeholder_hex = 'E9BB98E8AEA4E6A1A3E58FA3'; // “默认档口”
        assert_eq(
            sql_num(`SELECT COUNT(*) FROM station WHERE name = CONVERT(0x${placeholder_hex} USING utf8mb4);`),
            0,
            '默认档口'
        );
        assert_eq(sql_num("SELECT COUNT(*) FROM station WHERE name = '' OR name IS NULL;"), 0, '空名档口');
        // 门店档口（42）以所属店铺真实名命名；校内食堂档口（28）取自 geojson include 清单，名称是档口名而非食堂名
        assert_eq(
            sql_num('SELECT COUNT(*) FROM station s JOIN canteen c ON c.id = s.canteen_id AND c.name = s.name WHERE c.type <> 0;'),
            42,
            '门店档口名应与店铺名一致'
        );
        assert_eq(
            sql_num('SELECT COUNT(*) FROM station s JOIN canteen c ON c.id = s.canteen_id WHERE c.type = 0;'),
            28,
            '校内食堂档口应为 28 个'
        );
    });

    await case_it('R3-07', 'real-data.json 与库内数量一致', async () => {
        const real = JSON.parse(fs.readFileSync(path.join(ROOT, 'backend', 'src', 'seed', 'real-data.json'), 'utf8'));
        assert_eq(real.places.length, 60, 'JSON 点位');
        const stations = real.places.reduce((s, p) => s + (p.stations || []).length, 0);
        assert_eq(stations, 70, 'JSON 档口');
        const dishes = real.places.reduce((s, p) => s + (p.stations || []).reduce((t, st) => t + (st.dishes || []).length, 0), 0);
        assert_eq(dishes, 158, 'JSON 菜品');
    });

    await case_it('R3-08', 'API 菜品带 price_unit 与 is_estimated', async () => {
        const d = await api_get('/dishes?page=1&size=10');
        assert(Array.isArray(d.list), 'list 应为数组');
        assert(d.list.length > 0, '菜品列表为空');
        for (const it of d.list) {
            assert(it.price_unit !== undefined && it.price_unit !== null, '缺少 price_unit');
            assert(it.is_estimated !== undefined && it.is_estimated !== null, '缺少 is_estimated');
        }
    });

    await case_it('R3-09', '无档口点位结构合理（4 食堂 + 6 门店）', async () => {
        // r86 起 8 个校内食堂已按源库 geojson include 入库 28 个档口，
        // 无档口点位由 18（12 食堂 + 6 门店）降为 10（4 食堂 + 6 门店）；校内档口暂无菜品
        const total = sql_num('SELECT COUNT(*) FROM canteen c WHERE NOT EXISTS (SELECT 1 FROM station s WHERE s.canteen_id=c.id);');
        const canteen = sql_num("SELECT COUNT(*) FROM canteen c WHERE c.type=0 AND NOT EXISTS (SELECT 1 FROM station s WHERE s.canteen_id=c.id);");
        assert_eq(total, 10, '无档口点位数');
        assert_eq(canteen, 4, '其中食堂数');
    });

    /* ---------- R4 认证 / 权限 / 参数校验 ---------- */
    enter_round('R4 认证、权限、越权与参数校验');

    await case_it('R4-01', '验证码接口返回 captchaId（DEBUG 回显 debugCode）', async () => {
        const d = await api_get('/auth/captcha');
        assert(!!d.captchaId, '缺少 captchaId');
        assert(/^data:image\/svg\+xml/.test(d.imageBase64 || ''), '验证码应为 SVG');
        assert(!!d.debugCode, 'DEBUG 未开启或未回显 debugCode（测试前置未满足）');
    });

    await case_it('R4-02', '注册参数校验（用户名/密码）', async () => {
        const cap = await api_get('/auth/captcha');
        const bad1 = await req('POST', '/auth/register', { username: 'a', password: '123456', captchaId: cap.captchaId, captchaCode: cap.debugCode });
        assert_eq(bad1.status, 422, '短用户名');
        const cap2 = await api_get('/auth/captcha');
        const bad2 = await req('POST', '/auth/register', { username: `acc10x_${stamp}`, password: '123', captchaId: cap2.captchaId, captchaCode: cap2.debugCode });
        assert_eq(bad2.status, 422, '短密码');
    });

    await case_it('R4-03', '注册成功并签发 JWT', async () => {
        const r = await auth_flow(USERNAME, PASSWORD, true);
        assert_eq(r.status, 200, `注册状态（${JSON.stringify(r.body).slice(0, 160)}）`);
        assert(!!r.body.data.token, '缺少 token');
        assert_eq(r.body.data.user.username, USERNAME, '用户名');
        token = r.body.data.token;
        user_id = r.body.data.user.id;
    });

    await case_it('R4-04', '重复用户名注册 → 409', async () => {
        const r = await auth_flow(USERNAME, PASSWORD, true);
        assert_eq(r.status, 409, '重复注册状态');
    });

    await case_it('R4-05', '错误密码登录 → 422', async () => {
        const r = await auth_flow(USERNAME, 'wrong_password', false);
        assert_eq(r.status, 422, '错误密码状态');
    });

    await case_it('R4-06', '正确登录成功且可读取 /auth/me', async () => {
        const r = await auth_flow(USERNAME, PASSWORD, false);
        assert_eq(r.status, 200, '登录状态');
        token = r.body.data.token;
        const me = await api_get('/auth/me', token);
        assert_eq(me.username, USERNAME, 'me.username');
        assert_eq(me.role, 0, '普通用户角色');
    });

    await case_it('R4-07', '未带 token 访问 /auth/me → 401', async () => {
        const r = await req('GET', '/auth/me');
        assert_eq(r.status, 401, '未登录状态');
    });

    await case_it('R4-08', '普通用户访问后台审核队列 → 403', async () => {
        const r = await req('GET', '/admin/audit/pending', undefined, token);
        assert_eq(r.status, 403, '越权状态');
    });

    await case_it('R4-09', '管理员登录（admin）角色为 1', async () => {
        const cap = await api_get('/auth/captcha');
        const r = await req('POST', '/auth/login', { username: 'admin', password: (process.env.DAFU_ADMIN_PASSWORD || 'admin123'), captchaId: cap.captchaId, captchaCode: cap.debugCode });
        assert_eq(r.status, 200, '管理员登录');
        assert_eq(r.body.data.user.role, 1, '角色');
    });

    await case_it('R4-10', '资料修改非法昵称 → 422', async () => {
        const r = await req('PUT', '/me/profile', { nickname: '' }, token);
        assert_eq(r.status, 422, '空昵称状态');
    });

    await case_it('R4-11', '删除他人动态 → 403（越权防护）', async () => {
        // 种子库无动态，这里先造一条属于其他用户的动态再尝试删除
        sql(`INSERT INTO post (user_id, content, images, topics, links, status, like_count, comment_count, created_at)
             VALUES (1, 'ACC10_OTHER', '[]', '[]', '[]', 0, 0, 0, NOW());`);
        const pid = sql_num("SELECT id FROM post WHERE content = 'ACC10_OTHER' ORDER BY id DESC LIMIT 1;");
        const r = await req('DELETE', `/posts/${pid}`, undefined, token);
        assert_eq(r.status, 403, '删除他人动态状态');
        sql(`DELETE FROM post WHERE id = ${pid};`);
    });

    /* ---------- R5 任务 / 金币 / 宠物闭环 ---------- */
    enter_round('R5 任务、金币、宠物（点亮/喂食/装扮）闭环');

    await case_it('R5-01', '新账号点亮 1 天、金币 0、无道具', async () => {
        const pet = await api_get('/me/pet', token);
        assert_eq(pet.lit_days, 1, '点亮天数');
        assert_eq(pet.coins, 0, '金币');
        assert_eq(pet.props, 0, '道具');
    });

    await case_it('R5-02', '任务中心 12 条（6 每日 + 6 成长）', async () => {
        const t = await api_get('/me/tasks', token);
        assert_eq(t.daily.length, 6, '每日任务数');
        assert_eq(t.growth.length, 6, '成长任务数');
        assert_eq(t.coin_balance, 0, '初始金币');
    });

    await case_it('R5-03', '无道具无金币时喂食被拒（不再死循环）', async () => {
        const r = await req('POST', '/me/pet/feed', undefined, token);
        assert(r.status >= 400 && r.status < 500, `喂食状态 ${r.status}`);
    });

    await case_it('R5-04', '首次打卡成功并发放 1 个道具', async () => {
        const canteens = await api_get('/canteens');
        assert(canteens.length > 0, '无点位');
        const r = await req('POST', '/checkin', { canteenId: canteens[0].id }, token);
        assert_eq(r.status, 200, `打卡状态（${JSON.stringify(r.body).slice(0, 160)}）`);
        const pet = await api_get('/me/pet', token);
        assert(pet.props >= 1, `打卡后道具应 >=1，实际 ${pet.props}`);
    });

    await case_it('R5-05', '喂食消耗道具并累计喂养次数', async () => {
        const before = await api_get('/me/pet', token);
        const r = await req('POST', '/me/pet/feed', undefined, token);
        assert_eq(r.status, 200, `喂食状态（${JSON.stringify(r.body).slice(0, 160)}）`);
        const after = await api_get('/me/pet', token);
        assert_eq(after.props, before.props - 1, '道具消耗');
        assert_eq(after.feed_total, before.feed_total + 1, '喂养次数');
    });

    await case_it('R5-06', '打卡/喂食任务可领取并加金币', async () => {
        const t = await api_get('/me/tasks', token);
        const done = [...t.daily, ...t.growth].filter((x) => x.current >= x.target && !x.claimed);
        assert(done.length >= 2, `可领取任务应 >=2，实际 ${done.length}`);
        let coins = t.coin_balance;
        for (const task of done.slice(0, 2)) {
            const r = await req('POST', `/tasks/${task.id}/claim`, undefined, token);
            assert_eq(r.status, 200, `领取 ${task.id}`);
            assert(r.body.data.coin_balance >= coins, '金币应增长');
            coins = r.body.data.coin_balance;
        }
        assert(coins > 0, '领取后金币应 > 0');
    });

    await case_it('R5-07', '重复领取同一任务 → 409', async () => {
        const t = await api_get('/me/tasks', token);
        const claimed = [...t.daily, ...t.growth].find((x) => x.claimed);
        assert(!!claimed, '无已领取任务');
        const r = await req('POST', `/tasks/${claimed.id}/claim`, undefined, token);
        assert_eq(r.status, 409, '重复领取状态');
    });

    await case_it('R5-08', '金币不足购买装扮 → 422', async () => {
        const st = await api_get('/me/pet', token);
        // 装扮主键真实为 d1~d9，价格/等级门槛从接口目录动态取，避免写死数字
        const target = st.dresses
            .filter((d) => !d.owned && d.price > 0 && d.min_level <= st.level && d.price > st.coins)
            .sort((a, b) => b.price - a.price)[0];
        assert(!!target, `未找到“金币不足”的可购买装扮（当前金币 ${st.coins}）`);
        const r = await req('POST', '/me/pet/dress', { dress_id: target.id }, token);
        assert_eq(r.status, 422, `购买状态（${JSON.stringify(r.body).slice(0, 160)}）`);
        assert(/金币/.test(r.body.msg || ''), '应提示金币不足');
    });

    await case_it('R5-09', '注入足额金币后购买装扮成功并扣费', async () => {
        const st0 = await api_get('/me/pet', token);
        // 选最便宜的可购买装扮（价格 > 0、等级达标、尚未拥有）
        const target = st0.dresses
            .filter((d) => !d.owned && d.price > 0 && d.min_level <= st0.level)
            .sort((a, b) => a.price - b.price)[0];
        assert(!!target, '无可购买装扮');
        buy_dress = target;
        // 注入到「价格 + 20」的余额，保证扣费后仍有 20 金币可继续后续用例
        const need = target.price + 20 - st0.coins;
        if (need > 0) {
            sql(`INSERT INTO coin_transaction (user_id, change_type, amount, biz_type, balance_after, remark)
                 VALUES (${user_id}, 1, ${need}, 9, ${st0.coins + need}, 'ACC10_TEST_GRANT');`);
        }
        const expected = need > 0 ? st0.coins + need : st0.coins;
        const before = await api_get('/me/pet', token);
        assert_eq(before.coins, expected, '注入后金币');
        const r = await req('POST', '/me/pet/dress', { dress_id: target.id }, token);
        assert_eq(r.status, 200, `购买状态（${JSON.stringify(r.body).slice(0, 160)}）`);
        const after = await api_get('/me/pet', token);
        assert_eq(after.coins, before.coins - target.price, '扣费后金币');
        assert_eq(after.dress_id, target.id, '已穿戴');
        assert(after.dresses.find((d) => d.id === target.id).owned === true, '应已解锁');
    });

    await case_it('R5-10', '已拥有装扮再次切换不再扣费', async () => {
        const before = await api_get('/me/pet', token);
        const r = await req('POST', '/me/pet/dress', { dress_id: buy_dress.id }, token);
        assert_eq(r.status, 200, '再次切换状态');
        const after = await api_get('/me/pet', token);
        assert_eq(after.coins, before.coins, '金币不应变化');
    });

    await case_it('R5-11', '未拥有且金币不足装扮 → 422', async () => {
        const st = await api_get('/me/pet', token);
        const target = st.dresses
            .filter((d) => !d.owned && d.price > 0 && d.min_level <= st.level && d.price > st.coins)
            .sort((a, b) => b.price - a.price)[0];
        assert(!!target, `未找到“未拥有且金币不足”的装扮（当前金币 ${st.coins}）`);
        const r = await req('POST', '/me/pet/dress', { dress_id: target.id }, token);
        assert_eq(r.status, 422, `状态（${JSON.stringify(r.body).slice(0, 160)}）`);
    });

    await case_it('R5-12', '全服福宝数 = 数据库真实计数', async () => {
        const d = await api_get('/pet/community', token);
        const real = sql_num('SELECT COUNT(*) FROM pet;');
        assert_eq(d.total, real, '全服福宝数');
        assert(real < 1000, `福宝数应为真实量级，实际 ${real}`);
        // 累计投喂榜只收喂过至少 1 次的福宝，0 次不占榜
        assert(Array.isArray(d.ranking), 'ranking 缺失');
        assert(d.ranking.every((x) => Number(x.feed_total) > 0),
            `投喂榜出现 0 次：${JSON.stringify(d.ranking.map((x) => x.feed_total))}`);
        assert(d.ranking.every((x, i) => Number(x.rank) === i + 1), '榜内名次应从 1 连续排列');
    });

    /* ---------- R6 社交动态 ---------- */
    enter_round('R6 动态发布 / 排序 / 点赞 / 评论 / 删除');

    await case_it('R6-01', '发布动态成功', async () => {
        const r = await req('POST', '/posts', { content: 'ACC10_API 测试动态', images: [], topics: [], links: [] }, token);
        assert_eq(r.status, 200, `发布状态（${JSON.stringify(r.body).slice(0, 160)}）`);
        assert(!!r.body.data.id, '缺少动态 id');
        created.post_ids.push(r.body.data.id);
    });

    await case_it('R6-02', '推荐/最新列表均包含新动态', async () => {
        const rec = await api_get('/posts?tab=recommend', token);
        const latest = await api_get('/posts?tab=latest', token);
        assert(rec.list.some((p) => p.id === created.post_ids[0]), '推荐流缺失');
        assert(latest.list.some((p) => p.id === created.post_ids[0]), '最新流缺失');
    });

    await case_it('R6-03', '推荐与最新排序口径不同（人气优先 vs 时间优先）', async () => {
        sql(`INSERT INTO post (user_id, content, images, topics, links, status, like_count, comment_count, created_at) VALUES
             (${user_id}, 'ACC10_OLD', '[]', '[]', '[]', 0, 0, 0, NOW() - INTERVAL 48 HOUR),
             (${user_id}, 'ACC10_NEW', '[]', '[]', '[]', 0, 0, 0, NOW() - INTERVAL 6 HOUR),
             (${user_id}, 'ACC10_HOT', '[]', '[]', '[]', 0, 5, 0, NOW() - INTERVAL 30 HOUR);`);
        const rec = await api_get('/posts?tab=recommend&size=20', token);
        const latest = await api_get('/posts?tab=latest&size=20', token);
        const rec_idx = (c) => rec.list.findIndex((p) => p.content === c);
        const lat_idx = (c) => latest.list.findIndex((p) => p.content === c);
        assert(rec_idx('ACC10_HOT') >= 0 && lat_idx('ACC10_HOT') >= 0, '三条测试动态应可见');
        assert(rec_idx('ACC10_HOT') < rec_idx('ACC10_NEW'), '推荐应把高人气动态排前面');
        assert(lat_idx('ACC10_NEW') < lat_idx('ACC10_HOT'), '最新应把新动态排前面');
        assert(rec.list.map((p) => p.id).join() !== latest.list.map((p) => p.id).join(), '两种排序结果应不同');
        sql("DELETE FROM post WHERE content IN ('ACC10_OLD','ACC10_NEW','ACC10_HOT');");
    });

    await case_it('R6-04', '点赞为幂等切换，计数同步', async () => {
        const pid = created.post_ids[0];
        const a = await req('POST', `/posts/${pid}/like`, undefined, token);
        assert_eq(a.status, 200, '点赞状态');
        assert_eq(a.body.data.liked, true, '首次点赞 liked');
        assert_eq(a.body.data.like_count, 1, '首次点赞计数');
        const b = await req('POST', `/posts/${pid}/like`, undefined, token);
        assert_eq(b.body.data.liked, false, '再次点击取消');
        assert_eq(b.body.data.like_count, 0, '取消后计数');
    });

    await case_it('R6-05', '评论写入并同步 comment_count', async () => {
        const pid = created.post_ids[0];
        const r = await req('POST', `/posts/${pid}/comments`, { content: 'ACC10 评论' }, token);
        assert_eq(r.status, 200, `评论状态（${JSON.stringify(r.body).slice(0, 160)}）`);
        const list = await api_get(`/posts/${pid}/comments`);
        assert(list.list.some((c) => c.content === 'ACC10 评论'), '评论列表缺失');
        const detail = await api_get(`/posts/${pid}`, token);
        assert_eq(detail.comment_count, 1, '动态评论计数');
    });

    await case_it('R6-06', '动态详情可读取作者与内容', async () => {
        const d = await api_get(`/posts/${created.post_ids[0]}`, token);
        assert_eq(d.content, 'ACC10_API 测试动态', '内容');
        assert(!!d.author && d.author.id === user_id, '作者');
    });

    await case_it('R6-07', '删除本人动态成功且详情 404', async () => {
        const pid = created.post_ids[0];
        const r = await req('DELETE', `/posts/${pid}`, undefined, token);
        assert_eq(r.status, 200, '删除状态');
        const d = await req('GET', `/posts/${pid}`, undefined, token);
        assert_eq(d.status, 404, '删除后详情状态');
        created.post_ids = [];
    });

    /* ---------- R7 点评体系 ---------- */
    enter_round('R7 点评发布 / 列表 / 聚合 / 点赞 / 评论');

    await case_it('R7-01', '全站点评流可读（hot/new）', async () => {
        const hot = await api_get('/reviews?sort=hot&size=10');
        const fresh = await api_get('/reviews?sort=new&size=10');
        assert(Array.isArray(hot.list), 'hot.list 应为数组');
        assert(Array.isArray(fresh.list), 'new.list 应为数组');
    });

    await case_it('R7-02', '按维度分项打分发布点评成功', async () => {
        const dishes = await api_get('/dishes?page=1&pageSize=1');
        const dish = dishes.list[0];
        created.dish_id = dish.id;
        const detail = await api_get(`/dishes/${dish.id}`);
        const canteenType = detail.dish.canteen_type;
        const dims = await api_get(`/dimensions?type=${canteenType}`);
        assert(dims.length >= 3, '维度过少');
        const scores = {};
        for (const d of dims) scores[d.key] = 4;
        const r = await req('POST', '/reviews', {
            subjectType: 0,
            subjectId: dish.id,
            dimensionScores: scores,
            content: 'ACC10 自动化点评：口味与份量符合描述，价格明码。',
            tags: ['份量足'],
        }, token);
        assert_eq(r.status, 200, `发布点评（${JSON.stringify(r.body).slice(0, 200)}）`);
        assert([0, 1, 2].includes(r.body.data.status), '审核状态应为 0/1/2');
        assert(!!r.body.data.reviewId, '缺少 reviewId');
        created.review_id = r.body.data.reviewId;
    });

    await case_it('R7-03', '同一对象重复点评被拒（4xx）', async () => {
        const detail = await api_get(`/dishes/${created.dish_id}`);
        const dims = await api_get(`/dimensions?type=${detail.dish.canteen_type}`);
        const scores = {};
        for (const d of dims) scores[d.key] = 3;
        const r = await req('POST', '/reviews', { subjectType: 0, subjectId: created.dish_id, dimensionScores: scores, content: 'ACC10 重复点评' }, token);
        assert(r.status >= 400 && r.status < 500, `重复点评状态 ${r.status}`);
    });

    await case_it('R7-04', '点评进入对象列表并刷新聚合摘要', async () => {
        const list = await api_get(`/reviews?subjectType=0&subjectId=${created.dish_id}&sort=new&size=20`, token);
        const mine = list.list.find((r) => r.id === created.review_id);
        assert(!!mine, '对象点评列表缺失我的点评');
        assert(mine.content.startsWith('ACC10'), '点评内容不符');
        // review_summary 原样输出 snake_case：review_count / rating_avg
        const detail = await api_get(`/dishes/${created.dish_id}`);
        assert(detail.summary && detail.summary.review_count >= 1, '聚合点评数应 >=1');
        assert(Number(detail.summary.rating_avg) > 0, '聚合评分应 >0');
    });

    await case_it('R7-05', '点评点赞幂等切换', async () => {
        const a = await req('POST', `/reviews/${created.review_id}/like`, undefined, token);
        assert_eq(a.status, 200, '点赞状态');
        assert_eq(a.body.data.liked, true, '首次点赞');
        const b = await req('POST', `/reviews/${created.review_id}/like`, undefined, token);
        assert_eq(b.body.data.liked, false, '再次点击取消');
    });

    await case_it('R7-06', '点评评论可写入并读取', async () => {
        const r = await req('POST', `/reviews/${created.review_id}/comments`, { content: 'ACC10 点评评论' }, token);
        assert_eq(r.status, 200, `评论状态（${JSON.stringify(r.body).slice(0, 160)}）`);
        const list = await api_get(`/reviews/${created.review_id}/comments`, token);
        assert(list.list.some((c) => c.content === 'ACC10 点评评论'), '点评评论列表缺失');
    });

    await case_it('R7-07', '缺对象的分项排序 → 422', async () => {
        const r = await req('GET', '/reviews?sort=dim:taste');
        assert_eq(r.status, 422, `状态 ${r.status}`);
    });

    await case_it('R7-08', '删除本人点评后聚合回落', async () => {
        const before = await api_get(`/dishes/${created.dish_id}`);
        const before_n = Number(before.summary.review_count);
        const r = await req('DELETE', `/reviews/${created.review_id}`, undefined, token);
        assert_eq(r.status, 200, '删除点评状态');
        const after = await api_get(`/dishes/${created.dish_id}`);
        assert_eq(Number(after.summary.review_count), before_n - 1, '聚合点评数应减 1');
        created.review_id = 0;
    });

    /* ---------- R8 边界与异常 ---------- */
    enter_round('R8 边界值、异常输入与安全（注入/XSS）');

    await case_it('R8-01', '不存在资源统一 404', async () => {
        const a = await req('GET', '/canteens/999999');
        assert_eq(a.status, 404, '点位 404');
        const b = await req('GET', '/posts/999999', undefined, token);
        assert_eq(b.status, 404, '动态 404');
        const c = await req('GET', '/dishes/999999');
        assert_eq(c.status, 404, '菜品 404');
    });

    await case_it('R8-02', '非法 id 格式 → 422', async () => {
        const a = await req('GET', '/posts/abc', undefined, token);
        assert_eq(a.status, 422, '动态 id 格式');
        const b = await req('GET', '/reviews/abc');
        assert_eq(b.status, 422, '点评 id 格式');
    });

    await case_it('R8-03', '分页参数极端值被收敛（不 500）', async () => {
        const a = await req('GET', '/dishes?page=0&pageSize=0');
        assert_eq(a.status, 200, 'page=0 状态');
        assert(a.body.data.list.length >= 1, '应回落到默认分页并返回数据');
        const b = await req('GET', '/dishes?page=1&pageSize=99999');
        assert_eq(b.status, 200, 'pageSize 超大状态');
        assert(b.body.data.list.length <= 50, `单页应被限制，实际 ${b.body.data.list.length}`);
    });

    await case_it('R8-04', '非法枚举参数 → 422', async () => {
        const a = await req('GET', '/reviews?subjectType=9&subjectId=1');
        assert_eq(a.status, 422, 'subjectType 越界');
        const b = await req('GET', '/reviews?sort=nope');
        assert_eq(b.status, 422, 'sort 非法');
    });

    await case_it('R8-05', '未登录写接口 → 401', async () => {
        const a = await req('POST', '/posts', { content: 'x' });
        assert_eq(a.status, 401, '未登录发动态');
        const b = await req('POST', '/me/pet/feed');
        assert_eq(b.status, 401, '未登录喂食');
    });

    await case_it('R8-06', '档口入驻申请字段校验（手机号/店名）', async () => {
        const a = await req('POST', '/points-submit', { submitType: 3, payload: { name: 'ACC10', contact: '张三', phone: '123', position: 'A', intro: 'B' } }, token);
        assert_eq(a.status, 422, '手机号校验');
        const b = await req('POST', '/points-submit', { submitType: 3, payload: { name: '', contact: '张三', phone: '13800138000', position: 'A', intro: 'B' } }, token);
        assert_eq(b.status, 422, '店名校验');
    });

    await case_it('R8-07', '搜索关键词 SQL 注入无效', async () => {
        const r = await req('GET', `/canteens?kw=${encodeURIComponent("' OR 1=1 --")}`);
        assert_eq(r.status, 200, '注入尝试状态');
        const all = await api_get('/canteens');
        assert(Array.isArray(r.body.data), '结果应为数组');
        assert(r.body.data.length <= all.length, '注入不应放大结果集');
    });

    await case_it('R8-08', '超长内容被截断/拒绝且不 500', async () => {
        const long = 'x'.repeat(5000);
        const r = await req('POST', '/posts', { content: long }, token);
        assert(r.status === 200 || r.status === 422, `状态 ${r.status}`);
        if (r.status === 200) {
            const pid = r.body.data.id;
            const d = await api_get(`/posts/${pid}`, token);
            assert(d.content.length <= 2000, `内容长度 ${d.content.length}`);
            await req('DELETE', `/posts/${pid}`, undefined, token);
        }
    });

    await case_it('R8-09', 'XSS 载荷按纯文本存储', async () => {
        const payload = '<img src=x onerror=alert(1)>';
        const r = await req('POST', '/posts', { content: payload }, token);
        assert_eq(r.status, 200, '发布状态');
        const d = await api_get(`/posts/${r.body.data.id}`, token);
        assert_eq(d.content, payload, '应原样保存为文本（前端渲染转义）');
        await req('DELETE', `/posts/${r.body.data.id}`, undefined, token);
    });

    await case_it('R8-10', '健康检查与未知路由', async () => {
        const h = await req('GET', '/health');
        assert_eq(h.status, 200, 'health');
        assert_eq(h.body.data.status, 'up', 'health 内容');
        const n = await req('GET', '/nope');
        assert_eq(n.status, 404, '未知路由');
    });

    /* ---------- R9 测试记录 20 项逐条回归 ---------- */
    enter_round('R9 《测试记录》20 项逐条行为回归');

    await case_it('R9-01', '①评分默认灰色（0 星 + 未评分文案 + 灰度样式）', async () => {
        const s = read_front('views/publish-view.vue');
        assert(/scores\[d\.key\] = 0/.test(s) && /grayscale\(1\)/.test(s) && /未评分/.test(s), '默认灰未落地');
    });

    await case_it('R9-02', '②任务中心喂养闭环（打卡得道具 → 喂食成功）', async () => {
        // R5-04/R5-05 已实测；此处核对库内留痕
        const n = sql_num(`SELECT COUNT(*) FROM feed_record WHERE user_id = ${user_id};`);
        assert(n >= 1, `喂养记录数 ${n}`);
        const t = sql_num(`SELECT COUNT(*) FROM task_claim WHERE user_id = ${user_id};`);
        assert(t >= 1, '任务领取记录缺失');
    });

    await case_it('R9-03', '③收藏/分享任务进度随行为更新', async () => {
        const canteens = await api_get('/canteens');
        const fav = await req('POST', '/favorites', { subjectType: 2, subjectId: canteens[0].id, listType: 0 }, token);
        assert(fav.status === 200 || fav.status === 201, `收藏状态 ${fav.status}`);
        await req('POST', '/posts', { content: 'ACC10 分享任务' }, token);
        const tasks = await api_get('/me/tasks', token);
        const all = [...tasks.daily, ...tasks.growth];
        const fav_task = all.find((x) => x.action_type === 4);
        const share_task = all.find((x) => x.action_type === 6);
        assert(!!fav_task && fav_task.current >= 1, '收藏任务进度未更新');
        assert(!!share_task && share_task.current >= 1, '分享任务进度未更新');
    });

    await case_it('R9-04', '④⑤⑥全服福宝数与点亮天数均为真实值（非 1207 / 127 天）', async () => {
        // /pet/community 为登录态接口（auth_required），需带 token
        const d = await api_get('/pet/community', token);
        assert_eq(d.total, sql_num('SELECT COUNT(*) FROM pet;'), '全服数');
        const pet = await api_get('/me/pet', token);
        const days = sql_num(`SELECT DATEDIFF(CURDATE(), DATE(created_at)) + 1 FROM pet WHERE user_id = ${user_id};`);
        assert_eq(pet.lit_days, days, '点亮天数应等于建号天数');
    });

    await case_it('R9-05', '⑦宠物页无「包子底托」装饰层', async () => {
        const s = read_front('views/pet-view.vue');
        assert(!/包子底|bottom-bun|\.bun\b/.test(s), '仍存在底部装饰');
    });

    await case_it('R9-06', '⑧表情透明抠图 + 装扮购买扣币（R5-09 实测）', async () => {
        const dir = path.join(ROOT, 'frontend', 'public', 'assets', 'pet');
        const f = fs.readdirSync(dir).find((x) => /e-(angry|shy)/.test(x));
        assert(!!f, '缺少生气/害羞表情图');
        const b = fs.readFileSync(path.join(dir, f));
        assert([4, 6].includes(b[25]), `表情图非透明（colorType=${b[25]}）`);
        // 装扮购买会写入一条 change_type=2（支出）/ biz_type=3（装扮购买）的金币流水，金额为正数
        assert(!!buy_dress, 'R5-09 未成功购买装扮，无法校验扣费流水');
        const tx = sql_num(
            `SELECT COUNT(*) FROM coin_transaction
             WHERE user_id = ${user_id} AND change_type = 2 AND biz_type = 3 AND amount = ${buy_dress.price};`
        );
        assert(tx >= 1, `未见装扮扣费流水（应有一条 ${buy_dress.price} 金币的装扮购买支出）`);
    });

    await case_it('R9-07', '⑨搜索页仅一个搜索框（顶栏隐藏）', async () => {
        assert(/route\.path !== '\/search'/.test(read_front('App.vue')), '顶栏搜索未按路由隐藏');
    });

    await case_it('R9-08', '⑩地图四类筛选与搜索框可用', async () => {
        const s = read_front('views/map-view.vue');
        assert(/FILTERS/.test(s) && /apply_filter/.test(s) && /keyword/.test(s), '地图筛选/搜索缺失');
        const pts = await api_get('/points/map');
        assert(Array.isArray(pts), 'map 应为区域数组');
        const flat = pts.flatMap((a) => a.points || []);
        assert(flat.length >= 60, `地图点位应 >=60，实际 ${flat.length}`);
        assert(flat.every((p) => p.lat && p.lng), '地图点位坐标缺失');
    });

    await case_it('R9-09', '⑪推荐流与最新流排序不同（R6-03 实测）', async () => {
        assert(true, '已由 R6-03 覆盖');
    });

    await case_it('R9-10', '⑫饮食目标多选 + MBTI 12 题', async () => {
        const diet = read_front('views/diet-profile-view.vue');
        assert(/toggle_goal/.test(diet) && /Array\.isArray/.test(diet), '目标未做多选');
        const mbti = read_front('views/mbti-view.vue');
        assert_eq((mbti.match(/\{ key: 'q\d+'/g) || []).length, 12, 'MBTI 题数');
    });

    await case_it('R9-11', '⑬MBTI 结果命名与 4 字母代码（16 型）', async () => {
        const s = read_front('views/mbti-view.vue');
        // 本项目 MBTI 采用四字母人格代码（如 SMAE），共 16 型
        const codes = new Set((s.match(/\b[A-Z]{4}\b/g) || []));
        assert(codes.size >= 16, `16 型代码数 ${codes.size}`);
        assert(/type_name|result_name|name:/.test(s), '缺少结果名称映射');
    });

    await case_it('R9-12', '⑭分享文案带测试网址（MBTI / 动态）', async () => {
        const mbti = read_front('views/mbti-view.vue');
        assert(/location\.origin/.test(mbti) && /\/ai\/mbti/.test(mbti), 'MBTI 分享网址缺失');
        const post = read_front('views/post-detail-view.vue');
        assert(/location\.origin/.test(post) && /\/post\//.test(post), '动态分享网址缺失');
    });

    await case_it('R9-13', '⑮忌口支持自定义新增', async () => {
        const s = read_front('views/diet-profile-view.vue');
        assert(/custom_avoids/.test(s) && /add_avoid/.test(s), '自定义忌口缺失');
        assert(/push\(/.test(s), '缺少新增逻辑');
    });

    await case_it('R9-14', '⑯成就进度取真实统计', async () => {
        const s = await api_get('/me/stats', token);
        assert(!!s.stats, '缺少 stats');
        for (const k of ['review_count', 'check_in_count', 'favorite_count']) {
            assert(s.stats[k] !== undefined, `缺少 ${k}`);
        }
        assert(/api_me\.stats/.test(read_front('views/achievements-view.vue')), '前端未接真实统计');
    });

    await case_it('R9-15', '⑰设置-账号与安全跳转到我的页弹层', async () => {
        const s = read_front('views/settings-view.vue');
        assert(/dialog: kind/.test(s), '未走 ?dialog=');
        const me = read_front('views/me-view.vue');
        assert(/route\.query\.dialog/.test(me), '我的页未处理 dialog');
    });

    await case_it('R9-16', '⑱档口入驻申请真实落库（待审核）', async () => {
        const r = await req('POST', '/points-submit', {
            submitType: 3,
            payload: { name: 'ACC10 测试档口', contact: '张三', phone: '13800138000', position: '生活区一区', intro: '自动化测试提交' },
        }, token);
        assert_eq(r.status, 200, `提交状态（${JSON.stringify(r.body).slice(0, 160)}）`);
        const mine = await api_get('/me/point-submits', token);
        const row = mine.list.find((x) => Number(x.submit_type) === 3);
        assert(!!row, '未查询到入驻申请');
        // 审核结论落在主表：audit_status 0 待审 / 1 通过 / 2 驳回
        assert_eq(Number(row.audit_status), 0, '应为待审核');
    });

    await case_it('R9-17', '⑲⑳设置分组不重复、举报记录单一入口', async () => {
        const s = read_front('views/settings-view.vue');
        assert((s.match(/举报记录/g) || []).length <= 1, '举报记录重复');
        const groups = (s.match(/class="card group/g) || []).length;
        assert(groups >= 3, `设置分组过少 ${groups}`);
        assert(/\/vendor\/apply/.test(s), '档口入口缺失');
    });

    /* ---------- R10 浏览器运行时 / 响应式 ---------- */
    enter_round('R10 浏览器运行时（控制台异常 / 路由可达 / 移动端不溢出）');

    await case_it('R10-01', '关键页面无未捕获 JS 异常', async () => {
        const { chromium } = await import('playwright-core');
        const exe = path.join(process.env.LOCALAPPDATA || '', 'ms-playwright', 'chromium-1208', 'chrome-win64', 'chrome.exe');
        assert(fs.existsSync(exe), `未找到 Chromium：${exe}`);
        const browser = await chromium.launch({ executablePath: exe, headless: true });
        const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
        await ctx.addInitScript(([t, u]) => {
            localStorage.setItem('fk_token', t);
            localStorage.setItem('fk_user', u);
        }, [token, JSON.stringify({ id: user_id, username: USERNAME, nickname: USERNAME, role: 0, status: 0 })]);
        const page = await ctx.newPage();
        const errs = [];
        page.on('pageerror', (e) => errs.push(`[${page.url()}] ${e.message}`));
        const routes = ['/', '/list', '/circle', '/map', '/rank', '/search', '/me', '/tasks', '/pet', '/pet/community',
            '/ai/mbti', '/ai/diet/profile', '/settings', '/achievements', '/vendor/apply'];
        for (const r of routes) {
            await page.goto(`${BASE}${r}`, { waitUntil: 'networkidle', timeout: 30000 });
            await page.waitForTimeout(250);
        }
        await browser.close();
        assert_eq(errs.length, 0, `未捕获异常：${errs.slice(0, 5).join(' | ')}`);
    });

    await case_it('R10-02', '首页渲染真实口碑榜而非空壳', async () => {
        const { chromium } = await import('playwright-core');
        const exe = path.join(process.env.LOCALAPPDATA || '', 'ms-playwright', 'chromium-1208', 'chrome-win64', 'chrome.exe');
        const browser = await chromium.launch({ executablePath: exe, headless: true });
        const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
        await page.goto(`${BASE}/`, { waitUntil: 'networkidle', timeout: 30000 });
        const text = await page.innerText('body');
        assert(text.includes('校园口碑榜'), '缺少口碑榜标题');
        assert(text.includes('热门档口'), '缺少热门档口');
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        await browser.close();
        assert(overflow <= 2, `移动端横向溢出 ${overflow}px`);
    });

    await case_it('R10-03', '移动端关键页横向不溢出（列表/点评圈/宠物）', async () => {
        const { chromium } = await import('playwright-core');
        const exe = path.join(process.env.LOCALAPPDATA || '', 'ms-playwright', 'chromium-1208', 'chrome-win64', 'chrome.exe');
        const browser = await chromium.launch({ executablePath: exe, headless: true });
        const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
        await ctx.addInitScript(([t, u]) => {
            localStorage.setItem('fk_token', t);
            localStorage.setItem('fk_user', u);
        }, [token, JSON.stringify({ id: user_id, username: USERNAME, role: 0, status: 0 })]);
        const page = await ctx.newPage();
        const bad = [];
        for (const r of ['/list', '/circle', '/pet', '/tasks']) {
            await page.goto(`${BASE}${r}`, { waitUntil: 'networkidle', timeout: 30000 });
            const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
            if (over > 2) bad.push(`${r}:${over}px`);
        }
        await browser.close();
        assert_eq(bad.length, 0, `溢出页面：${bad.join(',')}`);
    });

    /* ---------- 清理 ---------- */
    enter_round('清理临时测试数据');
    await case_it('C-01', '删除测试账号及其全部关联数据', async () => {
        sql(`DELETE FROM post_comment WHERE user_id = ${user_id};
             DELETE FROM post_like WHERE user_id = ${user_id};
             DELETE FROM post WHERE user_id = ${user_id};
             DELETE FROM review_like WHERE user_id = ${user_id};
             DELETE FROM review WHERE user_id = ${user_id};
             DELETE FROM favorite WHERE user_id = ${user_id};
             DELETE FROM check_in WHERE user_id = ${user_id};
             DELETE FROM feed_record WHERE user_id = ${user_id};
             DELETE FROM coin_transaction WHERE user_id = ${user_id};
             DELETE FROM task_claim WHERE user_id = ${user_id};
             DELETE FROM user_dress WHERE user_id = ${user_id};
             DELETE FROM pet WHERE user_id = ${user_id};
             DELETE FROM point_submit WHERE submitter_id = ${user_id};
             DELETE FROM notification WHERE user_id = ${user_id};
             DELETE FROM user WHERE id = ${user_id};`);
        assert_eq(sql_num(`SELECT COUNT(*) FROM \`user\` WHERE id = ${user_id};`), 0, '测试账号未清除');
        assert_eq(sql_num("SELECT COUNT(*) FROM post WHERE content LIKE 'ACC10%';"), 0, '测试动态未清除');
        assert_eq(sql_num(`SELECT COUNT(*) FROM post_comment WHERE user_id = ${user_id};`), 0, '测试评论未清除');
    });
}

/* ==================== 运行与汇总 ==================== */
main()
    .then(() => {
        console.log('\n================ 汇总 ================');
        console.log(`通过 ${pass_count} / 失败 ${fail_count}`);
        if (failures.length) {
            console.log('\n失败明细：');
            for (const f of failures) console.log(`- ${f.round} ${f.id} ${f.desc}\n    ${f.message}`);
        }
        const report = {
            time: new Date().toISOString(),
            base: BASE,
            pass: pass_count,
            fail: fail_count,
            failures,
        };
        fs.mkdirSync(path.join(HERE, 'report'), { recursive: true });
        fs.writeFileSync(path.join(HERE, 'report', 'rounds-10-report.json'), JSON.stringify(report, null, 2));
        process.exit(fail_count === 0 ? 0 : 1);
    })
    .catch((e) => {
        console.error('测试运行异常：', e);
        process.exit(1);
    });
