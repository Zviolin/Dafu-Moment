/**
 * 任务 / 福宝 / 动态 / 档口入驻 接口回归测试（r78 测试记录修复项）
 * 运行：node tests/api-task-pet-social.test.mjs
 * 前置：docker compose up -d，API 端口 3000，且后端 DEBUG=true（验证码回显 debugCode）
 * 幂等：随机账号注册；任务按「每日」口径只领一次，因此每次都使用新账号
 */
const BASE = process.env.DAFU_API || 'http://localhost:3000';
import { cleanup_fixtures } from './_fixture-cleanup.mjs';
const PWD = 'it123456';

let token = '';
let pass = 0;
let fail = 0;

/**
 * 断言
 * @param {boolean} cond
 * @param {string} msg
 */
function assert(cond, msg) {
    if (!cond) throw new Error(msg || 'assert failed');
}

/**
 * 请求并解包 {code,msg,data}
 * @param {string} method
 * @param {string} path
 * @param {Object} [body]
 */
async function req(method, path, body) {
    const r = await fetch(`${BASE}/api${path}`, {
        method,
        headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    const j = await r.json();
    if (j.code !== 0) throw new Error(`${method} ${path} -> ${r.status} ${j.code} ${j.msg}`);
    return j.data;
}

/**
 * 执行一条用例
 * @param {string} id
 * @param {string} desc
 * @param {Function} fn
 */
async function case_it(id, desc, fn) {
    try {
        await fn();
        pass++;
        console.log(`  [PASS] ${id} ${desc}`);
    } catch (e) {
        fail++;
        console.log(`  [FAIL] ${id} ${desc} -> ${String(e.message).slice(0, 200)}`);
    }
}

/** 本次回归使用的临时账号名（末尾收尾清理用） */
const UNAME = `it_${Date.now().toString(36)}`;

/** 取验证码并注册随机账号 */
async function register() {
    const cap = await req('GET', '/auth/captcha');
    assert(cap.debugCode, '验证码未回显 debugCode，请以 DEBUG=true 启动后端');
    const d = await req('POST', '/auth/register', {
        username: UNAME,
        password: PWD,
        nickname: '回归测试员',
        captchaId: cap.captchaId,
        captchaCode: cap.debugCode,
    });
    token = d.token;
}

console.log('=== 任务 / 福宝 / 动态 / 档口入驻 接口回归 ===');

await register();

let pet0 = null;
let feed_task = null;
let post_id = 0;

await case_it('R78-1', '新账号福宝点亮天数=1、金币/道具为 0、装扮 9 件', async () => {
    pet0 = await req('GET', '/me/pet');
    assert(Number(pet0.lit_days) === 1, `lit_days=${pet0.lit_days}`);
    assert(Number(pet0.coins) === 0, `coins=${pet0.coins}`);
    assert(Number(pet0.props) === 0, `props=${pet0.props}`);
    assert(Array.isArray(pet0.dresses) && pet0.dresses.length === 9, `dresses=${pet0.dresses && pet0.dresses.length}`);
    // 从未投喂的新福宝：不应被判成「饿肚子 / 超 24 小时没喂食」
    assert(pet0.fed_never === true, `fed_never=${pet0.fed_never}`);
    assert(pet0.mood === 'normal', `新福宝心情应为待机，实际 ${pet0.mood}`);
});

await case_it('R78-2', '首次打卡发放 1 个喂食道具（打断金币/道具死循环）', async () => {
    await req('POST', '/checkin', { canteenId: 1, visibility: 1, note: '回归打卡', photos: [], dishIds: [] });
    const pet = await req('GET', '/me/pet');
    assert(Number(pet.props) === 1, `props=${pet.props}`);
});

await case_it('R78-2b', '未投喂的新福宝不上累计投喂榜（0 次不占榜）', async () => {
    const c = await req('GET', '/pet/community');
    assert(Array.isArray(c.ranking), 'ranking 缺失');
    assert(c.ranking.every((x) => Number(x.feed_total) > 0),
        `榜内存在 0 次：${JSON.stringify(c.ranking.map((x) => x.feed_total))}`);
    assert(c.ranking.every((x, i) => Number(x.rank) === i + 1), '榜内名次应从 1 连续排列');
    assert(!c.ranking.some((x) => x.is_me), '未投喂的新账号不应上榜');
    assert(c.my_rank === null, `未投喂时 my_rank 应为 null，实际 ${JSON.stringify(c.my_rank)}`);
});

await case_it('R78-3', '喂食优先消耗道具，累计投喂与经验增长', async () => {
    const feed = await req('POST', '/me/pet/feed');
    assert(feed.fed_cost_type === 'prop', `cost=${feed.fed_cost_type}`);
    assert(Number(feed.feed_total) === 1, `feed_total=${feed.feed_total}`);
    assert(Number(feed.exp) >= 10, `exp=${feed.exp}`);
    assert(Number(feed.props) === 0, `props=${feed.props}`);
    assert(feed.fed_never === false, `投喂后 fed_never 应为 false，实际 ${feed.fed_never}`);
    // 投喂 1 次后应真实进入投喂榜（榜内不含 0 次）
    const c = await req('GET', '/pet/community');
    assert(c.ranking.some((x) => x.is_me && Number(x.feed_total) === 1), '投喂后应进入累计投喂榜');
});

await case_it('R78-4', '喂食任务可领取，金币真实到账', async () => {
    const tasks = await req('GET', '/me/tasks');
    feed_task = (tasks.daily || []).find((t) => Number(t.id) === 3);
    assert(feed_task && feed_task.claimable, '喂食任务不可领取');
    await req('POST', '/tasks/3/claim');
    const pet = await req('GET', '/me/pet');
    assert(Number(pet.coins) === 10, `coins=${pet.coins}`);
});

await case_it('R78-5', '发布动态成功并进入最新/推荐流', async () => {
    const p = await req('POST', '/posts', {
        content: '回归测试：真实发布一条美食动态', images: [], topics: ['食堂测评'], links: [],
    });
    post_id = p.id;
    const latest = await req('GET', '/posts?tab=latest&page=1&size=5');
    assert((latest.list || []).some((x) => Number(x.id) === Number(post_id)), '最新流缺少新动态');
    const recommend = await req('GET', '/posts?tab=recommend&page=1&size=5');
    assert((recommend.list || []).some((x) => Number(x.id) === Number(post_id)), '推荐流缺少新动态');
});

await case_it('R78-6', '动态点赞幂等切换、评论写入并同步计数', async () => {
    const like1 = await req('POST', `/posts/${post_id}/like`);
    assert(like1.liked === true && Number(like1.like_count) === 1, `like1=${JSON.stringify(like1)}`);
    const like2 = await req('POST', `/posts/${post_id}/like`);
    assert(like2.liked === false && Number(like2.like_count) === 0, `like2=${JSON.stringify(like2)}`);
    await req('POST', `/posts/${post_id}/comments`, { content: '回归评论' });
    const cmts = await req('GET', `/posts/${post_id}/comments`);
    assert(Number(cmts.total) >= 1, `comments=${cmts.total}`);
    const got = await req('GET', `/posts/${post_id}`);
    assert(Number(got.comment_count) >= 1, `comment_count=${got.comment_count}`);
});

await case_it('R78-7', '档口入驻申请真实落库并在我的提交中可见', async () => {
    const r = await req('POST', '/points-submit', {
        submitType: 3,
        payload: { name: '回归测试档口', contact: '测试员', phone: '13800000000', position: '京元食堂一楼', intro: '回归用' },
    });
    assert(r.id > 0, '提交未返回 id');
    const subs = await req('GET', '/me/point-submits?page=1&size=10');
    assert((subs.list || []).some((x) => Number(x.submit_type) === 3 && Number(x.id) === Number(r.id)), '我的提交缺少入驻申请');
});

await case_it('R78-8', '福宝广场总数来自真实 pet 表而非固定 1208', async () => {
    const c = await req('GET', '/pet/community');
    assert(Number(c.total) >= 1, `total=${c.total}`);
    assert(Number(c.total) !== 1208, 'total 仍为硬编码 1208');
    assert(Array.isArray(c.list), 'list 缺失');
});

await case_it('R78-CLEAN', '收尾：删除本次临时账号及其宠物/任务/动态数据', async () => {
    cleanup_fixtures({ prefixes: [], usernames: [UNAME] });
});

console.log(`\n结果：通过 ${pass}，失败 ${fail}`);
process.exit(fail === 0 ? 0 : 1);
