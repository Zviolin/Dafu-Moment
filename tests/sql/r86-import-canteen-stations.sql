-- r86：校内食堂档口导入（幂等，可重跑）
-- 来源：Dafu-Moment data/db3/collection/round2/ffm-qishan.geojson 中 8 个「食堂」要素的 properties.include.name
--       共 28 个档口（notes 标注为「档口 / 连锁」）；源库 78 表 SQL 未插入任何食堂档口与菜单，
--       因此这里只建档口，不写菜品（不编造菜单，见 real-data.json 的 data_notes.canteen_station_caliber）
-- 说明：档口坐标沿用 seed.js 的确定性偏移（lat ±(si%5-2)*0.0004 / lng ±(floor(si/5)%5-2)*0.0004），
--       便于地图页档口标记不重叠；封面按 category 取预设图（与 seed.js 的 CATEGORY_COVER 一致）
-- 运行：docker exec -i dafu-mysql mysql -uroot -p*** -D dafu --default-character-set=utf8mb4 < tests/sql/r86-import-canteen-stations.sql
USE dafu;

-- 玫瑰园食惠餐厅（qishan-009，include 7 个：档口×4 + 连锁×3）
INSERT INTO station (canteen_id, name, category, cover_object_key, lat, lng)
SELECT c.id, '食惠烧腊', '卤味', 'preset:fries', c.lat - 0.0008, c.lng - 0.0008 FROM canteen c
WHERE c.name = '玫瑰园食惠餐厅' AND c.type = 0
  AND NOT EXISTS (SELECT 1 FROM station s WHERE s.canteen_id = c.id AND s.name = '食惠烧腊');
INSERT INTO station (canteen_id, name, category, cover_object_key, lat, lng)
SELECT c.id, '咖喱饭', '米饭套餐', 'preset:rice', c.lat - 0.0004, c.lng - 0.0008 FROM canteen c
WHERE c.name = '玫瑰园食惠餐厅' AND c.type = 0
  AND NOT EXISTS (SELECT 1 FROM station s WHERE s.canteen_id = c.id AND s.name = '咖喱饭');
INSERT INTO station (canteen_id, name, category, cover_object_key, lat, lng)
SELECT c.id, '老顺德干蒸菜', '家常炒菜', 'preset:wok', c.lat, c.lng - 0.0008 FROM canteen c
WHERE c.name = '玫瑰园食惠餐厅' AND c.type = 0
  AND NOT EXISTS (SELECT 1 FROM station s WHERE s.canteen_id = c.id AND s.name = '老顺德干蒸菜');
INSERT INTO station (canteen_id, name, category, cover_object_key, lat, lng)
SELECT c.id, '小街胡同', '综合', 'preset:rice', c.lat + 0.0004, c.lng - 0.0008 FROM canteen c
WHERE c.name = '玫瑰园食惠餐厅' AND c.type = 0
  AND NOT EXISTS (SELECT 1 FROM station s WHERE s.canteen_id = c.id AND s.name = '小街胡同');
INSERT INTO station (canteen_id, name, category, cover_object_key, lat, lng)
SELECT c.id, '塔斯汀', '汉堡简餐', 'preset:burger', c.lat + 0.0008, c.lng - 0.0008 FROM canteen c
WHERE c.name = '玫瑰园食惠餐厅' AND c.type = 0
  AND NOT EXISTS (SELECT 1 FROM station s WHERE s.canteen_id = c.id AND s.name = '塔斯汀');
INSERT INTO station (canteen_id, name, category, cover_object_key, lat, lng)
SELECT c.id, '杨国福麻辣烫', '麻辣烫', 'preset:hotpot', c.lat - 0.0008, c.lng - 0.0004 FROM canteen c
WHERE c.name = '玫瑰园食惠餐厅' AND c.type = 0
  AND NOT EXISTS (SELECT 1 FROM station s WHERE s.canteen_id = c.id AND s.name = '杨国福麻辣烫');
INSERT INTO station (canteen_id, name, category, cover_object_key, lat, lng)
SELECT c.id, '临榆炸鸡腿', '炸鸡小吃', 'preset:chicken', c.lat - 0.0004, c.lng - 0.0004 FROM canteen c
WHERE c.name = '玫瑰园食惠餐厅' AND c.type = 0
  AND NOT EXISTS (SELECT 1 FROM station s WHERE s.canteen_id = c.id AND s.name = '临榆炸鸡腿');

-- 芙蓉园兴安餐厅（qishan-010，include 4：档口×3 + 连锁×1）
INSERT INTO station (canteen_id, name, category, cover_object_key, lat, lng)
SELECT c.id, '米婆婆', '综合', 'preset:rice', c.lat - 0.0008, c.lng - 0.0008 FROM canteen c
WHERE c.name = '芙蓉园兴安餐厅' AND c.type = 0
  AND NOT EXISTS (SELECT 1 FROM station s WHERE s.canteen_id = c.id AND s.name = '米婆婆');
