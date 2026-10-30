-- 006：成长任务 / 宠物养成 / 社区动态（r78 测试修正）
-- 适用于已存在 v2.x 库的增量升级；新库直接执行 init.sql 即可。

-- dish 价格来源标注
SET @sql = (SELECT IF(COUNT(*) = 0,
    'ALTER TABLE `dish` ADD COLUMN `price_unit` VARCHAR(16) NOT NULL DEFAULT ''元'' COMMENT ''价格单位：元/份/个…'' AFTER `price`',
    'SELECT 1')
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'dish' AND COLUMN_NAME = 'price_unit');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(COUNT(*) = 0,
    'ALTER TABLE `dish` ADD COLUMN `is_estimated` TINYINT(1) NOT NULL DEFAULT 0 COMMENT ''1=价格为依据公开人均估算'' AFTER `price_unit`',
    'SELECT 1')
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'dish' AND COLUMN_NAME = 'is_estimated');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

CREATE TABLE IF NOT EXISTS `task` (
    `id` INT PRIMARY KEY AUTO_INCREMENT,
    `task_type` TINYINT NOT NULL COMMENT '1 每日 / 2 成长',
    `name` VARCHAR(64) NOT NULL,
    `description` VARCHAR(200) NOT NULL DEFAULT '',
    `action_type` TINYINT NOT NULL COMMENT '1 打卡 / 2 点评 / 3 喂食 / 4 收藏 / 5 互动 / 6 分享',
    `reward_coins` INT NOT NULL DEFAULT 0,
    `enabled` TINYINT NOT NULL DEFAULT 1,
    `sort` INT NOT NULL DEFAULT 0,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT '成长任务定义';

CREATE TABLE IF NOT EXISTS `task_claim` (
    `id` BIGINT PRIMARY KEY AUTO_INCREMENT,
    `user_id` BIGINT NOT NULL,
    `task_id` INT NOT NULL,
    `claim_date` DATE NOT NULL,
    `status` TINYINT NOT NULL DEFAULT 1 COMMENT '1 待领 / 2 已领',
    `completed_at` DATETIME NULL,
    `claimed_at` DATETIME NULL,
    UNIQUE KEY `uk_claim` (`user_id`, `task_id`, `claim_date`),
    KEY `idx_user` (`user_id`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT '任务领取记录';

CREATE TABLE IF NOT EXISTS `coin_transaction` (
    `id` BIGINT PRIMARY KEY AUTO_INCREMENT,
    `user_id` BIGINT NOT NULL,
    `change_type` TINYINT NOT NULL COMMENT '1 收入 / 2 支出',
    `amount` INT NOT NULL,
    `biz_type` TINYINT NOT NULL DEFAULT 0 COMMENT '1 任务 / 2 喂养 / 3 装扮 / 9 其他',
    `biz_id` BIGINT NULL,
    `balance_after` INT NOT NULL,
    `remark` VARCHAR(100) NOT NULL DEFAULT '',
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY `idx_user` (`user_id`, `id`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT '金币流水';

CREATE TABLE IF NOT EXISTS `pet` (
    `user_id` BIGINT PRIMARY KEY,
    `name` VARCHAR(32) NOT NULL DEFAULT '小福宝',
    `exp` INT NOT NULL DEFAULT 0,
    `props` INT NOT NULL DEFAULT 0,
    `dress_id` VARCHAR(16) NULL,
    `feed_total` INT NOT NULL DEFAULT 0,
    `adopted_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `last_fed_at` DATETIME NULL,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT '宠物养成';

CREATE TABLE IF NOT EXISTS `pet_dress` (
    `id` VARCHAR(16) PRIMARY KEY,
    `name` VARCHAR(32) NOT NULL,
    `price` INT NOT NULL DEFAULT 0,
    `min_level` INT NOT NULL DEFAULT 1,
    `image` VARCHAR(64) NOT NULL DEFAULT '',
    `sort` INT NOT NULL DEFAULT 0
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT '宠物装扮目录';

CREATE TABLE IF NOT EXISTS `user_dress` (
    `user_id` BIGINT NOT NULL,
    `dress_id` VARCHAR(16) NOT NULL,
    `acquired_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`user_id`, `dress_id`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT '用户装扮';

CREATE TABLE IF NOT EXISTS `feed_record` (
    `id` BIGINT PRIMARY KEY AUTO_INCREMENT,
    `user_id` BIGINT NOT NULL,
    `cost_type` VARCHAR(8) NOT NULL COMMENT 'prop / coin',
    `cost_amount` INT NOT NULL DEFAULT 0,
    `fed_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY `idx_user_time` (`user_id`, `fed_at`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT '宠物喂食记录';

CREATE TABLE IF NOT EXISTS `post` (
    `id` BIGINT PRIMARY KEY AUTO_INCREMENT,
    `user_id` BIGINT NOT NULL,
    `content` VARCHAR(1000) NOT NULL DEFAULT '',
    `images` JSON NULL,
    `topics` JSON NULL,
    `links` JSON NULL,
    `status` TINYINT NOT NULL DEFAULT 0,
    `like_count` INT NOT NULL DEFAULT 0,
    `comment_count` INT NOT NULL DEFAULT 0,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `deleted_at` DATETIME NULL,
    KEY `idx_feed` (`status`, `created_at`),
    KEY `idx_user` (`user_id`, `created_at`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT '社区动态';

CREATE TABLE IF NOT EXISTS `post_like` (
    `user_id` BIGINT NOT NULL,
    `post_id` BIGINT NOT NULL,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`user_id`, `post_id`),
    KEY `idx_post` (`post_id`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT '动态点赞';

CREATE TABLE IF NOT EXISTS `post_comment` (
    `id` BIGINT PRIMARY KEY AUTO_INCREMENT,
    `user_id` BIGINT NOT NULL,
    `parent_type` TINYINT NOT NULL COMMENT '1 帖子 / 2 评价',
    `parent_id` BIGINT NOT NULL,
    `content` VARCHAR(300) NOT NULL,
    `reply_to_comment_id` BIGINT NULL,
    `status` TINYINT NOT NULL DEFAULT 0,
    `deleted_at` DATETIME NULL,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY `idx_parent` (`parent_type`, `parent_id`, `status`),
    KEY `idx_user` (`user_id`, `created_at`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT '社区评论';
