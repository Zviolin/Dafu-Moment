/**
 * 后端启动入口：建库表（自愈）→ MinIO 桶 → DFA 词库 → 种子 → jobs → 监听
 */
const fs = require('fs');
const path = require('path');
const { create_app } = require('./app');
const { pool, query } = require('./db/pool');
const { ensure_bucket } = require('./db/minio');
const { load_dfa_from_db } = require('./utils/dfa');
const config = require('./config');
const { of } = require('./utils/logger');

const log = of('[boot]');

// Legacy entry must never add old columns into an authoritative3.0 database.
// 3.0 标记表用 location / rating_detail；check_in 自 T-01 起旧链也有（15-差距文档），不再是 3.0 独有
async function reject_db3_in_legacy() {
    const rows=await query("SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('location','rating_detail')");
    if(rows.length)throw new Error('检测到数据库3.0：旧版启动入口已停止，禁止运行旧seed或自动ALTER。请使用 npm run start:db3；前端及完整功能切换见docs/db3。');
}

/**
 * 等待 MySQL 就绪（重试 30 次 × 2s）
 */
async function wait_db() {
    for (let i = 0; i < 30; i++) {
        try {
            await query('SELECT 1');
            return;
        } catch (e) {
            log.info(`[boot] 等待 MySQL... (${i + 1})`);
            await new Promise((r) => setTimeout(r, 2000));
        }
    }
    throw new Error('MySQL 连接超时');
}

/**
 * 自愈建表：user 表不存在时执行 sql/init.sql（多语句连接）
 */
async function ensure_schema() {
    try {
        await query('SELECT 1 FROM `user` LIMIT 1');
    } catch {
        log.info('[boot] 初始化表结构...');
        const sql = fs.readFileSync(path.join(__dirname, '../sql/init.sql'), 'utf8');
        const conn = await pool.getConnection();
        try {
            // init.sql 内含 CREATE DATABASE/USE，需无 database 的连接执行；改用逐段执行
            const statements = sql.split(';').map((s) => s.trim()).filter((s) => s.length > 0);
            for (const stmt of statements) {
                if (/^USE /i.test(stmt)) continue;
                await conn.query(stmt);
            }
            log.info('[boot] 表结构初始化完成');
        } finally {
            conn.release();
        }
    }
}

/**
 * 敏感词种子（幂等写入：参数化插入避免 initdb 通道 latin1 损坏中文，每次启动补齐）
 * @returns {Promise<void>}
 */
async function seed_words() {
    const WORDS = [
        ['不好吃死全家', 3], ['加我微信', 3], ['代刷好评', 3], ['扫码进群', 3],
        ['傻逼', 2], ['垃圾窗口', 2], ['黑心商家', 2], ['厨师吃过的', 2],
        ['难吃', 1], ['踩雷', 1],
    ];
    for (const [w, lv] of WORDS) {
        await query(
            'INSERT INTO banned_word (word, level) VALUES (?, ?) ON DUPLICATE KEY UPDATE level = VALUES(level)',
            [w, lv]
        );
    }
}

/**
 * 自愈补列：canteen 缺 lat/lng 时补（老库升级，CREATE IF NOT EXISTS 不会补列）
 */
async function ensure_position_columns() {
    const rows = await query(
        `SELECT COUNT(*) AS n FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'canteen' AND COLUMN_NAME = 'lat'`
    );
    if (!rows[0].n) {
        await query('ALTER TABLE canteen ADD COLUMN lat DECIMAL(10, 6) NULL, ADD COLUMN lng DECIMAL(10, 6) NULL');
        log.info('[boot] canteen 补充 lat/lng 列');
    }
}

/**
 * 自愈补列/补表（v2.1 老库升级）：user.last_login_at / canteen.created_by+tags /
 * dish.is_recommended / review.like_count / review_like 点赞表
 * @returns {Promise<void>}
 */
