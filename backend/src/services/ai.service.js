/**
 * AI 助手服务（03 §5.6 v2.0）：条件解析 → 平台真实数据检索 → prompt 组装 → LLM 生成
 * 核心约定：
 *  - 评价即知识库：候选点位的高分评价摘录一并注入 prompt，答案锚定真实用户反馈
 *  - 仅注入平台真实点位/菜品/评价，系统提示明确禁止虚构（防幻觉）
 *  - 多供应商（r44 起，参考主流 AI 客户端自定义端点）：provider=openai 走 OpenAI 兼容
 *    /chat/completions（DeepSeek/通义/Kimi/智谱等通用），provider=anthropic 走 Claude 原生 /messages
 *  - 用户模型列表（r46 起，Trae CN 式多配置）中「使用中」项优先，平台 env 兜底；
 *    API 密钥 AES-256-GCM 加密落库（密文查库不可见），未配置或调用失败 → 降级规则推荐
 */
const config = require('../config');
const { query, query_one } = require('../db/pool');
const { err } = require('../utils/api-error');
const { encrypt_secret, decrypt_secret } = require('../utils/secret-box');
const { of } = require('../utils/logger');

const log = of('[ai]');

/* ---------------- 条件解析 ---------------- */

/** 忌口关键词 → dish.taboo_tags 词表 */
const TABOO_PATTERNS = [
    [/素食|吃素|不要肉/, '素食'],
    [/清真/, '清真'],
    [/香菜/, '无香菜'],
    [/葱蒜|葱|蒜/, '无葱蒜'],
];

/** 常见品类关键词（与 seed 品类口径呼应，运行时仍会与库内品类求交） */
const CATEGORY_HINTS = [
    '麻辣烫', '麻辣香锅', '沙县', '兰州拉面', '黄焖鸡', '奶茶', '咖啡', '汉堡',
    '炸鸡', '披萨', '饺子', '包子', '粥', '面', '米线', '螺蛳粉', '烤肉', '烧烤',
    '水果', '轻食', '沙拉', '炒饭', '盖浇饭', '自选餐', '甜点', '蛋糕', '烧腊',
];

/**
 * 从自然语言问题解析检索条件
 * @param {string} question
 * @returns {{priceMin: number|null, priceMax: number|null, taboo: string[], keyword: string, wantDelivery: boolean, wantHighRating: boolean}}
 */
function parse_conditions(question) {
    const q = String(question || '').slice(0, 500);
    const conds = { priceMin: null, priceMax: null, taboo: [], keyword: '', wantDelivery: false, wantHighRating: false };

    // 价格带：「10元以内」「5-12元」「10元以上」「8元以下」
    let m = q.match(/(\d+(?:\.\d+)?)\s*[-到至]\s*(\d+(?:\.\d+)?)\s*元/);
    if (m) { conds.priceMin = Number(m[1]); conds.priceMax = Number(m[2]); }
    if (conds.priceMin === null) {
        m = q.match(/(\d+(?:\.\d+)?)\s*元\s*(?:以内|以下|之内)/);
        if (m) conds.priceMax = Number(m[1]);
    }
    if (conds.priceMin === null && conds.priceMax === null) {
        m = q.match(/(\d+(?:\.\d+)?)\s*元\s*(?:以上|往上)/);
        if (m) conds.priceMin = Number(m[1]);
    }
    if (/便宜|实惠|性价比|省钱|不贵/.test(q)) conds.priceMax = conds.priceMax ?? 12;

    // 忌口
    for (const [re, tag] of TABOO_PATTERNS) {
        if (re.test(q)) conds.taboo.push(tag);
    }

    // 外卖/配送意图 → 周边点位（type>0）
    if (/外卖|配送|送餐|跑腿|代取/.test(q)) conds.wantDelivery = true;

    // 高分意图
    if (/好吃|推荐|高分|口碑|最好|评分高/.test(q)) conds.wantHighRating = true;

    // 品类关键词（取第一个命中的提示词）
    for (const c of CATEGORY_HINTS) {
        if (q.includes(c)) { conds.keyword = c; break; }
    }
    return conds;
}

/* ---------------- 平台真实数据检索 ---------------- */

/**
 * 按条件检索候选菜品（评价第一公民）+ 候选档口
 * @param {Object} conds - parse_conditions 结果
 * @returns {Promise<{dishes: Array, stations: Array}>}
 */
