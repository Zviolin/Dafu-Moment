/**
 * REST 路由总装（03 §五 v2.1 API 全量实现）
 * 约定：前缀 /api；统一响应 {code, msg, data}（code 为五位业务码，成功 0）；JWT Bearer 鉴权
 * v2.0：新增维度配置 / AI 助手 / AI 自配 / 点位提交；删除排队热度与榜单旧端点
 * v2.1：图形验证码 / 他人主页 / 点赞 / 收藏查询与取消 / 点位别名路由与维度排序 / 地图 / 推荐菜
 */
const express = require('express');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('../config');
const { query, query_one } = require('../db/pool');
const { ok, err } = require('../utils/api-error');
const { assert, assert_star, assert_str, page_int } = require('../utils/validate');
const captcha = require('../utils/captcha');
const { auth_optional, auth_required, write_required, admin_required } = require('../middleware/auth');
const { rate_limit } = require('../middleware/rate-limit');
const content = require('../services/content.service');
const review = require('../services/review.service');
const dimension = require('../services/dimension.service');
const ai = require('../services/ai.service');
const media = require('../services/media.service');
const userData = require('../services/user-data.service');
const notification = require('../services/notification.service');
const push = require('../services/push.service');
const sticker = require('../services/sticker.service');
const journal = require('../services/journal.service');
const privacy = require('../services/privacy.service');
const tasteSvc = require('../services/taste.service');
const followSvc = require('../services/follow.service');
const settingsSvc = require('../services/settings.service');
const draftSvc = require('../services/draft.service');
const commentSvc = require('../services/comment.service');
const taskSvc = require('../services/task.service');
const titleSvc = require('../services/title.service');
// 2.0 主库打卡实现（3.0 的 location/check_in_dish 版本在 checkin.service.js，由 v3 路由使用）
const checkin = require('../services/checkin-legacy.service');
const adminSvc = require('../services/admin.service');
const managerSvc = require('../services/manager.service');
const { minioClient } = require('../db/minio');
const { assert_cas_credential, cas_mode, cas_login_url } = require('../utils/fzu-cas');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: config.numbers.UPLOAD_MAX_BYTES } });
const N = config.numbers;

/* ---------------- 健康检查 ---------------- */
router.get('/health', (_req, res) => ok(res, { status: 'up', time: new Date().toISOString() }));

/* ---------------- 认证 ---------------- */

/**
 * 图形验证码（03 §5.2/§3，公开 + 限流）：SVG 手写生成器零依赖
 * 响应 {captchaId, imageBase64}（data URI 直填 img.src）；DEBUG=true 额外带明文 debugCode（仅联调）
 */
router.get('/auth/captcha', rate_limit('captcha', 30, 60), async (req, res, next) => {
    try {
        const { captchaId, text, svg } = await captcha.create_captcha();
        const data = {
            captchaId,
            imageBase64: `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`,
        };
        // 测试通道：生产（DEBUG 未开）不下发明文
        if (config.debug) data.debugCode = text;
        ok(res, data);
    } catch (e) { next(e); }
});

/**
 * 注册：用户名 3-32 位字母数字下划线，密码 ≥6 位；图形验证码必填（03 §5.2）
 */
router.post('/auth/register', rate_limit('register', 5, 3600), async (req, res, next) => {
    try {
        const { username, password, nickname, captchaId, captchaCode } = req.body;
        await captcha.assert_captcha(captchaId, captchaCode);
        assert(/^[a-zA-Z0-9_]{3,32}$/.test(username || ''), '用户名需 3-32 位字母/数字/下划线');
        assert(typeof password === 'string' && password.length >= 6, '密码至少 6 位');
        const dup = await query_one('SELECT id FROM `user` WHERE username = ?', [username]);
        if (dup) throw err.conflict('用户名已被注册');
        const hash = await bcrypt.hash(password, 10);
        const r = await query(
            'INSERT INTO `user` (username, password, nickname) VALUES (?, ?, ?)',
            [username, hash, (nickname || username).slice(0, 32)]
        );
        // JWT 有效期 7 天（03 §3 会话口径）
        const token = jwt.sign({ uid: r.insertId }, config.jwt_secret, { expiresIn: '7d' });
        ok(res, {
            token,
            user: { id: r.insertId, username, nickname: (nickname || username).slice(0, 32), email: null, avatar: 0, avatar_object_key: null, fzu_uid: null, fzu_name: null, fzu_verified: false, role: 0, status: 0 },
        });
    } catch (e) { next(e); }
});

/**
 * 登录：图形验证码必填；成功写入 last_login_at（03 §2 用户表）
 */
router.post('/auth/login', rate_limit('login', 10, 600), async (req, res, next) => {
    try {
        const { username, password, captchaId, captchaCode } = req.body;
        await captcha.assert_captcha(captchaId, captchaCode);
        const user = await query_one('SELECT * FROM `user` WHERE username = ?', [username]);
        if (!user || !(await bcrypt.compare(password || '', user.password))) {
            throw err.invalid('用户名或密码错误');
        }
        // 登录成功 → 最近登录时间留痕（看板 DAU / 审计用）
        await query('UPDATE `user` SET last_login_at = NOW() WHERE id = ?', [user.id]);
        const token = jwt.sign({ uid: user.id }, config.jwt_secret, { expiresIn: '7d' });
        ok(res, {
            token,
            user: {
                id: user.id, username: user.username, nickname: user.nickname,
                email: user.email || null, avatar: user.avatar, avatar_object_key: user.avatar_object_key || null,
                ...fzu_fields(user), role: user.role, status: user.status,
            },
        });
    } catch (e) { next(e); }
});

/**
 * 我的信息
 */
router.get('/auth/me', write_required(), async (req, res, next) => {
    try {
        const u = req.user;
        ok(res, {
            id: u.id, username: u.username, nickname: u.nickname,
            email: u.email || null, avatar: u.avatar, avatar_object_key: u.avatar_object_key || null,
            fzu_uid: u.fzu_uid || null, fzu_name: u.fzu_name || null, fzu_verified: u.fzu_verified === 1,
            role: u.role, status: u.status,
        });
    } catch (e) { next(e); }
});

/* ---------------- 福大统一身份认证（FZU SSO · CAS 双模式，r50/r51） ---------------- */

/** 用户响应里的认证身份字段（login/register/SSO 建号共用） */
function fzu_fields(u) {
    return { fzu_uid: u.fzu_uid || null, fzu_name: u.fzu_name || null, fzu_verified: u.fzu_verified === 1 };
}

/**
 * 当前 CAS 模式（公开）：前端据此决定「跳转校方登录页」还是「弹出演示桩表单」
 * 响应 { mode: 'real'|'demo' }；real 时另带 loginUrl（后端 302 跳板）
 */
router.get('/auth/fzu/cas/mode', (_req, res) => {
    const data = { mode: cas_mode() };
    if (data.mode === 'real') data.loginUrl = '/api/auth/fzu/cas/login';
    ok(res, data);
});

/**
 * CAS 登录跳板（公开）：real 模式 302 到学校统一身份认证登录页（service=校方注册的回调地址）；
 * demo 模式没有校方登录页，明确报错引导用演示表单
 */
router.get('/auth/fzu/cas/login', (req, res, next) => {
    try {
        const url = cas_login_url();
        if (!url) throw err.invalid('当前环境未配置福大 CAS，请使用学号 + 口令登录');
        res.redirect(302, url);
    } catch (e) { next(e); }
});

/**
 * 绑定福大统一身份认证（登录态）：凭据按模式校验（real=ticket / demo=学号+口令），
 * 通过后写入认证身份；学号已被其他账号绑定 → 409（一人一号，SSO 登录凭据唯一）
 */
