/**
 * 走查测试夹具清理工具
 *
 * 背景：r75 / r76 / r77 这类管理端走查会新建点位、档口、菜品与临时账号，
 * 若只增不删，会污染 /points、/points/map、榜单与「点评圈」的真实数据，
 * 让后续精确计数类验收（rounds-10）与线上展示出现脏数据。
 *
 * 用法：在测试末尾调用 cleanup_fixtures({ prefixes: ['r75'], usernames: ['it_'] })
 */
import { execSync } from 'node:child_process';

/**
 * 执行 MySQL 语句（容器内直连，避免依赖后端接口是否开放删除能力）
 * @param {string} q - SQL 语句
 * @returns {string} 标准输出
 */
function sql_exec(q) {
    return execSync(
        `docker exec dafu-mysql mysql -uroot -pdafu_root_2026 --default-character-set=utf8mb4 -N -B -e "${q}"`,
        { stdio: 'pipe' }
    ).toString();
}

/**
 * 清理指定名称前缀的走查夹具
 * @param {{prefixes: string[], usernames?: string[]}} opts
 *        prefixes  - 点位/档口/菜品名前缀，如 'r75'
 *        usernames - 临时账号名前缀，如 'it_'
 * @returns {{canteens: number, stations: number, dishes: number, users: number}} 删除数量
 */
export function cleanup_fixtures(opts) {
    const prefixes = opts.prefixes || [];
    const usernames = opts.usernames || [];
    const name_cond = prefixes.length
        ? prefixes.map((p) => `name LIKE '${p}%'`).join(' OR ')
        : '1 = 0';
    const user_cond = usernames.length
        ? usernames.map((u) => `username LIKE '${u}%'`).join(' OR ')
        : '1 = 0';

    // 1) 定位夹具（先取 id，后续所有派生数据都按 id 级联删除）
    const canteen_ids = sql_exec(`SELECT id FROM dafu.canteen WHERE ${name_cond};`)
        .split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    const station_ids = canteen_ids.length
        ? sql_exec(`SELECT id FROM dafu.station WHERE canteen_id IN (${canteen_ids.join(',')});`)
            .split(/\r?\n/).map((s) => s.trim()).filter(Boolean)
        : [];
    const dish_ids = station_ids.length
        ? sql_exec(`SELECT id FROM dafu.dish WHERE station_id IN (${station_ids.join(',')});`)
            .split(/\r?\n/).map((s) => s.trim()).filter(Boolean)
        : [];
    const user_ids = user_cond === '1 = 0'
        ? []
        : sql_exec(`SELECT id FROM dafu.user WHERE ${user_cond};`)
            .split(/\r?\n/).map((s) => s.trim()).filter(Boolean);

    // 2) 评价相关主表：按被评价对象与临时作者双口径清理
    const subj = [];
    if (dish_ids.length) subj.push(`(subject_type = 0 AND subject_id IN (${dish_ids.join(',')}))`);
    if (station_ids.length) subj.push(`(subject_type = 1 AND subject_id IN (${station_ids.join(',')}))`);
    if (canteen_ids.length) subj.push(`(subject_type = 2 AND subject_id IN (${canteen_ids.join(',')}))`);
    const uid_cond = user_ids.length ? `user_id IN (${user_ids.join(',')})` : '1 = 0';
    const review_cond = [...subj, uid_cond].join(' OR ');
    const review_ids = sql_exec(`SELECT id FROM dafu.review WHERE ${review_cond};`)
        .split(/\r?\n/).map((s) => s.trim()).filter(Boolean);

    if (review_ids.length) {
        const rids = review_ids.join(',');
        sql_exec(`DELETE FROM dafu.review_like WHERE review_id IN (${rids});`);
        sql_exec(`DELETE FROM dafu.review_reply WHERE review_id IN (${rids});`);
        sql_exec(`DELETE FROM dafu.review_image WHERE review_id IN (${rids});`);
    }
    sql_exec(`DELETE FROM dafu.review WHERE ${review_cond};`);
    if (subj.length) sql_exec(`DELETE FROM dafu.review_summary WHERE ${subj.join(' OR ')};`);

    // 3) 动态 / 打卡 / 宠物等账号数据
    if (user_ids.length) {
        const uids = user_ids.join(',');
        for (const t of ['post_like', 'post_comment', 'post', 'check_in', 'favorite', 'favorite_group',
            'feed_record', 'journal', 'notification', 'task_claim', 'coin_transaction',
            'ai_conversation', 'user_dress', 'sticker', 'pet', 'fzu_account']) {
            sql_exec(`DELETE FROM dafu.${t} WHERE user_id IN (${uids});`);
        }
        sql_exec(`DELETE FROM dafu.point_submit WHERE submitter_id IN (${uids});`);
        // 举报记录：按举报人回收（被举报对象可能是真实点位，不能按对象删）
        sql_exec(`DELETE FROM dafu.report WHERE reporter_id IN (${uids});`);
        // 档口投稿：作者列名为 author_id
        sql_exec(`DELETE FROM dafu.station_post WHERE author_id IN (${uids});`);
    }

    // 4) 夹具主体：菜品 → 档口 → 点位
    if (dish_ids.length) sql_exec(`DELETE FROM dafu.dish WHERE id IN (${dish_ids.join(',')});`);
    if (station_ids.length) sql_exec(`DELETE FROM dafu.station WHERE id IN (${station_ids.join(',')});`);
    const point_submit_cond = prefixes.length ? `payload LIKE '${prefixes[0]}%'` : '1 = 0';
    sql_exec(`DELETE FROM dafu.point_submit WHERE ${point_submit_cond};`);
    if (canteen_ids.length) sql_exec(`DELETE FROM dafu.canteen WHERE id IN (${canteen_ids.join(',')});`);

    // 5) 最后删账号
    if (user_ids.length) sql_exec(`DELETE FROM dafu.user WHERE id IN (${user_ids.join(',')});`);

    return {
        canteens: canteen_ids.length,
        stations: station_ids.length,
        dishes: dish_ids.length,
        users: user_ids.length,
    };
}