async function retrieve(conds) {
    const where = ['d.status = 0', 's.status < 2', 'c.enabled = 1', 'sm.review_count > 0'];
    const params = [];
    if (conds.priceMin !== null) { where.push('d.price >= ?'); params.push(conds.priceMin); }
    if (conds.priceMax !== null) { where.push('d.price <= ?'); params.push(conds.priceMax); }
    if (conds.keyword) {
        where.push('(d.name LIKE ? OR s.name LIKE ? OR s.category LIKE ?)');
        params.push(`%${conds.keyword}%`, `%${conds.keyword}%`, `%${conds.keyword}%`);
    }
    for (const t of conds.taboo) {
        // 命中忌口标签的菜品排除
        where.push('NOT FIND_IN_SET(?, REPLACE(d.taboo_tags, " ", ""))');
        params.push(t);
    }
    if (conds.wantDelivery) where.push('c.type > 0');

    const dishes = await query(
        `SELECT d.id, d.name, d.price, d.taste_tags, d.taboo_tags, s.id AS station_id, s.name AS station_name,
                c.id AS canteen_id, c.name AS canteen_name, c.type, c.avg_price,
                sm.rating_avg, sm.review_count
         FROM dish d
         JOIN station s ON s.id = d.station_id
         JOIN canteen c ON c.id = s.canteen_id
         JOIN review_summary sm ON sm.subject_type = 0 AND sm.subject_id = d.id
         WHERE ${where.join(' AND ')}
         ORDER BY sm.rating_avg DESC, sm.review_count DESC, d.id ASC
         LIMIT ${config.ai.max_candidates}`,
        params
    );

    // 菜品候选不足时补档口级候选
    let stations = [];
    if (dishes.length < 3) {
        stations = await query(
            `SELECT s.id, s.name, s.category, c.id AS canteen_id, c.name AS canteen_name, c.type,
                    sm.rating_avg, sm.review_count
             FROM station s
             JOIN canteen c ON c.id = s.canteen_id
             JOIN review_summary sm ON sm.subject_type = 1 AND sm.subject_id = s.id
             WHERE s.status < 2 AND c.enabled = 1 AND sm.review_count > 0
             ORDER BY sm.rating_avg DESC, sm.review_count DESC LIMIT 3`
        );
    }
    return { dishes, stations };
}

/**
 * 取候选的高分评价摘录（评价即知识库）：菜品级 + 档口级（r44 起覆盖更全面）
 * @param {Array} dishes
 * @param {Array} stations
 * @returns {Promise<string>} 拼接好的摘录文本
 */
async function review_quotes(dishes, stations = []) {
    const lines = [];
    for (const d of dishes.slice(0, 4)) {
        const rows = await query(
            `SELECT r.overall_score, r.content, r.is_anonymous, u.nickname
             FROM review r JOIN user u ON u.id = r.user_id
             WHERE r.subject_type = 0 AND r.subject_id = ? AND r.status = 0
             ORDER BY r.up_count DESC, r.overall_score DESC LIMIT ${config.ai.max_review_quotes}`,
            [d.id]
        );
        for (const r of rows) {
            const who = Number(r.is_anonymous) === 1 ? '匿名同学' : r.nickname;
            lines.push(`「${d.name}」（${d.station_name}）评分 ${r.overall_score}，${who}：${String(r.content).slice(0, 80)}`);
        }
    }
    // 档口级摘录：菜品候选覆盖不到的档口口碑（如现炒现做、出餐速度等窗口整体反馈）
    for (const s of stations.slice(0, 2)) {
        const rows = await query(
            `SELECT r.overall_score, r.content, r.is_anonymous, u.nickname
             FROM review r JOIN user u ON u.id = r.user_id
             WHERE r.subject_type = 1 AND r.subject_id = ? AND r.status = 0
             ORDER BY r.up_count DESC, r.overall_score DESC LIMIT ${config.ai.max_review_quotes}`,
            [s.id]
        );
        for (const r of rows) {
            const who = Number(r.is_anonymous) === 1 ? '匿名同学' : r.nickname;
            lines.push(`「${s.name}」（${s.canteen_name}）档口评分 ${r.overall_score}，${who}：${String(r.content).slice(0, 80)}`);
        }
    }
    return lines.join('\n');
}

/* ---------------- LLM 调用（多供应商：OpenAI 兼容 / Anthropic 原生） ---------------- */

/** 点位类型中文说明（0 校内食堂 / 4 外卖 / 其余周边点位；AC01） */
function type_text(t) {
    const n = Number(t);
    if (n === 0) return '校内食堂';
    if (n === 4) return '外卖';
    return '周边点位';
}

/**
 * 组装候选数据 JSON（仅真实字段；r44 起带口味/忌口标签，供模型参考避开忌口）
 */
function candidate_payload(dishes, stations) {
    return {
        dishes: dishes.map((d) => ({
            菜品: d.name, 档口: d.station_name, 点位: d.canteen_name,
            点位类型: type_text(d.type), 价格: Number(d.price),
            口味标签: d.taste_tags || '', 忌口标签: d.taboo_tags || '',
            平台评分: Number(d.rating_avg), 评价数: Number(d.review_count),
        })),
        stations: stations.map((s) => ({
            档口: s.name, 点位: s.canteen_name, 品类: s.category,
            平台评分: Number(s.rating_avg), 评价数: Number(s.review_count),
        })),
    };
}

/**
 * 调用 LLM（r44 起按 provider 分协议）
 * @param {{provider, base_url, api_key, model}} cfg
 * @param {Array} messages - [{role, content}]，role=system 至多一条
 * @returns {Promise<string>}
 */