router.post('/auth/fzu/bind', write_required(), async (req, res, next) => {
    try {
        const cas = await assert_cas_credential(req.body);
        const dup = await query_one('SELECT id FROM `user` WHERE fzu_uid = ? AND id <> ?', [cas.uid, req.user.id]);
        if (dup) throw err.conflict('该学号已绑定其他账号');
        await query('UPDATE `user` SET fzu_uid = ?, fzu_name = ?, fzu_verified = 1 WHERE id = ?', [cas.uid, cas.name, req.user.id]);
        const u = await query_one('SELECT fzu_uid, fzu_name, fzu_verified FROM `user` WHERE id = ?', [req.user.id]);
        ok(res, fzu_fields(u));
    } catch (e) { next(e); }
});

/**
 * 解绑福大认证（登录态）：清除认证身份，头衔随之消失
 */
router.delete('/auth/fzu/bind', write_required(), async (req, res, next) => {
    try {
        await query('UPDATE `user` SET fzu_uid = NULL, fzu_name = NULL, fzu_verified = 0 WHERE id = ?', [req.user.id]);
        ok(res, { fzu_uid: null, fzu_name: null, fzu_verified: false });
    } catch (e) { next(e); }
});

/**
 * 福大统一身份认证登录（公开 + 限流）：凭据按模式校验（real=ticket / demo=学号+口令）通过后
 * 已绑定用户 → 直接签发 JWT；username = 学号 的存量账号 → 补绑定后登录；
 * 全新学号 → 自动建号（登录名 = 学号，昵称 = CAS 姓名，随机本地口令）并绑定
 */
router.post('/auth/fzu/sso', rate_limit('fzu_sso', 10, 600), async (req, res, next) => {
    try {
        const cas = await assert_cas_credential(req.body);
        let user = await query_one('SELECT * FROM `user` WHERE fzu_uid = ?', [cas.uid]);
        if (!user) {
            const legacy = await query_one('SELECT * FROM `user` WHERE username = ?', [cas.uid]);
            if (legacy) {
                // 存量账号（登录名即学号）：补写认证身份，视为同一人
                await query('UPDATE `user` SET fzu_uid = ?, fzu_name = ?, fzu_verified = 1 WHERE id = ?', [cas.uid, cas.name, legacy.id]);
                user = await query_one('SELECT * FROM `user` WHERE id = ?', [legacy.id]);
            } else {
                // 全新学号：SSO 自动建号（随机本地口令，平时经 SSO 免密进入）
                const localPwd = await bcrypt.hash(`fzu-${cas.uid}-${Date.now()}`, 10);
                const r = await query(
                    'INSERT INTO `user` (username, password, nickname, fzu_uid, fzu_name, fzu_verified) VALUES (?, ?, ?, ?, ?, 1)',
                    [cas.uid, localPwd, cas.name, cas.uid, cas.name]
                );
                user = await query_one('SELECT * FROM `user` WHERE id = ?', [r.insertId]);
            }
        }
        await query('UPDATE `user` SET last_login_at = NOW() WHERE id = ?', [user.id]);
        const token = jwt.sign({ uid: user.id }, config.jwt_secret, { expiresIn: '7d' });
        ok(res, {
            token,
            user: {
                id: user.id, username: user.username, nickname: user.nickname,
                email: user.email || null, avatar: user.avatar, avatar_object_key: user.avatar_object_key || null,
                ...fzu_fields(user), role: user.role, status: user.status,
            },
            created: !user.last_login_at,
        });
    } catch (e) { next(e); }
});

/* ---------------- 公开浏览 ---------------- */

/**
 * 点位列表公共实现：type 筛选 + sort 维度排序（03 §5.3，非法 sort 由 service 抛 422）
 * @param {Object} req
 * @param {Object} res
 * @param {boolean} paginate - false 旧口径返回全量数组（/canteens）；true 文档口径分页（/points）
 */
async function handle_points_list(req, res, paginate) {
    const f = req.query;
    const type = f.type === undefined || f.type === '' ? null : Number(f.type);
    const sort = f.sort === undefined || f.sort === '' ? 'comprehensive' : String(f.sort);
    if (paginate) {
        return ok(res, await content.list_canteens(type, sort, page_int(f.page, 1)));
    }
    return ok(res, await content.list_canteens(type, sort, null));
}

/**
 * 点位列表（兼容旧前端：全量数组；type 筛选：0 校内食堂 / 1 永嘉天地 / 2 学生街 / 3 周边其他 / 4 外卖）
 */
router.get('/canteens', async (req, res, next) => {
    try { await handle_points_list(req, res, false); } catch (e) { next(e); }
});

/**
 * 点位列表文档别名（03 §5.3：type/sort/page，分页 {list, total, page, size}）
 */
router.get('/points', async (req, res, next) => {
    try { await handle_points_list(req, res, true); } catch (e) { next(e); }
});

/**
 * 点位地图（03 §5.3）：[{area: campus, points: [{id, name, lat, lng, type}]}]
 * 注意必须先于 /points/:id 注册，避免 map 被当作 id
 */
router.get('/points/map', async (_req, res, next) => {
    try { ok(res, await content.points_map()); } catch (e) { next(e); }
});

router.get('/canteens/:id', async (req, res, next) => {
    try { ok(res, await content.canteen_detail(Number(req.params.id))); } catch (e) { next(e); }
});

/**
 * 点位详情别名（= canteen_detail）
 */
router.get('/points/:id', async (req, res, next) => {
    try { ok(res, await content.canteen_detail(Number(req.params.id))); } catch (e) { next(e); }
});

/**
 * 点位评价分页别名（= subjectType=2 的评价列表，口径与 GET /reviews 一致）
 */
router.get('/points/:id/reviews', auth_optional(), async (req, res, next) => {
    try {
        const subjectId = Number(req.params.id);
        assert(Number.isInteger(subjectId) && subjectId > 0, '点位 ID 不合法');
        // sort：hot / new / dim:<dimension_key>（维度适用性由 service 校验）
        const sort = String(req.query.sort || 'new');
        const page = page_int(req.query.page, 1);
        ok(res, await review.list_reviews(2, subjectId, sort, page, 20, req.user ? req.user.id : null));
    } catch (e) { next(e); }
});

/**
 * 档口轻量列表（AC07 对比选择器池）：在架档口全量 + 所属点位名 + 聚合分
 */
router.get('/stations', async (_req, res, next) => {
    try { ok(res, await content.list_stations()); } catch (e) { next(e); }
});

/**
 * 档口横向对比（AC07）：ids=逗号分隔 2~4 个档口 id，按入参顺序返回对比行（含维度分项均分）
 * 注意必须先于 /stations/:id 注册，避免 compare 被当作 id
 */
router.get('/stations/compare', async (req, res, next) => {
    try {
        const raw = String(req.query.ids || '').trim();
        assert(raw.length > 0, 'ids 不能为空');
        const ids = raw.split(',').map((s) => Number(s.trim()));
        assert(ids.every((n) => Number.isInteger(n) && n > 0), 'ids 需为正整数');
        assert(new Set(ids).size === ids.length, 'ids 不能重复');
        assert(ids.length >= 2 && ids.length <= 4, '对比对象需 2~4 个');
        ok(res, await content.compare_stations(ids));
    } catch (e) { next(e); }
});

router.get('/stations/:id', async (req, res, next) => {
    try { ok(res, await content.station_detail(Number(req.params.id))); } catch (e) { next(e); }
});

/**
 * 菜品多维筛选（维度排序：comprehensive 综合评分 / new / hot / priceAsc / priceDesc）
 * businessStatus：open 营业中 / closed 休息中 / all（缺省）未下架
 */
