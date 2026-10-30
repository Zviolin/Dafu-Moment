-- 真实数据完整性校验（只读）：对应《测试记录》要求「全站使用 Dafu-Moment 最新 PR 的 SQL 真实数据」
-- 运行：docker exec -i dafu-mysql mysql -uroot -p*** < tests/sql/verify-real-data.sql
USE dafu;

SELECT '01 点位总数（期望 60）' AS item, COUNT(*) AS v FROM canteen
UNION ALL SELECT '02 档口总数（期望 70 = 42 门店档口 + 28 校内食堂档口，无伪造默认档口）', COUNT(*) FROM station
UNION ALL SELECT '03 档口名含"默认档口"（期望 0）', COUNT(*) FROM station WHERE name = '默认档口'
UNION ALL SELECT '04 菜品总数（期望 158 = 37 估算演示菜单 + 121 按公开人均折算）', COUNT(*) FROM dish
UNION ALL SELECT '05 明码实价菜品（期望 0：全站无商家核实价）', COUNT(*) FROM dish WHERE is_estimated = 0
UNION ALL SELECT '06 估算价菜品（期望 158）', COUNT(*) FROM dish WHERE is_estimated = 1
UNION ALL SELECT '07 价格非法菜品（<=0，期望 0）', COUNT(*) FROM dish WHERE price <= 0
UNION ALL SELECT '08 价格单位缺失（期望 0）', COUNT(*) FROM dish WHERE price_unit IS NULL OR price_unit = ''
UNION ALL SELECT '09 有坐标点位（期望 56 = 60 - 4 个源数据无坐标的校内食堂）', COUNT(*) FROM canteen WHERE lat IS NOT NULL AND lng IS NOT NULL
UNION ALL SELECT '10 坐标越界（期望 0）', COUNT(*) FROM canteen WHERE lat NOT BETWEEN 26.0 AND 26.1 OR lng NOT BETWEEN 119.1 AND 119.25
UNION ALL SELECT '11 有真实营业时间点位（期望 52）', COUNT(*) FROM canteen WHERE business_hours IS NOT NULL
UNION ALL SELECT '12 有人均价点位（期望 45）', COUNT(*) FROM canteen WHERE avg_price IS NOT NULL
UNION ALL SELECT '13 任务定义（期望 12）', COUNT(*) FROM task
UNION ALL SELECT '14 宠物装扮（期望 9）', COUNT(*) FROM pet_dress
UNION ALL SELECT '15 评分维度（期望 7）', COUNT(*) FROM review_dimension
UNION ALL SELECT '16 站点类型分布 0校内食堂', COUNT(*) FROM canteen WHERE type = 0
UNION ALL SELECT '17 站点类型分布 1永嘉天地', COUNT(*) FROM canteen WHERE type = 1
UNION ALL SELECT '18 站点类型分布 2学生街', COUNT(*) FROM canteen WHERE type = 2
UNION ALL SELECT '19 站点类型分布 3周边其他', COUNT(*) FROM canteen WHERE type = 3
UNION ALL SELECT '20 无菜单点位（4 个无档口食堂 + 6 无菜单门店，客观缺口）', COUNT(*) FROM canteen c WHERE NOT EXISTS (SELECT 1 FROM station s WHERE s.canteen_id = c.id)
UNION ALL SELECT '21 有菜单档口数（期望 42，均为门店档口）', COUNT(DISTINCT station_id) FROM dish
UNION ALL SELECT '22 评价总数', COUNT(*) FROM review
UNION ALL SELECT '23 摘要聚合行数', COUNT(*) FROM review_summary
UNION ALL SELECT '24 索引数（唯一键承担业务一致性约束）', COUNT(DISTINCT TABLE_NAME, INDEX_NAME) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE()
UNION ALL SELECT '25 校内食堂有坐标（期望 8/12，其余 4 个源数据无 map_location）', COUNT(*) FROM canteen WHERE type = 0 AND lat IS NOT NULL
UNION ALL SELECT '26 校内食堂有评分标签（期望 8/12：评分/标签按 qishan.geojson 关联补回）', COUNT(*) FROM canteen WHERE type = 0 AND JSON_LENGTH(tags) >= 3
UNION ALL SELECT '27 校内食堂档口（期望 28 = qishan.geojson 8 个食堂 include 档口清单）', COUNT(*) FROM station s JOIN canteen c ON c.id = s.canteen_id WHERE c.type = 0
UNION ALL SELECT '28 校内食堂档口有菜品（期望 0：源库 78 表 SQL 未插入食堂菜单，不编造）', COUNT(*) FROM dish d JOIN station s ON s.id = d.station_id JOIN canteen c ON c.id = s.canteen_id WHERE c.type = 0;