async function call_llm(cfg, messages) {
    const base = String(cfg.base_url || '').replace(/\/+$/, '');
    const system = messages.find((m) => m.role === 'system');
    const convo = messages.filter((m) => m.role !== 'system');
    const isAnthropic = cfg.protocol === 'anthropic';
    const url = isAnthropic ? `${base}/messages` : `${base}/chat/completions`;
    const headers = isAnthropic
        ? { 'Content-Type': 'application/json', 'x-api-key': cfg.api_key, 'anthropic-version': '2023-06-01' }
        : { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.api_key}` };
    const body = isAnthropic
        ? { model: cfg.model, system: system ? system.content : undefined, messages: convo, temperature: 0.7, max_tokens: 600 }
        : { model: cfg.model, messages, temperature: 0.7, max_tokens: 600 };
    const res = await fetch(url, {
        method: 'POST', headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(config.ai.timeout_ms),
    });
    if (!res.ok) {
        const body = await res.text().catch(() => '');
        // 带上供应商返回的错误片段，便于「测试连接」与日志定位 401/404/429 等原因
        throw new Error(`LLM HTTP ${res.status}${body ? ' ' + body.replace(/\s+/g, ' ').slice(0, 180) : ''}`);
    }
    const data = await res.json();
    // 响应取值：OpenAI choices[0].message.content；Anthropic content[] 中首个 text 块
    // （M2 系思考模型会把 thinking 块放 content[0]，必须按 type=text 定位，否则取空误降级）
    let text = '';
    if (isAnthropic) {
        const blocks = Array.isArray(data && data.content) ? data.content : [];
        const tb = blocks.find((b) => b && b.type === 'text' && b.text) || blocks[0];
        text = String(tb && tb.text ? tb.text : '').trim();
    } else {
        text = String(data && data.choices && data.choices[0] && data.choices[0].message
            ? data.choices[0].message.content || '' : '').trim();
    }
    if (!text) throw new Error('LLM 返回为空');
    return text;
}

/**
 * 把供应商/网络错误翻译成可操作的中文提示（测试连接按钮与降级原因共用）
 * @param {string} message - 原始错误信息
 * @returns {string} 中文原因
 */
function explain_llm_error(message) {
    const m = String(message || '');
    if (/HTTP 401|HTTP 403/.test(m)) return '密钥无效或无权限（401/403），请检查 API Key';
    if (/HTTP 404/.test(m)) return '接口地址或模型 ID 不正确（404），请对照官方文档';
    if (/HTTP 429/.test(m)) return '请求过于频繁或额度已用尽（429）';
    if (/HTTP 5\d\d/.test(m)) return '供应商服务异常（5xx），请稍后重试';
    if (/timeout|aborted|超时/i.test(m)) return '请求超时，请检查网络或接口地址';
    if (/fetch failed|ENOTFOUND|ECONNREFUSED|EAI_AGAIN|ECONNRESET/i.test(m)) {
        return '网络不可达：容器出网 / DNS 或接口地址错误';
    }
    if (/返回为空/.test(m)) return '模型返回空内容，请确认模型 ID 支持对话接口';
    return '调用失败，请检查配置后重试';
}

/**
 * 连通性测试：用给定配置真实发起一次最小对话请求
 * @param {{protocol:string, base_url:string, api_key:string, model:string}} cfg
 * @returns {Promise<{ok:boolean, latencyMs:number, model:string, reply?:string, error?:string, hint?:string}>}
 */
async function probe_llm(cfg) {
    if (!cfg.base_url || !/^https?:\/\//.test(cfg.base_url)) throw err.invalid('请填写接口地址（http(s):// 开头）');
    if (!cfg.model) throw err.invalid('请填写模型 ID');
    if (!cfg.api_key) throw err.invalid('请填写 API 密钥');
    const started = Date.now();
    try {
        const reply = await call_llm(cfg, [{ role: 'user', content: '连通性测试，请只回复：可用' }]);
        return { ok: true, latencyMs: Date.now() - started, model: cfg.model, reply: reply.slice(0, 80) };
    } catch (e) {
        const error = String(e.message || '调用失败').slice(0, 300);
        return {
            ok: false, latencyMs: Date.now() - started, model: cfg.model,
            error, hint: explain_llm_error(error),
        };
    }
}

/**
 * 测试用户自配模型：表单值优先，缺省回落到已保存配置（编辑态密钥留空可复用原密钥）
 * @param {number} userId
 * @param {Object} input - {id?, provider?, protocol?, baseUrl?, modelId?, apiKey?}
 * @returns {Promise<Object>} probe_llm 结果
 */
async function test_user_model(userId, input) {
    const id = input.id ? Number(input.id) : null;
    const row = id
        ? await query_one(
            'SELECT provider_key, protocol, base_url, model_id, api_key_cipher FROM ai_model WHERE id = ? AND user_id = ? AND platform_id IS NULL',
            [id, userId]
        )
        : null;
    if (id && !row) throw err.not_found('模型配置不存在');
    const provider = String(input.provider || (row ? row.provider_key : '') || '').trim();
    let base_url = String(input.baseUrl || (row ? row.base_url : '') || '').trim();
    if (!base_url && provider) {
        const prov = await query_one('SELECT base_url FROM ai_provider WHERE provider_key = ?', [provider]);
        if (prov && prov.base_url) base_url = prov.base_url;
    }
    const protocol = PROTOCOLS.includes(String(input.protocol || ''))
        ? String(input.protocol) : (row ? row.protocol : 'openai');
    const model = String(input.modelId || (row ? row.model_id : '') || '').trim();
    const api_key = String(input.apiKey || '').trim() || (row ? decrypt_secret(row.api_key_cipher) : '');
    return probe_llm({ protocol, base_url, api_key, model });
}

/**
 * 测试平台托管模型（后台表单：已保存的密钥可复用）
 * @param {Object} input - {id?, protocol?, baseUrl?, modelId?, apiKey?}
 * @returns {Promise<Object>} probe_llm 结果
 */
async function test_platform_model(input) {
    const id = input.id ? Number(input.id) : null;
    const row = id
        ? await query_one('SELECT protocol, base_url, model_id, api_key_cipher FROM ai_platform_model WHERE id = ?', [id])
        : null;
    if (id && !row) throw err.not_found('平台模型不存在');
    let base_url = String(input.baseUrl || (row ? row.base_url : '') || '').trim();
    const protocol = PROTOCOLS.includes(String(input.protocol || ''))
        ? String(input.protocol) : (row ? row.protocol : 'openai');
    const model = String(input.modelId || (row ? row.model_id : '') || '').trim();
    const api_key = String(input.apiKey || '').trim() || (row ? decrypt_secret(row.api_key_cipher) : '');
    return probe_llm({ protocol, base_url, api_key, model });
}

/**
 * 降级规则推荐文案（按平台真实评分排序直接生成，无 LLM 参与）
 */
function rule_answer(dishes, stations, conds) {
    const parts = [];
    if (dishes.length > 0) {
        const tops = dishes.slice(0, 3).map((d, i) =>
            `${i + 1}. ${d.name}（${d.station_name} · ${d.canteen_name}）人均 ${d.price} 元，平台评分 ${d.rating_avg}（${d.review_count} 条评价）`
        );
        parts.push(`根据平台真实评价数据，为你推荐：\n${tops.join('\n')}`);
    } else if (stations.length > 0) {
        const tops = stations.slice(0, 3).map((s, i) =>
            `${i + 1}. ${s.name}（${s.canteen_name}）平台评分 ${s.rating_avg}（${s.review_count} 条评价）`
        );
        parts.push(`根据平台真实评价数据，为你推荐：\n${tops.join('\n')}`);
    } else {
        parts.push('暂时没找到完全匹配的点位，可以换个口味或价格带再试试。');
    }
    if (conds.taboo.length > 0) parts.push(`已为你避开：${conds.taboo.join('、')}。`);
    if (conds.priceMax !== null) parts.push(`已按 ${conds.priceMin ?? 0}-${conds.priceMax} 元价格带筛选。`);
    return parts.join('\n');
}

/* ---------------- 对外主流程 ---------------- */

/**
 * AI 提问主流程：解析 → 检索 → LLM（可降级）→ 留痕
 * @param {number} userId
 * @param {string} question
 * @returns {Promise<{answer: string, recommendations: Array, degraded: boolean}>}
 */
async function ask(userId, question) {
    const q = String(question || '').trim().slice(0, 500);
    if (!q) throw err.invalid('问题不能为空');

    const conds = parse_conditions(q);
    const { dishes, stations } = await retrieve(conds);
    const quotes = await review_quotes(dishes, stations);

    // 推荐卡：菜品优先，不足补档口（前端跳详情；canteenId 供「地图找它」跳转 /map?focus=）
    const recommendations = [
        ...dishes.slice(0, 4).map((d) => ({
            subjectType: 0, subjectId: d.id, name: d.name, canteenId: d.canteen_id,
            reason: `${d.station_name}（${d.canteen_name}）· ${d.price} 元 · 平台评分 ${d.rating_avg}`,
        })),
        ...stations.slice(0, Math.max(0, 4 - Math.min(4, dishes.length))).map((s) => ({
            subjectType: 1, subjectId: s.id, name: s.name, canteenId: s.canteen_id,
            reason: `${s.canteen_name} · 平台评分 ${s.rating_avg}`,
        })),
    ].slice(0, 4);

    // 模型配置：使用中项优先——平台托管模型实时读平台表（停用/删除即失效回落），用户自配次之，平台 env 兜底
    const selected = await query_one(
        'SELECT platform_id, provider_key, protocol, base_url, model_id, api_key_cipher FROM ai_model WHERE user_id = ? AND is_selected = 1',
        [userId]
    );
    let cfg = null;
    if (selected && selected.platform_id) {
        // 平台托管模型：真实密钥始终留在平台表，按引用行实时取用
        const pm = await query_one(
            'SELECT protocol, base_url, model_id, api_key_cipher FROM ai_platform_model WHERE id = ? AND enabled = 1',
            [selected.platform_id]
        );
        if (pm && pm.api_key_cipher && pm.base_url && pm.model_id) {
            cfg = {
                provider: 'platform',
                protocol: pm.protocol,
                base_url: pm.base_url,
                api_key: decrypt_secret(pm.api_key_cipher),
                model: pm.model_id,
            };
        }
    } else if (selected && selected.api_key_cipher && selected.base_url && selected.model_id) {
        cfg = {
            provider: selected.provider_key,
            protocol: selected.protocol, // 接口类型随保存快照（供应商注册表后续改动不影响历史配置）
            base_url: selected.base_url,
            api_key: decrypt_secret(selected.api_key_cipher),
            model: selected.model_id,
        };
    }
    if (!cfg) {
        cfg = { provider: config.ai.provider, base_url: config.ai.base_url, api_key: config.ai.api_key, model: config.ai.model };
    }

    let answer = '';
    let degraded = false;
    let degraded_reason = '';
    const hasProvider = cfg.base_url && cfg.api_key && cfg.model;
    if (hasProvider) {
        const messages = [
            {
                role: 'system',
                content: '你是校园美食点评平台「大福食刻」的 AI 助手「福宝」。'
                    + '你只能基于用户消息中提供的平台真实数据（点位/菜品/评价摘录）进行推荐与回答，'
                    + '严禁编造不存在的店铺、菜品、价格或评分；数据不足时如实说明并建议换个问法。'
                    + '用户提到忌口时，结合候选的忌口标签严格避开。'
                    + '用简体中文回答，语气亲切自然，控制在 250 字以内。'
                    + '推荐时使用「菜品名（档口·点位名，价格，平台评分）」格式，便于学生直接找到。'
                    + '回答末尾可提醒：点击下方推荐卡可看详情，「地图找它」可查看点位位置。',
            },
            {
                role: 'user',
                content: `【用户提问】${q}\n\n【平台候选真实数据】\n${JSON.stringify(candidate_payload(dishes, stations), null, 1)}`
                    + (quotes ? `\n\n【高分评价摘录】\n${quotes}` : ''),
            },
        ];
        try {
            log.info(`[ai] user=${userId} provider=${cfg.provider} model=${cfg.model} candidates=${dishes.length}d+${stations.length}s`);
            answer = await call_llm(cfg, messages);
        } catch (e) {
            // 大模型超时/失败 → 降级规则推荐（以 degraded=true 标记降级，不抛业务码，核心链路不受影响）
            console.warn('[ai] LLM 调用失败，降级规则推荐:', e.message);
            degraded = true;
            degraded_reason = explain_llm_error(e.message);
            answer = rule_answer(dishes, stations, conds);
        }
    } else {
        // 未配置供应商 → 同降级口径：degraded=true 标记 + 规则推荐兜底
        degraded = true;
        degraded_reason = '尚未配置可用的模型（请到「模型设置」添加并测试连接）';
        answer = rule_answer(dishes, stations, conds);
    }

    // 留痕（复盘用，不阻塞主链路）
    try {
        await query(
            'INSERT INTO ai_conversation (user_id, question, parsed_conditions, recommend_ids, answer) VALUES (?, ?, ?, ?, ?)',
            [userId, q, JSON.stringify(conds), JSON.stringify(recommendations), answer]
        );
    } catch (e) {
        console.warn('[ai] 会话留痕失败:', e.message);
    }
    return { answer, recommendations, degraded, degradedReason: degraded ? degraded_reason : '' };
}

/**
 * 当前用户最近问答记录（可选扩展）
 * @param {number} userId
 */
async function history(userId) {
    return query(
        `SELECT id, question, answer, recommend_ids, created_at FROM ai_conversation
         WHERE user_id = ? ORDER BY id DESC LIMIT 20`,
        [userId]
    ).then((rows) => rows.map((r) => {
        let recs = r.recommend_ids;
        if (typeof recs === 'string') { try { recs = JSON.parse(recs); } catch { recs = []; } }
        return { id: r.id, question: r.question, answer: r.answer, recommendations: recs || [], createdAt: r.created_at };
    }));
}

/**
 * 删除单条问答记录（限定本人，防止越权删除他人记录）
 * @param {number} userId
 * @param {number} id
 */
async function delete_history_item(userId, id) {
    const r = await query('DELETE FROM ai_conversation WHERE id = ? AND user_id = ?', [Number(id), userId]);
    if (!r.affectedRows) throw err.not_found('记录不存在');
    return { deleted: r.affectedRows };
}

/**
 * 清空当前用户全部问答记录
 * @param {number} userId
 */
async function clear_history(userId) {
    const r = await query('DELETE FROM ai_conversation WHERE user_id = ?', [userId]);
    return { deleted: r.affectedRows || 0 };
}

/* ---------------- AI 供应商注册表（r45 起后台可维护，协议仅 openai / anthropic） ---------------- */

/** 支持的协议白名单 */
const PROTOCOLS = ['openai', 'anthropic'];

/**
 * 前台供应商列表（启用项，按 sort_order 排序）：下拉与文档链接数据源
 * @returns {Promise<Array<{id:number, providerKey:string, name:string, protocol:string, baseUrl:string, consoleUrl:string, modelDocUrl:string}>>}
 */
async function list_providers() {
    const rows = await query(
        'SELECT id, provider_key, name, protocol, base_url, console_url, model_doc_url FROM ai_provider WHERE enabled = 1 ORDER BY sort_order, id'
    );
    return rows.map((r) => ({
        id: Number(r.id), providerKey: r.provider_key, name: r.name, protocol: r.protocol,
        baseUrl: r.base_url || '', consoleUrl: r.console_url || '', modelDocUrl: r.model_doc_url || '',
    }));
}

/**
 * 后台供应商全量列表（含停用项）
 * @returns {Promise<Array>}
 */
async function admin_list_providers() {
    const rows = await query(
        'SELECT id, provider_key, name, protocol, base_url, console_url, model_doc_url, enabled, sort_order FROM ai_provider ORDER BY sort_order, id'
    );
    return rows.map((r) => ({
        id: Number(r.id), providerKey: r.provider_key, name: r.name, protocol: r.protocol,
        baseUrl: r.base_url || '', consoleUrl: r.console_url || '', modelDocUrl: r.model_doc_url || '',
        enabled: Number(r.enabled), sortOrder: Number(r.sort_order),
    }));
}

/**
 * 保存供应商（id 缺省=新增；编辑不改 provider_key，避免历史用户配置失联）
 * @param {Object} input - {id?, providerKey, name, protocol, baseUrl, consoleUrl, modelDocUrl, enabled, sortOrder}
 * @returns {Promise<{id:number}>}
 */
async function admin_save_provider(input) {
    const name = String(input.name || '').trim();
    if (!name || name.length > 64) throw err.invalid('供应商名称必填且 ≤64 字');
    const protocol = PROTOCOLS.includes(String(input.protocol || '')) ? String(input.protocol) : 'openai';
    const providerKey = String(input.providerKey || '').trim();
    if (!/^[a-z0-9_]{2,32}$/.test(providerKey)) throw err.invalid('供应商标识需 2-32 位小写字母/数字/下划线');
    const fields = {
        name, protocol,
        base_url: String(input.baseUrl || '').trim().slice(0, 200),
        console_url: String(input.consoleUrl || '').trim().slice(0, 300),
        model_doc_url: String(input.modelDocUrl || '').trim().slice(0, 300),
        enabled: input.enabled === undefined ? 1 : (Number(input.enabled) ? 1 : 0),
        sort_order: Number(input.sortOrder) || 0,
    };
    for (const key of ['base_url', 'console_url', 'model_doc_url']) {
        if (fields[key] && !/^https?:\/\//.test(fields[key])) throw err.invalid('链接需以 http(s):// 开头');
    }
    if (input.id) {
        // 编辑：key 唯一性排除自身
        const dup = await query_one('SELECT id FROM ai_provider WHERE provider_key = ? AND id <> ?', [providerKey, Number(input.id)]);
        if (dup) throw err.conflict('供应商标识已存在');
        await query('UPDATE ai_provider SET ? WHERE id = ?', [fields, Number(input.id)]);
        return { id: Number(input.id) };
    }
    const dup = await query_one('SELECT id FROM ai_provider WHERE provider_key = ?', [providerKey]);
    if (dup) throw err.conflict('供应商标识已存在');
    const r = await query(
        'INSERT INTO ai_provider (provider_key, name, protocol, base_url, console_url, model_doc_url, enabled, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [providerKey, fields.name, fields.protocol, fields.base_url, fields.console_url, fields.model_doc_url, fields.enabled, fields.sort_order]
    );
    return { id: Number(r.insertId) };
}

/**
 * 删除供应商（用户侧历史配置仍可保存，但下拉不再出现；协议按 openai 兜底）
 * @param {number} id
 */
async function admin_delete_provider(id) {
    await query('DELETE FROM ai_provider WHERE id = ?', [Number(id)]);
}

/* ---------------- 平台托管模型（r52 起后台配置含密钥，用户免配置直接选用） ---------------- */

/**
 * 后台平台模型全量列表（含停用项；密钥仅回显掩码）
 * @returns {Promise<Array>}
 */
async function admin_list_platform() {
    const rows = await query(
        'SELECT id, name, protocol, base_url, model_id, api_key_cipher, enabled, sort_order FROM ai_platform_model ORDER BY sort_order, id'
    );
    return rows.map((r) => ({
        id: Number(r.id), name: r.name, protocol: r.protocol, baseUrl: r.base_url || '',
        modelId: r.model_id || '', keyMasked: mask_key(decrypt_secret(r.api_key_cipher)),
        enabled: Number(r.enabled), sortOrder: Number(r.sort_order),
    }));
}

/**
 * 保存平台模型（id 缺省=新增；apiKey 留空 = 编辑时保留原密钥，新增必填）
 * @param {Object} input - {id?, name, protocol, baseUrl, modelId, apiKey?, enabled, sortOrder}
 * @returns {Promise<{id:number}>}
 */
async function admin_save_platform(input) {
    const name = String(input.name || '').trim();
    if (!name || name.length > 64) throw err.invalid('模型名称必填且 ≤64 字');
    const protocol = PROTOCOLS.includes(String(input.protocol || '')) ? String(input.protocol) : 'openai';
    const base_url = String(input.baseUrl || '').trim().slice(0, 200);
    const model_id = String(input.modelId || '').trim().slice(0, 64);
    if (!base_url || !/^https?:\/\//.test(base_url)) throw err.invalid('接口地址必填且以 http(s):// 开头');
    if (!model_id) throw err.invalid('请填写模型 ID（见官方模型接入文档）');
    const api_key = String(input.apiKey || '').trim();
    if (api_key.length > 200) throw err.invalid('API 密钥过长');
    const fields = {
        name, protocol, base_url, model_id,
        enabled: input.enabled === undefined ? 1 : (Number(input.enabled) ? 1 : 0),
        sort_order: Number(input.sortOrder) || 0,
    };
    if (input.id) {
        const old = await query_one('SELECT id FROM ai_platform_model WHERE id = ?', [Number(input.id)]);
        if (!old) throw err.not_found('平台模型不存在');
        // 编辑：密钥仅在输入新值时覆盖；名称快照同步到用户引用行（列表展示一致）
        await query('UPDATE ai_model SET display_name = ? WHERE platform_id = ?', [name, Number(input.id)]);
        await query(
            'UPDATE ai_platform_model SET ? WHERE id = ?',
            [api_key ? { ...fields, api_key_cipher: encrypt_secret(api_key) } : fields, Number(input.id)]
        );
        return { id: Number(input.id) };
    }
    if (!api_key) throw err.invalid('请填写 API 密钥');
    const r = await query(
        'INSERT INTO ai_platform_model (name, protocol, base_url, model_id, api_key_cipher, enabled, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [fields.name, fields.protocol, fields.base_url, fields.model_id, encrypt_secret(api_key), fields.enabled, fields.sort_order]
    );
    return { id: Number(r.insertId) };
}

/**
 * 删除平台模型（用户引用行一并清除，使用中状态自然回落 env 兜底）
 * @param {number} id
 */
async function admin_delete_platform(id) {
    await query('DELETE FROM ai_model WHERE platform_id = ?', [Number(id)]);
    await query('DELETE FROM ai_platform_model WHERE id = ?', [Number(id)]);
}

/* ---------------- 用户模型列表（r46 起：多套配置可切换，Trae CN 式交互） ---------------- */

/** 每用户最多可添加的模型配置数 */
const MODEL_LIMIT = 6;

/**
 * 校验并规整模型配置表单（新增/编辑共用）
 * @param {Object} input - {provider, protocol?, baseUrl, modelId, displayName, apiKey?}
 * @returns {Promise<{provider_key:string, protocol:string, base_url:string, model_id:string, display_name:string}>}
 */
async function normalize_model_input(input) {
    // 供应商必须来自注册表（后台可维护；未知 key 直接拒绝）
    const provider = String(input.provider || '').trim();
    const prov = await query_one('SELECT provider_key, protocol, base_url FROM ai_provider WHERE provider_key = ?', [provider]);
    if (!prov) throw err.invalid('未知供应商，请重新选择');
    // 接口类型：前端可手动改（默认随供应商注册表），白名单校验
    const protocol = PROTOCOLS.includes(String(input.protocol || '')) ? String(input.protocol) : prov.protocol;
    // 接口地址：留空时回落到供应商注册表（自定义端点必须手填，否则配了也用不起来）
    const base_url = String(input.baseUrl || prov.base_url || '').trim().slice(0, 200);
    const model_id = String(input.modelId || '').trim().slice(0, 64);
    const display_name = String(input.displayName || '').trim().slice(0, 64);
    if (!base_url) throw err.invalid('请填写接口地址（该供应商没有默认值，见官方文档）');
    if (!/^https?:\/\//.test(base_url)) throw err.invalid('接口地址需以 http(s):// 开头');
    if (!model_id) throw err.invalid('请填写模型 ID（见官方模型接入文档）');
    return { provider_key: provider, protocol, base_url, model_id, display_name };
}

/**
 * 密钥掩码（列表回显用，不回传明文）
 * @param {string} key
 * @returns {string}
 */
function mask_key(key) {
    return key.length > 8 ? `${key.slice(0, 4)}****${key.slice(-4)}` : (key ? '****' : '');
}

/**
 * 用户已添加模型列表（api_key 仅掩码；密文永不离开服务端）
 * 附 platform：平台托管模型（后台配置，用户免配置直接选用）
 * @param {number} userId
 * @returns {Promise<{list: Array, selectedId: number|null, platform: Array}>}
 */
async function list_models(userId) {
    // 仅取用户自配项；平台引用行（platform_id 非空）不占个人额度，单独在 platform 分组返回
    const rows = await query(
        `SELECT id, provider_key, protocol, base_url, model_id, display_name, api_key_cipher, is_selected, created_at
         FROM ai_model WHERE user_id = ? AND platform_id IS NULL ORDER BY is_selected DESC, id DESC`,
        [userId]
    );
    const list = [];
    for (const r of rows) {
        // 掩码需短暂解密；不落日志不外传明文
        const masked = mask_key(decrypt_secret(r.api_key_cipher));
        list.push({
            id: Number(r.id), provider: r.provider_key, protocol: r.protocol,
            baseUrl: r.base_url || '', modelId: r.model_id || '',
            displayName: r.display_name || '', hasKey: true, apiKeyMasked: masked,
            isSelected: Number(r.is_selected) === 1, createdAt: r.created_at,
        });
    }
    const sel = list.find((m) => m.isSelected);
    // 平台托管模型（启用项）+ 当前用户的引用/使用中状态
    const plats = await query(
        'SELECT id, name, protocol, model_id FROM ai_platform_model WHERE enabled = 1 ORDER BY sort_order, id'
    );
    const used = await query(
        'SELECT platform_id, is_selected FROM ai_model WHERE user_id = ? AND platform_id IS NOT NULL',
        [userId]
    );
    const used_map = new Map(used.map((u) => [Number(u.platform_id), Number(u.is_selected)]));
    const platform = plats.map((p) => ({
        id: Number(p.id), name: p.name, protocol: p.protocol, modelId: p.model_id || '',
        selected: used_map.get(Number(p.id)) === 1,
    }));
    return { list, selectedId: sel ? sel.id : null, platform };
}

/**
 * 新增模型配置（首个自动设为使用中；超 MODEL_LIMIT 拒绝）
 * @param {number} userId
 * @param {Object} input - {provider, protocol?, baseUrl, modelId, displayName, apiKey}
 * @returns {Promise<{id:number}>}
 */
async function add_model(userId, input) {
    const fields = await normalize_model_input(input);
    const api_key = String(input.apiKey || '').trim();
    if (!api_key) throw err.invalid('请填写 API 密钥');
    if (api_key.length > 200) throw err.invalid('API 密钥过长');
    // 个人额度只统计自配配置（平台托管模型的引用行不占额度，r89 修正）
    const cnt = await query_one('SELECT COUNT(*) AS n FROM ai_model WHERE user_id = ? AND platform_id IS NULL', [userId]);
    if (Number(cnt.n) >= MODEL_LIMIT) throw err.invalid(`最多添加 ${MODEL_LIMIT} 个模型，请先删除不用的配置`);
    // 没有任何「使用中」配置（含平台托管）时，新配置自动生效；已有使用中则不抢占（r46 口径）
    const active = await query_one('SELECT id FROM ai_model WHERE user_id = ? AND is_selected = 1', [userId]);
    const first = !active;
    const r = await query(
        `INSERT INTO ai_model (user_id, provider_key, protocol, base_url, model_id, display_name, api_key_cipher, is_selected)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [userId, fields.provider_key, fields.protocol, fields.base_url, fields.model_id, fields.display_name,
            encrypt_secret(api_key), first ? 1 : 0]
    );
    // isSelected 回传前端，便于提示「已添加并切换」还是「点使用才生效」
    return { id: Number(r.insertId), isSelected: first };
}