router.get('/dishes', async (req, res, next) => {
    try {
        const f = req.query;
        ok(res, await content.filter_dishes({
            canteenId: f.canteenId, stationId: f.stationId, q: f.q, category: f.category,
            taste: f.taste ? String(f.taste).split(',') : [],
            taboo: f.taboo ? String(f.taboo).split(',') : [],
            priceMin: f.priceMin, priceMax: f.priceMax,
            ratingMin: f.ratingMin,
            sort: f.sort, businessStatus: f.businessStatus,
            page: f.page, pageSize: f.pageSize,
        }));
    } catch (e) { next(e); }
});

/**
 * 统一关键词搜索：返回点位/档口/菜品三组匹配
 */
router.get('/search', async (req, res, next) => {
    try {
        const q = String(req.query.q || '').trim().slice(0, 64);
        assert(q.length > 0, '请输入搜索关键词');
        ok(res, await content.search_all(q));
    } catch (e) { next(e); }
});

/**
 * 推荐（首页两块）：top 高分口碑 / forYou 为你推荐（规则推荐，未登录按全站热度）
 */
router.get('/recommendations', auth_optional(), async (req, res, next) => {
    try {
        ok(res, await content.recommendations(req.user ? req.user.id : null));
    } catch (e) { next(e); }
});

/**
 * 品类聚合（首页分类导航用）
 */
router.get('/categories', async (_req, res, next) => {
    try { ok(res, await content.list_categories()); } catch (e) { next(e); }
});

router.get('/dishes/:id', async (req, res, next) => {
    try { ok(res, await content.dish_detail(Number(req.params.id))); } catch (e) { next(e); }
});

/**
 * 校园口碑榜（P04）：按档口聚合期间内真实评价
 * period: day 近 1 天 / week 近 7 天 / all 全部；dim: hot 人气 / score 口碑 / like 点赞
 */
router.get('/rankings', async (req, res, next) => {
    try {
        const period = String(req.query.period || 'week');
        const dim = String(req.query.dim || 'hot');
        ok(res, await content.rankings(
            ['day', 'week', 'all'].includes(period) ? period : 'week',
            ['hot', 'score', 'like'].includes(dim) ? dim : 'hot'
        ));
    } catch (e) { next(e); }
});

/**
 * 评分维度配置（按点位类型过滤，供评价表单动态渲染）
 */
router.get('/dimensions', async (req, res, next) => {
    try {
        const t = req.query.type;
        const dims = (t === undefined || t === '') ? await dimension.all_dimensions() : await dimension.dims_for_type(Number(t));
        ok(res, dims.map((d) => ({ id: d.id, key: d.key, name: d.name, weight: d.weight, sort: d.sort })));
    } catch (e) { next(e); }
});

router.get('/reviews', auth_optional(), async (req, res, next) => {
    try {
        // subject 双参可选：都传 → 对象维度点评列表；都不传 → 全站最新流（首页气泡 / 点评圈）
        let subjectType = null, subjectId = null;
        if (req.query.subjectType !== undefined || req.query.subjectId !== undefined) {
            subjectType = Number(req.query.subjectType);
            subjectId = Number(req.query.subjectId);
            assert(Number.isInteger(subjectType) && Number.isInteger(subjectId), 'subject 参数不合法');
        }
        // sort：hot / new / dim:<dimension_key>（维度适用性由 service 校验）
        const sort = String(req.query.sort || 'new');
        const page = page_int(req.query.page, 1);
        // size 1-50（post 详情页历史口径用 50）
        const size = Math.min(Math.max(page_int(req.query.size, 20), 1), 50);
        // viewerId 用于输出 liked（当前用户是否已赞；未登录恒 false）
        const data = await review.list_reviews(subjectType, subjectId, sort, page, size, req.user ? req.user.id : null);
        ok(res, data);
    } catch (e) { next(e); }
});

/**
 * 点评详情（单条）：动态详情页数字 id 直查（未命中前端回落 mock）
 */
router.get('/reviews/:id', auth_optional(), async (req, res, next) => {
    try {
        const id = Number(req.params.id);
        assert(Number.isInteger(id) && id > 0, 'id 不合法');
        const data = await review.get_review(id, req.user ? req.user.id : null);
        if (!data) return next(err.not_found('点评不存在'));
        ok(res, data);
    } catch (e) { next(e); }
});

/* ---------------- 学生写接口 ---------------- */

/**
 * 发布评价（动态维度 + DFA 机审分流）
 */
router.post('/reviews', write_required(), rate_limit('review', N.REVIEW_PER_H, 3600), async (req, res, next) => {
    try {
        // 封禁/禁言 → 业务码 40302（03 §5.9）
        if (req.user.status !== 0) throw err.banned('当前状态不可发布');
        const b = req.body;
        const input = {
            subjectType: Number(b.subjectType), subjectId: Number(b.subjectId),
            dimensionScores: b.dimensionScores || {},
            content: String(b.content || '').slice(0, 1000),
            isAnonymous: !!b.isAnonymous,
            tags: Array.isArray(b.tags) ? b.tags.slice(0, 5) : [],
            imageKeys: Array.isArray(b.imageKeys) ? b.imageKeys.slice(0, 3) : [],
        };
        ok(res, await review.create_review(req.user.id, input));
    } catch (e) { next(e); }
});

/**
 * 修改重评（不叠加计数 → 全量重算）
 */
router.put('/reviews/:id', write_required(), rate_limit('review', N.REVIEW_PER_H, 3600), async (req, res, next) => {
    try {
        const b = req.body;
        const input = {
            subjectType: Number(b.subjectType), subjectId: Number(b.subjectId),
            dimensionScores: b.dimensionScores || {},
            content: String(b.content || '').slice(0, 1000),
            isAnonymous: !!b.isAnonymous,
            tags: Array.isArray(b.tags) ? b.tags.slice(0, 5) : [],
            imageKeys: Array.isArray(b.imageKeys) ? b.imageKeys.slice(0, 3) : [],
        };
        ok(res, await review.update_review(req.user.id, Number(req.params.id), input));
    } catch (e) { next(e); }
});

/**
 * 自删评价
 */
router.delete('/reviews/:id', write_required(), async (req, res, next) => {
    try {
        await review.delete_review(req.user.id, Number(req.params.id));
        ok(res);
    } catch (e) { next(e); }
});

/**
 * 投票（1 有用 / -1 没用 / 0 撤销；前端 localStorage 去重——课程口径）
 */
router.post('/reviews/:id/vote', write_required(), rate_limit('vote', N.VOTE_PER_H, 3600), async (req, res, next) => {
    try {
        const { value } = req.body;
        assert([1, -1, 0].includes(Number(value)), 'value 需为 1/-1/0');
        const field = Number(value) >= 0 ? 'up' : 'down';
        const delta = Math.abs(Number(value));
        await review.vote(Number(req.params.id), delta, field);
        ok(res);
    } catch (e) { next(e); }
});

/**
 * 点赞 toggle（03 §5.4）：未赞 → 赞并 +1；已赞 → 取消并 -1
 * @returns {Promise<{liked: boolean, likeCount: number}>}
 */
router.post('/reviews/:id/like', write_required(), rate_limit('vote', N.VOTE_PER_H, 3600), async (req, res, next) => {
    try {
        ok(res, await review.toggle_like(req.user.id, Number(req.params.id)));
    } catch (e) { next(e); }
});

/**
 * 申诉（已下架 → 待人工复审）
 */
router.post('/reviews/:id/appeal', write_required(), async (req, res, next) => {
    try {
        ok(res, await userData.appeal_review(req.user.id, Number(req.params.id)));
    } catch (e) { next(e); }
});

/**
 * 收藏（T-09 三分组）：listType 0 想吃 / 1 常吃 / 2 自定义分组（须配 groupId），传 null/undefined 取消
 * 收藏菜品成功 → fire-and-forget 自动抠菜品主图入个人贴图库（手账贴纸素材，r52）
 */
