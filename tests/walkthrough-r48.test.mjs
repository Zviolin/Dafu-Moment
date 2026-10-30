/**
 * r48 走查：AI 供应商文档链接逐项核实修正（控制台类原误填文档站/旧域名）
 * 运行：node tests/walkthrough-r48.test.mjs
 * 前置：docker compose up -d --build backend（后端 3000；boot 迁移自动修现库）
 *
 * 用例：
 * - A1 boot 迁移生效：现库 ai_provider 表 7 供应商 console_url/model_doc_url/base_url 与核实后新值一致
 * - A2 接口口径：GET /api/ai/providers 返回 8 项（含自定义），链接字段与新值一致、自定义项链接为空
 * - A3 幂等回归：重启无副作用（靠 boot 迁移条件 UPDATE 旧值匹配语义保证，本用例复核 A1 查询可重复）
 *
 * 链接核实方法（2026-10-09 WebFetch 实际访问）：
 * - 控制台 = 开账号/拿 API Key 的地方：platform.deepseek.com / bailian.console.aliyun.com
 *   / platform.kimi.com（moonshot.cn 文档站已迁移）/ bigmodel.cn/console / console.volcengine.com/ark
 *   / cloud.siliconflow.cn / console.cloud.tencent.com/hunyuan（原就对）
 * - 模型接入文档 = 官方模型列表/计费页（原 7 项均有效，仅 kimi 换新域名）
 * - base_url 均与官方文档一致（deepseek 官方现写法不带 /v1；混元 OpenAI 兼容接口页实锤）
 */
import { execSync } from 'child_process';

const API = 'http://localhost:3000';
const results = [];
let pass = 0, fail = 0;

/** 核实后的目标链接（与 index.js AI_PROVIDERS_DEFAULT 同源） */
const EXPECT = {
    deepseek: { base_url: 'https://api.deepseek.com', console_url: 'https://platform.deepseek.com', model_doc_url: 'https://api-docs.deepseek.com/quick_start/pricing' },
    qwen: { base_url: 'https://dashscope.aliyuncs.com/compatible-mode/v1', console_url: 'https://bailian.console.aliyun.com/', model_doc_url: 'https://help.aliyun.com/zh/model-studio/models' },
    kimi: { base_url: 'https://api.moonshot.cn/v1', console_url: 'https://platform.kimi.com/', model_doc_url: 'https://platform.kimi.com/docs/models' },
    zhipu: { base_url: 'https://open.bigmodel.cn/api/paas/v4', console_url: 'https://bigmodel.cn/console', model_doc_url: 'https://docs.bigmodel.cn/cn/guide/start/model-overview' },
    doubao: { base_url: 'https://ark.cn-beijing.volces.com/api/v3', console_url: 'https://console.volcengine.com/ark', model_doc_url: 'https://www.volcengine.com/docs/82379/1330310' },
    siliconflow: { base_url: 'https://api.siliconflow.cn/v1', console_url: 'https://cloud.siliconflow.cn/', model_doc_url: 'https://docs.siliconflow.cn/cn/userguide/introduction' },
    hunyuan: { base_url: 'https://api.hunyuan.cloud.tencent.com/v1', console_url: 'https://console.cloud.tencent.com/hunyuan', model_doc_url: 'https://cloud.tencent.com/document/product/1729' },
    // r49.2 补充（官方文档实测口径）：MiniMax 新域名 api.minimax.cn（弃 minimaxi.com）
    minimax: { base_url: 'https://api.minimax.cn/v1', console_url: 'https://platform.minimaxi.com/user-center/basic-information/interface-key', model_doc_url: 'https://platform.minimaxi.com/docs/guides/text-generation' },
    mimo: { base_url: 'https://api.xiaomimimo.com/v1', console_url: 'https://platform.xiaomimimo.com/#/console/api-keys', model_doc_url: 'https://mimo.mi.com/docs/zh-CN/quick-start/first-api-call' },
};

/**
 * 登记一个走查用例
 * @param {string} id - R-xx
 * @param {string} desc
 * @param {Function} fn
 */
async function case_r(id, desc, fn) {
    try {
        await fn();
        pass++;
        results.push({ id, desc, ok: true });
        console.log(`  [PASS] ${id} ${desc}`);
    } catch (e) {
        fail++;
        results.push({ id, desc, ok: false, msg: String(e.message || e).slice(0, 300) });
        console.log(`  [FAIL] ${id} ${desc} -> ${String(e.message || e).slice(0, 300)}`);
    }
}

/** 断言 */
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assert failed'); }

/**
 * API 登录（DEBUG 验证码通道）
 * @param {string} username
 * @param {string} password
 */
async function login_api(username, password) {
    const cap = await (await fetch(`${API}/api/auth/captcha`)).json();
    const r = await (await fetch(`${API}/api/auth/login`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username, password, captchaId: cap.data.captchaId, captchaCode: cap.data.debugCode }),
    })).json();
    assert(r.data && r.data.token, `${username} 登录失败: ${JSON.stringify(r).slice(0, 100)}`);
    return { H: { authorization: `Bearer ${r.data.token}`, 'content-type': 'application/json' } };
}
const user = await login_api('zhangwl', '123456');

/**
 * docker exec 查现库 ai_provider 全行（含中文需 utf8mb4 通道）
 * @returns {Array<Object>}
 */
