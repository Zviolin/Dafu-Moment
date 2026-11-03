-- 用户确认：模拟身份学号统一9位；原包source-ddl保持原样，注册不自动认证。
-- 复用3.0字典；重复键仅保持已有值，不覆盖团队调整。包含明确命名的模拟身份测试样例。

USE dafu_shike;

SET NAMES utf8mb4;

INSERT INTO `scene_category` (`id`,`name`,`sort`) VALUES (1,'食堂',1),(2,'永嘉天地',2),(3,'学生街',3),(4,'其他',4),(5,'外卖',5) ON DUPLICATE KEY UPDATE `id`=`id`;

INSERT INTO `role` (`id`,`role_code`,`role_name`) VALUES
 (1,'super_admin','超级管理员'),(2,'platform_admin','平台管理员'),(3,'data_maintainer','点位信息维护员'),
 (4,'canteen_supervisor','食堂监督员'),(5,'verified_user','校内已认证用户'),(6,'user','注册用户'),(7,'guest','游客') ON DUPLICATE KEY UPDATE `id`=`id`;

INSERT INTO `review_dimension` (`id`,`code`,`name`,`is_required`,`sort`) VALUES
 (1,'taste','口味',1,1),(2,'portion','份量',1,2),(3,'package','包装',0,3),
 (4,'queue','排队体验',0,4),(5,'delivery','配送速度',0,5) ON DUPLICATE KEY UPDATE `id`=`id`;

INSERT INTO `review_dimension_meal_mode` (`dimension_id`,`meal_mode`) VALUES
 (1,1),(1,2),(1,3),(2,1),(2,2),(2,3),(4,1),(5,3),(3,2),(3,3) ON DUPLICATE KEY UPDATE `dimension_id`=`dimension_id`;

INSERT INTO `achievement` (`id`,`metric_type`,`target_value`,`title`) VALUES
 (1,1,100,'打卡达人'),(2,2,30,'探店达人'),(3,3,50,'点评达人'),(4,4,500,'人气之星') ON DUPLICATE KEY UPDATE `id`=`id`;

INSERT INTO `task` (`id`,`task_type`,`name`,`action_type`,`reward_coins`) VALUES
 (1,1,'每日打卡',1,10),(2,1,'写一条点评',2,20),(3,1,'给宠物喂食一次',3,5),
 (4,1,'收藏一道菜',4,5),(5,1,'互动一次',5,5),(6,1,'分享一条动态',6,10) ON DUPLICATE KEY UPDATE `id`=`id`;

INSERT INTO `mock_identity_dataset` (`student_no`,`real_name`,`class_name`) VALUES
 ('202400001','模拟同学01','软工2401'),('202400002','模拟同学02','软工2401'),('202400003','模拟同学03','软工2401'),
 ('202400004','模拟同学04','软工2401'),('202400005','模拟同学05','软工2401'),('202400006','模拟同学06','软工2401'),
 ('202400007','模拟同学07','软工2401'),('202400008','模拟同学08','软工2401'),('202400009','模拟同学09','软工2401'),
 ('202400010','模拟同学10','软工2401'),('202400011','模拟同学11','软工2401'),('202400012','模拟同学12','软工2401'),
 ('202400013','模拟同学13','软工2401'),('202400014','模拟同学14','软工2401'),('202400015','模拟同学15','软工2401'),
 ('202400016','模拟同学16','软工2401'),('202400017','模拟同学17','软工2401'),('202400018','模拟同学18','软工2401'),
 ('202400019','模拟同学19','软工2401'),('202400020','模拟同学20','软工2401'),('202400021','模拟同学21','软工2401'),
 ('202400022','模拟同学22','软工2401'),('202400023','模拟同学23','软工2401'),('202400024','模拟同学24','软工2401'),
 ('202400025','模拟同学25','软工2401'),('202400026','模拟同学26','软工2401'),('202400027','模拟同学27','软工2401'),
 ('202400028','模拟同学28','软工2401'),('202400029','模拟同学29','软工2401'),('202400030','模拟同学30','软工2401') ON DUPLICATE KEY UPDATE `student_no`=`student_no`;

INSERT INTO `banned_word` (`word`,`category`,`status`,`severity`,`action`) VALUES
 ('加微信',1,1,2,2),('代购',1,1,2,2),('刷单',1,1,2,2),('兼职',1,1,2,2),
 ('傻逼',2,1,2,2),('滚蛋',2,1,2,2),('身份证号',3,1,1,1),('代写',4,1,1,1) ON DUPLICATE KEY UPDATE `word`=`word`;