/**
 * 编辑模型配置（apiKey 不传或空串 = 保留原密钥；归属校验防越权）
 * @param {number} userId
 * @param {number} id
 * @param {Object} input - 同 add_model
 * @returns {Promise<{id:number}>}
 */
async function update_model(userId, id, input) {
    const own = await query_one('SELECT id FROM ai_model WHERE id = ? AND user_id = ?', [Number(id), userId]);
    if (!own) throw err.not_found('模型配置不存在');
    const fields = await normalize_model_input(input);
    const api_key = String(input.apiKey || '').trim();
    if (api_key.length > 200) throw err.invalid('API 密钥过长');
    // 密钥仅在用户输入新值时覆盖（编辑表单留空 = 保留原值）
    await query(
        'UPDATE ai_model SET ? WHERE id = ?',
        [api_key
            ? { ...fields, api_key_cipher: encrypt_secret(api_key) }
            : fields, Number(id)]
    );
    return { id: Number(id) };
}

/**
 * 删除模型配置；删的是使用中项时自动回落到剩余最新一条
 * @param {number} userId
 * @param {number} id
 */
async function delete_model(userId, id) {
    const own = await query_one('SELECT id, is_selected FROM ai_model WHERE id = ? AND user_id = ?', [Number(id), userId]);
    if (!own) throw err.not_found('模型配置不存在');
    await query('DELETE FROM ai_model WHERE id = ?', [Number(id)]);
    if (Number(own.is_selected) === 1) {
        // 回落仅限用户自配项（平台引用行不算「已添加配置」）
        const next = await query_one(
            'SELECT id FROM ai_model WHERE user_id = ? AND platform_id IS NULL ORDER BY id DESC LIMIT 1', [userId]
        );
        if (next) await query('UPDATE ai_model SET is_selected = 1 WHERE id = ?', [next.id]);
    }
}