INSERT INTO station (canteen_id, name, category, cover_object_key, lat, lng)
SELECT c.id, '重庆面食', '面食', 'preset:noodle', c.lat - 0.0004, c.lng - 0.0008 FROM canteen c
WHERE c.name = '芙蓉园兴安餐厅' AND c.type = 0
  AND NOT EXISTS (SELECT 1 FROM station s WHERE s.canteen_id = c.id AND s.name = '重庆面食');
INSERT INTO station (canteen_id, name, category, cover_object_key, lat, lng)
SELECT c.id, '客家牛肉面', '面食', 'preset:noodle', c.lat, c.lng - 0.0008 FROM canteen c
WHERE c.name = '芙蓉园兴安餐厅' AND c.type = 0
  AND NOT EXISTS (SELECT 1 FROM station s WHERE s.canteen_id = c.id AND s.name = '客家牛肉面');
INSERT INTO station (canteen_id, name, category, cover_object_key, lat, lng)
SELECT c.id, '永兴发', '综合', 'preset:rice', c.lat + 0.0004, c.lng - 0.0008 FROM canteen c
WHERE c.name = '芙蓉园兴安餐厅' AND c.type = 0
  AND NOT EXISTS (SELECT 1 FROM station s WHERE s.canteen_id = c.id AND s.name = '永兴发');

-- 紫荆园捷祥餐厅（qishan-011，include 4：档口×3 + 连锁×1）
INSERT INTO station (canteen_id, name, category, cover_object_key, lat, lng)
SELECT c.id, '烧腊', '卤味', 'preset:fries', c.lat - 0.0008, c.lng - 0.0008 FROM canteen c
WHERE c.name = '紫荆园捷祥餐厅' AND c.type = 0
  AND NOT EXISTS (SELECT 1 FROM station s WHERE s.canteen_id = c.id AND s.name = '烧腊');
INSERT INTO station (canteen_id, name, category, cover_object_key, lat, lng)
SELECT c.id, '梦想咖喱', '米饭套餐', 'preset:rice', c.lat - 0.0004, c.lng - 0.0008 FROM canteen c
WHERE c.name = '紫荆园捷祥餐厅' AND c.type = 0
  AND NOT EXISTS (SELECT 1 FROM station s WHERE s.canteen_id = c.id AND s.name = '梦想咖喱');
INSERT INTO station (canteen_id, name, category, cover_object_key, lat, lng)
SELECT c.id, '牛杂面', '面食', 'preset:noodle', c.lat, c.lng - 0.0008 FROM canteen c
WHERE c.name = '紫荆园捷祥餐厅' AND c.type = 0
  AND NOT EXISTS (SELECT 1 FROM station s WHERE s.canteen_id = c.id AND s.name = '牛杂面');
INSERT INTO station (canteen_id, name, category, cover_object_key, lat, lng)
SELECT c.id, '麦当劳', '汉堡简餐', 'preset:burger', c.lat + 0.0004, c.lng - 0.0008 FROM canteen c
WHERE c.name = '紫荆园捷祥餐厅' AND c.type = 0
  AND NOT EXISTS (SELECT 1 FROM station s WHERE s.canteen_id = c.id AND s.name = '麦当劳');

-- 牡丹园清谷餐厅（qishan-012，include 4：档口×3 + 连锁×1）
INSERT INTO station (canteen_id, name, category, cover_object_key, lat, lng)
SELECT c.id, '粤福记烧腊', '卤味', 'preset:fries', c.lat - 0.0008, c.lng - 0.0008 FROM canteen c
WHERE c.name = '牡丹园清谷餐厅' AND c.type = 0
  AND NOT EXISTS (SELECT 1 FROM station s WHERE s.canteen_id = c.id AND s.name = '粤福记烧腊');
INSERT INTO station (canteen_id, name, category, cover_object_key, lat, lng)
SELECT c.id, '清谷寻味', '综合', 'preset:rice', c.lat - 0.0004, c.lng - 0.0008 FROM canteen c
WHERE c.name = '牡丹园清谷餐厅' AND c.type = 0
  AND NOT EXISTS (SELECT 1 FROM station s WHERE s.canteen_id = c.id AND s.name = '清谷寻味');
INSERT INTO station (canteen_id, name, category, cover_object_key, lat, lng)
SELECT c.id, '乡村炖品', '套餐', 'preset:rice', c.lat, c.lng - 0.0008 FROM canteen c
WHERE c.name = '牡丹园清谷餐厅' AND c.type = 0
  AND NOT EXISTS (SELECT 1 FROM station s WHERE s.canteen_id = c.id AND s.name = '乡村炖品');
INSERT INTO station (canteen_id, name, category, cover_object_key, lat, lng)
SELECT c.id, '猪角', '综合', 'preset:rice', c.lat + 0.0004, c.lng - 0.0008 FROM canteen c
WHERE c.name = '牡丹园清谷餐厅' AND c.type = 0
  AND NOT EXISTS (SELECT 1 FROM station s WHERE s.canteen_id = c.id AND s.name = '猪角');

