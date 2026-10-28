-- 撤销 004：canteen.type 注释回滚 + review_dimension.applicable_types 移除 4
-- 警告：移除后外卖类型（type=4）点位将无适用评分维度，相关评价无法再提交；
--       存量 type=4 点位行不会被清除，需人工先处理（改型或下架）再回滚。

-- 1) canteen.type 注释回滚（仅当当前为五分类注释时还原）
SET @d_ct_sql = IF(EXISTS(
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'canteen' AND COLUMN_NAME = 'type'
      AND COLUMN_COMMENT LIKE '%外卖%'
), 'ALTER TABLE `canteen` MODIFY COLUMN `type` TINYINT NOT NULL DEFAULT 0 COMMENT ''0 校内食堂 / 1 永嘉天地 / 2 学生街 / 3 周边其他''', 'DO 0');
PREPARE d_ct_stmt FROM @d_ct_sql;
EXECUTE d_ct_stmt;
DEALLOCATE PREPARE d_ct_stmt;

-- 2) review_dimension.applicable_types 移除 4（JSON_SEARCH 定位下标后删除；无 4 的行跳过）
UPDATE `review_dimension`
SET applicable_types = JSON_REMOVE(applicable_types, JSON_UNQUOTE(JSON_SEARCH(applicable_types, 'one', '4')))
WHERE JSON_SEARCH(applicable_types, 'one', '4') IS NOT NULL;
