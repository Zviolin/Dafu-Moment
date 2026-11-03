-- 新采集公开点位60条，含第一批15条；8个食堂简称归一合并。无真实评价、菜价或到校配送保证。
USE dafu_shike;
SET NAMES utf8mb4;
START TRANSACTION;
-- fzu-001 https://hqc.fzu.edu.cn/info/1032/3114.htm
INSERT INTO location(name,address,scene_category_id) SELECT '玫瑰园食惠餐厅','福州大学生活区三区（一楼）',c.id FROM scene_category c WHERE c.name='食堂' AND NOT EXISTS(SELECT 1 FROM location WHERE name IN ('玫瑰园食惠餐厅','玫瑰园') AND deleted_at IS NULL);
UPDATE location SET address='福州大学生活区三区（一楼）' WHERE name IN ('玫瑰园食惠餐厅','玫瑰园') AND address IS NULL AND deleted_at IS NULL;
-- fzu-002 https://hqc.fzu.edu.cn/info/1032/3114.htm
INSERT INTO location(name,address,scene_category_id) SELECT '丁香园品膳餐厅','福州大学生活区一区（一楼）',c.id FROM scene_category c WHERE c.name='食堂' AND NOT EXISTS(SELECT 1 FROM location WHERE name IN ('丁香园品膳餐厅','丁香园') AND deleted_at IS NULL);
UPDATE location SET address='福州大学生活区一区（一楼）' WHERE name IN ('丁香园品膳餐厅','丁香园') AND address IS NULL AND deleted_at IS NULL;
-- fzu-003 https://hqc.fzu.edu.cn/info/1032/3114.htm
INSERT INTO location(name,address,scene_category_id) SELECT '桃李园餐厅',NULL,c.id FROM scene_category c WHERE c.name='食堂' AND NOT EXISTS(SELECT 1 FROM location WHERE name IN ('桃李园餐厅') AND deleted_at IS NULL);
-- fzu-004 https://hqc.fzu.edu.cn/info/1032/3114.htm
INSERT INTO location(name,address,scene_category_id) SELECT '佳客来西餐厅',NULL,c.id FROM scene_category c WHERE c.name='食堂' AND NOT EXISTS(SELECT 1 FROM location WHERE name IN ('佳客来西餐厅') AND deleted_at IS NULL);
-- fzu-005 https://hqc.fzu.edu.cn/info/1032/3114.htm
INSERT INTO location(name,address,scene_category_id) SELECT '海棠园京元餐厅',NULL,c.id FROM scene_category c WHERE c.name='食堂' AND NOT EXISTS(SELECT 1 FROM location WHERE name IN ('海棠园京元餐厅') AND deleted_at IS NULL);
-- fzu-006 https://hqc.fzu.edu.cn/info/1032/3114.htm
INSERT INTO location(name,address,scene_category_id) SELECT '丹桂园朝阳餐厅','福州大学生活区一区（二楼）',c.id FROM scene_category c WHERE c.name='食堂' AND NOT EXISTS(SELECT 1 FROM location WHERE name IN ('丹桂园朝阳餐厅','丹桂园') AND deleted_at IS NULL);
UPDATE location SET address='福州大学生活区一区（二楼）' WHERE name IN ('丹桂园朝阳餐厅','丹桂园') AND address IS NULL AND deleted_at IS NULL;
-- fzu-007 https://hqc.fzu.edu.cn/info/1032/3114.htm
INSERT INTO location(name,address,scene_category_id) SELECT '茉莉园聚誉餐厅','福州大学生活区一区（二楼）',c.id FROM scene_category c WHERE c.name='食堂' AND NOT EXISTS(SELECT 1 FROM location WHERE name IN ('茉莉园聚誉餐厅','茉莉园') AND deleted_at IS NULL);
UPDATE location SET address='福州大学生活区一区（二楼）' WHERE name IN ('茉莉园聚誉餐厅','茉莉园') AND address IS NULL AND deleted_at IS NULL;
-- fzu-008 https://hqc.fzu.edu.cn/info/1032/3114.htm
INSERT INTO location(name,address,scene_category_id) SELECT '百合园立品餐厅','福州大学生活区一区（三楼）',c.id FROM scene_category c WHERE c.name='食堂' AND NOT EXISTS(SELECT 1 FROM location WHERE name IN ('百合园立品餐厅','百合园') AND deleted_at IS NULL);
UPDATE location SET address='福州大学生活区一区（三楼）' WHERE name IN ('百合园立品餐厅','百合园') AND address IS NULL AND deleted_at IS NULL;
-- fzu-009 https://hqc.fzu.edu.cn/info/1032/3114.htm
INSERT INTO location(name,address,scene_category_id) SELECT '紫竹园到口餐厅',NULL,c.id FROM scene_category c WHERE c.name='食堂' AND NOT EXISTS(SELECT 1 FROM location WHERE name IN ('紫竹园到口餐厅') AND deleted_at IS NULL);
-- fzu-010 https://hqc.fzu.edu.cn/info/1032/3114.htm
INSERT INTO location(name,address,scene_category_id) SELECT '紫荆园捷祥餐厅','福州大学生活区三区（一楼）',c.id FROM scene_category c WHERE c.name='食堂' AND NOT EXISTS(SELECT 1 FROM location WHERE name IN ('紫荆园捷祥餐厅','紫荆园') AND deleted_at IS NULL);
UPDATE location SET address='福州大学生活区三区（一楼）' WHERE name IN ('紫荆园捷祥餐厅','紫荆园') AND address IS NULL AND deleted_at IS NULL;
-- fzu-011 https://hqc.fzu.edu.cn/info/1032/3114.htm
INSERT INTO location(name,address,scene_category_id) SELECT '牡丹园清谷餐厅','福州大学生活区三区（二楼）',c.id FROM scene_category c WHERE c.name='食堂' AND NOT EXISTS(SELECT 1 FROM location WHERE name IN ('牡丹园清谷餐厅','牡丹园') AND deleted_at IS NULL);
UPDATE location SET address='福州大学生活区三区（二楼）' WHERE name IN ('牡丹园清谷餐厅','牡丹园') AND address IS NULL AND deleted_at IS NULL;
-- fzu-012 https://hqc.fzu.edu.cn/info/1032/3114.htm
INSERT INTO location(name,address,scene_category_id) SELECT '芙蓉园兴安餐厅','福州大学生活区三区（二楼）',c.id FROM scene_category c WHERE c.name='食堂' AND NOT EXISTS(SELECT 1 FROM location WHERE name IN ('芙蓉园兴安餐厅','芙蓉园') AND deleted_at IS NULL);
UPDATE location SET address='福州大学生活区三区（二楼）' WHERE name IN ('芙蓉园兴安餐厅','芙蓉园') AND address IS NULL AND deleted_at IS NULL;
-- mcd-013 https://www.mcdonalds.com.cn/page/giftcard-available-stores
INSERT INTO location(name,address,scene_category_id) SELECT '福州麦当劳国宾大道DT餐厅','福建省福州市闽侯县上街镇国宾大道233号博仕家园B区的2-2#的101-104商业、129-132复式商业的商铺',c.id FROM scene_category c WHERE c.name='其他' AND NOT EXISTS(SELECT 1 FROM location WHERE name IN ('福州麦当劳国宾大道DT餐厅') AND address <=> '福建省福州市闽侯县上街镇国宾大道233号博仕家园B区的2-2#的101-104商业、129-132复式商业的商铺' AND deleted_at IS NULL);
-- mcd-014 https://www.mcdonalds.com.cn/page/giftcard-available-stores
INSERT INTO location(name,address,scene_category_id) SELECT '福州麦当劳上街镇国宾大道餐厅','福建省福州市闽侯县上街镇国宾大道268号永辉城市生活广场16#楼',c.id FROM scene_category c WHERE c.name='其他' AND NOT EXISTS(SELECT 1 FROM location WHERE name IN ('福州麦当劳上街镇国宾大道餐厅') AND address <=> '福建省福州市闽侯县上街镇国宾大道268号永辉城市生活广场16#楼' AND deleted_at IS NULL);
-- mcd-015 https://www.mcdonalds.com.cn/page/giftcard-available-stores
INSERT INTO location(name,address,scene_category_id) SELECT '福州麦当劳闽侯上街国宾大道(梅园酒店)餐厅','福建省福州市闽侯县上街镇国宾大道350号梅园上街广场1-1#楼一层1号商铺',c.id FROM scene_category c WHERE c.name='其他' AND NOT EXISTS(SELECT 1 FROM location WHERE name IN ('福州麦当劳闽侯上街国宾大道(梅园酒店)餐厅') AND address <=> '福建省福州市闽侯县上街镇国宾大道350号梅园上街广场1-1#楼一层1号商铺' AND deleted_at IS NULL);
-- qishan-001 https://raw.githubusercontent.com/155TuT/FFM-FzuFoodMap/9d9680b6a4050fff132eb551c79f7818c8e9e928/fzu-food-map/public/data/fuzhou/qishan.geojson
INSERT INTO location(name,address,scene_category_id) SELECT '盛茂源东北饺子馆','岐安福大学生街A1区学府北路10-27号',c.id FROM scene_category c WHERE c.name='学生街' AND NOT EXISTS(SELECT 1 FROM location WHERE name IN ('盛茂源东北饺子馆') AND address <=> '岐安福大学生街A1区学府北路10-27号' AND deleted_at IS NULL);
-- qishan-002 https://raw.githubusercontent.com/155TuT/FFM-FzuFoodMap/9d9680b6a4050fff132eb551c79f7818c8e9e928/fzu-food-map/public/data/fuzhou/qishan.geojson
INSERT INTO location(name,address,scene_category_id) SELECT '夜贰两东北串吧','岐安福大学生街C2区溪源宫路3-12号',c.id FROM scene_category c WHERE c.name='学生街' AND NOT EXISTS(SELECT 1 FROM location WHERE name IN ('夜贰两东北串吧') AND address <=> '岐安福大学生街C2区溪源宫路3-12号' AND deleted_at IS NULL);
-- qishan-003 https://raw.githubusercontent.com/155TuT/FFM-FzuFoodMap/9d9680b6a4050fff132eb551c79f7818c8e9e928/fzu-food-map/public/data/fuzhou/qishan.geojson
INSERT INTO location(name,address,scene_category_id) SELECT '文博家锅盔','福州大学（旗山校区）西1门附近',c.id FROM scene_category c WHERE c.name='其他' AND NOT EXISTS(SELECT 1 FROM location WHERE name IN ('文博家锅盔') AND address <=> '福州大学（旗山校区）西1门附近' AND deleted_at IS NULL);
-- qishan-004 https://raw.githubusercontent.com/155TuT/FFM-FzuFoodMap/9d9680b6a4050fff132eb551c79f7818c8e9e928/fzu-food-map/public/data/fuzhou/qishan.geojson
INSERT INTO location(name,address,scene_category_id) SELECT '猪师弟空气年糕','岐安福大学生街B1区',c.id FROM scene_category c WHERE c.name='学生街' AND NOT EXISTS(SELECT 1 FROM location WHERE name IN ('猪师弟空气年糕') AND address <=> '岐安福大学生街B1区' AND deleted_at IS NULL);
-- qishan-005 https://raw.githubusercontent.com/155TuT/FFM-FzuFoodMap/9d9680b6a4050fff132eb551c79f7818c8e9e928/fzu-food-map/public/data/fuzhou/qishan.geojson
INSERT INTO location(name,address,scene_category_id) SELECT '陈记片皮鸭','岐安福大学生街B3区学府北路10-192号',c.id FROM scene_category c WHERE c.name='学生街' AND NOT EXISTS(SELECT 1 FROM location WHERE name IN ('陈记片皮鸭') AND address <=> '岐安福大学生街B3区学府北路10-192号' AND deleted_at IS NULL);
-- qishan-006 https://raw.githubusercontent.com/155TuT/FFM-FzuFoodMap/9d9680b6a4050fff132eb551c79f7818c8e9e928/fzu-food-map/public/data/fuzhou/qishan.geojson
INSERT INTO location(name,address,scene_category_id) SELECT '壹品豆花','岐安福大学生街B1区',c.id FROM scene_category c WHERE c.name='学生街' AND NOT EXISTS(SELECT 1 FROM location WHERE name IN ('壹品豆花') AND address <=> '岐安福大学生街B1区' AND deleted_at IS NULL);
-- qishan-007 https://raw.githubusercontent.com/155TuT/FFM-FzuFoodMap/9d9680b6a4050fff132eb551c79f7818c8e9e928/fzu-food-map/public/data/fuzhou/qishan.geojson
INSERT INTO location(name,address,scene_category_id) SELECT '便宜坊（原光阴的故事）','岐安福大学生街C1区学府北路10-180号',c.id FROM scene_category c WHERE c.name='学生街' AND NOT EXISTS(SELECT 1 FROM location WHERE name IN ('便宜坊（原光阴的故事）') AND address <=> '岐安福大学生街C1区学府北路10-180号' AND deleted_at IS NULL);
-- qishan-008 https://raw.githubusercontent.com/155TuT/FFM-FzuFoodMap/9d9680b6a4050fff132eb551c79f7818c8e9e928/fzu-food-map/public/data/fuzhou/qishan.geojson
INSERT INTO location(name,address,scene_category_id) SELECT '临榆炸鸡腿（学生街店）','岐安福大学生街C1区学府北路10-177号',c.id FROM scene_category c WHERE c.name='学生街' AND NOT EXISTS(SELECT 1 FROM location WHERE name IN ('临榆炸鸡腿（学生街店）') AND address <=> '岐安福大学生街C1区学府北路10-177号' AND deleted_at IS NULL);
-- qishan-017 https://raw.githubusercontent.com/155TuT/FFM-FzuFoodMap/9d9680b6a4050fff132eb551c79f7818c8e9e928/fzu-food-map/public/data/fuzhou/qishan.geojson
INSERT INTO location(name,address,scene_category_id) SELECT '台湾锅贴','福州大学（旗山校区）西1门附近',c.id FROM scene_category c WHERE c.name='其他' AND NOT EXISTS(SELECT 1 FROM location WHERE name IN ('台湾锅贴') AND address <=> '福州大学（旗山校区）西1门附近' AND deleted_at IS NULL);
-- qishan-018 https://raw.githubusercontent.com/155TuT/FFM-FzuFoodMap/9d9680b6a4050fff132eb551c79f7818c8e9e928/fzu-food-map/public/data/fuzhou/qishan.geojson
INSERT INTO location(name,address,scene_category_id) SELECT '重庆小面','岐安福大学生街B2区学府北路10号',c.id FROM scene_category c WHERE c.name='学生街' AND NOT EXISTS(SELECT 1 FROM location WHERE name IN ('重庆小面') AND address <=> '岐安福大学生街B2区学府北路10号' AND deleted_at IS NULL);
-- qishan-019 https://raw.githubusercontent.com/155TuT/FFM-FzuFoodMap/9d9680b6a4050fff132eb551c79f7818c8e9e928/fzu-food-map/public/data/fuzhou/qishan.geojson
INSERT INTO location(name,address,scene_category_id) SELECT '刘记肉夹馍','岐安福大学生街A2区B8-1学府北路10号',c.id FROM scene_category c WHERE c.name='学生街' AND NOT EXISTS(SELECT 1 FROM location WHERE name IN ('刘记肉夹馍') AND address <=> '岐安福大学生街A2区B8-1学府北路10号' AND deleted_at IS NULL);
-- qishan-020 https://raw.githubusercontent.com/155TuT/FFM-FzuFoodMap/9d9680b6a4050fff132eb551c79f7818c8e9e928/fzu-food-map/public/data/fuzhou/qishan.geojson
INSERT INTO location(name,address,scene_category_id) SELECT '可可烘焙','岐安福大学生街学府北路10-110号',c.id FROM scene_category c WHERE c.name='学生街' AND NOT EXISTS(SELECT 1 FROM location WHERE name IN ('可可烘焙') AND address <=> '岐安福大学生街学府北路10-110号' AND deleted_at IS NULL);
-- qishan-021 https://raw.githubusercontent.com/155TuT/FFM-FzuFoodMap/9d9680b6a4050fff132eb551c79f7818c8e9e928/fzu-food-map/public/data/fuzhou/qishan.geojson
INSERT INTO location(name,address,scene_category_id) SELECT '广式养生鸡','岐安福大学生街A1区学府北路10-22号',c.id FROM scene_category c WHERE c.name='学生街' AND NOT EXISTS(SELECT 1 FROM location WHERE name IN ('广式养生鸡') AND address <=> '岐安福大学生街A1区学府北路10-22号' AND deleted_at IS NULL);
-- qishan-022 https://raw.githubusercontent.com/155TuT/FFM-FzuFoodMap/9d9680b6a4050fff132eb551c79f7818c8e9e928/fzu-food-map/public/data/fuzhou/qishan.geojson
INSERT INTO location(name,address,scene_category_id) SELECT '莆田卤面·天九湾炝肉·山里炝粉','岐安福大学生街B1区08店面学府北路10-92号',c.id FROM scene_category c WHERE c.name='学生街' AND NOT EXISTS(SELECT 1 FROM location WHERE name IN ('莆田卤面·天九湾炝肉·山里炝粉') AND address <=> '岐安福大学生街B1区08店面学府北路10-92号' AND deleted_at IS NULL);
-- qishan-023 https://raw.githubusercontent.com/155TuT/FFM-FzuFoodMap/9d9680b6a4050fff132eb551c79f7818c8e9e928/fzu-food-map/public/data/fuzhou/qishan.geojson
INSERT INTO location(name,address,scene_category_id) SELECT '栗栗烘焙-栗酥饼（福大店）','岐安福大学生街B1区学府北路10-106号',c.id FROM scene_category c WHERE c.name='学生街' AND NOT EXISTS(SELECT 1 FROM location WHERE name IN ('栗栗烘焙-栗酥饼（福大店）') AND address <=> '岐安福大学生街B1区学府北路10-106号' AND deleted_at IS NULL);
-- qishan-024 https://raw.githubusercontent.com/155TuT/FFM-FzuFoodMap/9d9680b6a4050fff132eb551c79f7818c8e9e928/fzu-food-map/public/data/fuzhou/qishan.geojson
INSERT INTO location(name,address,scene_category_id) SELECT '江一福·按时吃饭·啫啫煲','岐安福大学生街学府北路10-127号',c.id FROM scene_category c WHERE c.name='学生街' AND NOT EXISTS(SELECT 1 FROM location WHERE name IN ('江一福·按时吃饭·啫啫煲') AND address <=> '岐安福大学生街学府北路10-127号' AND deleted_at IS NULL);
-- qishan-025 https://raw.githubusercontent.com/155TuT/FFM-FzuFoodMap/9d9680b6a4050fff132eb551c79f7818c8e9e928/fzu-food-map/public/data/fuzhou/qishan.geojson
INSERT INTO location(name,address,scene_category_id) SELECT '周麻婆·新川式家常菜','岐安福大学生街学府北路10-193号',c.id FROM scene_category c WHERE c.name='学生街' AND NOT EXISTS(SELECT 1 FROM location WHERE name IN ('周麻婆·新川式家常菜') AND address <=> '岐安福大学生街学府北路10-193号' AND deleted_at IS NULL);
-- qishan-026 https://raw.githubusercontent.com/155TuT/FFM-FzuFoodMap/9d9680b6a4050fff132eb551c79f7818c8e9e928/fzu-food-map/public/data/fuzhou/qishan.geojson
INSERT INTO location(name,address,scene_category_id) SELECT '鲜榨果汁·现炒板栗','岐安福大学生街B1区学府北路10-228号',c.id FROM scene_category c WHERE c.name='学生街' AND NOT EXISTS(SELECT 1 FROM location WHERE name IN ('鲜榨果汁·现炒板栗') AND address <=> '岐安福大学生街B1区学府北路10-228号' AND deleted_at IS NULL);
-- qishan-027 https://raw.githubusercontent.com/155TuT/FFM-FzuFoodMap/9d9680b6a4050fff132eb551c79f7818c8e9e928/fzu-food-map/public/data/fuzhou/qishan.geojson
INSERT INTO location(name,address,scene_category_id) SELECT '十里后院·快递夜市','岐安福大学生街B1区学府北路10-228号',c.id FROM scene_category c WHERE c.name='学生街' AND NOT EXISTS(SELECT 1 FROM location WHERE name IN ('十里后院·快递夜市') AND address <=> '岐安福大学生街B1区学府北路10-228号' AND deleted_at IS NULL);
-- qishan-028 https://raw.githubusercontent.com/155TuT/FFM-FzuFoodMap/9d9680b6a4050fff132eb551c79f7818c8e9e928/fzu-food-map/public/data/fuzhou/qishan.geojson
INSERT INTO location(name,address,scene_category_id) SELECT '洪濑鸡爪','岐安福大学生街学府北路10-73号',c.id FROM scene_category c WHERE c.name='学生街' AND NOT EXISTS(SELECT 1 FROM location WHERE name IN ('洪濑鸡爪') AND address <=> '岐安福大学生街学府北路10-73号' AND deleted_at IS NULL);
-- qishan-029 https://raw.githubusercontent.com/155TuT/FFM-FzuFoodMap/9d9680b6a4050fff132eb551c79f7818c8e9e928/fzu-food-map/public/data/fuzhou/qishan.geojson
INSERT INTO location(name,address,scene_category_id) SELECT '云南铜锅牛羊肉米线','岐安福大学生街学府北路10-235号',c.id FROM scene_category c WHERE c.name='学生街' AND NOT EXISTS(SELECT 1 FROM location WHERE name IN ('云南铜锅牛羊肉米线') AND address <=> '岐安福大学生街学府北路10-235号' AND deleted_at IS NULL);
-- qishan-030 https://raw.githubusercontent.com/155TuT/FFM-FzuFoodMap/9d9680b6a4050fff132eb551c79f7818c8e9e928/fzu-food-map/public/data/fuzhou/qishan.geojson
INSERT INTO location(name,address,scene_category_id) SELECT '达叔肉夹馍·烤冷面','岐安福大学生街B1区学府北路10号',c.id FROM scene_category c WHERE c.name='学生街' AND NOT EXISTS(SELECT 1 FROM location WHERE name IN ('达叔肉夹馍·烤冷面') AND address <=> '岐安福大学生街B1区学府北路10号' AND deleted_at IS NULL);
-- qishan-031 https://raw.githubusercontent.com/155TuT/FFM-FzuFoodMap/9d9680b6a4050fff132eb551c79f7818c8e9e928/fzu-food-map/public/data/fuzhou/qishan.geojson
INSERT INTO location(name,address,scene_category_id) SELECT '卤百味','岐安福大学生街学府北路10号',c.id FROM scene_category c WHERE c.name='学生街' AND NOT EXISTS(SELECT 1 FROM location WHERE name IN ('卤百味') AND address <=> '岐安福大学生街学府北路10号' AND deleted_at IS NULL);
-- qishan-032 https://raw.githubusercontent.com/155TuT/FFM-FzuFoodMap/9d9680b6a4050fff132eb551c79f7818c8e9e928/fzu-food-map/public/data/fuzhou/qishan.geojson
INSERT INTO location(name,address,scene_category_id) SELECT '成都纸包鱼烧烤大排档','岐安福大学生街A1区学府北路10号19店面',c.id FROM scene_category c WHERE c.name='学生街' AND NOT EXISTS(SELECT 1 FROM location WHERE name IN ('成都纸包鱼烧烤大排档') AND address <=> '岐安福大学生街A1区学府北路10号19店面' AND deleted_at IS NULL);
-- qishan-033 https://raw.githubusercontent.com/155TuT/FFM-FzuFoodMap/9d9680b6a4050fff132eb551c79f7818c8e9e928/fzu-food-map/public/data/fuzhou/qishan.geojson
INSERT INTO location(name,address,scene_category_id) SELECT '桥头排骨','岐安福大学生街学府北路10-231号',c.id FROM scene_category c WHERE c.name='学生街' AND NOT EXISTS(SELECT 1 FROM location WHERE name IN ('桥头排骨') AND address <=> '岐安福大学生街学府北路10-231号' AND deleted_at IS NULL);
-- qishan-034 https://raw.githubusercontent.com/155TuT/FFM-FzuFoodMap/9d9680b6a4050fff132eb551c79f7818c8e9e928/fzu-food-map/public/data/fuzhou/qishan.geojson
INSERT INTO location(name,address,scene_category_id) SELECT '北方饭店','明德路6号万科金域蓝湾1栋115商铺',c.id FROM scene_category c WHERE c.name='其他' AND NOT EXISTS(SELECT 1 FROM location WHERE name IN ('北方饭店') AND address <=> '明德路6号万科金域蓝湾1栋115商铺' AND deleted_at IS NULL);
-- qishan-035 https://raw.githubusercontent.com/155TuT/FFM-FzuFoodMap/9d9680b6a4050fff132eb551c79f7818c8e9e928/fzu-food-map/public/data/fuzhou/qishan.geojson
INSERT INTO location(name,address,scene_category_id) SELECT '川册·川味小馆','中海寰宇天下高新大道1-41号',c.id FROM scene_category c WHERE c.name='其他' AND NOT EXISTS(SELECT 1 FROM location WHERE name IN ('川册·川味小馆') AND address <=> '中海寰宇天下高新大道1-41号' AND deleted_at IS NULL);
-- qishan-036 https://raw.githubusercontent.com/155TuT/FFM-FzuFoodMap/9d9680b6a4050fff132eb551c79f7818c8e9e928/fzu-food-map/public/data/fuzhou/qishan.geojson
INSERT INTO location(name,address,scene_category_id) SELECT '李夏记牛腩煲（原广式牛杂）','高新大道1-1号中海寰宇天下42号楼1层125商业',c.id FROM scene_category c WHERE c.name='其他' AND NOT EXISTS(SELECT 1 FROM location WHERE name IN ('李夏记牛腩煲（原广式牛杂）') AND address <=> '高新大道1-1号中海寰宇天下42号楼1层125商业' AND deleted_at IS NULL);
-- qishan-037 https://raw.githubusercontent.com/155TuT/FFM-FzuFoodMap/9d9680b6a4050fff132eb551c79f7818c8e9e928/fzu-food-map/public/data/fuzhou/qishan.geojson
INSERT INTO location(name,address,scene_category_id) SELECT '焦焦牧场·鲜牛奶炸鸡','国宾大道179-2号',c.id FROM scene_category c WHERE c.name='其他' AND NOT EXISTS(SELECT 1 FROM location WHERE name IN ('焦焦牧场·鲜牛奶炸鸡') AND address <=> '国宾大道179-2号' AND deleted_at IS NULL);
-- qishan-038 https://raw.githubusercontent.com/155TuT/FFM-FzuFoodMap/9d9680b6a4050fff132eb551c79f7818c8e9e928/fzu-food-map/public/data/fuzhou/qishan.geojson
INSERT INTO location(name,address,scene_category_id) SELECT '116炭火','国宾大道266-5号家园酒店旁',c.id FROM scene_category c WHERE c.name='其他' AND NOT EXISTS(SELECT 1 FROM location WHERE name IN ('116炭火') AND address <=> '国宾大道266-5号家园酒店旁' AND deleted_at IS NULL);
-- qishan-039 https://raw.githubusercontent.com/155TuT/FFM-FzuFoodMap/9d9680b6a4050fff132eb551c79f7818c8e9e928/fzu-food-map/public/data/fuzhou/qishan.geojson
INSERT INTO location(name,address,scene_category_id) SELECT 'fufu牛奶冰','国宾大道233号博仕后时代购物广场1楼',c.id FROM scene_category c WHERE c.name='其他' AND NOT EXISTS(SELECT 1 FROM location WHERE name IN ('fufu牛奶冰') AND address <=> '国宾大道233号博仕后时代购物广场1楼' AND deleted_at IS NULL);
-- qishan-040 https://raw.githubusercontent.com/155TuT/FFM-FzuFoodMap/9d9680b6a4050fff132eb551c79f7818c8e9e928/fzu-food-map/public/data/fuzhou/qishan.geojson
INSERT INTO location(name,address,scene_category_id) SELECT '傻师傅台湾厨房','源通东路59-56号',c.id FROM scene_category c WHERE c.name='其他' AND NOT EXISTS(SELECT 1 FROM location WHERE name IN ('傻师傅台湾厨房') AND address <=> '源通东路59-56号' AND deleted_at IS NULL);
-- qishan-041 https://raw.githubusercontent.com/155TuT/FFM-FzuFoodMap/9d9680b6a4050fff132eb551c79f7818c8e9e928/fzu-food-map/public/data/fuzhou/qishan.geojson
INSERT INTO location(name,address,scene_category_id) SELECT '新疆石榴花美食馆','源通东路59-54号',c.id FROM scene_category c WHERE c.name='其他' AND NOT EXISTS(SELECT 1 FROM location WHERE name IN ('新疆石榴花美食馆') AND address <=> '源通东路59-54号' AND deleted_at IS NULL);
-- qishan-042 https://raw.githubusercontent.com/155TuT/FFM-FzuFoodMap/9d9680b6a4050fff132eb551c79f7818c8e9e928/fzu-food-map/public/data/fuzhou/qishan.geojson
INSERT INTO location(name,address,scene_category_id) SELECT '禾西Restaurant','国宾大道350号梅园上街广场4号楼元翔快线旁（近上街地铁站A出口）',c.id FROM scene_category c WHERE c.name='其他' AND NOT EXISTS(SELECT 1 FROM location WHERE name IN ('禾西Restaurant') AND address <=> '国宾大道350号梅园上街广场4号楼元翔快线旁（近上街地铁站A出口）' AND deleted_at IS NULL);
-- qishan-043 https://raw.githubusercontent.com/155TuT/FFM-FzuFoodMap/9d9680b6a4050fff132eb551c79f7818c8e9e928/fzu-food-map/public/data/fuzhou/qishan.geojson
INSERT INTO location(name,address,scene_category_id) SELECT '大福的烧鸟·居酒屋','源通东路196号理想城二期7号楼1层113',c.id FROM scene_category c WHERE c.name='其他' AND NOT EXISTS(SELECT 1 FROM location WHERE name IN ('大福的烧鸟·居酒屋') AND address <=> '源通东路196号理想城二期7号楼1层113' AND deleted_at IS NULL);
-- qishan-044 https://raw.githubusercontent.com/155TuT/FFM-FzuFoodMap/9d9680b6a4050fff132eb551c79f7818c8e9e928/fzu-food-map/public/data/fuzhou/qishan.geojson
INSERT INTO location(name,address,scene_category_id) SELECT '有饭料理店','岐安福大学生街学府北路10-72号',c.id FROM scene_category c WHERE c.name='学生街' AND NOT EXISTS(SELECT 1 FROM location WHERE name IN ('有饭料理店') AND address <=> '岐安福大学生街学府北路10-72号' AND deleted_at IS NULL);
-- qishan-045 https://raw.githubusercontent.com/155TuT/FFM-FzuFoodMap/9d9680b6a4050fff132eb551c79f7818c8e9e928/fzu-food-map/public/data/fuzhou/qishan.geojson
INSERT INTO location(name,address,scene_category_id) SELECT '唐小厨东北菜','上街镇源江路156号-10',c.id FROM scene_category c WHERE c.name='其他' AND NOT EXISTS(SELECT 1 FROM location WHERE name IN ('唐小厨东北菜') AND address <=> '上街镇源江路156号-10' AND deleted_at IS NULL);
-- qishan-046 https://raw.githubusercontent.com/155TuT/FFM-FzuFoodMap/9d9680b6a4050fff132eb551c79f7818c8e9e928/fzu-food-map/public/data/fuzhou/qishan.geojson
INSERT INTO location(name,address,scene_category_id) SELECT '福大阿毛烧烤','溪源宫路106-4号',c.id FROM scene_category c WHERE c.name='其他' AND NOT EXISTS(SELECT 1 FROM location WHERE name IN ('福大阿毛烧烤') AND address <=> '溪源宫路106-4号' AND deleted_at IS NULL);
-- qishan-047 https://raw.githubusercontent.com/155TuT/FFM-FzuFoodMap/9d9680b6a4050fff132eb551c79f7818c8e9e928/fzu-food-map/public/data/fuzhou/qishan.geojson
INSERT INTO location(name,address,scene_category_id) SELECT '周家粥铺','岐安花园一期东北2门南120米',c.id FROM scene_category c WHERE c.name='其他' AND NOT EXISTS(SELECT 1 FROM location WHERE name IN ('周家粥铺') AND address <=> '岐安花园一期东北2门南120米' AND deleted_at IS NULL);
-- qishan-048 https://raw.githubusercontent.com/155TuT/FFM-FzuFoodMap/9d9680b6a4050fff132eb551c79f7818c8e9e928/fzu-food-map/public/data/fuzhou/qishan.geojson
INSERT INTO location(name,address,scene_category_id) SELECT '黔味烤鱼','岐安1号二期',c.id FROM scene_category c WHERE c.name='其他' AND NOT EXISTS(SELECT 1 FROM location WHERE name IN ('黔味烤鱼') AND address <=> '岐安1号二期' AND deleted_at IS NULL);
-- qishan-049 https://raw.githubusercontent.com/155TuT/FFM-FzuFoodMap/9d9680b6a4050fff132eb551c79f7818c8e9e928/fzu-food-map/public/data/fuzhou/qishan.geojson
INSERT INTO location(name,address,scene_category_id) SELECT '邱阳破店','红峰村新上街邱阳9-1号',c.id FROM scene_category c WHERE c.name='其他' AND NOT EXISTS(SELECT 1 FROM location WHERE name IN ('邱阳破店') AND address <=> '红峰村新上街邱阳9-1号' AND deleted_at IS NULL);
-- qishan-050 https://raw.githubusercontent.com/155TuT/FFM-FzuFoodMap/9d9680b6a4050fff132eb551c79f7818c8e9e928/fzu-food-map/public/data/fuzhou/qishan.geojson
INSERT INTO location(name,address,scene_category_id) SELECT '山东水饺','侯官路1-57号',c.id FROM scene_category c WHERE c.name='其他' AND NOT EXISTS(SELECT 1 FROM location WHERE name IN ('山东水饺') AND address <=> '侯官路1-57号' AND deleted_at IS NULL);
-- qishan-051 https://raw.githubusercontent.com/155TuT/FFM-FzuFoodMap/9d9680b6a4050fff132eb551c79f7818c8e9e928/fzu-food-map/public/data/fuzhou/qishan.geojson
INSERT INTO location(name,address,scene_category_id) SELECT '何记河南正宗水煎包胡辣汤','国宾大道上街余盛小学南侧',c.id FROM scene_category c WHERE c.name='其他' AND NOT EXISTS(SELECT 1 FROM location WHERE name IN ('何记河南正宗水煎包胡辣汤') AND address <=> '国宾大道上街余盛小学南侧' AND deleted_at IS NULL);
-- qishan-052 https://raw.githubusercontent.com/155TuT/FFM-FzuFoodMap/9d9680b6a4050fff132eb551c79f7818c8e9e928/fzu-food-map/public/data/fuzhou/qishan.geojson
INSERT INTO location(name,address,scene_category_id) SELECT 'KEFI来乐食堂','浦兴路18号',c.id FROM scene_category c WHERE c.name='其他' AND NOT EXISTS(SELECT 1 FROM location WHERE name IN ('KEFI来乐食堂') AND address <=> '浦兴路18号' AND deleted_at IS NULL);
-- qishan-053 https://raw.githubusercontent.com/155TuT/FFM-FzuFoodMap/9d9680b6a4050fff132eb551c79f7818c8e9e928/fzu-food-map/public/data/fuzhou/qishan.geojson
INSERT INTO location(name,address,scene_category_id) SELECT '依云煎包店','新上街与新尚路交叉口东50米（新华盛超市对面）',c.id FROM scene_category c WHERE c.name='其他' AND NOT EXISTS(SELECT 1 FROM location WHERE name IN ('依云煎包店') AND address <=> '新上街与新尚路交叉口东50米（新华盛超市对面）' AND deleted_at IS NULL);
COMMIT;