-- 丁香园品膳餐厅（qishan-013，include 2：档口×1 + 连锁×1）
INSERT INTO station (canteen_id, name, category, cover_object_key, lat, lng)
SELECT c.id, '隆江猪脚饭', '米饭套餐', 'preset:rice', c.lat - 0.0008, c.lng - 0.0008 FROM canteen c
WHERE c.name = '丁香园品膳餐厅' AND c.type = 0
  AND NOT EXISTS (SELECT 1 FROM station s WHERE s.canteen_id = c.id AND s.name = '隆江猪脚饭');
INSERT INTO station (canteen_id, name, category, cover_object_key, lat, lng)
SELECT c.id, '肯德基', '炸鸡小吃', 'preset:chicken', c.lat - 0.0004, c.lng - 0.0008 FROM canteen c
WHERE c.name = '丁香园品膳餐厅' AND c.type = 0
  AND NOT EXISTS (SELECT 1 FROM station s WHERE s.canteen_id = c.id AND s.name = '肯德基');

-- 丹桂园朝阳餐厅（qishan-014，include 2：连锁×2）
INSERT INTO station (canteen_id, name, category, cover_object_key, lat, lng)
SELECT c.id, '阿肥发', '小吃', 'preset:fries', c.lat - 0.0008, c.lng - 0.0008 FROM canteen c
WHERE c.name = '丹桂园朝阳餐厅' AND c.type = 0
  AND NOT EXISTS (SELECT 1 FROM station s WHERE s.canteen_id = c.id AND s.name = '阿肥发');
INSERT INTO station (canteen_id, name, category, cover_object_key, lat, lng)
SELECT c.id, '张亮麻辣烫', '麻辣烫', 'preset:hotpot', c.lat - 0.0004, c.lng - 0.0008 FROM canteen c
WHERE c.name = '丹桂园朝阳餐厅' AND c.type = 0
  AND NOT EXISTS (SELECT 1 FROM station s WHERE s.canteen_id = c.id AND s.name = '张亮麻辣烫');

-- 百合园立品餐厅（qishan-015，include 1：档口×1）
INSERT INTO station (canteen_id, name, category, cover_object_key, lat, lng)
SELECT c.id, '酷乐普斯', '综合', 'preset:rice', c.lat - 0.0008, c.lng - 0.0008 FROM canteen c
WHERE c.name = '百合园立品餐厅' AND c.type = 0
  AND NOT EXISTS (SELECT 1 FROM station s WHERE s.canteen_id = c.id AND s.name = '酷乐普斯');

-- 茉莉园聚誉餐厅（qishan-016，include 4：档口×4）
INSERT INTO station (canteen_id, name, category, cover_object_key, lat, lng)
SELECT c.id, '金翼瓦罐套餐', '套餐', 'preset:rice', c.lat - 0.0008, c.lng - 0.0008 FROM canteen c
WHERE c.name = '茉莉园聚誉餐厅' AND c.type = 0
  AND NOT EXISTS (SELECT 1 FROM station s WHERE s.canteen_id = c.id AND s.name = '金翼瓦罐套餐');
INSERT INTO station (canteen_id, name, category, cover_object_key, lat, lng)
SELECT c.id, '老上海馄饨铺', '面点', 'preset:baozi', c.lat - 0.0004, c.lng - 0.0008 FROM canteen c
WHERE c.name = '茉莉园聚誉餐厅' AND c.type = 0
  AND NOT EXISTS (SELECT 1 FROM station s WHERE s.canteen_id = c.id AND s.name = '老上海馄饨铺');
INSERT INTO station (canteen_id, name, category, cover_object_key, lat, lng)
SELECT c.id, '蜀一蜀二', '家常炒菜', 'preset:wok', c.lat, c.lng - 0.0008 FROM canteen c
WHERE c.name = '茉莉园聚誉餐厅' AND c.type = 0
  AND NOT EXISTS (SELECT 1 FROM station s WHERE s.canteen_id = c.id AND s.name = '蜀一蜀二');
INSERT INTO station (canteen_id, name, category, cover_object_key, lat, lng)
SELECT c.id, '小猪麻辣烫', '麻辣烫', 'preset:hotpot', c.lat + 0.0004, c.lng - 0.0008 FROM canteen c
WHERE c.name = '茉莉园聚誉餐厅' AND c.type = 0
  AND NOT EXISTS (SELECT 1 FROM station s WHERE s.canteen_id = c.id AND s.name = '小猪麻辣烫');

-- 导入后自检
SELECT c.name AS canteen, COUNT(s.id) AS stations
FROM canteen c LEFT JOIN station s ON s.canteen_id = c.id
WHERE c.type = 0
GROUP BY c.id, c.name
ORDER BY c.id;
