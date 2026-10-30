-- 006 回滚：删除成长任务 / 宠物 / 社区动态相关表与 dish 价格来源列
DROP TABLE IF EXISTS `post_comment`;
DROP TABLE IF EXISTS `post_like`;
DROP TABLE IF EXISTS `post`;
DROP TABLE IF EXISTS `feed_record`;
DROP TABLE IF EXISTS `user_dress`;
DROP TABLE IF EXISTS `pet_dress`;
DROP TABLE IF EXISTS `pet`;
DROP TABLE IF EXISTS `coin_transaction`;
DROP TABLE IF EXISTS `task_claim`;
DROP TABLE IF EXISTS `task`;

SET @sql = (SELECT IF(COUNT(*) > 0,
    'ALTER TABLE `dish` DROP COLUMN `is_estimated`',
    'SELECT 1')
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'dish' AND COLUMN_NAME = 'is_estimated');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(COUNT(*) > 0,
    'ALTER TABLE `dish` DROP COLUMN `price_unit`',
    'SELECT 1')
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'dish' AND COLUMN_NAME = 'price_unit');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
