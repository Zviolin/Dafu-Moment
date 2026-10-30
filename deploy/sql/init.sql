-- =====================================================================
-- 大福食刻 · MySQL 初始化脚本（35 表，依据 03-详细设计 §二 v2.0 + 15-差距文档 T-01/T-09）
-- 引擎 InnoDB / utf8mb4；时间一律 DATETIME（服务器时间）
-- v2.0 口径：点位四类型（canteen.type）+ 维度配置驱动分项评分 + AI 会话留痕
--           删除排队热度 / 榜单快照旧表；收藏仅保留「想吃」语义
-- v2.1 口径：user.last_login_at / canteen.created_by+tags / dish.is_recommended /
--           review.like_count + review_like 点赞表（03 §2 表设计补齐）
-- v2.2 口径：check_in 打卡表（一人一点位一天一条，uk_check_in_dup 幂等硬约束）+
--           journal.check_in_id 可空列（15-差距文档 T-01；AC10/AC11/AC12）
-- v2.3 口径：favorite_group 收藏分组表 + favorite.group_id 可空列，
--           favorite.list_type 扩 0 想吃 / 1 常吃 / 2 自定义（须配 group_id）
--           （15-差距文档 T-09；AC06；表名/列名照设计文档 favorite_group 原名）
-- v2.4 口径：canteen.type 扩第 5 类「外卖」（值 4；15-差距文档 AC01），
--           列仍 TINYINT 无需扩宽，仅注释口径更新；review_dimension.applicable_types 同步含 4
-- v2.5 口径：station 加导览坐标 lat/lng（GCJ-02，可空；15-差距文档 T-31；AC08/G10），
--           /points/map 标记带 kind（canteen/station）出档口级标记；不落设计文档 map_location 表
-- 注意：中文数据行一律由 seed.js 参数化插入（initdb 通道按 latin1 解析会损坏中文）
-- =====================================================================

-- 连接字符集（r81）：initdb 通道（docker-entrypoint 的 mysql CLI）默认按 latin1 解析脚本，
-- 不加这行会把 DDL 里的中文默认值写成乱码（pet.name「小福宝」/ canteen.campus「旗山校区」/ dish.price_unit「元」）
SET NAMES utf8mb4;

CREATE DATABASE IF NOT EXISTS dafu DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
USE dafu;

