-- 002：15-差距文档 T-01 打卡落地（AC10/AC11/AC12）
-- 内容：1) 新建 check_in 表（一人一点位一天一条，uk_check_in_dup 幂等硬约束）
--       2) journal 末尾补 check_in_id 可空列
-- 可重复执行：建表用 IF NOT EXISTS；加列用 information_schema 判断（MySQL 8.0 无 ADD COLUMN IF NOT EXISTS）
-- 在已选中的库上执行（不含 CREATE DATABASE 或 USE）。

-- 1) check_in 建表（DDL 与 init.sql 保持一致）
CREATE TABLE IF NOT EXISTS `check_in` (
    `id` BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT '主键标识',
    `user_id` BIGINT NOT NULL COMMENT '打卡人（user.id）',
    `canteen_id` INT NOT NULL COMMENT '打卡点位（canteen.id；设计文档 location_id 的落库映射）',
    `check_in_date` DATE NOT NULL COMMENT '打卡日期（+08:00 当日，应用层生成 YYYY-MM-DD 写入）',
    `visibility` TINYINT NOT NULL DEFAULT 1 COMMENT '可见范围：1 公开 / 2 仅自己 / 3 匿名',
    `note` VARCHAR(200) NOT NULL DEFAULT '' COMMENT '打卡备注',
    `photos` JSON NULL COMMENT '图片 objectKey 数组（MinIO 键，不存 URL，最多 9 张）',
    `dish_ids` JSON NULL COMMENT '关联菜品 id 数组（「另记一条」往这里追加，不新建记录）',
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    UNIQUE KEY `uk_check_in_dup` (`user_id`, `canteen_id`, `check_in_date`) COMMENT '一人一点位一天一条（幂等硬约束；删除为物理删，软删会占住唯一键挡住当天再打卡）',
    KEY `idx_user_date` (`user_id`, `check_in_date`) COMMENT '日历聚合与统计查询'
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT '打卡（一人一点位一天一条）';

-- 2) journal.check_in_id（列不存在才加）
SET @d_checkin_sql = IF(EXISTS(
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'journal' AND COLUMN_NAME = 'check_in_id'
), 'DO 0', 'ALTER TABLE `journal` ADD COLUMN `check_in_id` BIGINT NULL COMMENT ''关联打卡（check_in.id，可空；15-差距文档 T-01 补列）''');
PREPARE d_checkin_stmt FROM @d_checkin_sql;
EXECUTE d_checkin_stmt;
DEALLOCATE PREPARE d_checkin_stmt;
