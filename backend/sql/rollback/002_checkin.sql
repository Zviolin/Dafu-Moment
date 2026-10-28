-- 撤销 002：journal.check_in_id 列 + check_in 表
-- 警告：DROP TABLE 会删除全部打卡流水，执行前请先备份 check_in。

-- 1) journal.check_in_id（仅当列存在且仍为本补丁定义时删除）
SET @d_checkin_sql = IF(EXISTS(
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'journal' AND COLUMN_NAME = 'check_in_id'
      AND COLUMN_TYPE <=> 'bigint' AND IS_NULLABLE <=> 'YES'
), 'ALTER TABLE `journal` DROP COLUMN `check_in_id`', 'DO 0');
PREPARE d_checkin_stmt FROM @d_checkin_sql;
EXECUTE d_checkin_stmt;
DEALLOCATE PREPARE d_checkin_stmt;

-- 2) check_in 表（含全部打卡数据，谨慎执行）
DROP TABLE IF EXISTS `check_in`;