-- 1. 用户表
CREATE TABLE IF NOT EXISTS `user` (
    `id` BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT '主键标识',
    `username` VARCHAR(32) NOT NULL UNIQUE COMMENT '登录名',
    `password` VARCHAR(72) NOT NULL COMMENT 'bcryptjs',
    `nickname` VARCHAR(32) NOT NULL COMMENT '展示名',
    `email` VARCHAR(128) NULL COMMENT '邮箱（个人资料选填）',
    `avatar` TINYINT NOT NULL DEFAULT 0 COMMENT '预设头像编号',
    `avatar_object_key` VARCHAR(255) NULL COMMENT '自定义头像 MinIO objectKey',
    `fzu_uid` VARCHAR(16) NULL UNIQUE COMMENT '福大统一身份认证学号/工号（绑定后唯一，SSO 登录凭据）',
    `fzu_name` VARCHAR(32) NULL COMMENT 'CAS 返回的真实姓名（福大认证头衔展示）',
    `fzu_verified` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '0 未认证 / 1 已绑定福大统一身份认证',
    `ai_config` JSON NULL COMMENT 'AI 自定义配置 {baseUrl,apiKey,model}（OpenAI 兼容）',
    `role` TINYINT NOT NULL DEFAULT 0 COMMENT '0 学生 / 1 管理员',
    `status` TINYINT NOT NULL DEFAULT 0 COMMENT '0 正常 / 1 禁言 / 2 封禁',
    `muted_until` DATETIME NULL COMMENT '禁言到期时间',
    `last_login_at` DATETIME NULL COMMENT '最近登录时间（登录成功写入）',
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '注册时间（审计/看板趋势基准）'
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;

-- 2. 点位表（校内食堂 + 永嘉天地 + 学生街 + 周边其他 + 外卖统一建模，type 区分）
CREATE TABLE IF NOT EXISTS `canteen` (
    `id` INT PRIMARY KEY AUTO_INCREMENT COMMENT '主键标识',
    `name` VARCHAR(64) NOT NULL UNIQUE COMMENT '如「旗山校区·京元餐厅」',
    `type` TINYINT NOT NULL DEFAULT 0 COMMENT '0 校内食堂 / 1 永嘉天地 / 2 学生街 / 3 周边其他 / 4 外卖（AC01）',
    `campus` VARCHAR(32) NOT NULL DEFAULT '旗山校区' COMMENT '所属校区',
    `location` VARCHAR(128) NOT NULL DEFAULT '' COMMENT '楼栋/方位描述',
    `avg_price` DECIMAL(6, 1) NULL COMMENT '人均消费（元）',
    `business_hours` VARCHAR(64) NULL COMMENT '营业时间（真实公开资料口径，如 06:00-19:30；无资料为 NULL）',
    `lat` DECIMAL(10, 6) NULL COMMENT '地图纬度（GCJ-02 火星坐标，后台拖拽校准）',
    `lng` DECIMAL(10, 6) NULL COMMENT '地图经度（GCJ-02 火星坐标，后台拖拽校准）',
    `cover_object_key` VARCHAR(255) NULL COMMENT 'MinIO objectKey',
    `tags` JSON NULL COMMENT '标签数组，如 ["清真","平价"]，忌口筛选与推荐用',
    `created_by` BIGINT UNSIGNED NULL COMMENT '录入人（后台创建记管理员 / 提交审核通过记提交人）',
    `enabled` TINYINT NOT NULL DEFAULT 1 COMMENT '上下架开关：1 在架 / 0 下架'
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;

-- 3. 档口表（食堂档口 / 商铺默认档口）
CREATE TABLE IF NOT EXISTS `station` (
    `id` INT PRIMARY KEY AUTO_INCREMENT COMMENT '主键标识',
    `canteen_id` INT NOT NULL COMMENT '所属点位ID（canteen.id）',
    `name` VARCHAR(64) NOT NULL COMMENT '如「三楼麻辣香锅」',
    `category` VARCHAR(32) NOT NULL DEFAULT '' COMMENT '品类（筛选用）',
    `cover_object_key` VARCHAR(255) NULL COMMENT '封面图 MinIO objectKey',
    `status` TINYINT NOT NULL DEFAULT 0 COMMENT '0 营业 / 1 休摊 / 2 下架',
    `manager_user_id` BIGINT NULL COMMENT '档口负责人',
    `lat` DECIMAL(10, 6) NULL COMMENT '导览纬度（GCJ-02；档口级地图标记用，NULL 则不出档口标记）',
    `lng` DECIMAL(10, 6) NULL COMMENT '导览经度（GCJ-02；同上）',
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    KEY `idx_canteen` (`canteen_id`, `status`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;

-- 4. 菜品表（评价第一公民）
CREATE TABLE IF NOT EXISTS `dish` (
    `id` INT PRIMARY KEY AUTO_INCREMENT COMMENT '主键标识',
    `station_id` INT NOT NULL COMMENT '所属档口ID（station.id）',
    `name` VARCHAR(64) NOT NULL COMMENT '名称',
    `price` DECIMAL(6, 1) NOT NULL DEFAULT 0 COMMENT '元',
    `price_unit` VARCHAR(16) NOT NULL DEFAULT '元' COMMENT '价格单位：元/份/个…',
    `is_estimated` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '1=价格为依据公开人均估算（真实商铺数据无逐菜标价时）',
    `taste_tags` VARCHAR(128) NOT NULL DEFAULT '' COMMENT '口味：偏辣,少油…',
    `taboo_tags` VARCHAR(128) NOT NULL DEFAULT '' COMMENT '忌口：清真,素食,无香菜,无葱蒜',
    `is_recommended` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '推荐菜标记（管理员标记/聚合修正）',
    `cover_object_key` VARCHAR(255) NULL COMMENT '封面图MinIO对象键',
    `status` TINYINT NOT NULL DEFAULT 0 COMMENT '0 在售 / 1 下架',
    `first_seen_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '上新时间（新品排序口径）',
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    KEY `idx_station` (`station_id`, `status`),
    KEY `idx_price` (`status`, `price`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;

-- 5. 评分维度配置表（分项评分由配置驱动，前端按点位类型动态渲染）
CREATE TABLE IF NOT EXISTS `review_dimension` (
    `id` INT PRIMARY KEY AUTO_INCREMENT COMMENT '主键标识',
    `dimension_key` VARCHAR(32) NOT NULL UNIQUE COMMENT '维度键，写入 review.dimension_scores',
    `dimension_name` VARCHAR(32) NOT NULL COMMENT '展示名，如「口味」',
    `applicable_types` JSON NOT NULL COMMENT '适用的点位类型数组，如 [0,1,2,3,4]',
    `weight` DECIMAL(3, 2) NOT NULL DEFAULT 1.00 COMMENT '聚合总分权重',
    `sort` INT NOT NULL DEFAULT 0 COMMENT '表单展示顺序'
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;

-- 6. 评价表（多态评价，核心表；分项得分 JSON + 权重加权总分）
CREATE TABLE IF NOT EXISTS `review` (
    `id` BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT '主键标识',
    `user_id` BIGINT NOT NULL COMMENT '所属用户ID（user.id）',
    `subject_type` TINYINT NOT NULL COMMENT '0 菜品 / 1 档口 / 2 点位',
    `subject_id` INT NOT NULL COMMENT '目标ID，由subject_type指定目标表',
    `overall_score` DECIMAL(2, 1) NOT NULL COMMENT '总分 = Σ(分项×权重)/Σ权重，1.0-5.0',
    `dimension_scores` JSON NOT NULL COMMENT '分项得分，如 {"taste":5,"portion":4}，键须过维度适用性校验',
    `content` VARCHAR(1000) NOT NULL DEFAULT '' COMMENT '文字',
    `is_anonymous` TINYINT NOT NULL DEFAULT 0 COMMENT '匿名同学',
    `tags` VARCHAR(128) NOT NULL DEFAULT '' COMMENT '推荐,踩雷,量大…',
    `status` TINYINT NOT NULL DEFAULT 0 COMMENT '0 已发布 / 1 待人工 / 2 已下架 / 3 已驳回',
    `status_reason` VARCHAR(200) NOT NULL DEFAULT '' COMMENT '处置理由（通知用户用）',
    `up_count` INT NOT NULL DEFAULT 0 COMMENT '有用投票（冗余计数）',
    `down_count` INT NOT NULL DEFAULT 0 COMMENT '没用投票（冗余计数）',
    `like_count` INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '点赞数（review_like 冗余计数）',
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    UNIQUE KEY `uk_one_review` (`user_id`, `subject_type`, `subject_id`) COMMENT '一人一对象一条（防刷硬约束）',
    KEY `idx_list` (`subject_type`, `subject_id`, `status`, `created_at`),
    KEY `idx_user` (`user_id`, `created_at`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;

-- 7. 评价图片表
CREATE TABLE IF NOT EXISTS `review_image` (
    `id` BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT '主键标识',
    `review_id` BIGINT NOT NULL COMMENT '所属评价ID（review.id）',
    `object_key` VARCHAR(255) NOT NULL COMMENT 'MinIO 路径',
    `status` TINYINT NOT NULL DEFAULT 0 COMMENT '0 正常 / 1 违规（连带评价下架）',
    KEY `idx_review` (`review_id`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;

-- 8. 聚合表（读路径主力，多态；对已发布评价做普通平均，无加权无衰减）
CREATE TABLE IF NOT EXISTS `review_summary` (
    `subject_type` TINYINT NOT NULL COMMENT '目标类型：0菜品、1档口、2点位',
    `subject_id` INT NOT NULL COMMENT '目标ID，由subject_type指定目标表',
    `review_count` INT NOT NULL DEFAULT 0 COMMENT '已发布数',
    `sum_score` DECIMAL(10, 2) NOT NULL DEFAULT 0 COMMENT 'Σ overall_score',
    `rating_avg` DECIMAL(3, 2) NOT NULL DEFAULT 0 COMMENT '普通平均分',
    `dim_sums` JSON NULL COMMENT '分项求和 {"taste":48,…}，均分 = dim_sums/review_count',
    `hist_1` INT NOT NULL DEFAULT 0 COMMENT '四舍五入后归入1星桶的已发布评价数',
    `hist_2` INT NOT NULL DEFAULT 0 COMMENT '四舍五入后归入2星桶的已发布评价数',
    `hist_3` INT NOT NULL DEFAULT 0 COMMENT '四舍五入后归入3星桶的已发布评价数',
    `hist_4` INT NOT NULL DEFAULT 0 COMMENT '四舍五入后归入4星桶的已发布评价数',
    `hist_5` INT NOT NULL DEFAULT 0 COMMENT '四舍五入后归入5星桶的已发布评价数',
    `recalc_at` DATETIME NULL COMMENT '最近重算时间（观测漂移）',
    PRIMARY KEY (`subject_type`, `subject_id`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;

-- 9. 收藏表（一对象一条；T-09 起三分组：想吃 / 常吃 / 自定义）
CREATE TABLE IF NOT EXISTS `favorite` (
    `user_id` BIGINT NOT NULL COMMENT '所属用户ID（user.id）',
    `subject_type` TINYINT NOT NULL COMMENT '目标类型：0菜品、1档口、2点位',
    `subject_id` INT NOT NULL COMMENT '目标ID，由subject_type指定目标表',
    `list_type` TINYINT NOT NULL DEFAULT 0 COMMENT '0 想吃 / 1 常吃 / 2 自定义（须配 group_id）（15-差距文档 T-09 扩展）',
    `group_id` BIGINT NULL COMMENT '自定义分组ID（favorite_group.id；list_type=2 时必填，其余为 NULL）',
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    PRIMARY KEY (`user_id`, `subject_type`, `subject_id`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;

-- 9.1 点赞表（v2.1 补齐：一人一赞，review.like_count 冗余计数的数据源）
CREATE TABLE IF NOT EXISTS `review_like` (
    `id` BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT '主键标识',
    `user_id` BIGINT NOT NULL COMMENT '点赞人',
    `review_id` BIGINT NOT NULL COMMENT '被赞评价',
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    UNIQUE KEY `uk_user_review` (`user_id`, `review_id`) COMMENT '一人一赞硬约束',
    KEY `idx_review` (`review_id`) COMMENT '按评价聚合点赞人与计数'
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;

-- 10. 举报表
CREATE TABLE IF NOT EXISTS `report` (
    `id` BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT '主键标识',
    `reporter_id` BIGINT NOT NULL COMMENT '举报人ID（user.id）',
    `subject_type` TINYINT NOT NULL COMMENT '举报目标类型（既有接口允许0、1、2；目标映射按业务接口）',
    `subject_id` INT NOT NULL COMMENT '此处为 review.id',
    `reason` TINYINT NOT NULL COMMENT '1 垃圾广告 / 2 人身攻击 / 3 虚假信息 / 4 抄袭搬运 / 5 其他',
    `detail` VARCHAR(300) NOT NULL DEFAULT '' COMMENT '举报补充说明',
    `status` VARCHAR(16) NOT NULL DEFAULT 'open' COMMENT 'open/resolved/rejected',
    `handled_by` BIGINT NULL COMMENT '处理管理员ID（user.id），未处理时为空',
    `handled_at` DATETIME NULL COMMENT '处理时间，未处理时为空',
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    KEY `idx_status` (`status`, `created_at`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;

-- 11. 档口动态公告表
CREATE TABLE IF NOT EXISTS `station_post` (
    `id` BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT '主键标识',
    `station_id` INT NOT NULL COMMENT '所属档口ID（station.id）',
    `author_id` BIGINT NOT NULL COMMENT '公告作者ID（user.id）',
    `type` VARCHAR(16) NOT NULL COMMENT 'new_dish/menu_change/away/promo',
    `content` VARCHAR(200) NOT NULL COMMENT '正文内容',
    `starts_at` DATETIME NULL COMMENT '生效开始时间',
    `ends_at` DATETIME NULL COMMENT '生效结束时间',
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    KEY `idx_station` (`station_id`, `created_at`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;

-- 12. 敏感词表（DFA 词库源；1 替换后发布 / 2、3 转人工审核）
CREATE TABLE IF NOT EXISTS `banned_word` (
    `id` INT PRIMARY KEY AUTO_INCREMENT COMMENT '主键标识',
    `word` VARCHAR(64) NOT NULL UNIQUE COMMENT '敏感词文本',
    `level` TINYINT NOT NULL COMMENT '1 替换 / 2 进人工 / 3 进人工（严重）'
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;

-- 13. 通知表（处置/申诉/举报结果）
CREATE TABLE IF NOT EXISTS `notification` (
    `id` BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT '主键标识',
    `user_id` BIGINT NOT NULL COMMENT '所属用户ID（user.id）',
    `type` VARCHAR(32) NOT NULL COMMENT 'audit/mute/ban/report/reply/appeal',
    `title` VARCHAR(100) NOT NULL COMMENT '通知标题',
    `content` VARCHAR(500) NOT NULL DEFAULT '' COMMENT '正文内容',
    `ref_type` VARCHAR(32) NULL COMMENT '关联业务类型',
    `ref_id` BIGINT NULL COMMENT '关联业务记录ID，由ref_type指定含义',
    `read_at` DATETIME NULL COMMENT '已读时间，未读时为空',
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    KEY `idx_user` (`user_id`, `created_at`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;

-- 14. 档口负责人回应表（1:1）
CREATE TABLE IF NOT EXISTS `review_reply` (
    `id` BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT '主键标识',
    `review_id` BIGINT NOT NULL UNIQUE COMMENT '所属评价ID（review.id）',
    `user_id` BIGINT NOT NULL COMMENT '所属用户ID（user.id）',
    `content` VARCHAR(500) NOT NULL COMMENT '正文内容',
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间'
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;

-- 15. 点位提交审核表（用户提交新点位/档口/菜品，管理员审核后写入主表）
CREATE TABLE IF NOT EXISTS `point_submit` (
    `id` BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT '主键标识',
    `submitter_id` BIGINT NOT NULL COMMENT '提交人',
    `submit_type` TINYINT NOT NULL COMMENT '0 点位 / 1 档口 / 2 菜品',
    `target_id` INT NULL COMMENT '挂靠对象（提交档口时为点位 ID，提交菜品时为档口 ID）',
    `payload` JSON NOT NULL COMMENT '提交内容（结构同对应主表字段）',
    `audit_status` TINYINT NOT NULL DEFAULT 0 COMMENT '0 待审 / 1 通过 / 2 驳回',
    `auditor_id` BIGINT NULL COMMENT '审核管理员',
    `audit_comment` VARCHAR(255) NOT NULL DEFAULT '' COMMENT '审核意见',
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    KEY `idx_status` (`audit_status`, `created_at`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;

-- 16. AI 会话表（AI 助手问答留痕，仅复盘用不参与核心链路）
CREATE TABLE IF NOT EXISTS `ai_conversation` (
    `id` BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT '主键标识',
    `user_id` BIGINT NOT NULL COMMENT '所属用户ID（user.id）',
    `question` VARCHAR(500) NOT NULL COMMENT '自然语言提问',
    `parsed_conditions` JSON NULL COMMENT '解析出的条件（口味/价格/忌口）',
    `recommend_ids` JSON NULL COMMENT '命中平台对象 [{subjectType,subjectId,name}]',
    `answer` TEXT NULL COMMENT '模型返回的建议文本',
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    KEY `idx_user` (`user_id`, `created_at`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;

-- AI 供应商注册表（r45：后台可维护；默认 7 项由后端启动幂等种子写入，此处只建表）
CREATE TABLE IF NOT EXISTS `ai_provider` (
    `id` INT PRIMARY KEY AUTO_INCREMENT COMMENT '主键标识',
    `provider_key` VARCHAR(32) NOT NULL COMMENT '供应商标识（存 user.ai_config.provider）',
    `name` VARCHAR(64) NOT NULL COMMENT '显示名',
    `protocol` VARCHAR(16) NOT NULL DEFAULT 'openai' COMMENT '协议：openai 兼容 / anthropic 原生',
    `base_url` VARCHAR(200) NOT NULL DEFAULT '' COMMENT '官方默认接口地址（空=自定义端点）',
    `console_url` VARCHAR(300) NOT NULL DEFAULT '' COMMENT '控制台/接口文档链接',
    `model_doc_url` VARCHAR(300) NOT NULL DEFAULT '' COMMENT '模型接入文档链接',
    `enabled` TINYINT(1) NOT NULL DEFAULT 1 COMMENT '是否启用',
    `sort_order` INT NOT NULL DEFAULT 0 COMMENT '排序（小在前）',
    UNIQUE KEY `uk_provider_key` (`provider_key`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT 'AI 供应商注册表（后台可维护）';

-- 18. 用户 AI 模型配置列表（r46 起，Trae CN 式多配置；默认行无需种子，用户自行添加）
-- api_key_cipher 为 AES-256-GCM 密文（utils/secret-box），库内无明文密钥
-- platform_id 非空 = 选用平台托管模型的个人引用行（名称/模型 ID 存快照，真实密钥留在 ai_platform_model）
CREATE TABLE IF NOT EXISTS `ai_model` (
    `id` BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT '主键标识',
    `user_id` BIGINT NOT NULL COMMENT '归属用户',
    `platform_id` BIGINT NULL COMMENT '平台托管模型引用（ai_platform_model.id，非空=引用行）',
    `provider_key` VARCHAR(32) NOT NULL COMMENT '供应商标识（ai_provider.provider_key，引用行固定 platform）',
    `protocol` VARCHAR(16) NOT NULL DEFAULT 'openai' COMMENT '接口类型快照：openai 兼容 / anthropic 原生',
    `base_url` VARCHAR(200) NOT NULL DEFAULT '' COMMENT '接口地址',
    `model_id` VARCHAR(64) NOT NULL DEFAULT '' COMMENT '模型 ID（官方模型名）',
    `display_name` VARCHAR(64) NOT NULL DEFAULT '' COMMENT '模型展示名称（空=显示模型 ID）',
    `api_key_cipher` TEXT NOT NULL COMMENT 'API 密钥密文（AES-256-GCM，iv+tag+ciphertext base64）',
    `is_selected` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '使用中（单用户仅一条为 1）',
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    KEY `idx_user` (`user_id`),
    KEY `idx_platform` (`platform_id`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT '用户 AI 模型配置列表（密钥加密存储）';

-- 19. 平台托管 AI 模型（r52 起：后台配置含密钥，前台用户免配置直接选用；密钥永不下发前端）
CREATE TABLE IF NOT EXISTS `ai_platform_model` (
    `id` BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT '主键标识',
    `name` VARCHAR(64) NOT NULL COMMENT '展示名称',
    `protocol` VARCHAR(16) NOT NULL DEFAULT 'openai' COMMENT '协议：openai 兼容 / anthropic 原生',
    `base_url` VARCHAR(200) NOT NULL COMMENT '接口地址',
    `model_id` VARCHAR(64) NOT NULL COMMENT '模型 ID（官方模型名）',
    `api_key_cipher` TEXT NOT NULL COMMENT 'API 密钥密文（AES-256-GCM，iv+tag+ciphertext base64）',
    `enabled` TINYINT(1) NOT NULL DEFAULT 1 COMMENT '是否启用（停用后用户端即刻隐藏/失效回落）',
    `sort_order` INT NOT NULL DEFAULT 0 COMMENT '排序（小在前）',
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间'
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT '平台托管 AI 模型（后台配置，用户直接选用）';

-- 20. 个人贴图库（r52 手账贴纸）：商家菜品图自动抠图 / 用户上传抠图，MinIO 存透明 PNG
CREATE TABLE IF NOT EXISTS `sticker` (
    `id` BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键标识',
    `user_id` BIGINT NOT NULL COMMENT '所属用户ID（user.id）',
    `name` VARCHAR(64) NOT NULL DEFAULT '' COMMENT '贴纸名（默认菜品/文件名）',
    `object_key` VARCHAR(255) NOT NULL COMMENT 'MinIO 对象键（透明 PNG）',
    `source` TINYINT NOT NULL DEFAULT 0 COMMENT '0 用户上传抠图 / 1 收藏自动抠图',
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    KEY `idx_user` (`user_id`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT '个人贴图库（手账贴纸素材）';

-- 21. 美食手账（r52 手账编辑器）：bg 背景样式 + layout 块 JSON（贴纸/文字块，含位置缩放旋转）
CREATE TABLE IF NOT EXISTS `journal` (
    `id` BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键标识',
    `user_id` BIGINT NOT NULL COMMENT '所属用户ID（user.id）',
    `title` VARCHAR(64) NOT NULL DEFAULT '' COMMENT '手账标题',
    `date` DATE NOT NULL COMMENT '手账对应日期',
    `text` TEXT NULL COMMENT '正文随笔',
    `bg` TINYINT NOT NULL DEFAULT 0 COMMENT '纸面背景样式 0 米纸网格 / 1 点阵 / 2 牛皮纸 / 3 自定义图片',
    `bg_src` VARCHAR(255) NULL COMMENT 'bg=3 自定义背景图 /img/ 路径',
    `layout` JSON NOT NULL COMMENT '画布块数组 [{kind,sticker,x,y,w,rot,text,color,size}]（画布 750x1000）',
    `cover` VARCHAR(255) NULL COMMENT '封面贴纸对象键（列表缩略）',
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    `check_in_id` BIGINT NULL COMMENT '关联打卡（check_in.id，可空；15-差距文档 T-01 补列）',
    KEY `idx_user_date` (`user_id`, `date`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT '美食手账（贴纸排版画布）';

-- 22. 打卡表（15-差距文档 T-01；03 §5.9；AC10/AC11/AC12）
CREATE TABLE IF NOT EXISTS `check_in` (
    `id` BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT '主键标识',
    `user_id` BIGINT NOT NULL COMMENT '打卡人（user.id）',
    `canteen_id` INT NOT NULL COMMENT '打卡点位（canteen.id；设计文档 location_id 的落库映射）',
    `check_in_date` DATE NOT NULL COMMENT '打卡日期（+08:00 当日，应用层生成 YYYY-MM-DD 写入）',
    `visibility` TINYINT NOT NULL DEFAULT 1 COMMENT '可见范围：1 公开 / 2 仅自己 / 3 匿名',
    `note` VARCHAR(200) NOT NULL DEFAULT '' COMMENT '打卡备注',
    `photos` JSON NULL COMMENT '图片 objectKey 数组（MinIO 键，不存 URL，最多 9 张）',
    `dish_ids` JSON NULL COMMENT '关联菜品 id 数组（「另记一条」往这里追加，不新建记录）',
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    UNIQUE KEY `uk_check_in_dup` (`user_id`, `canteen_id`, `check_in_date`) COMMENT '一人一点位一天一条（幂等硬约束；删除为物理删，软删会占住唯一键挡住当天再打卡）',
    KEY `idx_user_date` (`user_id`, `check_in_date`) COMMENT '日历聚合与统计查询'
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT '打卡（一人一点位一天一条）';

-- 23. 收藏分组表（15-差距文档 T-09；AC06；表名/列名照设计文档 favorite_group 原名）
-- 口径登记：「想吃」「常吃」为 favorite.list_type 内置语义（0/1），不落本表；
--           3.0 设计的 is_default/deleted_at 旧链不落（内置组不走表、删除为物理删，组内收藏回落「想吃」）
CREATE TABLE IF NOT EXISTS `favorite_group` (
    `id` BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT '分组标识',
    `user_id` BIGINT NOT NULL COMMENT '分组归属用户（user.id）',
    `group_name` VARCHAR(64) NOT NULL COMMENT '分组名（自定义）',
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    UNIQUE KEY `uk_favorite_group` (`user_id`, `group_name`) COMMENT '同人组名唯一（创建幂等硬约束）'
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT '收藏自定义分组';

-- 24. 成长任务定义（T-20）
CREATE TABLE IF NOT EXISTS `task` (
    `id` INT PRIMARY KEY AUTO_INCREMENT COMMENT '主键标识',
    `task_type` TINYINT NOT NULL COMMENT '1 每日 / 2 成长',
    `name` VARCHAR(64) NOT NULL COMMENT '任务名',
    `description` VARCHAR(200) NOT NULL DEFAULT '' COMMENT '任务说明',
    `action_type` TINYINT NOT NULL COMMENT '1 打卡 / 2 点评 / 3 喂食 / 4 收藏 / 5 互动 / 6 分享',
    `reward_coins` INT NOT NULL DEFAULT 0 COMMENT '奖励金币',
    `enabled` TINYINT NOT NULL DEFAULT 1 COMMENT '1 启用',
    `sort` INT NOT NULL DEFAULT 0 COMMENT '展示顺序',
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间'
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT '成长任务定义';

-- 25. 任务领取记录（每日任务按 claim_date 幂等；成长任务只领一次）
CREATE TABLE IF NOT EXISTS `task_claim` (
    `id` BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT '主键标识',
    `user_id` BIGINT NOT NULL COMMENT '用户ID',
    `task_id` INT NOT NULL COMMENT '任务ID',
    `claim_date` DATE NOT NULL COMMENT '领取日期（每日任务按天幂等）',
    `status` TINYINT NOT NULL DEFAULT 1 COMMENT '1 已完成待领 / 2 已领取',
    `completed_at` DATETIME NULL COMMENT '完成时间',
    `claimed_at` DATETIME NULL COMMENT '领取时间',
    UNIQUE KEY `uk_claim` (`user_id`, `task_id`, `claim_date`),
    KEY `idx_user` (`user_id`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT '任务领取记录';

-- 26. 金币流水（余额取最后一行 balance_after，写时行锁串行）
CREATE TABLE IF NOT EXISTS `coin_transaction` (
    `id` BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT '主键标识',
    `user_id` BIGINT NOT NULL COMMENT '用户ID',
    `change_type` TINYINT NOT NULL COMMENT '1 收入 / 2 支出',
    `amount` INT NOT NULL COMMENT '变动数量（正数）',
    `biz_type` TINYINT NOT NULL DEFAULT 0 COMMENT '1 任务 / 2 宠物喂养 / 3 装扮购买 / 9 其他',
    `biz_id` BIGINT NULL COMMENT '业务ID',
    `balance_after` INT NOT NULL COMMENT '变动后余额',
    `remark` VARCHAR(100) NOT NULL DEFAULT '' COMMENT '备注',
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    KEY `idx_user` (`user_id`, `id`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT '金币流水';

-- 27. 宠物（每用户一只，懒创建；低龄账号点亮天数按创建日计算）
CREATE TABLE IF NOT EXISTS `pet` (
    `user_id` BIGINT PRIMARY KEY COMMENT '用户ID',
    `name` VARCHAR(32) NOT NULL DEFAULT '小福宝' COMMENT '宠物名',
    `exp` INT NOT NULL DEFAULT 0 COMMENT '经验值（每次喂食 +10）',
    `props` INT NOT NULL DEFAULT 0 COMMENT '喂养道具数（每日签到 +1）',
    `dress_id` VARCHAR(16) NULL COMMENT '当前装扮ID（pet_dress.id）',
    `feed_total` INT NOT NULL DEFAULT 0 COMMENT '累计喂食次数',
    `adopted_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '领养时间（点亮天数起算）',
    `last_fed_at` DATETIME NULL COMMENT '最近喂食时间',
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间'
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT '宠物养成';

-- 28. 装扮目录
CREATE TABLE IF NOT EXISTS `pet_dress` (
    `id` VARCHAR(16) PRIMARY KEY COMMENT '装扮ID',
    `name` VARCHAR(32) NOT NULL COMMENT '装扮名',
    `price` INT NOT NULL DEFAULT 0 COMMENT '金币价格',
    `min_level` INT NOT NULL DEFAULT 1 COMMENT '解锁等级',
    `image` VARCHAR(64) NOT NULL DEFAULT '' COMMENT '角标/图标',
    `sort` INT NOT NULL DEFAULT 0 COMMENT '展示顺序'
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT '宠物装扮目录';

-- 29. 用户已拥有装扮
CREATE TABLE IF NOT EXISTS `user_dress` (
    `user_id` BIGINT NOT NULL COMMENT '用户ID',
    `dress_id` VARCHAR(16) NOT NULL COMMENT '装扮ID',
    `acquired_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '获得时间',
    PRIMARY KEY (`user_id`, `dress_id`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT '用户装扮';

-- 30. 喂食记录（任务「给福宝喂食一次」按此计数）
CREATE TABLE IF NOT EXISTS `feed_record` (
    `id` BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT '主键标识',
    `user_id` BIGINT NOT NULL COMMENT '用户ID',
    `cost_type` VARCHAR(8) NOT NULL COMMENT 'prop 道具 / coin 金币',
    `cost_amount` INT NOT NULL DEFAULT 0 COMMENT '消耗数量',
    `fed_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '喂食时间',
    KEY `idx_user_time` (`user_id`, `fed_at`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT '宠物喂食记录';

-- 31. 社区动态（真实发布，用于「分享一条美食动态」任务）
CREATE TABLE IF NOT EXISTS `post` (
    `id` BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT '主键标识',
    `user_id` BIGINT NOT NULL COMMENT '作者ID',
    `content` VARCHAR(1000) NOT NULL DEFAULT '' COMMENT '正文',
    `images` JSON NULL COMMENT '图片 objectKey 数组',
    `topics` JSON NULL COMMENT '话题数组',
    `links` JSON NULL COMMENT '关联点位/档口/菜品 [{kind,id,name}]',
    `status` TINYINT NOT NULL DEFAULT 0 COMMENT '0 正常 / 1 待审 / 2 下架',
    `like_count` INT NOT NULL DEFAULT 0 COMMENT '点赞数',
    `comment_count` INT NOT NULL DEFAULT 0 COMMENT '评论数',
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    `deleted_at` DATETIME NULL COMMENT '软删除时间',
    KEY `idx_feed` (`status`, `created_at`),
    KEY `idx_user` (`user_id`, `created_at`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT '社区动态';

-- 32. 动态点赞
CREATE TABLE IF NOT EXISTS `post_like` (
    `user_id` BIGINT NOT NULL COMMENT '用户ID',
    `post_id` BIGINT NOT NULL COMMENT '动态ID',
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '点赞时间',
    PRIMARY KEY (`user_id`, `post_id`),
    KEY `idx_post` (`post_id`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT '动态点赞';

-- 33. 社区评论（帖子 + 评价共用；parent_type 1 帖子 / 2 评价）
CREATE TABLE IF NOT EXISTS `post_comment` (
    `id` BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT '主键标识',
    `user_id` BIGINT NOT NULL COMMENT '评论人',
    `parent_type` TINYINT NOT NULL COMMENT '1 帖子 / 2 评价',
    `parent_id` BIGINT NOT NULL COMMENT '父对象ID',
    `content` VARCHAR(300) NOT NULL COMMENT '评论内容',
    `reply_to_comment_id` BIGINT NULL COMMENT '回复的根评论ID（单层）',
    `status` TINYINT NOT NULL DEFAULT 0 COMMENT '0 正常 / 1 删除',
    `deleted_at` DATETIME NULL COMMENT '软删除时间',
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    KEY `idx_parent` (`parent_type`, `parent_id`, `status`),
    KEY `idx_user` (`user_id`, `created_at`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT '社区评论';

-- =========================================================
-- 福大统一身份认证账号（r80）：demo 模式托管口令，支持「初始口令 → 本人改密 → 后台重置」闭环
-- real 模式（已接校方 CAS）不在此校验，仅作本地镜像与口令托管
CREATE TABLE IF NOT EXISTS `fzu_account` (
    `uid` VARCHAR(16) NOT NULL COMMENT '学号/工号（统一身份账号唯一键）',
    `name` VARCHAR(32) NOT NULL COMMENT 'CAS 姓名（demo 模式按学号确定性映射）',
    `password` VARCHAR(100) NOT NULL COMMENT '统一身份口令 bcrypt 哈希（演示桩托管）',
    `must_change` TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1 仍为初始口令，需本人首次登录后修改 / 0 已改密',
    `user_id` INT NULL COMMENT '关联的本地账号 id（SSO 自动建号或绑定）',
    `last_login_at` DATETIME NULL COMMENT '最近一次 SSO 登录时间',
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '建档时间',
    `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    PRIMARY KEY (`uid`),
    UNIQUE KEY `uk_fzu_user` (`user_id`),
    KEY `idx_fzu_must_change` (`must_change`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT '福大统一身份认证账号（口令托管）';

-- =========================================================
-- 敏感词种子改为 seed.js 参数化插入（initdb 通道按 latin1 解析 SQL 文本会损坏中文）
