-- 撤销 003：favorite.list_type 注释回滚 + favorite.group_id 列 + favorite_group 表
-- 警告：DROP TABLE 会删除全部自定义分组；删列前请确认组内收藏已回落（应用层删组时会把组内收藏改回「想吃」），
--       直接回滚将丢弃 group_id 归属信息，执行前请先备份 favorite_group 与 favorite。

-- 1) favorite.list_type 注释回滚（仅当当前为 T-09 三分组注释时还原为 v2.0 旧注释）
SET @d_favlt_sql = IF(EXISTS(
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'favorite' AND COLUMN_NAME = 'list_type'
      AND COLUMN_COMMENT LIKE '%常吃%'
), 'ALTER TABLE `favorite` MODIFY COLUMN `list_type` TINYINT NOT NULL DEFAULT 0 COMMENT ''0 想吃（唯一收藏语义，保留列位兼容）''', 'DO 0');
PREPARE d_favlt_stmt FROM @d_favlt_sql;
EXECUTE d_favlt_stmt;
DEALLOCATE PREPARE d_favlt_stmt;

-- 2) favorite.group_id（仅当列存在且仍为本补丁定义时删除）
SET @d_fav_sql = IF(EXISTS(
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'favorite' AND COLUMN_NAME = 'group_id'
      AND COLUMN_TYPE <=> 'bigint' AND IS_NULLABLE <=> 'YES'
), 'ALTER TABLE `favorite` DROP COLUMN `group_id`', 'DO 0');
PREPARE d_fav_stmt FROM @d_fav_sql;
EXECUTE d_fav_stmt;
DEALLOCATE PREPARE d_fav_stmt;

-- 3) favorite_group 表（含全部分组数据，谨慎执行）
DROP TABLE IF EXISTS `favorite_group`;