router.post('/favorites', write_required(), async (req, res, next) => {
    try {
        const subjectType = Number(req.body.subjectType);
        const subjectId = Number(req.body.subjectId);
        const listType = req.body.listType === null || req.body.listType === undefined ? null : Number(req.body.listType);
        const groupId = req.body.groupId === null || req.body.groupId === undefined ? null : Number(req.body.groupId);
        const result = await userData.set_favorite(req.user.id, { subjectType, subjectId, listType, groupId });
        // 仅收藏动作（非取消）且对象是菜品时异步抠图；失败静默不影响收藏
        if (listType !== null && subjectType === 0) {
            const dish = await query_one('SELECT name, cover_object_key AS img FROM dish WHERE id = ?', [subjectId]);
            if (dish && dish.img) sticker.extract_from_object_key(dish.img, req.user.id, dish.name);
        }
        ok(res, result);
    } catch (e) { next(e); }
});

/* ---------------- 个人贴图库（r52 手账贴纸） ---------------- */

/**
 * 上传并自动抠图：原图（商家菜品图/任意食物图）→ matting 透明贴纸 → 入个人贴图库
 */
router.post('/stickers/extract', auth_required(), upload.single('image'), async (req, res, next) => {
    try {
        if (!req.file) throw err.invalid('请上传图片');
        const result = await sticker.extract_and_save(req.file.buffer, req.user.id, req.body.name || '我的贴纸', 0);
        ok(res, result);
    } catch (e) { next(e); }
});

/**
 * 我的贴图库：个人贴纸 + 内置公共贴纸
 */
router.get('/stickers', auth_required(), async (req, res, next) => {
    try { ok(res, await sticker.list_user(req.user.id)); } catch (e) { next(e); }
});

/**
 * 删除个人贴纸（内置贴纸不可删）
 */
router.delete('/stickers/:id', auth_required(), async (req, res, next) => {
    try { ok(res, await sticker.delete_item(req.user.id, Number(req.params.id))); } catch (e) { next(e); }
});

/* ---------------- 美食手账（r52 手账编辑器） ---------------- */

/**
 * 手账自定义纸面背景图上传（编辑器 bg=3 使用）
 */
router.post('/journal/bg', auth_required(), upload.single('image'), async (req, res, next) => {
    try { ok(res, await journal.save_bg(req.file.buffer)); } catch (e) { next(e); }
});

/**
 * 新建手账：{title, date, text, bg, bg_src, layout, cover}
 */
router.post('/journal', write_required(), async (req, res, next) => {
    try { ok(res, await journal.create(req.user.id, req.body)); } catch (e) { next(e); }
});

/**
 * 我的手账列表（最近 100 篇）
 */
router.get('/journal', auth_required(), async (req, res, next) => {
    try { ok(res, await journal.list(req.user.id)); } catch (e) { next(e); }
});

/**
 * 手账详情（归属校验）
 */
router.get('/journal/:id', auth_required(), async (req, res, next) => {
    try { ok(res, await journal.get(req.user.id, Number(req.params.id))); } catch (e) { next(e); }
});

/**
 * 更新手账（归属校验）
 */
router.put('/journal/:id', write_required(), async (req, res, next) => {
    try { ok(res, await journal.update(req.user.id, Number(req.params.id), req.body)); } catch (e) { next(e); }
});

/**
 * 删除手账（归属校验）
 */
router.delete('/journal/:id', write_required(), async (req, res, next) => {
    try { ok(res, await journal.remove(req.user.id, Number(req.params.id))); } catch (e) { next(e); }
});

/* ---------------- 打卡（15-差距文档 T-01；03 §5.9；AC10/AC11/AC12） ---------------- */

/**
 * 提交打卡（一人一点位一天一条，uk_check_in_dup 兜底幂等）
 * 请求体 {canteenId, visibility=1公开/2仅自己/3匿名, note≤200, photos≤9, dishIds[], again?}
 * 返回 {checkinId, checkinDate}；当天重复提交 → 409 + 40402 + data.checkinId；
 * again=true → 「另记一条」：菜品/图片并入当天既有记录（不新建），返回 {checkinId, dishIds}
 */
router.post('/checkin', write_required(), async (req, res, next) => {
    try {
        const b = req.body || {};
        const canteen_id = Number(b.canteenId);
        assert(Number.isInteger(canteen_id) && canteen_id > 0, 'canteenId 需为正整数');
        const visibility = b.visibility === undefined ? 1 : Number(b.visibility);
        assert([1, 2, 3].includes(visibility), 'visibility 需为 1 公开 / 2 仅自己 / 3 匿名');
        const note = typeof b.note === 'string' ? b.note.trim().slice(0, 200) : '';
        const photos = Array.isArray(b.photos) ? b.photos : [];
        assert(photos.length <= N.CHECKIN_PHOTOS_MAX, `图片最多 ${N.CHECKIN_PHOTOS_MAX} 张`);
        assert(photos.every((p) => typeof p === 'string' && p.length > 0 && p.length <= 255), 'photos 需为图片 objectKey 数组');
        const dish_ids = Array.isArray(b.dishIds) ? b.dishIds.map(Number).filter((n) => Number.isInteger(n) && n > 0) : [];
        ok(res, b.again
            ? await checkin.append_checkin(req.user.id, { canteen_id, dish_ids, photos, note })
            : await checkin.create_checkin(req.user.id, { canteen_id, visibility, note, photos, dish_ids }));
    } catch (e) { next(e); }
});

/**
 * 我的打卡记录（03 §5.9）：分页四键 {list,total,page,size}，canteenId 可选筛选，时间倒序
 */
router.get('/checkin', auth_required(), async (req, res, next) => {
    try {
        const page = page_int(req.query.page, 1);
        const size = Math.min(page_int(req.query.size, 10), 50);
        const canteen_id = req.query.canteenId === undefined ? null : Number(req.query.canteenId);
        assert(canteen_id === null || (Number.isInteger(canteen_id) && canteen_id > 0), 'canteenId 需为正整数');
        ok(res, await checkin.list_checkins(req.user.id, { canteen_id, page, size }));
    } catch (e) { next(e); }
});

/**
 * 打卡日历（03 §5.9 日历聚合）：month=YYYY-MM，返 {days:[{checkinDate,count,visibility,dishIds}]}，无数据返空数组
 */
router.get('/checkin/calendar', auth_required(), async (req, res, next) => {
    try {
        const month = String(req.query.month || '');
        assert(/^\d{4}-\d{2}$/.test(month), 'month 需为 YYYY-MM 格式');
        ok(res, await checkin.checkin_calendar(req.user.id, month));
    } catch (e) { next(e); }
});

/**
 * 打卡统计（AC12）：{totalDays, monthDays, continuousDays, monthCanteens}，全部数字，无记录为 0
 */
router.get('/checkin/stats', auth_required(), async (req, res, next) => {
    try { ok(res, await checkin.checkin_stats(req.user.id)); } catch (e) { next(e); }
});

/**
 * 删除打卡（物理删，删后当天可再打卡）：记录不存在 404；非本人 403 + 40301
 */
router.delete('/checkin/:id', write_required(), async (req, res, next) => {
    try { ok(res, await checkin.delete_checkin(req.user.id, Number(req.params.id))); } catch (e) { next(e); }
});

/**
 * 收藏状态查询（03 §5.5）：{favored: bool}（读操作，仅要求登录）
 */
router.get('/favorites/status', auth_required(), async (req, res, next) => {
    try {
        ok(res, await userData.favorite_status(req.user.id, {
            subjectType: req.query.targetType,
            subjectId: req.query.targetId,
        }));
    } catch (e) { next(e); }
});

/**
 * 显式取消收藏（03 §5.5）：目标不存在或未收藏均 404
 * 路径 targetType 值域与收藏一致：0 菜品 / 1 档口 / 2 点位
 */
