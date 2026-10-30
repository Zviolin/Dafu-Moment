-- 008：福大统一身份认证账号表（r80）
-- 演示桩口令托管：统一初始口令 → 本人改密 → 后台重置的闭环数据落点。
-- 适用于已存在 v2.x 库的增量升级；新库直接执行 init.sql 即可（本脚本幂等）。

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
