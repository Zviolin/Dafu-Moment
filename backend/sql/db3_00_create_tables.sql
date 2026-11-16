-- DB3独立测试库准备；不用于升级当前22表工程。无DROP，无删行。

CREATE DATABASE IF NOT EXISTS dafu_shike DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;

USE dafu_shike;

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS `user` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '用户唯一标识',
  `nickname` VARCHAR(64) NULL COMMENT '昵称',
  `avatar` VARCHAR(255) NULL COMMENT '头像（MinIO object_key，拍板0.4）',
  `verified_status` TINYINT NOT NULL DEFAULT 0 COMMENT '0=未认证 1=已认证（2=驳回 预留）',
  `student_no` VARCHAR(32) NULL COMMENT '学号（绑定后回填冗余；唯一凭据以campus_auth为准）',
  `phone` VARCHAR(255) NULL COMMENT '手机号（加密存储，禁止明文入库）',
  `phone_hash` CHAR(64) NULL COMMENT '手机号 SHA-256 加盐摘要（仅用于查找/查重与找回账号，不用于展示）',
  `password_hash` VARCHAR(255) NULL COMMENT 'bcrypt散列（数据库不存可逆口令）；SSO用户可空',
  `status` TINYINT NOT NULL DEFAULT 0 COMMENT '0=正常 1=禁言 2=封禁 3=注销',
  `mute_until` DATETIME NULL COMMENT '禁言到期时间（status=1时有效）',
  `banned_at` DATETIME NULL COMMENT '封禁时间（status=2时有效）',
  `ban_reason` VARCHAR(255) NULL COMMENT '封禁原因',
  `last_login_at` DATETIME NULL COMMENT '最近登录时间',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted_at` DATETIME NULL COMMENT '软删除时间：NULL=有效',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_phone_hash` (`phone_hash`),
  UNIQUE KEY `uk_user_student_no` (`student_no`),
  CONSTRAINT `ck_user_status` CHECK (`status` IN (0,1,2,3))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='用户（user）';