/**
 * 切换使用中的模型（配置间互斥，单用户仅一条 is_selected=1）
 * @param {number} userId
 * @param {number} id
 */
async function select_model(userId, id) {
    const own = await query_one('SELECT id FROM ai_model WHERE id = ? AND user_id = ?', [Number(id), userId]);
    if (!own) throw err.not_found('模型配置不存在');
    await query('UPDATE ai_model SET is_selected = 0 WHERE user_id = ?', [userId]);
    await query('UPDATE ai_model SET is_selected = 1 WHERE id = ?', [Number(id)]);
}

/**
 * 选用平台托管模型：生成/激活个人引用行并互斥置为使用中（真实密钥始终留在平台表，不占个人额度）
 * @param {number} userId
 * @param {number} id - ai_platform_model.id
 */
async function select_platform_model(userId, id) {
    const pm = await query_one(
        'SELECT id, name, model_id FROM ai_platform_model WHERE id = ? AND enabled = 1',
        [Number(id)]
    );
    if (!pm) throw err.not_found('平台模型不存在或已停用');
    await query('UPDATE ai_model SET is_selected = 0 WHERE user_id = ?', [userId]);
    const own = await query_one(
        'SELECT id FROM ai_model WHERE user_id = ? AND platform_id = ?',
        [userId, Number(id)]
    );
    if (own) {
        await query('UPDATE ai_model SET is_selected = 1 WHERE id = ?', [own.id]);
    } else {
        // 引用行：名称/模型 ID 存快照供列表展示，真实配置使用时实时读平台表
        await query(
            `INSERT INTO ai_model (user_id, platform_id, provider_key, protocol, base_url, model_id, display_name, api_key_cipher, is_selected)
             VALUES (?, ?, 'platform', '', '', ?, ?, '', 1)`,
            [userId, Number(id), pm.model_id || '', pm.name || '']
        );
    }
    return { id: Number(id) };
}

/**
 * 移除平台托管模型的个人引用（取消选用）；若移除的是使用中项，回落到剩余自配最新一条
 * @param {number} userId
 * @param {number} id - ai_platform_model.id
 */
async function remove_platform_model(userId, id) {
    const own = await query_one(
        'SELECT id, is_selected FROM ai_model WHERE user_id = ? AND platform_id = ?',
        [userId, Number(id)]
    );
    if (!own) throw err.not_found('未添加该平台模型');
    await query('DELETE FROM ai_model WHERE id = ?', [own.id]);
    if (Number(own.is_selected) === 1) {
        const next = await query_one(
            'SELECT id FROM ai_model WHERE user_id = ? AND platform_id IS NULL ORDER BY id DESC LIMIT 1', [userId]
        );
        if (next) await query('UPDATE ai_model SET is_selected = 1 WHERE id = ?', [next.id]);
    }
}

module.exports = {
    ask, history, parse_conditions, delete_history_item, clear_history,
    list_providers, admin_list_providers, admin_save_provider, admin_delete_provider,
    admin_list_platform, admin_save_platform, admin_delete_platform,
    list_models, add_model, update_model, delete_model, select_model,
    select_platform_model, remove_platform_model,
    test_user_model, test_platform_model,
};