router.delete('/favorites/:targetType/:targetId', write_required(), async (req, res, next) => {
    try {
        ok(res, await userData.unset_favorite(req.user.id, Number(req.params.targetType), Number(req.params.targetId)));
    } catch (e) { next(e); }
});

/**
 * 我的收藏查询（需登录：直接读 req.user.id，未登录由 auth_required 拦 401）
 * T-09：query 支持 listType / groupId 过滤（均空则全量）
 */
router.get('/favorites', auth_required(), async (req, res, next) => {
    try { ok(res, await userData.my_favorites(req.user.id, req.query)); } catch (e) { next(e); }
});

/**
 * 他人个人主页（03 §5.2，公开）：基础资料 + 已发布评价分页（每页 10，created_at 倒序）
 * 被禁言/封禁用户主页仍可访问（公开页口径）
 */
router.get('/users/:id/profile', auth_optional(), async (req, res, next) => {
    try {
        const uid = Number(req.params.id);
        assert(Number.isInteger(uid) && uid > 0, '用户 ID 不合法');
        const u = await query_one(
            'SELECT id, nickname, avatar, avatar_object_key, created_at FROM `user` WHERE id = ?',
            [uid]
        );
        if (!u) throw err.not_found('用户不存在');
        const viewerId = req.user ? req.user.id : null;
        const reviews = await review.list_user_reviews(uid, viewerId, page_int(req.query.page, 1), 10);
        // T-21 头衔进度 + T-14 关注关系（表未落库时返回降级结构，不阻断主页）
        const [statBlock, relation] = await Promise.all([
            titleSvc.public_summary(uid),
            followSvc.counts(uid, viewerId),
        ]);
        ok(res, {
            user: {
                id: u.id, nickname: u.nickname, avatar: u.avatar,
                avatarObjectKey: u.avatar_object_key || null, createdAt: u.created_at,
            },
            stats: statBlock.stats,
            title: statBlock.title,
            follow: relation,
            reviews,
        });
    } catch (e) { next(e); }
});

/**
 * 个人档案页
 */
router.get('/me/reviews', auth_required(), async (req, res, next) => {
    try { ok(res, await review.my_reviews(req.user.id)); } catch (e) { next(e); }
});
router.get('/me/favorites', auth_required(), async (req, res, next) => {
    try { ok(res, await userData.my_favorites(req.user.id, req.query)); } catch (e) { next(e); }
});

/* ---------------- 收藏分组（15-差距文档 T-09；AC06） ---------------- */

/**
 * 我的分组列表（带每组收藏数 fav_count）
 */
router.get('/me/favorite-groups', auth_required(), async (req, res, next) => {
    try { ok(res, await userData.list_favorite_groups(req.user.id)); } catch (e) { next(e); }
});

/**
 * 新建分组：名字 trim 后 1-32 字，禁占用内置名「想吃」「常吃」；每人上限 FAVORITE_GROUP_MAX；同名 409
 */
router.post('/me/favorite-groups', write_required(), async (req, res, next) => {
    try { ok(res, await userData.create_favorite_group(req.user.id, req.body.name)); } catch (e) { next(e); }
});

/**
 * 改名分组（仅本人，越权按 404 不暴露存在性）
 */
router.put('/me/favorite-groups/:id', write_required(), async (req, res, next) => {
    try {
        const id = Number(req.params.id);
        assert(Number.isInteger(id) && id > 0, '分组 ID 不合法');
        ok(res, await userData.rename_favorite_group(req.user.id, id, req.body.name));
    } catch (e) { next(e); }
});

/**
 * 删除分组（物理删）：组内收藏事务内回落「想吃」（list_type=0, group_id=NULL）
 */
router.delete('/me/favorite-groups/:id', write_required(), async (req, res, next) => {
    try {
        const id = Number(req.params.id);
        assert(Number.isInteger(id) && id > 0, '分组 ID 不合法');
        ok(res, await userData.delete_favorite_group(req.user.id, id));
    } catch (e) { next(e); }
});

/**
 * 我的点位提交记录（15-差距文档 T-30；AC09 状态回写：0 待审 / 1 通过 / 2 驳回 + 审核意见）
 * 分页四键 {list,total,page,size}，按提交时间倒序
 */
router.get('/me/point-submits', auth_required(), async (req, res, next) => {
    try {
        const page = page_int(req.query.page, 1);
        const size = Math.min(page_int(req.query.size, 10), 50);
        ok(res, await userData.my_point_submits(req.user.id, { page, size }));
    } catch (e) { next(e); }
});

/**
 * 我的举报记录（15-差距文档 T-30：open/resolved/rejected + handled_at）
 * 分页四键 {list,total,page,size}，按提交时间倒序
 */
router.get('/me/reports', auth_required(), async (req, res, next) => {
    try {
        const page = page_int(req.query.page, 1);
        const size = Math.min(page_int(req.query.size, 10), 50);
        ok(res, await userData.my_reports(req.user.id, { page, size }));
    } catch (e) { next(e); }
});

/**
 * 个人数据导出（T-16）：scope=all 或逗号分隔 journal,checkin,taste,ai,favorite,notification
 * 返回完整 JSON（不含密码 / AI 密钥）
 */
router.get('/me/export', auth_required(), rate_limit('export', N.EXPORT_PER_H, 3600), async (req, res, next) => {
    try { ok(res, await privacy.export_data(req.user.id, req.query.scope)); } catch (e) { next(e); }
});

/**
 * 删除个人数据（T-16）：{scopes:[...], confirm:true}，单事务按范围真删除
 */
router.delete('/me/data', write_required(), async (req, res, next) => {
    try { ok(res, await privacy.delete_data(req.user.id, req.body || {})); } catch (e) { next(e); }
});

/* ---------------- 口味画像（T-12） ---------------- */

/**
 * 我的口味画像：由已发布评价 / 收藏 / 打卡行为实时聚合五维
 * 数据不足（< TASTE_MIN_SAMPLES）返回提示；未授权行为分析返回 authorized=false
 */
router.get('/me/taste-profile', auth_required(), async (req, res, next) => {
    try { ok(res, await tasteSvc.get_profile(req.user.id)); } catch (e) { next(e); }
});

/**
 * 重新生成画像（可选保存饭 MBTI 编码 mbtiCode）；画像表未落库时只返回计算结果
 */
router.post('/me/taste-profile/refresh', write_required(), async (req, res, next) => {
    try { ok(res, await tasteSvc.refresh_profile(req.user.id, req.body || {})); } catch (e) { next(e); }
});

/**
 * 删除画像（软删除；支持画像授权撤回后的清除）
 */
router.delete('/me/taste-profile', write_required(), async (req, res, next) => {
    try { ok(res, await tasteSvc.delete_profile(req.user.id)); } catch (e) { next(e); }
});

/* ---------------- 关注关系（T-14） ---------------- */

/**
 * 我的关注 / 粉丝列表（含互关标记与计数；关系表未落库时 available=false）
 */
router.get('/me/follows', auth_required(), async (req, res, next) => {
    try { ok(res, await followSvc.list_mine(req.user.id)); } catch (e) { next(e); }
});

/**
 * 关注状态（他人主页按钮初始态）
 */
router.get('/users/:id/follow-status', auth_required(), async (req, res, next) => {
    try { ok(res, await followSvc.follow_status(req.user.id, Number(req.params.id))); } catch (e) { next(e); }
});

/**
 * 关注某人（幂等；不能关注自己）
 */
router.post('/users/:id/follow', write_required(), rate_limit('follow', N.FOLLOW_PER_H, 3600), async (req, res, next) => {
    try { ok(res, await followSvc.follow(req.user.id, Number(req.params.id))); } catch (e) { next(e); }
});

