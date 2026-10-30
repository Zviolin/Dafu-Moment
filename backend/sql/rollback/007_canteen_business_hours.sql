-- 回滚 007：移除点位营业时间列

SET @sql = (SELECT IF(COUNT(*) > 0,
    'ALTER TABLE `canteen` DROP COLUMN `business_hours`',
    'SELECT 1')
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'canteen' AND COLUMN_NAME = 'business_hours');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
