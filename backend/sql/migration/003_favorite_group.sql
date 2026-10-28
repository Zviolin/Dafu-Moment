-- 003：15-差距文档 T-09 收藏分组落地（AC06）
-- 内容：1) 新建 favorite_group 表（同人组名唯一，uk_favorite_group 幂等硬约束）
--       2) favorite 末尾补 group_id 可空列（list_type=2 时指向 favorite_group.id）
--       3) favorite.list_type 列注释更新为三分组口径（0 想吃 / 1 常吃 / 2 自定义）
-- 可重复执行：建表用 IF NOT EXISTS；加列/改注释用 information_schema 判断（MySQL 8.0 无 ADD COLUMN IF NOT EXISTS）
-- 在已选中的库上执行（不含 CREATE DATABASE 或 USE）。

-- 1) favorite_group 建表（DDL 与 init.sql 保持一致）
CREATE TABLE IF NOT EXISTS `favorite_group` (
    `id` BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT '分组标识',
    `user_id` BIGINT NOT NULL COMMENT '分组归属用户（user.id）',
    `group_name` VARCHAR(64) NOT NULL COMMENT '分组名（自定义）',
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    UNIQUE KEY `uk_favorite_group` (`user_id`, `group_name`) COMMENT '同人组名唯一（创建幂等硬约束）'
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT '收藏自定义分组';

-- 2) favorite.group_id（列不存在才加）
SET @d_fav_sql = IF(EXISTS(
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'favorite' AND COLUMN_NAME = 'group_id'
), 'DO 0', 'ALTER TABLE `favorite` ADD COLUMN `group_id` BIGINT NULL COMMENT ''自定义分组ID（favorite_group.id；list_type=2 时必填，其余为 NULL）''');
PREPARE d_fav_stmt FROM @d_fav_sql;
EXECUTE d_fav_stmt;
DEALLOCATE PREPARE d_fav_stmt;

-- 3) favorite.list_type 列注释更新（仅当仍是 v2.0 旧注释「唯一收藏语义」时改写，避免覆盖后续补丁）
SET @d_favlt_sql = IF(EXISTS(
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'favorite' AND COLUMN_NAME = 'list_type'
      AND COLUMN_COMMENT LIKE '%唯一收藏语义%'
), 'ALTER TABLE `favorite` MODIFY COLUMN `list_type` TINYINT NOT NULL DEFAULT 0 COMMENT ''0 想吃 / 1 常吃 / 2 自定义（须配 group_id）（15-差距文档 T-09 扩展）''', 'DO 0');
PREPARE d_favlt_stmt FROM @d_favlt_sql;
EXECUTE d_favlt_stmt;
DEALLOCATE PREPARE d_favlt_stmt;
