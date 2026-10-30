-- 007：点位真实营业时间（数据来自 Dafu-Moment 最新 PR 的 data/db3 公开采集数据）
-- 适用于已存在 v2.x 库的增量升级；新库直接执行 init.sql 即可。

SET @sql = (SELECT IF(COUNT(*) = 0,
    'ALTER TABLE `canteen` ADD COLUMN `business_hours` VARCHAR(64) NULL COMMENT ''营业时间（真实公开资料口径，如 06:00-19:30；无资料为 NULL）'' AFTER `avg_price`',
    'SELECT 1')
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'canteen' AND COLUMN_NAME = 'business_hours');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
