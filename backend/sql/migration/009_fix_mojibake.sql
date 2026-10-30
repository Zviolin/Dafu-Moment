-- 009：修复中文列默认值乱码（QA 测试文档截图 3）
-- 现象：宠物名显示为「å°ç¦å®」（小福宝 的 UTF-8 字节被 latin1 通道重新编码成乱码字符）
-- 根因：init.sql 通过 docker-entrypoint 的 mysql CLI 执行时连接字符集是 latin1，
--       中文 DEFAULT 字面量被写坏，之后新建宠物直接沿用坏默认值。
-- 适用：已存在的库（新库用最新 init.sql 建库不会再有此问题）。
-- 幂等：可重复执行。

SET NAMES utf8mb4;

-- 1) 三处中文列默认值改回正确文本
ALTER TABLE `canteen` ALTER COLUMN `campus` SET DEFAULT '旗山校区';
ALTER TABLE `dish` ALTER COLUMN `price_unit` SET DEFAULT '元';
ALTER TABLE `pet` ALTER COLUMN `name` SET DEFAULT '小福宝';

-- 2) 已按坏默认值落库的宠物名一次性修回（"小福宝" 的 mojibake 形态）
--    C3A5C2B0C28FC3A7C2A6C28FC3A5C2AEC29D = UTF-8 编码后的 å°ç¦å®
UPDATE `pet`
SET `name` = '小福宝'
WHERE HEX(`name`) = 'C3A5C2B0C28FC3A7C2A6C28FC3A5C2AEC29D';

-- 3) 兜底：任何仍含「å°/ç¦」特征串的宠物名（同类通道写坏的变体）统一修正为默认名
UPDATE `pet` SET `name` = '小福宝' WHERE `name` LIKE '%å°%' OR `name` LIKE '%ç¦%';
