-- 撤销 005：station 导览坐标 lat/lng 删列
-- 警告：删列将丢失全部档口级导览坐标（含后台已校准的精确值），执行前请先备份 station 表。

-- 1) station.lng（仅当列存在且仍为本补丁定义时删除）
SET @d_slng_sql = IF(EXISTS(
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'station' AND COLUMN_NAME = 'lng'
      AND COLUMN_TYPE <=> 'decimal(10,6)' AND IS_NULLABLE <=> 'YES'
), 'ALTER TABLE `station` DROP COLUMN `lng`', 'DO 0');
PREPARE d_slng_stmt FROM @d_slng_sql;
EXECUTE d_slng_stmt;
DEALLOCATE PREPARE d_slng_stmt;

-- 2) station.lat
SET @d_slat_sql = IF(EXISTS(
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'station' AND COLUMN_NAME = 'lat'
      AND COLUMN_TYPE <=> 'decimal(10,6)' AND IS_NULLABLE <=> 'YES'
), 'ALTER TABLE `station` DROP COLUMN `lat`', 'DO 0');
PREPARE d_slat_stmt FROM @d_slat_sql;
EXECUTE d_slat_stmt;
DEALLOCATE PREPARE d_slat_stmt;