async function ensure_upgrade_columns() {
    // [表, 列, 缺列时执行的 DDL]
    const upgrades = [
        ['user', 'last_login_at',
            'ALTER TABLE `user` ADD COLUMN `last_login_at` DATETIME NULL COMMENT \'最近登录时间\''],
        ['canteen', 'tags',
            'ALTER TABLE canteen ADD COLUMN `tags` JSON NULL COMMENT \'标签数组\''],
        ['canteen', 'created_by',
            'ALTER TABLE canteen ADD COLUMN `created_by` BIGINT UNSIGNED NULL COMMENT \'录入人\''],
        ['dish', 'is_recommended',
            'ALTER TABLE dish ADD COLUMN `is_recommended` TINYINT(1) NOT NULL DEFAULT 0 COMMENT \'推荐菜标记\''],
        ['review', 'like_count',
            'ALTER TABLE review ADD COLUMN `like_count` INT UNSIGNED NOT NULL DEFAULT 0 COMMENT \'点赞数\''],
    ];
    for (const [table, column, ddl] of upgrades) {
        const rows = await query(
            `SELECT COUNT(*) AS n FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
            [table, column]
        );
        if (!rows[0].n) {
            await query(ddl);
            log.info(`[boot] ${table} 补充 ${column} 列`);
        }
    }
    // r50 福大统一身份认证（SSO）：老库补 fzu 三列（fzu_uid 带唯一索引）
    const fzuCols = await query(
        `SELECT COLUMN_NAME FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'user' AND COLUMN_NAME = 'fzu_uid'`
    );
    if (!fzuCols.length) {
        await query(
            "ALTER TABLE `user` ADD COLUMN `fzu_uid` VARCHAR(16) NULL UNIQUE COMMENT '福大统一身份认证学号/工号', " +
            "ADD COLUMN `fzu_name` VARCHAR(32) NULL COMMENT 'CAS 返回真实姓名', " +
            "ADD COLUMN `fzu_verified` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '0 未认证 / 1 已绑定'"
        );
        log.info('[boot] user 补充 fzu_uid/fzu_name/fzu_verified 列');
    }
    // 点赞表（第 17 张表）
    await query(
        `CREATE TABLE IF NOT EXISTS \`review_like\` (
            \`id\` BIGINT PRIMARY KEY AUTO_INCREMENT,
            \`user_id\` BIGINT NOT NULL COMMENT '点赞人',
            \`review_id\` BIGINT NOT NULL COMMENT '被赞评价',
            \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY \`uk_user_review\` (\`user_id\`, \`review_id\`),
            KEY \`idx_review\` (\`review_id\`)
        ) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4`
    );
}

/**
 * 点位落点回填已移除（r85）：源库 Dafu-Moment 78 表 SQL 中「桃李园 / 佳客来 / 海棠园京元 / 紫竹园到口」
 * 与 3 家麦当劳都没有 map_location 记录，早期用关键词硬编码坐标回填会写入无来源的伪坐标，
 * 且每次重启都会把人工清空的坐标重新填回。现在缺失坐标一律留 NULL，由前端地图按兜底位置示意。
 */

/**
 * AI 供应商注册表（r45 起）：表 + 默认行幂等初始化（老库升级同享）
 * 后台可增改启停；前台「模型设置」供应商选择列表与文档链接数据源；协议仅 openai / anthropic 两种
 * @returns {Promise<void>}
 */
// r47 定稿 + r48 链接逐项核实修正：供应商清单收敛为国内（Trae CN 式选择列表；OpenAI 官方 / Anthropic Claude 不再内置）
// 链接口径：控制台 = 开账号/拿 API Key 的地方（非文档站）；模型接入文档 = 官方模型列表/计费页（均经 WebFetch 实际访问验证）
const AI_PROVIDERS_DEFAULT = [
    // [key, 显示名, 协议, 官方默认端点(空=自定义), 接口控制台, 模型接入文档, 排序]
    ['openai', '自定义', 'openai', '', '', '', 1],
    ['deepseek', 'DeepSeek', 'openai', 'https://api.deepseek.com', 'https://platform.deepseek.com', 'https://api-docs.deepseek.com/quick_start/pricing', 2],
    ['qwen', '通义千问 Qwen', 'openai', 'https://dashscope.aliyuncs.com/compatible-mode/v1', 'https://bailian.console.aliyun.com/', 'https://help.aliyun.com/zh/model-studio/models', 3],
    ['kimi', 'Kimi · Moonshot', 'openai', 'https://api.moonshot.cn/v1', 'https://platform.kimi.com/', 'https://platform.kimi.com/docs/models', 4],
    ['zhipu', '智谱 GLM', 'openai', 'https://open.bigmodel.cn/api/paas/v4', 'https://bigmodel.cn/console', 'https://docs.bigmodel.cn/cn/guide/start/model-overview', 5],
    ['doubao', '火山引擎 · 豆包', 'openai', 'https://ark.cn-beijing.volces.com/api/v3', 'https://console.volcengine.com/ark', 'https://www.volcengine.com/docs/82379/1330310', 6],
    ['siliconflow', '硅基流动', 'openai', 'https://api.siliconflow.cn/v1', 'https://cloud.siliconflow.cn/', 'https://docs.siliconflow.cn/cn/userguide/introduction', 10],
    ['hunyuan', '腾讯混元', 'openai', 'https://api.hunyuan.cloud.tencent.com/v1', 'https://console.cloud.tencent.com/hunyuan', 'https://cloud.tencent.com/document/product/1729', 9],
    // r49.2 补充：MiniMax（官方文档最新口径 api.minimax.cn，弃旧 minimaxi.com）+ 小米 MiMo
    // r49.4 排序对调：MiniMax/小米 提前至倒四/倒三，混元/硅基流动 后移至倒二/倒一
    ['minimax', 'MiniMax', 'openai', 'https://api.minimax.cn/v1', 'https://platform.minimaxi.com/user-center/basic-information/interface-key', 'https://platform.minimaxi.com/docs/guides/text-generation', 7],
    ['mimo', '小米 MiMo', 'openai', 'https://api.xiaomimimo.com/v1', 'https://platform.xiaomimimo.com/#/console/api-keys', 'https://mimo.mi.com/docs/zh-CN/quick-start/first-api-call', 8],
];

/** r47 收敛时移除的旧默认供应商（OpenAI 官方 / Anthropic Claude，用户明确不再内置） */
const AI_PROVIDERS_REMOVED = ['anthropic', 'openai_official'];

/**
 * 供应商注册表声明式收敛：无论新老库，boot 后均收敛到 AI_PROVIDERS_DEFAULT 目标状态
 * （逐条 INSERT IGNORE 幂等补插 + 删除移除项 + 改名「自定义」；后台手工新增的供应商不受影响）
 */
async function ensure_ai_providers() {
    await query(
        `CREATE TABLE IF NOT EXISTS \`ai_provider\` (
            \`id\` INT PRIMARY KEY AUTO_INCREMENT,
            \`provider_key\` VARCHAR(32) NOT NULL COMMENT '供应商标识（ai_model.provider_key 引用）',
            \`name\` VARCHAR(64) NOT NULL COMMENT '显示名',
            \`protocol\` VARCHAR(16) NOT NULL DEFAULT 'openai' COMMENT '协议：openai 兼容 / anthropic 原生',
            \`base_url\` VARCHAR(200) NOT NULL DEFAULT '' COMMENT '官方默认接口地址（空=自定义端点）',
            \`console_url\` VARCHAR(300) NOT NULL DEFAULT '' COMMENT '控制台/接口文档链接',
            \`model_doc_url\` VARCHAR(300) NOT NULL DEFAULT '' COMMENT '模型接入文档链接',
            \`enabled\` TINYINT(1) NOT NULL DEFAULT 1 COMMENT '是否启用',
            \`sort_order\` INT NOT NULL DEFAULT 0 COMMENT '排序（小在前）',
            UNIQUE KEY \`uk_provider_key\` (\`provider_key\`)
        ) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT 'AI 供应商注册表（后台可维护）'`
    );
    // 幂等补插默认项（key 唯一键冲突跳过，已存在项不覆盖后台的改动）
    for (const [k, name, proto, base, cUrl, mUrl, sort] of AI_PROVIDERS_DEFAULT) {
        await query(
            'INSERT IGNORE INTO ai_provider (provider_key, name, protocol, base_url, console_url, model_doc_url, enabled, sort_order) VALUES (?, ?, ?, ?, ?, ?, 1, ?)',
            [k, name, proto, base, cUrl, mUrl, sort]
        );
    }
    // r47 升级：删除不再内置的 OpenAI 官方 / Anthropic Claude；
    // 「OpenAI 兼容 · 自定义」改名「自定义」并清掉旧默认文档链接（仅匹配旧默认值，不覆盖后台自定义）
    await query('DELETE FROM ai_provider WHERE provider_key IN (?)', [AI_PROVIDERS_REMOVED]);
    await query(
        "UPDATE ai_provider SET name = '自定义', console_url = '', model_doc_url = '' " +
        "WHERE provider_key = 'openai' AND console_url = 'https://platform.openai.com/docs/api-reference'"
    );
    // r48 链接核实修正：控制台类链接原误填文档站/旧域名，仅当行内仍是旧默认值时更新（不覆盖后台自定义）
    const AI_PROVIDERS_URL_FIX = [
        // [key, 列名, 旧默认值, 修正值]
        ['deepseek', 'base_url', 'https://api.deepseek.com/v1', 'https://api.deepseek.com'],
        ['deepseek', 'console_url', 'https://api-docs.deepseek.com', 'https://platform.deepseek.com'],
        ['qwen', 'console_url', 'https://help.aliyun.com/zh/model-studio/', 'https://bailian.console.aliyun.com/'],
        ['kimi', 'console_url', 'https://platform.moonshot.cn/docs', 'https://platform.kimi.com/'],
        ['kimi', 'model_doc_url', 'https://platform.moonshot.cn/docs/introduction', 'https://platform.kimi.com/docs/models'],
        ['zhipu', 'console_url', 'https://docs.bigmodel.cn', 'https://bigmodel.cn/console'],
        ['doubao', 'console_url', 'https://www.volcengine.com/docs/82379', 'https://console.volcengine.com/ark'],
        ['siliconflow', 'console_url', 'https://cloud.siliconflow.cn/models', 'https://cloud.siliconflow.cn/'],
    ];
    for (const [k, col, oldV, newV] of AI_PROVIDERS_URL_FIX) {
        await query(`UPDATE ai_provider SET ${col} = ? WHERE provider_key = ? AND ${col} = ?`, [newV, k, oldV]);
    }
    // r49.4 排序对调：MiniMax/小米 提前至倒四/倒三，混元/硅基流动 后移（旧排序匹配才更新，幂等）
    const AI_PROVIDERS_SORT_FIX = [
        ['siliconflow', 7, 10], ['hunyuan', 8, 9], ['minimax', 9, 7], ['mimo', 10, 8],
    ];
    for (const [k, oldS, newS] of AI_PROVIDERS_SORT_FIX) {
        await query('UPDATE ai_provider SET sort_order = ? WHERE provider_key = ? AND sort_order = ?', [newS, k, oldS]);
    }
    log.info(`[boot] ai_provider 注册表已收敛（${AI_PROVIDERS_DEFAULT.length} 项国内供应商，链接已核实）`);
}

/**
 * 用户模型列表表（r46 起，Trae CN 式多配置）+ 老单份配置迁移
 * - api_key_cipher：AES-256-GCM 密文（utils/secret-box），库内无明文
 * - protocol：保存时接口类型快照（openai / anthropic），注册表后续改动不影响历史配置
 * - 迁移：user.ai_config 有完整旧配置且 ai_model 无该用户行 → 迁入并清空旧字段（单一数据源）
 */
async function ensure_ai_models() {
    await query(
        `CREATE TABLE IF NOT EXISTS \`ai_model\` (
            \`id\` BIGINT PRIMARY KEY AUTO_INCREMENT,
            \`user_id\` BIGINT NOT NULL COMMENT '归属用户',
            \`provider_key\` VARCHAR(32) NOT NULL COMMENT '供应商标识（ai_provider.provider_key）',
            \`protocol\` VARCHAR(16) NOT NULL DEFAULT 'openai' COMMENT '接口类型快照：openai 兼容 / anthropic 原生',
            \`base_url\` VARCHAR(200) NOT NULL DEFAULT '' COMMENT '接口地址',
            \`model_id\` VARCHAR(64) NOT NULL DEFAULT '' COMMENT '模型 ID（官方模型名）',
            \`display_name\` VARCHAR(64) NOT NULL DEFAULT '' COMMENT '模型展示名称（空=显示模型 ID）',
            \`api_key_cipher\` TEXT NOT NULL COMMENT 'API 密钥密文（AES-256-GCM，iv+tag+ciphertext base64）',
            \`is_selected\` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '使用中（单用户仅一条为 1）',
            \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            KEY \`idx_user\` (\`user_id\`)
        ) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT '用户 AI 模型配置列表（密钥加密存储）'`
    );
    // 老库迁移：单份自配 → 模型列表（幂等：迁移后清空 user.ai_config，二次启动无残留）
    const { encrypt_secret } = require('./utils/secret-box');
    const olds = await query(
        `SELECT u.id, u.ai_config FROM \`user\` u
         LEFT JOIN ai_model m ON m.user_id = u.id
         WHERE u.ai_config IS NOT NULL AND u.ai_config <> '' AND u.ai_config <> 'null' AND m.id IS NULL`
    );
    for (const u of olds) {
        let cfg = u.ai_config;
        if (typeof cfg === 'string') { try { cfg = JSON.parse(cfg); } catch { cfg = null; } }
        if (!cfg || typeof cfg !== 'object' || !cfg.api_key || !cfg.model) continue;
        try {
            await query(
                `INSERT INTO ai_model (user_id, provider_key, protocol, base_url, model_id, display_name, api_key_cipher, is_selected)
                 VALUES (?, ?, ?, ?, ?, '', ?, 1)`,
                [u.id, String(cfg.provider || 'openai'), 'openai', String(cfg.base_url || ''),
                    String(cfg.model || ''), encrypt_secret(String(cfg.api_key))]
            );
            await query('UPDATE `user` SET ai_config = NULL WHERE id = ?', [u.id]);
            log.info(`[boot] 用户 ${u.id} 旧 AI 配置已迁入模型列表`);
        } catch (e) {
            console.warn(`[boot] 用户 ${u.id} 旧 AI 配置迁移失败（跳过）:`, e.message);
        }
    }
}

/**
 * 启动流程
 */
async function main() {
    log.info('[boot] 大福食刻 后端启动中...');
    await wait_db();
    await reject_db3_in_legacy();
    await ensure_schema();
    await ensure_position_columns();
    await ensure_upgrade_columns();
    await ensure_ai_providers();
    await ensure_ai_models();
    await ensure_bucket(); // 桶不存在/策略失败已内部兜底
    // 封面自愈（r88）：新部署的 MinIO 是空桶，种子数据引用的封面图随镜像内置，缺什么补什么
    await require('./seed/seed-media').ensure_seed_media();
    await seed_words();
    await load_dfa_from_db(query);

    // 种子数据（库为空时执行）
    const seed = require('./seed/seed');
    await seed.seed_if_empty();

    const { start_jobs } = require('./jobs');
    await start_jobs();

    // 个性化推送调度（每日口味灵感 8 点窗口 + 周一周报；重启自愈补跑）
    const push = require('./services/push.service');
    push.start_push_scheduler();

    // 全量菜品公共贴纸自动同步（source=3 幂等补缺，人人可用；失败不阻塞启动，可经管理端点补跑）
    require('./services/sticker.service').sync_dish_stickers()
        .then((r) => log.info(`[sticker] dish sync: made=${r.made} skip=${r.skip} fail=${r.fail}`))
        .catch((e) => console.error('[sticker] startup sync failed:', e.message));

    const app = create_app();
    app.listen(config.port, () => {
        log.info(`[boot] 后端就绪：http://localhost:${config.port}/api/health`);
    });
}

main().catch((e) => {
    console.error('[boot] 启动失败:', e);
    process.exit(1);
});
