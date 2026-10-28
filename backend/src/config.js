/**
 * 全局配置：环境变量 + 数值常量表（03-详细设计 §六，全部热调项集中）
 */
const config = {
    port: Number(process.env.PORT || 3000),
    jwt_secret: process.env.JWT_SECRET || 'dafu-dev-secret',
    // 调试通道：DEBUG=true 时验证码接口附带明文 debugCode（仅联调/测试环境，生产必须关闭）
    debug: process.env.DEBUG === 'true',
    mysql: {
        host: process.env.DB_HOST || '127.0.0.1',
        port: Number(process.env.DB_PORT || 3306),
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || 'dafu_root_2026',
        database: process.env.DB_NAME || 'dafu_shike',
    },
    redis: {
        host: process.env.REDIS_HOST || '127.0.0.1',
        port: Number(process.env.REDIS_PORT || 6379),
    },
    minio: {
        host: process.env.MINIO_HOST || '127.0.0.1',
        port: Number(process.env.MINIO_PORT || 9000),
        user: process.env.MINIO_USER || 'dafu-minio',
        password: process.env.MINIO_PASSWORD || 'dafu-minio-2026',
        bucket: process.env.MINIO_BUCKET || 'dafu-images',
    },
    /**
     * AI 助手（OpenAI 兼容协议）：用户未自配时的平台默认供应商
     * 用户级配置存 user.ai_config（PUT /api/me/ai-config），请求时用户配置优先
     */
    ai: {
        provider: process.env.AI_PROVIDER || 'openai',  // openai 兼容 / anthropic（Claude 原生 /messages）
        base_url: process.env.AI_BASE_URL || '',   // 如 https://api.xxx.com/v1（不带 /chat/completions 或 /messages）
        api_key: process.env.AI_API_KEY || '',
        model: process.env.AI_MODEL || '',
        timeout_ms: Number(process.env.AI_TIMEOUT_MS || 60000), // 思考型模型（MiniMax-M3 等）首字延迟较高，默认放宽到 60s
        max_candidates: 6,      // 注入 prompt 的候选点位上限
        max_review_quotes: 2,   // 每候选摘录的评价条数（评价即知识库）
    },
    /**
     * 福大统一身份认证（CAS 协议双模式，r51）：
     * base_url + service 均配置 → 真实 CAS 3.0 流程（302 跳学校登录页 → ticket 回调 → serviceValidate 校验）；
     * 任一缺失 → 演示桩模式（学号 + 口令模拟校验，答辩如实说明）
     * 真实接入需向福大网信办申请应用注册（service 回调白名单），凭证下来填入即可切换
     */
    fzu_cas: {
        base_url: process.env.FZU_CAS_BASE_URL || '',   // 如 https://sso.fzu.edu.cn/cas 或 https://id.fzu.edu.cn/authserver
        service: process.env.FZU_CAS_SERVICE || '',     // 校方回调地址，如 https://your-domain/auth/fzu/callback
        validate_path: process.env.FZU_CAS_VALIDATE_PATH || '/serviceValidate', // CAS 2.0 默认；CAS 3.0 为 /p3/serviceValidate
        timeout_ms: Number(process.env.FZU_CAS_TIMEOUT_MS || 10000), // ticket 校验 HTTP 超时
    },
    /**
     * 自动抠图微服务（r52 手账贴纸）：rembg(U2Net) sidecar 容器
     * POST {url}/extract (multipart file) → 透明底贴纸 PNG
     */
    matting: {
        url: process.env.MATTING_URL || 'http://matting:8000',
        timeout_ms: Number(process.env.MATTING_TIMEOUT_MS || 30000),
    },
    /**
     * 数值常量表（编码口径冻结，测试期可调）
     */
    numbers: {
        // 聚合口径：对已发布评价做普通平均，无加权无衰减
        MIN_SAMPLES: 3,         // 高分口碑门槛：样本 < 3 不进高分口碑
        DIM_CACHE_TTL_MS: 60000, // 维度配置内存缓存
        // 上传链路
        UPLOAD_MAX_BYTES: 5 * 1024 * 1024, // 单图上传上限 5MB（multer 与 media.service 共用）
        DHASH_HAMMING: 5,       // 上传判重 dHash 汉明距离阈值（media.service 专用）
        // 频控
        REVIEW_PER_H: 10,       // 发布/修改评价 次/时/人
        VOTE_PER_H: 60,         // 投票 次/时/人
        UPLOAD_PER_H: 30,       // 上传 张/时/人
        AI_PER_H: 20,           // AI 提问 次/时/人
        POINT_SUBMIT_PER_H: 5,  // 点位提交 次/时/人
        // 打卡（15-差距文档 T-01；AC10）
        CHECKIN_PHOTOS_MAX: 9,  // 单次打卡图片上限（「另记一条」合并后同样受此限）
        // 收藏分组（15-差距文档 T-09；AC06）
        FAVORITE_GROUP_MAX: 20, // 每人自定义分组上限
        FAVORITE_GROUP_NAME_MAX: 32, // 分组名长度上限（字）
        EXPORT_PER_H: 3,        // 个人数据导出 次/时/人
        COMMENT_PER_H: 30,      // 发表评论 次/时/人
        TASK_CLAIM_PER_H: 30,   // 任务领取 次/时/人
        FOLLOW_PER_H: 60,       // 关注/取关 次/时/人
        // 通知合并窗口：同类型通知在该小时内聚合为一条
        NOTIFY_MERGE_HOURS: 24,
        // 口味画像（T-12）：行为样本不足不强行生成；单次最多读取的样本数
        TASTE_MIN_SAMPLES: 5,
        TASTE_MAX_SAMPLES: 200,
        // 草稿箱（T-17）：每用户草稿上限与单份 payload 字节上限
        DRAFT_MAX: 100,
        DRAFT_PAYLOAD_MAX_BYTES: 64 * 1024,
        DRAFT_SUMMARY_LEN: 80,
        // 关注/粉丝列表单次返回上限（T-14）
        FOLLOW_LIST_MAX: 200,
        // 评论列表单次返回上限（T-18）
        COMMENT_LIST_MAX: 200,
        COMMENT_MAX_LEN: 300,
        // 成长任务目标（T-20）：按 action_type 映射，1 打卡/2 点评/3 喂食/4 收藏/5 互动/6 分享
        GROWTH_TARGETS: { 1: 10, 2: 20, 3: 3, 4: 8, 5: 50, 6: 3 },
        // 头衔贡献分权重（T-21）：评价/获赞/收藏/打卡/点亮点位
        CONTRIB_WEIGHTS: { review: 10, like: 2, favorite: 1, checkin: 5, spot: 3 },
        // 头衔档位（T-21）：min 为进入该档所需贡献分
        TITLE_TIERS: [
            { min: 0, name: '美食新客' },
            { min: 60, name: '校园食探' },
            { min: 150, name: '风味向导' },
            { min: 350, name: '食堂老饕' },
            { min: 700, name: '知食份子' },
        ],
    },
};

module.exports = config;