CREATE TABLE IF NOT EXISTS `campus_auth` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '认证记录唯一标识',
  `user_id` BIGINT UNSIGNED NOT NULL COMMENT '所属用户（0..1）',
  `student_no` VARCHAR(32) NOT NULL COMMENT '学号（唯一凭据，uk）',
  `status` TINYINT NOT NULL DEFAULT 0 COMMENT '0=未认证 1=已认证',
  `verified_at` DATETIME NULL COMMENT '认证通过时间',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted_at` DATETIME NULL COMMENT '软删除时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_campus_auth_user` (`user_id`),
  UNIQUE KEY `uk_campus_auth_student_no` (`student_no`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='校园身份认证（campus_auth）；真实姓名不在本表：经 student_no JOIN mock_identity_dataset 取 real_name';

CREATE TABLE IF NOT EXISTS `mock_identity_dataset` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '记录标识',
  `student_no` VARCHAR(32) NOT NULL COMMENT '学号',
  `real_name` VARCHAR(64) NOT NULL COMMENT '姓名（仅演示）',
  `class_name` VARCHAR(64) NOT NULL COMMENT '班级',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_mock_student_no` (`student_no`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='模拟身份认证数据集（mock_identity_dataset）';

CREATE TABLE IF NOT EXISTS `dietary_profile` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '档案标识',
  `user_id` BIGINT UNSIGNED NOT NULL COMMENT '所属用户',
  `budget_min` DECIMAL(10,2) NULL COMMENT '预算下限',
  `budget_max` DECIMAL(10,2) NULL COMMENT '预算上限',
  `is_vegetarian` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '素食偏好：0=否 1=是',
  `taste_preference` VARCHAR(64) NULL COMMENT '口味偏好（自由文本）',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted_at` DATETIME NULL COMMENT '软删除时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_dietary_profile_user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='饮食档案（dietary_profile）；忌口/过敏原见 dietary_restriction 子表';

CREATE TABLE IF NOT EXISTS `privacy_setting` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '设置标识',
  `user_id` BIGINT UNSIGNED NOT NULL COMMENT '所属用户',
  `behavior_analysis_allowed` TINYINT(1) NOT NULL DEFAULT 1 COMMENT '0=关 1=开（行为分析授权，撤回后画像/推荐停用）',
  `notification_enabled` TINYINT(1) NOT NULL DEFAULT 1 COMMENT '0=关 1=开（通知开关）',
  `matching_allowed` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '0=关 1=开（饭搭子匹配，首版默认关闭）',
  `diet_authorized` TINYINT(1) NOT NULL DEFAULT 1 COMMENT '0=关 1=开（饮食档案授权，B图1开关）',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted_at` DATETIME NULL COMMENT '软删除时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_privacy_user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='隐私设置（privacy_setting）';

CREATE TABLE IF NOT EXISTS `role` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '角色标识',
  `role_code` VARCHAR(64) NOT NULL COMMENT '角色编码',
  `role_name` VARCHAR(64) NOT NULL COMMENT '角色显示名',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_role_code` (`role_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='角色（role）；RBAC 以 B 方案为准';

CREATE TABLE IF NOT EXISTS `permission` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '权限标识',
  `perm_code` VARCHAR(128) NOT NULL COMMENT '权限编码（模块:子模块:操作）',
  `perm_name` VARCHAR(64) NOT NULL COMMENT '权限显示名',
  `parent_id` BIGINT UNSIGNED NULL COMMENT '父权限节点（树状）',
  `grantable` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否可再授权',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_permission_code` (`perm_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='权限（permission）；RBAC 以 B 方案为准';

CREATE TABLE IF NOT EXISTS `user_group` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '组标识',
  `group_name` VARCHAR(64) NOT NULL COMMENT '组名',
  `parent_id` BIGINT UNSIGNED NULL COMMENT '上级组',
  `data_scope` TINYINT NOT NULL DEFAULT 1 COMMENT '1=仅本人(SELF) 2=组范围(GROUP) 3=全量(ALL)',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_group_name` (`group_name`),
  CONSTRAINT `ck_ug_scope` CHECK (`data_scope` IN (1,2,3))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='组（user_group）；RBAC 以 B 方案为准';

CREATE TABLE IF NOT EXISTS `user_role` (
  `user_id` BIGINT UNSIGNED NOT NULL COMMENT '用户',
  `role_id` BIGINT UNSIGNED NOT NULL COMMENT '角色',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '授予时间',
  PRIMARY KEY (`user_id`, `role_id`),
  KEY `idx_user_role_role` (`role_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='用户角色（user_role）';

CREATE TABLE IF NOT EXISTS `user_group_member` (
  `user_id` BIGINT UNSIGNED NOT NULL COMMENT '用户',
  `group_id` BIGINT UNSIGNED NOT NULL COMMENT '组',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '加入时间',
  PRIMARY KEY (`user_id`, `group_id`),
  KEY `idx_ugm_group` (`group_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='组成员（user_group_member）';

CREATE TABLE IF NOT EXISTS `user_permission` (
  `user_id` BIGINT UNSIGNED NOT NULL COMMENT '用户',
  `permission_id` BIGINT UNSIGNED NOT NULL COMMENT '直接授予的权限（个别特例）',
  `scope` TINYINT NOT NULL DEFAULT 1 COMMENT '数据范围 1=仅本人 2=组范围 3=全量（可授权是授权关系属性）',
  `granted_by` BIGINT UNSIGNED NULL COMMENT '授予人；转授时必填，系统自动授予为空',
  `granted_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '授予时间',
  `grantable` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否可再转授（0=否；仅超级管理员授予时置 1，G-05）',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '授予时间',
  PRIMARY KEY (`user_id`, `permission_id`),
  CONSTRAINT `ck_up_scope` CHECK (`scope` IN (1,2,3))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='用户直接权限（user_permission）';

CREATE TABLE IF NOT EXISTS `role_permission` (
  `role_id` BIGINT UNSIGNED NOT NULL COMMENT '角色',
  `permission_id` BIGINT UNSIGNED NOT NULL COMMENT '权限',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '授予时间',
  PRIMARY KEY (`role_id`, `permission_id`),
  KEY `idx_rp_perm` (`permission_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='角色权限（role_permission）';

CREATE TABLE IF NOT EXISTS `group_permission` (
  `group_id` BIGINT UNSIGNED NOT NULL COMMENT '组',
  `permission_id` BIGINT UNSIGNED NOT NULL COMMENT '权限',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '授予时间',
  PRIMARY KEY (`group_id`, `permission_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='组权限（group_permission）';

CREATE TABLE IF NOT EXISTS `group_role` (
  `group_id` BIGINT UNSIGNED NOT NULL COMMENT '组',
  `role_id` BIGINT UNSIGNED NOT NULL COMMENT '角色',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '授予时间',
  PRIMARY KEY (`group_id`, `role_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='组角色（group_role）';

CREATE TABLE IF NOT EXISTS `user_group_location` (
  `group_id` BIGINT UNSIGNED NOT NULL COMMENT '组',
  `location_id` BIGINT UNSIGNED NOT NULL COMMENT '被覆盖的点位',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '登记时间',
  PRIMARY KEY (`group_id`, `location_id`),
  KEY `idx_ugl_location` (`location_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='组数据范围覆盖点位（user_group_location）';

CREATE TABLE IF NOT EXISTS `search_history` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '历史标识',
  `user_id` BIGINT UNSIGNED NULL COMMENT '搜索用户（可空=游客不留）',
  `keyword` VARCHAR(64) NOT NULL COMMENT '搜索词',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '搜索时间',
  PRIMARY KEY (`id`),
  KEY `idx_search_user_time` (`user_id`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='搜索历史（search_history）';

CREATE TABLE IF NOT EXISTS `dietary_restriction` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '限制行标识',
  `dietary_profile_id` BIGINT UNSIGNED NOT NULL COMMENT '所属饮食档案',
  `type` TINYINT NOT NULL DEFAULT 1 COMMENT '1=忌口 2=过敏原（分开标记 4.6(3)）',
  `word` VARCHAR(64) NOT NULL COMMENT '食材/词（如 香菜、虾）',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_dietary_restriction` (`dietary_profile_id`, `type`, `word`),
  KEY `idx_dr_match` (`type`, `word`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='饮食限制（dietary_restriction）；过敏原为安全红线';

CREATE TABLE IF NOT EXISTS `scene_category` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '分类标识',
  `name` VARCHAR(64) NOT NULL COMMENT '分类名（食堂/永嘉天地/学生街/其他/外卖）',
  `category_type` TINYINT NULL COMMENT '分类用途标记（取值待产品定，QC-20）',
  `sort` INT NULL COMMENT '列表展示顺序',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted_at` DATETIME NULL COMMENT '软删除时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_scene_category_name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='场地分类（scene_category）';

CREATE TABLE IF NOT EXISTS `canteen` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '食区标识',
  `name` VARCHAR(64) NOT NULL COMMENT '食区名称（一食堂/二食堂/永嘉天地等）',
  `type` TINYINT NULL COMMENT '食区类型（取值待产品定，QC-20）',
  `campus` TINYINT NULL COMMENT '校区（取值待产品定，QC-20）',
  `lng` DECIMAL(10,7) NULL COMMENT '食区中心经度（GCJ-02 坐标系入库）',
  `lat` DECIMAL(10,7) NULL COMMENT '食区中心纬度（GCJ-02 坐标系入库）',
  `status` TINYINT NOT NULL DEFAULT 1 COMMENT '0=停用 1=正常',
  `sort` INT NULL COMMENT '展示顺序',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted_at` DATETIME NULL COMMENT '软删除时间',
  PRIMARY KEY (`id`),
  KEY `idx_canteen_campus_status` (`campus`, `status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='食区（canteen）；层级：食区→点位→档口→菜品';

CREATE TABLE IF NOT EXISTS `location` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '点位标识',
  `name` VARCHAR(128) NOT NULL COMMENT '点位名称',
  `address` VARCHAR(255) NULL COMMENT '详细地址文本',
  `scene_category_id` BIGINT UNSIGNED NULL COMMENT '所属场地分类',
  `canteen_id` BIGINT UNSIGNED NULL COMMENT '所属食区（可空=校外点位）',
  `map_location_id` BIGINT UNSIGNED NULL COMMENT '地图坐标（GCJ-02，经 map_location 关联）',
  `business_info_id` BIGINT UNSIGNED NULL COMMENT '营业信息（1:1，B图2）',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted_at` DATETIME NULL COMMENT '软删除时间',
  PRIMARY KEY (`id`),
  KEY `idx_location_canteen` (`canteen_id`),
  KEY `idx_location_scene` (`scene_category_id`),
  KEY `idx_location_name` (`name`),
  UNIQUE KEY `uk_location_map` (`map_location_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='点位（location）；营业状态唯一由 business_info 维护';

CREATE TABLE IF NOT EXISTS `business_info` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '信息标识',
  `location_id` BIGINT UNSIGNED NOT NULL COMMENT '所属点位（1:1）',
  `business_hours` VARCHAR(128) NULL COMMENT '营业时间文本',
  `business_status` TINYINT NOT NULL DEFAULT 1 COMMENT '0=停业/撤销 1=正常（点位营业状态唯一维护点，E 审核/B 2.0 去重）',
  `contact` VARCHAR(64) NULL COMMENT '对外联系方式',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted_at` DATETIME NULL COMMENT '软删除时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_business_info_location` (`location_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='营业信息（business_info）';

CREATE TABLE IF NOT EXISTS `map_location` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '坐标点唯一标识',
  `latitude` DECIMAL(10,7) NOT NULL COMMENT '纬度（GCJ-02 坐标系入库）',
  `longitude` DECIMAL(10,7) NOT NULL COMMENT '经度（GCJ-02 坐标系入库）',
  `description` VARCHAR(128) NULL COMMENT '位置描述文案',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='地图位置（map_location）';

CREATE TABLE IF NOT EXISTS `station` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '档口标识',
  `name` VARCHAR(128) NOT NULL COMMENT '档口名称',
  `location_id` BIGINT UNSIGNED NOT NULL COMMENT '所属点位',
  `map_location_id` BIGINT UNSIGNED NULL COMMENT '导览坐标（GCJ-02，可空，二期导览图 P08）',
  `business_hours` VARCHAR(128) NULL COMMENT '营业时间文本',
  `owner_id` BIGINT UNSIGNED NULL COMMENT '档口负责人（店家）。本期仅预留：无商家角色、无商家端；为空表示未指定。启用后用于「店主回复评价」的归属校验与信息维护授权。',
  `status` TINYINT NOT NULL DEFAULT 1 COMMENT '0=停业/撤销 1=正常（撤销保留历史评价与打卡，前台标注）',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted_at` DATETIME NULL COMMENT '软删除时间',
  PRIMARY KEY (`id`),
  KEY `idx_station_location` (`location_id`),
  KEY `idx_station_owner` (`owner_id`),
  KEY `idx_station_name` (`name`),
  KEY `idx_station_status` (`status`),
  UNIQUE KEY `uk_station_map` (`map_location_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='档口（station）；A /stations 对应';

CREATE TABLE IF NOT EXISTS `dish` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '菜品唯一标识',
  `station_id` BIGINT UNSIGNED NOT NULL COMMENT '所属档口',
  `name` VARCHAR(128) NOT NULL COMMENT '菜品名称',
  `price` DECIMAL(10,2) NOT NULL COMMENT '单价',
  `price_unit` VARCHAR(16) NULL COMMENT '计价单位（/份、/两、/杯等）',
  `image` VARCHAR(255) NULL COMMENT '菜品图（MinIO object_key）',
  `status` TINYINT NOT NULL DEFAULT 0 COMMENT '0=待审核 1=正常 2=停用（审核前不入公共搜索）',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted_at` DATETIME NULL COMMENT '软删除时间',
  PRIMARY KEY (`id`),
  KEY `idx_dish_station` (`station_id`, `status`),
  KEY `idx_dish_name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='菜品（dish）；E 审核：station_id 承载档口粒度（原 stall 已删）';

CREATE TABLE IF NOT EXISTS `tag` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '标签唯一标识',
  `name` VARCHAR(64) NOT NULL COMMENT '标签名（如 免辣）',
  `type` TINYINT NOT NULL DEFAULT 1 COMMENT '1=忌口 2=食材 3=场景适配',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_tag_name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='标签（tag）';

CREATE TABLE IF NOT EXISTS `dish_tag` (
  `dish_id` BIGINT UNSIGNED NOT NULL COMMENT '菜品',
  `tag_id` BIGINT UNSIGNED NOT NULL COMMENT '标签',
  PRIMARY KEY (`dish_id`, `tag_id`),
  KEY `idx_dish_tag_tag` (`tag_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='菜品标签（dish_tag）';

CREATE TABLE IF NOT EXISTS `station_manager` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '绑定行标识',
  `station_id` BIGINT UNSIGNED NOT NULL COMMENT '档口',
  `user_id` BIGINT UNSIGNED NOT NULL COMMENT '负责人（店家）',
  `is_primary` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否主负责人',
  `granted_by` BIGINT UNSIGNED NULL COMMENT '由谁绑定（管理员）',
  `granted_at` DATETIME NULL COMMENT '绑定时间',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `deleted_at` DATETIME NULL COMMENT '软删除时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_station_manager` (`station_id`, `user_id`),
  KEY `idx_sm_user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='档口负责人绑定（station_manager）；E 审核：一人可多档口；/manager/* 鉴权=查绑定';

CREATE TABLE IF NOT EXISTS `station_post` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '公告标识',
  `station_id` BIGINT UNSIGNED NOT NULL COMMENT '所属档口（FK→station）',
  `author_id` BIGINT UNSIGNED NOT NULL COMMENT '发布人（FK→user）',
  `type` VARCHAR(16) NOT NULL COMMENT 'new_dish/menu_change/away/promo',
  `content` VARCHAR(200) NOT NULL COMMENT '公告正文',
  `starts_at` DATETIME NULL COMMENT '生效开始时间',
  `ends_at` DATETIME NULL COMMENT '生效结束时间',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`id`),
  KEY `idx_station_post` (`station_id`, `created_at`),
  CONSTRAINT `ck_sp_type` CHECK (`type` IN ('new_dish','menu_change','away','promo'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='档口动态公告（station_post）';

CREATE TABLE IF NOT EXISTS `review` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '评价标识',
  `user_id` BIGINT UNSIGNED NOT NULL COMMENT '评价用户',
  `location_id` BIGINT UNSIGNED NOT NULL COMMENT '关联点位（必填）',
  `station_id` BIGINT UNSIGNED NOT NULL COMMENT '被评价档口（必填；菜品可选，若指定须属于该档口）',
  `dish_id` BIGINT UNSIGNED NULL COMMENT '关联菜品（可选）',
  `content` TEXT NULL COMMENT '评价文字（可空：文字与图片不可同时为空，应用层校验；G-10）',
  `meal_mode` TINYINT NOT NULL DEFAULT 1 COMMENT '1=堂食 2=打包 3=外送',
  `status` TINYINT NOT NULL DEFAULT 0 COMMENT '0=已发布 1=违规下架（offline_* 必填，触发汇总重算） 2=待人工审核（高级词转人工：前台不可见、不参与聚合，复核后转 0 或 1；G-02）',
  `offline_reason` VARCHAR(255) NULL COMMENT '下架原因（status=1 必填）',
  `offline_by` BIGINT UNSIGNED NULL COMMENT '下架处置管理员',
  `offline_at` DATETIME NULL COMMENT '下架处置时间（触发 review_summary 重算 CON-26）',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted_at` DATETIME NULL COMMENT '软删除时间',
  PRIMARY KEY (`id`),
  KEY `idx_review_location_status_time` (`location_id`, `status`, `created_at`),
  KEY `idx_review_station_status` (`station_id`, `status`),
  KEY `idx_review_dish_status` (`dish_id`, `status`),
  KEY `idx_review_user_time` (`user_id`, `created_at`),
  KEY `idx_review_status_time` (`status`, `created_at`),
  CONSTRAINT `ck_review_status` CHECK (`status` IN (0,1,2)),
  CONSTRAINT `ck_review_meal_mode` CHECK (`meal_mode` IN (1,2,3)),
  CONSTRAINT `ck_review_offline` CHECK (`status` <> 1 OR (`offline_reason` IS NOT NULL AND `offline_by` IS NOT NULL AND `offline_at` IS NOT NULL))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='评价（review）；聚合只算 status=0 且 deleted_at IS NULL';

CREATE TABLE IF NOT EXISTS `rating_detail` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '评分明细行标识',
  `review_id` BIGINT UNSIGNED NOT NULL COMMENT '所属评价',
  `dimension_id` BIGINT UNSIGNED NOT NULL COMMENT '评分维度（FK→review_dimension）',
  `score` DECIMAL(2,1) NOT NULL COMMENT '维度得分 1.0–5.0（全维度统一 5 分制，维度字典无 max_score 列；G-10）',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_rating_detail` (`review_id`, `dimension_id`),
  KEY `idx_rating_dim` (`dimension_id`),
  CONSTRAINT `ck_rating_score` CHECK (`score` >= 1.0 AND `score` <= 5.0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='评分明细（rating_detail）；维度由 meal_mode 决定（CON-15）';

CREATE TABLE IF NOT EXISTS `review_image` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '图片行标识',
  `review_id` BIGINT UNSIGNED NOT NULL COMMENT '所属评价',
  `object_key` VARCHAR(255) NOT NULL COMMENT 'MinIO 对象键（拍板0.4）',
  `sort` INT NULL COMMENT '展示顺序',
  PRIMARY KEY (`id`),
  KEY `idx_review_image_review` (`review_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='评价图片（review_image）';

CREATE TABLE IF NOT EXISTS `review_tag` (
  `review_id` BIGINT UNSIGNED NOT NULL COMMENT '评价',
  `tag_id` BIGINT UNSIGNED NOT NULL COMMENT '标签',
  PRIMARY KEY (`review_id`, `tag_id`),
  KEY `idx_review_tag_tag` (`tag_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='评价标签（review_tag）';

CREATE TABLE IF NOT EXISTS `review_like` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '点赞记录',
  `user_id` BIGINT UNSIGNED NOT NULL COMMENT '点赞用户',
  `biz_type` TINYINT NOT NULL DEFAULT 1 COMMENT '1=评价 2=帖子 3=评论',
  `biz_id` BIGINT UNSIGNED NOT NULL COMMENT '点赞目标ID（多态无外键）',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '点赞时间',
  `deleted_at` DATETIME NULL COMMENT '软删除时间：NULL=有效',
  `valid_flag` BIGINT GENERATED ALWAYS AS (IF(`deleted_at` IS NULL, 1, NULL)) STORED COMMENT '有效行标志',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_review_like` (`user_id`, `biz_type`, `biz_id`, `valid_flag`),
  KEY `idx_review_like_biz` (`biz_type`, `biz_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='点赞（review_like）；多态，CON-23 级联软删';

CREATE TABLE IF NOT EXISTS `favorite` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '收藏记录',
  `user_id` BIGINT UNSIGNED NOT NULL COMMENT '收藏用户',
  `biz_type` TINYINT NOT NULL DEFAULT 1 COMMENT '1=点位 2=档口 3=菜品 4=帖子',
  `biz_id` BIGINT UNSIGNED NOT NULL COMMENT '收藏目标ID（多态无外键）',
  `group_id` BIGINT UNSIGNED NULL COMMENT '所属分组（想吃/常吃/自定义）',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '收藏时间',
  `deleted_at` DATETIME NULL COMMENT '软删除时间：NULL=有效',
  `valid_flag` BIGINT GENERATED ALWAYS AS (IF(`deleted_at` IS NULL, 1, NULL)) STORED COMMENT '有效行标志',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_favorite` (`user_id`, `biz_type`, `biz_id`, `valid_flag`),
  KEY `idx_favorite_biz` (`biz_type`, `biz_id`),
  KEY `idx_favorite_group` (`group_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='收藏（favorite）；多态，CON-23 级联软删';

CREATE TABLE IF NOT EXISTS `favorite_group` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '分组标识',
  `user_id` BIGINT UNSIGNED NOT NULL COMMENT '分组归属用户',
  `group_name` VARCHAR(64) NOT NULL COMMENT '分组名（想吃/常吃/自定义）',
  `is_default` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否默认分组',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `deleted_at` DATETIME NULL COMMENT '软删除时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_favorite_group` (`user_id`, `group_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='收藏分组（favorite_group）';

CREATE TABLE IF NOT EXISTS `report` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '举报记录',
  `reporter_id` BIGINT UNSIGNED NOT NULL COMMENT '举报用户',
  `biz_type` TINYINT NOT NULL COMMENT '目标类型 1=点位 2=档口 3=菜品 4=帖子 5=评论 6=评价；纠错不设独立目标类型（由 reason 与实际对象表达，避免指向不存在的 correction 表）',
  `biz_id` BIGINT UNSIGNED NOT NULL COMMENT '举报目标ID（多态无外键）',
  `reason` TINYINT NOT NULL COMMENT '1=广告骚扰 2=辱骂攻击 3=虚假信息 4=隐私泄露 5=其他',
  `status` TINYINT NOT NULL DEFAULT 0 COMMENT '0=待处理 1=已处理 2=已驳回',
  `handled_by` BIGINT UNSIGNED NULL COMMENT '处理管理员（待处理时为空）',
  `handled_at` DATETIME NULL COMMENT '处理完成时间',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '举报时间',
  PRIMARY KEY (`id`),
  KEY `idx_report_biz` (`biz_type`, `biz_id`),
  KEY `idx_report_status_time` (`status`, `created_at`),
  CONSTRAINT `ck_report_biz_type` CHECK (`biz_type` BETWEEN 1 AND 6),
  CONSTRAINT `ck_report_status` CHECK (`status` IN (0,1,2))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='举报（report）；多态，CON-23 级联软删';

CREATE TABLE IF NOT EXISTS `review_dimension` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '维度标识',
  `code` VARCHAR(32) NOT NULL COMMENT '维度编码（taste/portion/package/queue/delivery）',
  `name` VARCHAR(32) NOT NULL COMMENT '维度名（口味/份量/包装/排队体验/配送速度）',
  `is_required` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '0=非必评 1=必评（口味/份量=1）',
  `sort` INT NULL COMMENT '打分组件展示顺序',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_review_dimension_code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='评分维度字典（review_dimension）；GET /dimensions 数据源';

CREATE TABLE IF NOT EXISTS `review_dimension_meal_mode` (
  `dimension_id` BIGINT UNSIGNED NOT NULL COMMENT '评分维度',
  `meal_mode` TINYINT NOT NULL COMMENT '1=堂食 2=打包 3=外送',
  PRIMARY KEY (`dimension_id`, `meal_mode`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='维度适用就餐方式（review_dimension_meal_mode）';

CREATE TABLE IF NOT EXISTS `review_summary` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '汇总行标识',
  `biz_type` TINYINT NOT NULL COMMENT '1=点位 2=档口 3=菜品',
  `biz_id` BIGINT UNSIGNED NOT NULL COMMENT '对象ID（多态无外键）',
  `dimension_id` BIGINT UNSIGNED NOT NULL COMMENT '统计维度（FK→review_dimension）',
  `avg_score` DECIMAL(3,2) NOT NULL COMMENT '该维度均分',
  `review_count` INT NOT NULL DEFAULT 0 COMMENT '参与统计的评价数（原count，改名避免保留字）',
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最近刷新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_review_summary` (`biz_type`, `biz_id`, `dimension_id`),
  KEY `idx_review_summary_dim` (`dimension_id`),
  KEY `idx_review_summary_biz` (`biz_type`, `biz_id`),
  CONSTRAINT `ck_summary_avg` CHECK (`avg_score` >= 1.0 AND `avg_score` <= 5.0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='评价汇总（review_summary）；只统计 status=0 AND deleted_at IS NULL；发布/删除/下架/申诉通过 四处触发重算（CON-26）';

CREATE TABLE IF NOT EXISTS `review_appeal` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '申诉标识',
  `review_id` BIGINT UNSIGNED NOT NULL COMMENT '被申诉的评价',
  `user_id` BIGINT UNSIGNED NOT NULL COMMENT '申诉人（评价作者）',
  `reason` VARCHAR(255) NOT NULL COMMENT '申诉理由',
  `status` TINYINT NOT NULL DEFAULT 0 COMMENT '0=待处理 1=通过 2=驳回',
  `handled_by` BIGINT UNSIGNED NULL COMMENT '处理管理员',
  `handled_at` DATETIME NULL COMMENT '处理时间',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '申诉时间',
  PRIMARY KEY (`id`),
  KEY `idx_appeal_review` (`review_id`),
  KEY `idx_appeal_status` (`status`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='评价申诉（review_appeal）';

CREATE TABLE IF NOT EXISTS `check_in` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '打卡标识',
  `user_id` BIGINT UNSIGNED NOT NULL COMMENT '打卡用户',
  `location_id` BIGINT UNSIGNED NOT NULL COMMENT '关联点位（必填）',
  `check_in_date` DATE NOT NULL COMMENT '就餐日期（干饭日历 P12 按此聚合）',
  `visibility` TINYINT NOT NULL DEFAULT 1 COMMENT '1=仅记录 2=私有 3=公开',
  `note` VARCHAR(255) NULL COMMENT '可选随笔',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted_at` DATETIME NULL COMMENT '软删除时间',
  PRIMARY KEY (`id`),
  KEY `idx_check_in_user_date` (`user_id`, `check_in_date`),
  KEY `idx_check_in_location_date` (`location_id`, `check_in_date`),
  UNIQUE KEY `uk_check_in_dup` (`user_id`, `location_id`, `check_in_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='打卡（check_in）；E 轮：photos 子表承载，photos 行已删';

CREATE TABLE IF NOT EXISTS `check_in_image` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '图片行标识',
  `check_in_id` BIGINT UNSIGNED NOT NULL COMMENT '所属打卡',
  `object_key` VARCHAR(255) NOT NULL COMMENT 'MinIO 对象键（拍板0.4）',
  `sort` INT NULL COMMENT '展示顺序',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `deleted_at` DATETIME NULL COMMENT '软删除时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_check_in_image` (`check_in_id`, `object_key`),
  KEY `idx_check_in_image` (`check_in_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='打卡图片（check_in_image）';

CREATE TABLE IF NOT EXISTS `check_in_dish` (
  `check_in_id` BIGINT UNSIGNED NOT NULL COMMENT '所属打卡',
  `dish_id` BIGINT UNSIGNED NOT NULL COMMENT '消费的菜品',
  `quantity` INT NULL DEFAULT 1 COMMENT '消费数量（B图4补）',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`check_in_id`, `dish_id`),
  KEY `idx_cid_dish` (`dish_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='打卡菜品（check_in_dish）';

CREATE TABLE IF NOT EXISTS `journal` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '手账标识',
  `check_in_id` BIGINT UNSIGNED NOT NULL COMMENT '关联打卡（0..1）',
  `note` TEXT NULL COMMENT '手账文字内容',
  `template` VARCHAR(64) NULL COMMENT '手账排版模板（取值待产品定，QC-20）',
  `is_private` TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1=私有（默认） 0=公开；转公开/转草稿须经用户主动操作',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted_at` DATETIME NULL COMMENT '软删除时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_journal_check_in` (`check_in_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='手账（journal）；照片见 journal_image 子表';

CREATE TABLE IF NOT EXISTS `journal_image` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '图片行标识',
  `journal_id` BIGINT UNSIGNED NOT NULL COMMENT '所属手账',
  `object_key` VARCHAR(255) NOT NULL COMMENT 'MinIO 对象键（拍板0.4）',
  `sort` INT NULL COMMENT '展示顺序',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `deleted_at` DATETIME NULL COMMENT '软删除时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_journal_image` (`journal_id`, `object_key`),
  KEY `idx_journal_image` (`journal_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='手账图片（journal_image）';

CREATE TABLE IF NOT EXISTS `footprint` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '足迹标识',
  `user_id` BIGINT UNSIGNED NOT NULL COMMENT '足迹归属用户',
  `location_id` BIGINT UNSIGNED NOT NULL COMMENT '到访点位',
  `first_visit_at` DATETIME NOT NULL COMMENT '首次到访时间（重复打卡不更新）',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `deleted_at` DATETIME NULL COMMENT '软删除时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_footprint` (`user_id`, `location_id`),
  KEY `idx_footprint_location` (`location_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='足迹（footprint）；E 轮：check_in.is_first_visit 已删';

CREATE TABLE IF NOT EXISTS `achievement` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '成就定义标识',
  `metric_type` TINYINT NOT NULL COMMENT '1=打卡次数 2=不同点位数 3=评价数量 4=获赞数',
  `target_value` INT NOT NULL COMMENT '解锁目标值（拟定：100/30/50/500）',
  `title` VARCHAR(64) NOT NULL COMMENT '成就标题',
  `description` VARCHAR(255) NULL COMMENT '成就说明文案',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_achievement_metric` (`metric_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='成就定义（achievement）；四项指标（口径#5）';

CREATE TABLE IF NOT EXISTS `user_achievement` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '用户成就行标识',
  `user_id` BIGINT UNSIGNED NOT NULL COMMENT '进度归属用户',
  `achievement_id` BIGINT UNSIGNED NOT NULL COMMENT '对应成就定义',
  `progress` INT NOT NULL DEFAULT 0 COMMENT '当前进度值',
  `unlocked` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否已解锁（每25%一档为展示层）',
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最近刷新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_user_achievement` (`user_id`, `achievement_id`),
  KEY `idx_ua_achievement` (`achievement_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='用户成就（user_achievement）';

CREATE TABLE IF NOT EXISTS `pet` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '宠物标识',
  `user_id` BIGINT UNSIGNED NOT NULL COMMENT '宠物归属用户（1:1）',
  `skin` VARCHAR(64) NULL COMMENT '宠物外观（表情/装扮切换）',
  `status` TINYINT NOT NULL DEFAULT 0 COMMENT '0=正常 1=饥饿（派生缓存，每日重算禁手工写）',
  `level` INT NULL COMMENT '宠物等级（P14 等级进度条）',
  `lit_days` INT NULL COMMENT '累计点亮天数（P14）',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted_at` DATETIME NULL COMMENT '软删除时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_pet_user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='宠物（pet）；satiety 已删（E轮），status 派生缓存';

CREATE TABLE IF NOT EXISTS `feed_record` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '喂食记录',
  `user_id` BIGINT UNSIGNED NOT NULL COMMENT '喂食用户',
  `pet_id` BIGINT UNSIGNED NOT NULL COMMENT '被喂食宠物',
  `coin_cost` INT NOT NULL DEFAULT 10 COMMENT '本次消耗金币（拟定值10）',
  `fed_at` DATETIME NOT NULL COMMENT '喂食时间（每日3次限制判断）',
  `emotion_result` TINYINT NOT NULL DEFAULT 1 COMMENT '宠物表情反馈：1=满足（表情切换）',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`id`),
  KEY `idx_feed_user_time` (`user_id`, `fed_at`),
  KEY `idx_feed_pet` (`pet_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='喂食记录（feed_record）';

CREATE TABLE IF NOT EXISTS `coin_transaction` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '金币流水',
  `user_id` BIGINT UNSIGNED NOT NULL COMMENT '流水归属用户',
  `change_type` TINYINT NOT NULL COMMENT '1=任务奖励 2=喂食消耗 3=系统调整',
  `amount` INT NOT NULL COMMENT '变动量（奖励为正、消耗为负）',
  `biz_type` TINYINT NULL COMMENT '来源对象类型（任务/打卡/评价等）',
  `biz_id` BIGINT UNSIGNED NULL COMMENT '来源对象ID（多态无外键）',
  `balance_after` INT NULL COMMENT '变动后余额（对账用）',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '流水时间',
  PRIMARY KEY (`id`),
  KEY `idx_coin_user_time` (`user_id`, `created_at`),
  KEY `idx_coin_biz` (`biz_type`, `biz_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='金币流水（coin_transaction）';

CREATE TABLE IF NOT EXISTS `task` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '任务标识',
  `task_type` TINYINT NOT NULL COMMENT '1=每日任务 2=成长任务',
  `name` VARCHAR(64) NOT NULL COMMENT '任务名（如 每日打卡）',
  `action_type` TINYINT NOT NULL COMMENT '1=打卡 2=写点评 3=喂食 4=收藏 5=互动 6=分享',
  `reward_coins` INT NOT NULL COMMENT '奖励金币（拟定值 10/20/5/5/5/10，合计55/日）',
  `enabled` TINYINT(1) NOT NULL DEFAULT 1 COMMENT '是否上架',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_task_type_action` (`task_type`, `action_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='任务（task）；金币拟定值，可 UPDATE';

CREATE TABLE IF NOT EXISTS `task_claim` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '领取记录',
  `user_id` BIGINT UNSIGNED NOT NULL COMMENT '领取用户',
  `task_id` BIGINT UNSIGNED NOT NULL COMMENT '所属任务',
  `claim_date` DATE NOT NULL COMMENT '任务日期（每日任务按日去重）',
  `status` TINYINT NOT NULL DEFAULT 0 COMMENT '0=未完成 1=待领取 2=已领取',
  `completed_at` DATETIME NULL COMMENT '达成条件时间',
  `claimed_at` DATETIME NULL COMMENT '领取奖励时间（金币不追回口径）',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_task_claim` (`user_id`, `task_id`, `claim_date`),
  KEY `idx_task_claim_task_date` (`task_id`, `claim_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='任务领取记录（task_claim）；CON-21 每日限领';

CREATE TABLE IF NOT EXISTS `sticker` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '贴纸标识',
  `user_id` BIGINT UNSIGNED NOT NULL COMMENT '贴纸归属用户',
  `object_key` VARCHAR(255) NOT NULL COMMENT 'MinIO 对象键',
  `category` TINYINT NULL COMMENT '贴纸分类（取值待产品定，QC-20）',
  `source_image_key` VARCHAR(255) NULL COMMENT '抠图来源图（MinIO object_key）',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`id`),
  KEY `idx_sticker_user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='用户贴纸（sticker）';

CREATE TABLE IF NOT EXISTS `post` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '帖子标识',
  `user_id` BIGINT UNSIGNED NOT NULL COMMENT '作者',
  `content` TEXT NOT NULL COMMENT '帖子正文',
  `images` JSON NULL COMMENT '图片（JSON 数组，元素为 MinIO object_key）',
  `post_type` TINYINT NOT NULL DEFAULT 1 COMMENT '1=动态 2=长帖（二期） 3=手账转帖',
  `journal_id` BIGINT UNSIGNED NULL COMMENT '来源手账（手账转帖回链）',
  `status` TINYINT NOT NULL DEFAULT 0 COMMENT '0=正常展示 1=下架（先发后审）',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '发布时间',
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted_at` DATETIME NULL COMMENT '软删除时间',
  PRIMARY KEY (`id`),
  KEY `idx_post_user_time` (`user_id`, `created_at`),
  KEY `idx_post_status_time` (`status`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='帖子（post）；长帖二期预留';

CREATE TABLE IF NOT EXISTS `post_link` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '关联标识',
  `post_id` BIGINT UNSIGNED NOT NULL COMMENT '所属帖子',
  `biz_type` TINYINT NOT NULL DEFAULT 1 COMMENT '1=点位 2=菜品',
  `biz_id` BIGINT UNSIGNED NOT NULL COMMENT '关联对象ID（多态无外键）',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_post_link` (`post_id`, `biz_type`, `biz_id`),
  KEY `idx_post_link_biz` (`biz_type`, `biz_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='帖子关联（post_link）；多态，CON-23 级联软删';

CREATE TABLE IF NOT EXISTS `review_reply` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '评论标识',
  `user_id` BIGINT UNSIGNED NOT NULL COMMENT '评论作者',
  `content` TEXT NOT NULL COMMENT '评论文字',
  `parent_type` TINYINT NOT NULL DEFAULT 1 COMMENT '1=帖子 2=评价（多态父对象）',
  `parent_id` BIGINT UNSIGNED NOT NULL COMMENT '多态父对象ID',
  `reply_to_comment_id` BIGINT UNSIGNED NULL COMMENT '楼中楼：指向被回复评论',
  `status` TINYINT NOT NULL DEFAULT 0 COMMENT '0=正常展示 1=下架',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '评论时间',
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted_at` DATETIME NULL COMMENT '软删除时间',
  PRIMARY KEY (`id`),
  KEY `idx_reply_parent` (`parent_type`, `parent_id`),
  KEY `idx_reply_user_time` (`user_id`, `created_at`),
  KEY `idx_reply_reply_to` (`reply_to_comment_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='评论（review_reply）；多态父对象 + 楼中楼自引用';

CREATE TABLE IF NOT EXISTS `notification` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '通知标识',
  `user_id` BIGINT UNSIGNED NOT NULL COMMENT '接收用户',
  `type` TINYINT NOT NULL COMMENT '1=评价获赞 2=帖子互动 3=审核结果 4=举报处理结果 5=系统消息',
  `biz_type` TINYINT NULL COMMENT '跳转目标类型（多态无外键）',
  `biz_id` BIGINT UNSIGNED NULL COMMENT '跳转目标ID',
  `is_read` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '0=未读 1=已读',
  `content` VARCHAR(255) NOT NULL COMMENT '通知文案（含跳转摘要）',
  `merge_key` VARCHAR(64) NULL COMMENT '同类合并展示键＝type＋biz_type（不含日期，跨天仍合并）；空=不合并；如需按天合并，由实现方加日期后缀并在此注明',
  `merge_count` INT NOT NULL DEFAULT 1 COMMENT '合并组内未读数；用户读过整组后归零（非条数累计）',
  `last_at` DATETIME NULL COMMENT '合并组内最近一条时间（列表排序用；created_at 为组内首条）',
  `deleted_at` DATETIME NULL COMMENT '软删除时间',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '通知产生时间（合并组内为首条时间）',
  PRIMARY KEY (`id`),
  KEY `idx_notification_user_read` (`user_id`, `is_read`, `type`, `created_at`),
  KEY `idx_notification_biz` (`biz_type`, `biz_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='通知（notification）';

CREATE TABLE IF NOT EXISTS `audit_record` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '审核记录标识',
  `biz_type` TINYINT NOT NULL COMMENT '1=点位 2=档口 3=菜品 4=纠错 5=帖子 6=评论 7=评价',
  `biz_id` BIGINT UNSIGNED NOT NULL COMMENT '审核目标ID（多态无外键）',
  `submitter_id` BIGINT UNSIGNED NOT NULL COMMENT '内容提交者',
  `auditor_id` BIGINT UNSIGNED NULL COMMENT '审核管理员（待审核时为空）',
  `status` TINYINT NOT NULL DEFAULT 0 COMMENT '0=待审核 1=通过 2=驳回',
  `reason` VARCHAR(255) NULL COMMENT '驳回/处置原因',
  `version` INT NOT NULL DEFAULT 1 COMMENT '第几次提交（重提+1）',
  `resubmit_from_id` BIGINT UNSIGNED NULL COMMENT '重提来源（被驳回记录）',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '提交时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_audit_version` (`biz_type`, `biz_id`, `version`),
  KEY `idx_audit_biz` (`biz_type`, `biz_id`),
  KEY `idx_audit_status_time` (`status`, `created_at`),
  KEY `idx_audit_submitter` (`submitter_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='审核记录（audit_record）；E 审核：version + 重提链';

CREATE TABLE IF NOT EXISTS `draft` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '草稿标识',
  `user_id` BIGINT UNSIGNED NOT NULL COMMENT '草稿归属用户',
  `draft_type` TINYINT NOT NULL COMMENT '1=点评 2=动态 3=长帖 4=手账转帖',
  `payload` JSON NOT NULL COMMENT '草稿整体快照（图片为 object_key 数组）',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最近保存时间',
  `deleted_at` DATETIME NULL COMMENT '软删除时间',
  PRIMARY KEY (`id`),
  KEY `idx_draft_user_type` (`user_id`, `draft_type`, `updated_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='草稿（draft）';

CREATE TABLE IF NOT EXISTS `follow_relation` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '关注标识',
  `follower_id` BIGINT UNSIGNED NOT NULL COMMENT '关注人（发起方）',
  `followee_id` BIGINT UNSIGNED NOT NULL COMMENT '被关注人',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '关注时间',
  `deleted_at` DATETIME NULL COMMENT '软删除时间：NULL=有效（取消关注=写入 deleted_at）',
  `valid_flag` BIGINT GENERATED ALWAYS AS (IF(`deleted_at` IS NULL, 1, NULL)) STORED COMMENT '有效行标志',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_follow` (`follower_id`, `followee_id`, `valid_flag`),
  KEY `idx_follow_followee` (`followee_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='关注关系（follow_relation）；互关=双向两行';

CREATE TABLE IF NOT EXISTS `operation_log` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '日志标识',
  `operator_id` BIGINT UNSIGNED NOT NULL COMMENT '操作管理员',
  `action_type` TINYINT NULL COMMENT '操作类型（审核/驳回/封禁/数据维护等，取值待产品定）',
  `biz_type` TINYINT NULL COMMENT '操作对象类型（多态）',
  `biz_id` BIGINT UNSIGNED NULL COMMENT '操作对象ID',
  `result` TINYINT NULL COMMENT '操作结果（取值待产品定）',
  `content` VARCHAR(255) NULL COMMENT '操作摘要',
  `reason` VARCHAR(255) NULL COMMENT '操作原因',
  `operated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '操作发生时间（区别于 created_at 落库时间）',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '操作时间',
  PRIMARY KEY (`id`),
  KEY `idx_oplog_operator_time` (`operator_id`, `created_at`),
  KEY `idx_oplog_biz` (`biz_type`, `biz_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='操作日志（operation_log）';

CREATE TABLE IF NOT EXISTS `banned_word` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '词库行标识',
  `word` VARCHAR(64) NOT NULL COMMENT '敏感词',
  `category` TINYINT NOT NULL COMMENT '1=广告 2=辱骂 3=隐私 4=其他',
  `status` TINYINT NOT NULL DEFAULT 1 COMMENT '0=停用 1=启用',
  `severity` TINYINT NOT NULL DEFAULT 1 COMMENT '1=低级（替换占位符后照常发布） 2=高级（转人工待审）',
  `action` TINYINT NOT NULL DEFAULT 2 COMMENT '处置方式 1=替换 2=拦截(422)；高级词转人工待审→review.status=2（G-02）',
  `created_by` BIGINT UNSIGNED NULL COMMENT '词库维护管理员',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '登记时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_banned_word` (`word`),
  KEY `idx_banned_status` (`status`),
  CONSTRAINT `ck_bw_severity` CHECK (`severity` IN (1,2)),
  CONSTRAINT `ck_bw_action` CHECK (`action` IN (1,2))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='敏感词库（banned_word）';

CREATE TABLE IF NOT EXISTS `upload_asset` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '资产标识',
  `object_key` VARCHAR(255) NOT NULL COMMENT 'MinIO 对象键',
  `hash_dhash` VARCHAR(64) NOT NULL COMMENT 'dHash 感知哈希',
  `size` INT NOT NULL COMMENT '文件字节数（≤5MB）',
  `mime` VARCHAR(64) NOT NULL COMMENT '文件 MIME 类型',
  `uploader_id` BIGINT UNSIGNED NULL COMMENT '上传用户（可空）',
  `ref_count` INT NOT NULL DEFAULT 0 COMMENT '被引用次数（0可垃圾回收）',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '上传时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_upload_dhash` (`hash_dhash`),
  KEY `idx_upload_uploader` (`uploader_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='上传资产（upload_asset）；dHash 判重＋引用计数垃圾回收';

CREATE TABLE IF NOT EXISTS `point_submit` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '提交标识',
  `submitter_id` BIGINT UNSIGNED NOT NULL COMMENT '提交人（FK→user）',
  `submit_type` TINYINT NOT NULL COMMENT '0=点位 1=档口 2=菜品',
  `target_id` BIGINT UNSIGNED NULL COMMENT '挂靠对象：提交档口时为点位 ID，提交菜品时为档口 ID',
  `payload` JSON NOT NULL COMMENT '提交内容（结构同对应主表字段）',
  `audit_status` TINYINT NOT NULL DEFAULT 0 COMMENT '0=待审 1=通过 2=驳回',
  `auditor_id` BIGINT UNSIGNED NULL COMMENT '审核管理员（FK→user）',
  `audit_comment` VARCHAR(255) NOT NULL DEFAULT '' COMMENT '审核意见',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '提交时间',
  PRIMARY KEY (`id`),
  KEY `idx_ps_status_time` (`audit_status`, `created_at`),
  CONSTRAINT `ck_ps_type` CHECK (`submit_type` IN (0,1,2)),
  CONSTRAINT `ck_ps_audit` CHECK (`audit_status` IN (0,1,2))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='众包录入申请（point_submit）；通过后写主表';

CREATE TABLE IF NOT EXISTS `recommendation` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '推荐结果标识',
  `user_id` BIGINT UNSIGNED NOT NULL COMMENT '推荐归属用户',
  `scene` TINYINT NOT NULL DEFAULT 1 COMMENT '1=首页推荐 2=智能饮食推荐',
  `source_type` TINYINT NOT NULL DEFAULT 1 COMMENT '1=规则 2=热门 3=AI（AI 不可用降级为规则/热门）',
  `rule_id` BIGINT UNSIGNED NULL COMMENT '命中规则（规则生成时填）',
  `reason` VARCHAR(255) NOT NULL COMMENT '说明推荐依据',
  `question` VARCHAR(255) NULL COMMENT '智能饮食推荐的用户提问（B图6）',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '推荐时间',
  PRIMARY KEY (`id`),
  KEY `idx_rec_user_time` (`user_id`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='推荐结果（recommendation）';

CREATE TABLE IF NOT EXISTS `recommendation_rule` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '规则标识',
  `name` VARCHAR(64) NOT NULL COMMENT '规则名',
  `condition_expr` JSON NOT NULL COMMENT '命中条件（结构化 JSON：字段/算子/值，如 忌口∩标签）',
  `action` VARCHAR(32) NULL COMMENT '硬动作：剔除/降级（安全类；可空=纯打分，B 2.0 三段式）',
  `weight` DECIMAL(5,2) NULL COMMENT '软排序权重（偏好类，可负）',
  `enabled` TINYINT(1) NOT NULL DEFAULT 1 COMMENT '是否启用',
  `priority` INT NOT NULL DEFAULT 0 COMMENT '执行优先级',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`id`),
  KEY `idx_rec_rule_enabled` (`enabled`, `priority`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='推荐规则（recommendation_rule）；条件+动作+权重三段式（B 2.0）';

CREATE TABLE IF NOT EXISTS `recommendation_item` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '推荐项标识',
  `recommendation_id` BIGINT UNSIGNED NOT NULL COMMENT '所属推荐结果',
  `biz_type` TINYINT NOT NULL DEFAULT 1 COMMENT '1=点位 2=菜品',
  `biz_id` BIGINT UNSIGNED NOT NULL COMMENT '推荐对象ID',
  `score` DECIMAL(5,2) NULL COMMENT '推荐得分',
  PRIMARY KEY (`id`),
  KEY `idx_rec_item_rec` (`recommendation_id`),
  KEY `idx_rec_item_biz` (`biz_type`, `biz_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='推荐项（recommendation_item）';

CREATE TABLE IF NOT EXISTS `taste_profile` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '画像标识',
  `user_id` BIGINT UNSIGNED NOT NULL COMMENT '画像所属用户（0..1，数据不足不强行生成）',
  `spice_level` TINYINT NULL COMMENT '辣度接受度（1–5 档）',
  `taste_style` VARCHAR(64) NULL COMMENT '口味风格（自由文本，QC-20 枚举化待定）',
  `spend_tendency` VARCHAR(64) NULL COMMENT '消费水平倾向（QC-20）',
  `common_scene` VARCHAR(64) NULL COMMENT '常去就餐场所（需求原文作常见场景；QC-20）',
  `queue_tolerance` VARCHAR(64) NULL COMMENT '排队接受度档位（QC-20）',
  `mbti_code` VARCHAR(4) NULL COMMENT '饭MBTI 16型编码（可空）',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted_at` DATETIME NULL COMMENT '软删除时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_taste_user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='口味画像（taste_profile）；授权后生成，撤回授权停用';

CREATE TABLE IF NOT EXISTS `diet_plan` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '计划标识',
  `user_id` BIGINT UNSIGNED NOT NULL COMMENT '计划归属用户',
  `period` TINYINT NOT NULL COMMENT '1=单日 3=三日 7=七日',
  `generation_method` TINYINT NOT NULL DEFAULT 1 COMMENT '1=规则 2=模板 3=AI',
  `status` TINYINT NOT NULL DEFAULT 1 COMMENT '生效/已过期/已废弃（取值待产品定，QC-20）',
  `estimated_budget` DECIMAL(10,2) NOT NULL COMMENT '计划总预算',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted_at` DATETIME NULL COMMENT '软删除时间',
  PRIMARY KEY (`id`),
  KEY `idx_diet_user_time` (`user_id`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='饮食计划（diet_plan）';

CREATE TABLE IF NOT EXISTS `diet_plan_item` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '计划项标识',
  `plan_id` BIGINT UNSIGNED NOT NULL COMMENT '所属计划',
  `dish_id` BIGINT UNSIGNED NOT NULL COMMENT '安排的菜品（可跳详情）',
  `dining_date` DATE NOT NULL COMMENT '当日排期日期',
  `meal_type` TINYINT NOT NULL DEFAULT 1 COMMENT '1=早 2=午 3=晚',
  `estimated_price` DECIMAL(10,2) NULL COMMENT '该餐估算价格',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `deleted_at` DATETIME NULL COMMENT '软删除时间',
  PRIMARY KEY (`id`),
  KEY `idx_dpi_plan_date` (`plan_id`, `dining_date`),
  KEY `idx_dpi_dish` (`dish_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='饮食计划项（diet_plan_item）';

CREATE TABLE IF NOT EXISTS `preference_analysis` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '分析记录标识',
  `user_id` BIGINT UNSIGNED NOT NULL COMMENT '分析归属用户',
  `source_type` TINYINT NULL COMMENT '分析来源（取值待产品定）',
  `result` JSON NULL COMMENT '分析结果（JSON）',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '分析时间',
  PRIMARY KEY (`id`),
  KEY `idx_pref_user_time` (`user_id`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='偏好分析（preference_analysis）';

CREATE TABLE IF NOT EXISTS `browse_event` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '行为事件标识',
  `user_id` BIGINT UNSIGNED NULL COMMENT '行为用户（可空=游客）',
  `event_type` TINYINT NOT NULL COMMENT '行为类型（浏览点位/浏览菜品/搜索等，取值待产品定）',
  `biz_type` TINYINT NULL COMMENT '行为对象类型',
  `biz_id` BIGINT UNSIGNED NULL COMMENT '行为对象标识',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '行为时间（撤回授权后不再用于画像/推荐）',
  PRIMARY KEY (`id`),
  KEY `idx_browse_user_time` (`user_id`, `created_at`),
  KEY `idx_browse_biz` (`biz_type`, `biz_id`),
  KEY `idx_browse_type_time` (`event_type`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='浏览行为记录（browse_event）；日志型追加写，受隐私授权约束';

CREATE TABLE IF NOT EXISTS `ai_provider` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '供应商行标识',
  `name` VARCHAR(64) NOT NULL COMMENT '供应商名',
  `base_url` VARCHAR(255) NOT NULL COMMENT '接口地址（OpenAI 兼容协议）',
  `api_key_ref` VARCHAR(255) NOT NULL COMMENT '密钥的引用/密文（禁止明文入库）',
  `model` VARCHAR(64) NOT NULL COMMENT '模型名',
  `is_active` TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1=启用 0=停用（停用即时从前台隐藏）',
  `priority` INT NOT NULL DEFAULT 0 COMMENT '优先级（降级顺序）',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '登记时间',
  PRIMARY KEY (`id`),
  KEY `idx_ai_provider_active` (`is_active`, `priority`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='AI 供应商注册表（ai_provider）；启动自愈播种';

CREATE TABLE IF NOT EXISTS `ai_conversation` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '会话标识',
  `user_id` BIGINT UNSIGNED NOT NULL COMMENT '会话归属用户',
  `provider_id` BIGINT UNSIGNED NULL COMMENT '会话使用的供应商（可空=规则降级会话）',
  `title` VARCHAR(128) NULL COMMENT '会话标题',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '会话创建时间',
  `deleted_at` DATETIME NULL COMMENT '软删除时间（删除会话级联软删消息）',
  PRIMARY KEY (`id`),
  KEY `idx_ai_conv_user_time` (`user_id`, `created_at`),
  KEY `idx_ai_conv_provider` (`provider_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='AI 会话（ai_conversation）';

CREATE TABLE IF NOT EXISTS `ai_chat_message` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '消息标识',
  `session_id` BIGINT UNSIGNED NOT NULL COMMENT '所属会话',
  `role` TINYINT NOT NULL DEFAULT 1 COMMENT '1=user 2=assistant 3=system',
  `content` TEXT NOT NULL COMMENT '消息内容',
  `tokens` INT NULL COMMENT '消息 token 数',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '消息时间',
  `deleted_at` DATETIME NULL COMMENT '软删除时间',
  PRIMARY KEY (`id`),
  KEY `idx_ai_msg_session` (`session_id`, `id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='AI 会话消息（ai_chat_message）';

CREATE TABLE IF NOT EXISTS `ai_platform_model` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '目录标识',
  `name` VARCHAR(64) NOT NULL COMMENT '展示名称',
  `protocol` VARCHAR(16) NOT NULL DEFAULT 'openai' COMMENT 'openai 兼容 / anthropic 原生',
  `base_url` VARCHAR(200) NOT NULL COMMENT '接口地址',
  `model_id` VARCHAR(64) NOT NULL COMMENT '模型 ID（官方模型名）',
  `api_key_cipher` TEXT NOT NULL COMMENT 'API 密钥密文（AES-256-GCM, iv+tag+ciphertext base64）；主密钥不入库',
  `enabled` TINYINT NOT NULL DEFAULT 1 COMMENT '是否启用（停用后用户端隐藏）',
  `sort_order` INT NOT NULL DEFAULT 0 COMMENT '排序（小在前）',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='平台托管模型目录';

CREATE TABLE IF NOT EXISTS `ai_model` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '配置标识',
  `user_id` BIGINT UNSIGNED NOT NULL COMMENT '归属用户（FK→user）',
  `platform_id` BIGINT UNSIGNED NULL COMMENT '平台托管模型引用（FK→ai_platform_model，非空=引用行）',
  `provider_key` VARCHAR(32) NOT NULL COMMENT '供应商标识（引用行固定 platform）',
  `protocol` VARCHAR(16) NOT NULL DEFAULT 'openai' COMMENT '接口类型快照',
  `base_url` VARCHAR(200) NOT NULL DEFAULT '' COMMENT '接口地址',
  `model_id` VARCHAR(64) NOT NULL DEFAULT '' COMMENT '模型 ID',
  `display_name` VARCHAR(64) NOT NULL DEFAULT '' COMMENT '展示名称（空=显示模型 ID）',
  `api_key_cipher` TEXT NOT NULL COMMENT 'API 密钥密文（引用行存平台密钥副本）；主密钥不入库',
  `is_selected` TINYINT NOT NULL DEFAULT 0 COMMENT '使用中（单用户仅一条为 1）',
  `selected_flag` TINYINT GENERATED ALWAYS AS (IF(`is_selected` = 1, 1, NULL)) STORED COMMENT '生成列：用于唯一键兜住单条选中',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_user_selected` (`user_id`, `selected_flag`),
  KEY `idx_ai_model_user` (`user_id`),
  KEY `idx_ai_model_platform` (`platform_id`),
  CONSTRAINT `ck_ai_model_selected` CHECK (`is_selected` IN (0,1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='用户自配模型（BYOK）；密钥加密入库，主密钥外置';