/**
 * 取关（未关注 404；软删除保留关系行）
 */
router.delete('/users/:id/follow', write_required(), rate_limit('follow', N.FOLLOW_PER_H, 3600), async (req, res, next) => {
    try { ok(res, await followSvc.unfollow(req.user.id, Number(req.params.id))); } catch (e) { next(e); }
});

/* ---------------- 隐私设置（T-15） ---------------- */

/**
 * 读取隐私/通知授权开关（表未落库返回缺省值）
 */
router.get('/me/privacy', auth_required(), async (req, res, next) => {
    try { ok(res, await settingsSvc.get_privacy(req.user.id)); } catch (e) { next(e); }
});

/**
 * 更新隐私/通知授权开关（布尔或 0/1；单项撤回不影响其他项）
 */
router.put('/me/privacy', write_required(), async (req, res, next) => {
    try { ok(res, await settingsSvc.update_privacy(req.user.id, req.body || {})); } catch (e) { next(e); }
});

/* ---------------- 草稿箱（T-17） ---------------- */

/**
 * 我的草稿列表（最近更新在前；每用户上限 DRAFT_MAX）
 */
router.get('/me/drafts', auth_required(), async (req, res, next) => {
    try { ok(res, await draftSvc.list(req.user.id)); } catch (e) { next(e); }
});

/**
 * 草稿详情（归属校验，供编辑器回填）
 */
router.get('/me/drafts/:id', auth_required(), async (req, res, next) => {
    try { ok(res, await draftSvc.get(req.user.id, Number(req.params.id))); } catch (e) { next(e); }
});

/**
 * 新建草稿：{draftType 1点评/2动态/3长帖/4手账转帖, payload}
 */
router.post('/me/drafts', write_required(), async (req, res, next) => {
    try { ok(res, await draftSvc.create(req.user.id, req.body || {})); } catch (e) { next(e); }
});

/**
 * 更新草稿（draftType / payload 可选）
 */
router.put('/me/drafts/:id', write_required(), async (req, res, next) => {
    try { ok(res, await draftSvc.update(req.user.id, Number(req.params.id), req.body || {})); } catch (e) { next(e); }
});

/**
 * 删除草稿（软删除）
 */
router.delete('/me/drafts/:id', write_required(), async (req, res, next) => {
    try { ok(res, await draftSvc.remove(req.user.id, Number(req.params.id))); } catch (e) { next(e); }
});

/* ---------------- 社区评论（T-18） ---------------- */

/**
 * 评价评论列表（单层；评论表未落库时 available=false）
 */
router.get('/reviews/:id/comments', auth_optional(), async (req, res, next) => {
    try {
        ok(res, await commentSvc.list_comments(
            commentSvc.PARENT_REVIEW, Number(req.params.id), req.user ? req.user.id : null
        ));
    } catch (e) { next(e); }
});

/**
 * 发表评价评论：{content, replyToCommentId?}（机审掩码 + 被评论人通知）
 */
router.post('/reviews/:id/comments', write_required(), rate_limit('comment', N.COMMENT_PER_H, 3600), async (req, res, next) => {
    try {
        ok(res, await commentSvc.create_comment(
            req.user.id, commentSvc.PARENT_REVIEW, Number(req.params.id), req.body || {}
        ));
    } catch (e) { next(e); }
});

/**
 * 帖子评论列表（社区帖子表未落库时 available=false）
 */
router.get('/posts/:id/comments', auth_optional(), async (req, res, next) => {
    try {
        ok(res, await commentSvc.list_comments(
            commentSvc.PARENT_POST, Number(req.params.id), req.user ? req.user.id : null
        ));
    } catch (e) { next(e); }
});

/**
 * 发表帖子评论：{content, replyToCommentId?}
 */
router.post('/posts/:id/comments', write_required(), rate_limit('comment', N.COMMENT_PER_H, 3600), async (req, res, next) => {
    try {
        ok(res, await commentSvc.create_comment(
            req.user.id, commentSvc.PARENT_POST, Number(req.params.id), req.body || {}
        ));
    } catch (e) { next(e); }
});

/**
 * 删除自己的评论（软删除）
 */
router.delete('/comments/:id', write_required(), async (req, res, next) => {
    try { ok(res, await commentSvc.delete_comment(req.user.id, Number(req.params.id))); } catch (e) { next(e); }
});

/* ---------------- 成长任务（T-20） ---------------- */

/**
 * 我的任务列表：每日任务 + 成长任务（含今日/累计进度与领取状态）
 */
router.get('/me/tasks', auth_required(), async (req, res, next) => {
    try { ok(res, await taskSvc.list_tasks(req.user.id)); } catch (e) { next(e); }
});

/**
 * 领取任务奖励（单事务写 task_claim + coin_transaction；重复领取 409）
 */
router.post('/tasks/:id/claim', write_required(), rate_limit('task-claim', N.TASK_CLAIM_PER_H, 3600), async (req, res, next) => {
    try {
        const taskId = Number(req.params.id);
        assert(Number.isInteger(taskId) && taskId > 0, '任务 ID 不合法');
        ok(res, await taskSvc.claim_task(req.user.id, taskId));
    } catch (e) { next(e); }
});

/* ---------------- 头衔与贡献（T-21） ---------------- */

/**
 * 我的个人统计与头衔进度（评价/获赞/收藏/打卡/点位数 → 贡献分）
 */
router.get('/me/stats', auth_required(), async (req, res, next) => {
    try { ok(res, await titleSvc.stats_for(req.user.id)); } catch (e) { next(e); }
});

/**
 * 他人统计与头衔进度（公开主页进度条）
 */
router.get('/users/:id/stats', auth_optional(), async (req, res, next) => {
    try {
        const uid = Number(req.params.id);
        assert(Number.isInteger(uid) && uid > 0, '用户 ID 不合法');
        ok(res, await titleSvc.public_summary(uid));
    } catch (e) { next(e); }
});

/**
 * AI 模型列表（r46 起：用户多套配置，密钥仅掩码回显，密文不出服务端）
 */
router.get('/ai/models', auth_required(), async (req, res, next) => {
    try { ok(res, await ai.list_models(req.user.id)); } catch (e) { next(e); }
});

/**
 * 新增模型配置（供应商/接口类型/地址/模型 ID/展示名称/API 密钥；首个自动设为使用中）
 */
router.post('/ai/models', auth_required(), async (req, res, next) => {
    try { ok(res, await ai.add_model(req.user.id, req.body || {})); } catch (e) { next(e); }
});

/**
 * 编辑模型配置（apiKey 留空 = 保留原密钥）
 */
router.put('/ai/models/:id', auth_required(), async (req, res, next) => {
    try { ok(res, await ai.update_model(req.user.id, Number(req.params.id), req.body || {})); } catch (e) { next(e); }
});

/**
 * 删除模型配置（删使用中项自动回落剩余最新一条）
 */
router.delete('/ai/models/:id', auth_required(), async (req, res, next) => {
    try { ok(res, await ai.delete_model(req.user.id, Number(req.params.id))); } catch (e) { next(e); }
});

/**
 * 切换使用中的模型（ask 链路按此生效）
 */
router.put('/ai/models/:id/select', auth_required(), async (req, res, next) => {
    try { ok(res, await ai.select_model(req.user.id, Number(req.params.id))); } catch (e) { next(e); }
});

/* 平台托管模型：选用（生成个人引用行并置为使用中）/ 移除引用（取消选用） */
router.put('/ai/platform-models/:id/select', auth_required(), async (req, res, next) => {
    try { ok(res, await ai.select_platform_model(req.user.id, Number(req.params.id))); } catch (e) { next(e); }
});
router.delete('/ai/platform-models/:id', auth_required(), async (req, res, next) => {
    try { ok(res, await ai.remove_platform_model(req.user.id, Number(req.params.id))); } catch (e) { next(e); }
});