-- 坐标与最新 PR（05_collected_map_locations.sql）逐点对照：差异点应为 0
-- 期望：53 个点位有 map_location 源坐标（其中校内食堂 8 个）；
-- 桃李园/佳客来/海棠园京元/紫竹园到口 4 个校内食堂源库无坐标，一律留空（不再写估算值）；
-- 另 3 家麦当劳源库亦无坐标，当前保留近似值，待确认是否一并置空
SELECT c.name, c.lat, c.lng, c.business_hours
FROM canteen c
WHERE c.name IN ('玫瑰园食惠餐厅', '丁香园品膳餐厅', '丹桂园朝阳餐厅', '茉莉园聚誉餐厅', '百合园立品餐厅')
ORDER BY c.id;

-- 引用完整性（项目库不建物理外键，靠唯一键 + 业务校验；此处等价做孤儿行扫描，全部期望 0）
SELECT 'A1 档口指向不存在点位' AS item, COUNT(*) AS v FROM station s LEFT JOIN canteen c ON c.id = s.canteen_id WHERE c.id IS NULL
UNION ALL SELECT 'A2 菜品指向不存在档口', COUNT(*) FROM dish d LEFT JOIN station s ON s.id = d.station_id WHERE s.id IS NULL
UNION ALL SELECT 'A3 评价人不存在', COUNT(*) FROM review r LEFT JOIN `user` u ON u.id = r.user_id WHERE u.id IS NULL
UNION ALL SELECT 'A4 菜品评价指向不存在菜品', COUNT(*) FROM review r LEFT JOIN dish d ON d.id = r.subject_id WHERE r.subject_type = 0 AND d.id IS NULL
UNION ALL SELECT 'A5 档口评价指向不存在档口', COUNT(*) FROM review r LEFT JOIN station s ON s.id = r.subject_id WHERE r.subject_type = 1 AND s.id IS NULL
UNION ALL SELECT 'A6 点位评价指向不存在点位', COUNT(*) FROM review r LEFT JOIN canteen c ON c.id = r.subject_id WHERE r.subject_type = 2 AND c.id IS NULL
UNION ALL SELECT 'A7 摘要指向不存在对象（菜品）', COUNT(*) FROM review_summary m LEFT JOIN dish d ON d.id = m.subject_id WHERE m.subject_type = 0 AND d.id IS NULL
UNION ALL SELECT 'A8 摘要指向不存在对象（档口）', COUNT(*) FROM review_summary m LEFT JOIN station s ON s.id = m.subject_id WHERE m.subject_type = 1 AND s.id IS NULL
UNION ALL SELECT 'A9 动态作者不存在', COUNT(*) FROM post p LEFT JOIN `user` u ON u.id = p.user_id WHERE u.id IS NULL
UNION ALL SELECT 'A10 动态点赞指向不存在动态', COUNT(*) FROM post_like l LEFT JOIN post p ON p.id = l.post_id WHERE p.id IS NULL
UNION ALL SELECT 'A11 动态评论指向不存在动态（parent_type=1）', COUNT(*) FROM post_comment c LEFT JOIN post p ON p.id = c.parent_id WHERE c.parent_type = 1 AND p.id IS NULL
UNION ALL SELECT 'A12 任务领取指向不存在任务', COUNT(*) FROM task_claim t LEFT JOIN task k ON k.id = t.task_id WHERE k.id IS NULL
UNION ALL SELECT 'A13 喂养记录指向不存在用户', COUNT(*) FROM feed_record f LEFT JOIN `user` u ON u.id = f.user_id WHERE u.id IS NULL
UNION ALL SELECT 'A14 用户装扮指向不存在的装扮', COUNT(*) FROM user_dress d LEFT JOIN pet_dress p ON p.id = d.dress_id WHERE p.id IS NULL;

-- 编号连续性（档口/菜品自增无空洞不算错，这里只查空名与重复菜品）
SELECT 'B1 档口同名（同点位内，期望 0）' AS item, COUNT(*) AS v FROM (SELECT canteen_id, name FROM station GROUP BY canteen_id, name HAVING COUNT(*) > 1) t
UNION ALL SELECT 'B2 菜品同名同档口（期望 0）', COUNT(*) FROM (SELECT station_id, name FROM dish GROUP BY station_id, name HAVING COUNT(*) > 1) t
UNION ALL SELECT 'B3 空名点位', COUNT(*) FROM canteen WHERE name = '' OR name IS NULL;