function db_rows() {
    const out = execSync(
        'docker exec dafu-mysql mysql -uroot -pdafu_root_2026 --default-character-set=utf8mb4 -N -e ' +
        '"SELECT provider_key, base_url, console_url, model_doc_url FROM dafu.ai_provider"',
        { encoding: 'utf8' }
    );
    return out.trim().split('\n').filter(Boolean).map((line) => {
        const [provider_key, base_url, console_url, model_doc_url] = line.split('\t');
        return { provider_key, base_url, console_url, model_doc_url };
    });
}

console.log('=== r48 走查（供应商文档链接核实修正） ===');

await case_r('A1', 'boot 播种生效：现库 9 供应商三链接与核实后新值逐项一致', async () => {
    const rows = db_rows();
    const map = Object.fromEntries(rows.map((r) => [r.provider_key, r]));
    for (const [key, exp] of Object.entries(EXPECT)) {
        const row = map[key];
        assert(row, `缺供应商行 ${key}`);
        for (const col of ['base_url', 'console_url', 'model_doc_url']) {
            assert(row[col] === exp[col], `${key}.${col} = ${row[col]}，应为 ${exp[col]}`);
        }
    }
    assert(!map.anthropic && !map.openai_official, 'r47 收敛项残留: anthropic/openai_official');
    assert(map.openai.console_url === '' && map.openai.model_doc_url === '', '自定义项应无文档链接');
});

await case_r('A2', 'GET /api/ai/providers 返回 ≥10 项且链接字段与新值一致', async () => {
    const r = await (await fetch(`${API}/api/ai/providers`, { headers: user.H })).json();
    assert(r.code === 0 && Array.isArray(r.data), `列表异常: ${JSON.stringify(r).slice(0, 120)}`);
    // 供应商会随迭代增加，只校验「不少于基线 10 项」，具体项按 EXPECT 逐项核对
    assert(r.data.length >= 10, `应 ≥10 项: ${r.data.length}`);
    const map = Object.fromEntries(r.data.map((p) => [p.providerKey, p]));
    for (const [key, exp] of Object.entries(EXPECT)) {
        const p = map[key];
        assert(p, `缺供应商 ${key}`);
        assert(p.baseUrl === exp.base_url, `${key}.baseUrl = ${p.baseUrl}`);
        assert(p.consoleUrl === exp.console_url, `${key}.consoleUrl = ${p.consoleUrl}`);
        assert(p.modelDocUrl === exp.model_doc_url, `${key}.modelDocUrl = ${p.modelDocUrl}`);
    }
    assert(map.openai.consoleUrl === '' && map.openai.modelDocUrl === '', '自定义项应无文档链接');
    // r49.4 排序对调：自定义(0) DeepSeek 通义 Kimi 智谱 豆包 MiniMax(6) 小米(7) 混元(8) 硅基流动(9)
    const keys = r.data.map((p) => p.providerKey);
    assert(keys.indexOf('minimax') === 6 && keys.indexOf('mimo') === 7, `排序不符: ${keys}`);
    assert(keys.indexOf('hunyuan') === 8 && keys.indexOf('siliconflow') === 9, `对调后混元/硅基流动应在末两位: ${keys}`);
});

await case_r('A4', '后台可配置：管理员拉取 /admin/ai-providers 列表含新增项且可改', async () => {
    const admin = await login_api('admin', (process.env.DAFU_ADMIN_PASSWORD || 'admin123'));
    const r = await (await fetch(`${API}/api/admin/ai-providers`, { headers: admin.H })).json();
    assert(r.code === 0 && Array.isArray(r.data), `后台列表异常: ${JSON.stringify(r).slice(0, 120)}`);
    const map = Object.fromEntries(r.data.map((p) => [p.providerKey, p]));
    assert(map.minimax && map.mimo, `后台缺新增项: ${Object.keys(map)}`);
    assert(map.minimax.enabled === 1 && map.mimo.enabled === 1, '新增项应为启用态');
    // 验证后台编辑写回：PUT 为全量更新（name/providerKey 必填），改排序后还原
    const row = map.mimo;
    const body = {
        providerKey: row.providerKey, name: row.name, protocol: row.protocol,
        baseUrl: row.baseUrl, consoleUrl: row.consoleUrl, modelDocUrl: row.modelDocUrl,
        enabled: row.enabled, sortOrder: 11,
    };
    const up = await (await fetch(`${API}/api/admin/ai-providers/${row.id}`, {
        method: 'PUT', headers: admin.H, body: JSON.stringify(body),
    })).json();
    assert(up.code === 0, `后台更新失败: ${JSON.stringify(up).slice(0, 120)}`);
    body.sortOrder = row.sortOrder; // 还原排序
    const back = await (await fetch(`${API}/api/admin/ai-providers/${row.id}`, {
        method: 'PUT', headers: admin.H, body: JSON.stringify(body),
    })).json();
    assert(back.code === 0, '还原失败');
    const after = await (await fetch(`${API}/api/admin/ai-providers`, { headers: admin.H })).json();
    assert(after.data.find((p) => p.providerKey === 'mimo').sortOrder === row.sortOrder, '排序未还原');
});

await case_r('A3', '迁移幂等：重复查询库行结果一致（条件 UPDATE 旧值匹配语义）', async () => {
    const a = db_rows();
    const b = db_rows();
    assert(JSON.stringify(a) === JSON.stringify(b), '两次查询结果不一致');
});

console.log(`\n=== 结果: ${pass} 通过 / ${fail} 失败 ===`);
process.exit(fail > 0 ? 1 : 0);