/**
 * AI 供应商列表（启用项：模型设置下拉与文档链接数据源，后台可维护）
 */
router.get('/ai/providers', auth_required(), async (_req, res, next) => {
    try { ok(res, await ai.list_providers()); } catch (e) { next(e); }
});

/**
 * AI 助手提问（评价即知识库；未配置/失败自动降级规则推荐）
 */
router.post('/ai/ask', write_required(), rate_limit('ai', N.AI_PER_H, 3600), async (req, res, next) => {
    try {
        ok(res, await ai.ask(req.user.id, req.body.question));
    } catch (e) { next(e); }
});

/**
 * AI 问答历史（最近 20 条）
 */
router.get('/ai/history', auth_required(), async (req, res, next) => {
    try { ok(res, await ai.history(req.user.id)); } catch (e) { next(e); }
});

/**
 * 删除单条 AI 问答记录（仅本人）
 */
router.delete('/ai/history/:id', auth_required(), async (req, res, next) => {
    try { ok(res, await ai.delete_history_item(req.user.id, Number(req.params.id))); } catch (e) { next(e); }
});

/**
 * 清空当前用户全部 AI 问答记录
 */
router.delete('/ai/history', auth_required(), async (req, res, next) => {
    try { ok(res, await ai.clear_history(req.user.id)); } catch (e) { next(e); }
});

/**
 * 点位提交（用户报新点位/档口/菜品，进后台审核）
 */
router.post('/points-submit', write_required(), rate_limit('point-submit', N.POINT_SUBMIT_PER_H, 3600), async (req, res, next) => {
    try {
        ok(res, await userData.create_point_submit(req.user.id, req.body || {}));
    } catch (e) { next(e); }
});

/**
 * 修改个人资料（昵称/邮箱/预设头像/自定义头像）
 */
router.put('/me/profile', auth_required(), async (req, res, next) => {
    try {
        const b = req.body;
        const nickname = String(b.nickname || '').trim();
        assert(nickname.length >= 1 && nickname.length <= 32, '昵称需 1-32 个字符');
        let email = b.email == null || b.email === '' ? null : String(b.email).trim();
        if (email) assert(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 128, '邮箱格式不正确');
        const avatar = Number(b.avatar == null ? req.user.avatar : b.avatar);
        // 头像编号：0=自动（按 id 映射）、1-8=显式预设
        assert(Number.isInteger(avatar) && avatar >= 0 && avatar <= 8, '头像编号不合法');
        const avatarKey = b.avatarObjectKey ? String(b.avatarObjectKey).slice(0, 255) : null;
        await query(
            'UPDATE `user` SET nickname = ?, email = ?, avatar = ?, avatar_object_key = ? WHERE id = ?',
            [nickname, email, avatar, avatarKey, req.user.id]
        );
        ok(res, { nickname, email, avatar, avatar_object_key: avatarKey });
    } catch (e) { next(e); }
});

/**
 * 修改密码（验证旧密码 + 新密码 ≥6 位）
 */
router.put('/me/password', auth_required(), async (req, res, next) => {
    try {
        const { oldPassword, newPassword } = req.body;
        assert(typeof newPassword === 'string' && newPassword.length >= 6, '新密码至少 6 位');
        const u = await query_one('SELECT password FROM `user` WHERE id = ?', [req.user.id]);
        if (!u || !(await bcrypt.compare(oldPassword || '', u.password))) throw err.invalid('旧密码不正确');
        const hash = await bcrypt.hash(newPassword, 10);
        await query('UPDATE `user` SET password = ? WHERE id = ?', [hash, req.user.id]);
        ok(res);
    } catch (e) { next(e); }
});

/**
 * 通知
 */
router.get('/notifications', auth_required(), async (req, res, next) => {
    try { ok(res, await notification.list_mine(req.user.id)); } catch (e) { next(e); }
});
router.post('/notifications/read', auth_required(), async (req, res, next) => {
    try { await notification.mark_read(req.user.id); ok(res); } catch (e) { next(e); }
});

/**
 * 图片上传（单图 ≤5MB，上限与 media.service 共用 config.numbers.UPLOAD_MAX_BYTES）
 */
router.post('/uploads', write_required(), rate_limit('upload', N.UPLOAD_PER_H, 3600),
    upload.single('file'), async (req, res, next) => {
        try {
            if (!req.file) throw err.invalid('缺少文件');
            const scene = req.body.scene === 'cover' ? 'cover' : 'review';
            ok(res, await media.upload_image(req.file.buffer, req.user.id, scene));
        } catch (e) { next(e); }
    });

/**
 * 举报
 */
router.post('/reports', write_required(), rate_limit('report', 10, 3600), async (req, res, next) => {
    try {
        await userData.create_report(req.user.id, {
            subjectType: Number(req.body.subjectType),
            subjectId: Number(req.body.subjectId),
            reason: Number(req.body.reason),
            detail: req.body.detail,
        });
        ok(res);
    } catch (e) { next(e); }
});

/* ---------------- 档口负责人 ---------------- */

router.get('/manager/stations/:id/summary', async (req, res, next) => {
    try {
        const auth = req.headers.authorization;
        if (!auth) throw err.unauthorized();
        const { load_user } = require('../middleware/auth');
        const user = await load_user(req);
        if (!user) throw err.unauthorized();
        await managerSvc.assert_manager(user.id, Number(req.params.id));
        ok(res, await managerSvc.station_summary(Number(req.params.id)));
    } catch (e) { next(e); }
});

router.post('/manager/stations/:id/posts', async (req, res, next) => {
    try {
        const { load_user } = require('../middleware/auth');
        const user = await load_user(req);
        if (!user) throw err.unauthorized();
        await managerSvc.create_post(user.id, Number(req.params.id), req.body);
        ok(res);
    } catch (e) { next(e); }
});

/**
 * 档口负责人回应评价（公开回复楼中楼）
 */
router.post('/reviews/:id/reply', async (req, res, next) => {
    try {
        const { load_user } = require('../middleware/auth');
        const user = await load_user(req);
        if (!user) throw err.unauthorized();
        await managerSvc.reply_review(user.id, Number(req.params.id), req.body.content);
        ok(res);
    } catch (e) { next(e); }
});

/* ---------------- 管理后台（role=1） ---------------- */

const admin = express.Router();
admin.use(admin_required());

/* 个性化推送手动触发（kind=daily/weekly/both，默认 both；供后台/联调立即出推送） */
admin.post('/push/run', async (req, res, next) => {
    try { ok(res, await push.run_once(req.body.kind || 'both')); } catch (e) { next(e); }
});

/* 全量菜品贴纸同步（source=3 幂等补缺；启动已自动跑，此处供补跑/重抠） */
admin.post('/stickers/sync', async (req, res, next) => {
    try { ok(res, await sticker.sync_dish_stickers()); } catch (e) { next(e); }
});

admin.get('/audit/pending', async (req, res, next) => {
    try { ok(res, await adminSvc.audit_list(page_int(req.query.page, 1))); } catch (e) { next(e); }
});
admin.post('/audit/:reviewId', async (req, res, next) => {
    try { ok(res, await adminSvc.audit_handle(req.user.id, Number(req.params.reviewId), req.body)); } catch (e) { next(e); }
});

/* 点位提交审核 */
admin.get('/point-submits', async (req, res, next) => {
    try { ok(res, await adminSvc.point_submit_list(Number(req.query.status ?? 0))); } catch (e) { next(e); }
});
admin.post('/point-submits/:id/approve', async (req, res, next) => {
    try { ok(res, await adminSvc.point_submit_approve(req.user.id, Number(req.params.id), req.body || {})); } catch (e) { next(e); }
});
admin.post('/point-submits/:id/reject', async (req, res, next) => {
    try { await adminSvc.point_submit_reject(req.user.id, Number(req.params.id), req.body || {}); ok(res); } catch (e) { next(e); }
});

