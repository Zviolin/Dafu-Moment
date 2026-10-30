-- r82 测试数据清理：删除本次走查临时账号、点位、档口、菜品与派生数据
-- 执行：Get-Content tests/cleanup-r82-test-data.sql -Raw | docker exec -i dafu-mysql mysql -uroot -pdafu_root_2026 --default-character-set=utf8mb4 dafu
SET @uids = '75,76,79,80,81,82,85,86';

DELETE FROM review_like   WHERE user_id IN (75,76,79,80,81,82,85,86) OR review_id IN (SELECT id FROM review WHERE user_id IN (75,76,79,80,81,82,85,86) OR (subject_type = 0 AND subject_id = 159));
DELETE FROM review_reply  WHERE user_id IN (75,76,79,80,81,82,85,86) OR review_id IN (SELECT id FROM review WHERE user_id IN (75,76,79,80,81,82,85,86) OR (subject_type = 0 AND subject_id = 159));
DELETE FROM review_image  WHERE review_id IN (SELECT id FROM review WHERE user_id IN (75,76,79,80,81,82,85,86) OR (subject_type = 0 AND subject_id = 159));
DELETE FROM review WHERE user_id IN (75,76,79,80,81,82,85,86) OR (subject_type = 0 AND subject_id = 159);

DELETE FROM post_like    WHERE user_id IN (75,76,79,80,81,82,85,86) OR post_id IN (SELECT id FROM post WHERE user_id IN (75,76,79,80,81,82,85,86));
DELETE FROM post_comment WHERE user_id IN (75,76,79,80,81,82,85,86) OR (parent_type = 1 AND parent_id IN (SELECT id FROM post WHERE user_id IN (75,76,79,80,81,82,85,86)));
DELETE FROM post WHERE user_id IN (75,76,79,80,81,82,85,86);

DELETE FROM check_in        WHERE user_id IN (75,76,79,80,81,82,85,86);
DELETE FROM favorite        WHERE user_id IN (75,76,79,80,81,82,85,86);
DELETE FROM favorite_group  WHERE user_id IN (75,76,79,80,81,82,85,86);
DELETE FROM feed_record     WHERE user_id IN (75,76,79,80,81,82,85,86);
DELETE FROM journal         WHERE user_id IN (75,76,79,80,81,82,85,86);
DELETE FROM notification    WHERE user_id IN (75,76,79,80,81,82,85,86);
DELETE FROM task_claim      WHERE user_id IN (75,76,79,80,81,82,85,86);
DELETE FROM coin_transaction WHERE user_id IN (75,76,79,80,81,82,85,86);
DELETE FROM ai_conversation WHERE user_id IN (75,76,79,80,81,82,85,86);
DELETE FROM fzu_account     WHERE user_id IN (75,76,79,80,81,82,85,86);
DELETE FROM user_dress      WHERE user_id IN (75,76,79,80,81,82,85,86);
DELETE FROM sticker         WHERE user_id IN (75,76,79,80,81,82,85,86);
DELETE FROM pet             WHERE user_id IN (75,76,79,80,81,82,85,86);
DELETE FROM point_submit    WHERE submitter_id IN (75,76,79,80,81,82,85,86);
DELETE FROM user            WHERE id IN (75,76,79,80,81,82,85,86);

-- 走查建的点位 / 档口 / 菜品（r75 外卖小站 65、r76 新点位 66）
DELETE FROM review_summary WHERE subject_type = 0 AND subject_id = 159;
DELETE FROM dish    WHERE id = 159;
DELETE FROM station WHERE id IN (55, 56);
DELETE FROM canteen WHERE id IN (65, 66);