/**
 * 回收「孤儿」派生数据：账号已被删除但关联表仍留行的历史残留
 *
 * 背景：早期走查脚本直接 DELETE user 而未清派生表，导致 report / check_in /
 *       notification 等表留下 user_id 指向不存在账号的行。这些行会被
 *       「我的记录」类接口按 user_id 过滤后忽略，但会污染统计口径。
 *
 * 注意：sticker 表的 user_id=0 是系统公共贴纸（source=3），不属于孤儿，不处理。
 *
 * @returns {Object<string, number>} 各表删除行数
 */
export function cleanup_orphans() {
    const deleted = {};
    const rules = [
        ['post_like', 'user_id'],
        ['post_comment', 'user_id'],
        ['review_like', 'user_id'],
        ['review_reply', 'user_id'],
        ['review', 'user_id'],
        ['favorite', 'user_id'],
        ['favorite_group', 'user_id'],
        ['task_claim', 'user_id'],
        ['coin_transaction', 'user_id'],
        ['user_dress', 'user_id'],
        ['feed_record', 'user_id'],
        ['notification', 'user_id'],
        ['journal', 'user_id'],
        ['ai_conversation', 'user_id'],
        ['fzu_account', 'user_id'],
        ['check_in', 'user_id'],
        ['pet', 'user_id'],
        ['post', 'user_id'],
        ['report', 'reporter_id'],
        ['point_submit', 'submitter_id'],
        ['station_post', 'author_id'],
    ];
    for (const [table, col] of rules) {
        const n = sql_exec(
            `SELECT COUNT(*) FROM dafu.${table} WHERE ${col} <> 0 ` +
            `AND ${col} NOT IN (SELECT id FROM dafu.user);`
        ).split(/\r?\n/).map((s) => s.trim()).filter(Boolean)[0] || '0';
        sql_exec(
            `DELETE FROM dafu.${table} WHERE ${col} <> 0 ` +
            `AND ${col} NOT IN (SELECT id FROM dafu.user);`
        );
        deleted[table] = Number(n);
    }
    return deleted;
}