admin.get('/canteens', async (_req, res, next) => {
    try { ok(res, await query('SELECT * FROM canteen ORDER BY id')); } catch (e) { next(e); }
});
admin.post('/canteens', async (req, res, next) => {
    try { ok(res, await adminSvc.create_canteen(req.user.id, req.body)); } catch (e) { next(e); }
});
admin.put('/canteens/:id', async (req, res, next) => {
    try { await adminSvc.update_canteen(Number(req.params.id), req.body); ok(res); } catch (e) { next(e); }
});
admin.delete('/canteens/:id', async (req, res, next) => {
    try { await adminSvc.delete_canteen(Number(req.params.id)); ok(res); } catch (e) { next(e); }
});

// 点位上架 / 下架（enabled: 1 上架 / 0 下架）
admin.put('/canteens/:id/status', async (req, res, next) => {
    try { await adminSvc.set_canteen_status(Number(req.params.id), req.body.enabled); ok(res); } catch (e) { next(e); }
});

/* AI 供应商注册表（模型设置下拉/文档链接数据源；协议仅 openai / anthropic，后台可维护） */
admin.get('/ai-providers', async (_req, res, next) => {
    try { ok(res, await ai.admin_list_providers()); } catch (e) { next(e); }
});
admin.post('/ai-providers', async (req, res, next) => {
    try { ok(res, await ai.admin_save_provider(req.body || {})); } catch (e) { next(e); }
});
admin.put('/ai-providers/:id', async (req, res, next) => {
    try { ok(res, await ai.admin_save_provider({ ...(req.body || {}), id: Number(req.params.id) })); } catch (e) { next(e); }
});
admin.delete('/ai-providers/:id', async (req, res, next) => {
    try { await ai.admin_delete_provider(Number(req.params.id)); ok(res); } catch (e) { next(e); }
});

/* 平台托管模型：后台配置（含密钥），用户端免配置直接选用 */
admin.get('/platform-models', async (_req, res, next) => {
    try { ok(res, await ai.admin_list_platform()); } catch (e) { next(e); }
});
admin.post('/platform-models', async (req, res, next) => {
    try { ok(res, await ai.admin_save_platform(req.body || {})); } catch (e) { next(e); }
});
admin.put('/platform-models/:id', async (req, res, next) => {
    try { ok(res, await ai.admin_save_platform({ ...(req.body || {}), id: Number(req.params.id) })); } catch (e) { next(e); }
});
admin.delete('/platform-models/:id', async (req, res, next) => {
    try { await ai.admin_delete_platform(Number(req.params.id)); ok(res); } catch (e) { next(e); }
});

// 点位地图坐标校准（后台地图拖拽保存）
admin.put('/canteens/:id/position', async (req, res, next) => {
    try {
        const lat = Number(req.body.lat), lng = Number(req.body.lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
            // 统一走 err 工厂：业务码 40001（禁止旁路写死 body code）
            throw err.invalid('坐标不合法');
        }
        await query('UPDATE canteen SET lat = ?, lng = ? WHERE id = ?', [lat, lng, Number(req.params.id)]);
        ok(res);
    } catch (e) { next(e); }
});

admin.get('/stations', async (_req, res, next) => {
    try {
        ok(res, await query(
            `SELECT s.*, c.name AS canteen_name, u.nickname AS manager_name
             FROM station s JOIN canteen c ON c.id = s.canteen_id
             LEFT JOIN user u ON u.id = s.manager_user_id ORDER BY s.id`));
    } catch (e) { next(e); }
});
admin.post('/stations', async (req, res, next) => {
    try { ok(res, await adminSvc.create_station(req.body)); } catch (e) { next(e); }
});
admin.put('/stations/:id', async (req, res, next) => {
    try { await adminSvc.update_station(Number(req.params.id), req.body); ok(res); } catch (e) { next(e); }
});
admin.delete('/stations/:id', async (req, res, next) => {
    try { await adminSvc.delete_station(Number(req.params.id)); ok(res); } catch (e) { next(e); }
});
admin.put('/stations/:id/status', async (req, res, next) => {
    try { await adminSvc.set_station_status(Number(req.params.id), req.body.status); ok(res); } catch (e) { next(e); }
});
admin.put('/stations/:id/manager', async (req, res, next) => {
    try { await adminSvc.set_station_manager(Number(req.params.id), Number(req.body.userId)); ok(res); } catch (e) { next(e); }
});

admin.get('/dishes', async (req, res, next) => {
    try {
        const kw = `%${req.query.q || ''}%`;
        ok(res, await query(
            `SELECT d.*, s.name AS station_name FROM dish d JOIN station s ON s.id = d.station_id
             WHERE d.name LIKE ? ORDER BY d.id DESC LIMIT 200`, [kw]));
    } catch (e) { next(e); }
});
admin.post('/dishes', async (req, res, next) => {
    try { ok(res, await adminSvc.create_dish(req.body)); } catch (e) { next(e); }
});
admin.put('/dishes/:id', async (req, res, next) => {
    try { await adminSvc.update_dish(Number(req.params.id), req.body); ok(res); } catch (e) { next(e); }
});
admin.delete('/dishes/:id', async (req, res, next) => {
    try { await adminSvc.delete_dish(Number(req.params.id)); ok(res); } catch (e) { next(e); }
});
admin.put('/dishes/:id/status', async (req, res, next) => {
    try { await adminSvc.set_dish_status(Number(req.params.id), req.body.status); ok(res); } catch (e) { next(e); }
});

admin.get('/reports', async (req, res, next) => {
    try { ok(res, await adminSvc.report_list(req.query.status || 'open')); } catch (e) { next(e); }
});
admin.post('/reports/:id/handle', async (req, res, next) => {
    try { await adminSvc.handle_report(req.user.id, Number(req.params.id), req.body); ok(res); } catch (e) { next(e); }
});

admin.get('/users', async (req, res, next) => {
    try { ok(res, await adminSvc.user_list(req.query.q || '')); } catch (e) { next(e); }
});
admin.post('/users/:id/status', async (req, res, next) => {
    try { await adminSvc.set_user_status(req.user.id, Number(req.params.id), req.body); ok(res); } catch (e) { next(e); }
});

admin.get('/words', async (_req, res, next) => {
    try { ok(res, await adminSvc.word_list()); } catch (e) { next(e); }
});
admin.post('/words', async (req, res, next) => {
    try { await adminSvc.word_add(req.body); ok(res); } catch (e) { next(e); }
});
admin.delete('/words/:id', async (req, res, next) => {
    try { await adminSvc.word_delete(Number(req.params.id)); ok(res); } catch (e) { next(e); }
});

admin.get('/dashboard', async (_req, res, next) => {
    try { ok(res, await adminSvc.dashboard()); } catch (e) { next(e); }
});

/* 档口公告管理（后台直发，无需负责人身份） */
admin.get('/posts', async (_req, res, next) => {
    try { ok(res, await adminSvc.post_list()); } catch (e) { next(e); }
});
admin.post('/posts', async (req, res, next) => {
    try { ok(res, await adminSvc.post_create(req.user.id, req.body)); } catch (e) { next(e); }
});
admin.delete('/posts/:id', async (req, res, next) => {
    try { await adminSvc.post_delete(Number(req.params.id)); ok(res); } catch (e) { next(e); }
});

/* 运维维护：全量重算聚合 */
admin.post('/maintenance/recalc', async (_req, res, next) => {
    try { ok(res, await adminSvc.maintenance_recalc()); } catch (e) { next(e); }
});

router.use('/admin', admin);

module.exports = router;
