-- 004：15-差距文档 AC01 外卖第五类（canteen.type 扩值 4）
-- 内容：1) canteen.type 列注释更新为五分类口径（列仍 TINYINT，值域由应用层放开）
--       2) review_dimension.applicable_types 幂等追加 4（否则外卖类型点位无适用维度，评价会被 422 拒）
-- 可重复执行：注释更新用 information_schema 判断；JSON 追加用 JSON_CONTAINS 守卫（天然幂等）
-- 在已选中的库上执行（不含 CREATE DATABASE 或 USE）。

-- 1) canteen.type 列注释更新（仅当仍是四分类旧注释时改写）
SET @d_ct_sql = IF(EXISTS(
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'canteen' AND COLUMN_NAME = 'type'
      AND COLUMN_COMMENT NOT LIKE '%外卖%'
), 'ALTER TABLE `canteen` MODIFY COLUMN `type` TINYINT NOT NULL DEFAULT 0 COMMENT ''0 校内食堂 / 1 永嘉天地 / 2 学生街 / 3 周边其他 / 4 外卖（AC01）''', 'DO 0');
PREPARE d_ct_stmt FROM @d_ct_sql;
EXECUTE d_ct_stmt;
DEALLOCATE PREPARE d_ct_stmt;

-- 2) review_dimension.applicable_types 追加 4（仅追加到周边类已适用的维度——即含 1 的行；
--    queue/env 仅堂食 type=0 不适用外卖；已含 4 的行跳过，天然幂等）
UPDATE `review_dimension`
SET applicable_types = JSON_ARRAY_APPEND(applicable_types, '$', 4)
WHERE JSON_CONTAINS(applicable_types, '1') = 1 AND JSON_CONTAINS(applicable_types, '4') = 0;
