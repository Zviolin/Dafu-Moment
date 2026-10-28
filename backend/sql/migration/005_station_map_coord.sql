-- 005：15-差距文档 T-31 导览图档口级标记（AC08/G10）
-- 内容：1) station 加导览坐标 lat/lng（GCJ-02，可空；NULL 则不出档口级标记）
--       2) 存量档口坐标回填：承所属点位坐标 + 按 station.id 确定性小偏移（±0.0008°≈±80m，防标记重叠）
--          （本任务 D 部分「补坐标数据」：真实精确坐标后续由后台校准，回填仅保证档口级标记可见）
-- 可重复执行：加列用 information_schema 判断；回填只写 lat 为 NULL 的行（天然幂等）
-- 在已选中的库上执行（不含 CREATE DATABASE 或 USE）。

-- 1) station.lat / station.lng（列不存在才加）
SET @d_slat_sql = IF(EXISTS(
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'station' AND COLUMN_NAME = 'lat'
), 'DO 0', 'ALTER TABLE `station` ADD COLUMN `lat` DECIMAL(10, 6) NULL COMMENT ''导览纬度（GCJ-02；档口级地图标记用，NULL 则不出档口标记）''');
PREPARE d_slat_stmt FROM @d_slat_sql;
EXECUTE d_slat_stmt;
DEALLOCATE PREPARE d_slat_stmt;

SET @d_slng_sql = IF(EXISTS(
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'station' AND COLUMN_NAME = 'lng'
), 'DO 0', 'ALTER TABLE `station` ADD COLUMN `lng` DECIMAL(10, 6) NULL COMMENT ''导览经度（GCJ-02；同上）''');
PREPARE d_slng_stmt FROM @d_slng_sql;
EXECUTE d_slng_stmt;
DEALLOCATE PREPARE d_slng_stmt;

-- 2) 存量档口回填（所属点位有坐标且档口尚无坐标；偏移由 station.id 决定，重跑结果一致）
UPDATE `station` s JOIN `canteen` c ON c.id = s.canteen_id
SET s.lat = c.lat + (MOD(s.id, 5) - 2) * 0.0004,
    s.lng = c.lng + (MOD(FLOOR(s.id / 5), 5) - 2) * 0.0004
WHERE s.lat IS NULL AND c.lat IS NOT NULL AND c.lng IS NOT NULL;
