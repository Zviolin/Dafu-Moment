/**
 * API 模块：按域拆分的请求函数（snake_case 命名）
 */
import http from './http';

export const api_auth = {
    register: (data) => http.post('/auth/register', data),
    login: (data) => http.post('/auth/login', data),
    me: () => http.get('/auth/me'),
    // 图形验证码：{captchaId, imageBase64}（登录/注册提交时需带 captchaId + captchaCode）
    get_captcha: () => http.get('/auth/captcha'),
    update_profile: (d) => http.put('/me/profile', d),
    update_password: (d) => http.put('/me/password', d),
    // 福大统一身份认证（r50/r51）：绑定 / 解绑 / SSO 登录 / CAS 模式探测
    fzu_bind: (d) => http.post('/auth/fzu/bind', d),
    fzu_unbind: () => http.delete('/auth/fzu/bind'),
    fzu_sso: (d) => http.post('/auth/fzu/sso', d),
    fzu_cas_mode: () => http.get('/auth/fzu/cas/mode'),
};

// 他人公开主页：用户信息 + 公开点评分页（{user, reviews: {list, total, page, size}}）
export const api_user = {
    profile: (id, params) => http.get(`/users/${id}/profile`, { params }),
};

export const api_content = {
    // 点位列表：type 为 0-3 数字（不传返回全部）；sort 维度排序
    // comprehensive 综合 / taste 口味 / portion 份量 / price 价格 / queue 排队 / env 环境 / delivery 配送 / package 包装
    canteens: (params) => http.get('/canteens', { params }),
    canteen_detail: (id) => http.get(`/canteens/${id}`),
    station_detail: (id) => http.get(`/stations/${id}`),
    // 档口轻量列表（AC07 对比选择器池）：在架档口全量 + 所属点位名 + 聚合分
    stations: () => http.get('/stations'),
    // 档口横向对比（AC07）：ids 为 2~4 个档口 id 数组，按入参顺序返回含 dimScores 的对比行
    stations_compare: (ids) => http.get('/stations/compare', { params: { ids: ids.join(',') } }),
    dishes: (params) => http.get('/dishes', { params }),
    dish_detail: (id) => http.get(`/dishes/${id}`),
    categories: () => http.get('/categories'),
    // 评分维度配置（按点位类型动态返回）
    dimensions: (type) => http.get('/dimensions', { params: { type } }),
    // 统一搜索：返回点位 / 档口 / 菜品三分组
    search_all: (q) => http.get('/search', { params: { q } }),
    // 推荐：高分口碑 top + 个性化 forYou
    recommendations: () => http.get('/recommendations'),
    // 校园口碑榜：按档口聚合期间内真实评价（period: day/week/all；dim: hot/score/like）
    rankings: (params) => http.get('/rankings', { params }),
    // 点位提交（新点位 / 新窗口 / 改信息）
    submit_point: (data) => http.post('/points-submit', data),
    // 我的点位提交记录（T-30；AC09 审核状态回写）：分页 {page,size}
    my_point_submits: (params) => http.get('/me/point-submits', { params }),
};

export const api_review = {
    list: (params) => http.get('/reviews', { params }),
    get: (id) => http.get(`/reviews/${id}`),
    create: (data) => http.post('/reviews', data),
    update: (id, data) => http.put(`/reviews/${id}`, data),
    remove: (id) => http.delete(`/reviews/${id}`),
    vote: (id, value) => http.post(`/reviews/${id}/vote`, { value }),
    // 点赞/取消赞 toggle：返回 {liked, likeCount}
    like: (id) => http.post(`/reviews/${id}/like`),
    appeal: (id) => http.post(`/reviews/${id}/appeal`),
    reply: (id, content) => http.post(`/reviews/${id}/reply`, { content }),
    my_reviews: () => http.get('/me/reviews'),
};

// AI 助手「福宝」：问答 + 历史 + 用户自配（多供应商：openai 兼容 / anthropic 原生）
export const api_ai = {
    ask: (question) => http.post('/ai/ask', { question }),
    history: () => http.get('/ai/history'),
    /* 历史对话管理：删除单条 / 清空全部（仅本人记录） */
    delete_history: (id) => http.delete(`/ai/history/${id}`),
    clear_history: () => http.delete('/ai/history'),
    // 供应商注册表（启用项）：下拉与文档链接数据源，后台可维护
    providers: () => http.get('/ai/providers'),
    // 模型列表（r46 起多套配置可切换；密钥仅掩码，密文不出服务端）
    models: () => http.get('/ai/models'),
    add_model: (d) => http.post('/ai/models', d),
    update_model: (id, d) => http.put(`/ai/models/${id}`, d),
    delete_model: (id) => http.delete(`/ai/models/${id}`),
    select_model: (id) => http.put(`/ai/models/${id}/select`),
    /* 平台托管模型（后台配置，免密钥直接选用）：选用 / 移除引用 */
    select_platform: (id) => http.put(`/ai/platform-models/${id}/select`),
    remove_platform: (id) => http.delete(`/ai/platform-models/${id}`),
};

export const api_favorite = {
    set: (data) => http.post('/favorites', data),
    // 我的收藏（T-09：params 支持 {listType, groupId} 过滤，均空则全量）
    mine: (params) => http.get('/me/favorites', { params }),
    // 单个对象收藏状态（详情页初始态）：{favored}
    status: (targetType, targetId) => http.get('/favorites/status', { params: { targetType, targetId } }),
    // 取消收藏（RESTful 删除）
    remove: (targetType, targetId) => http.delete(`/favorites/${targetType}/${targetId}`),
    // 收藏分组（T-09；AC06）：列表带 fav_count；删组后组内收藏回落「想吃」
    groups: () => http.get('/me/favorite-groups'),
    create_group: (name) => http.post('/me/favorite-groups', { name }),
    rename_group: (id, name) => http.put(`/me/favorite-groups/${id}`, { name }),
    delete_group: (id) => http.delete(`/me/favorite-groups/${id}`),
};

/* 打卡（T-01；03 §5.9）：一人一点位一天一条；重复提交 409 + data.checkinId，带 again:true 另记一条 */
export const api_checkin = {
    create: (data) => http.post('/checkin', data),
    list: (params) => http.get('/checkin', { params }),
    // 日历聚合：month 为 'YYYY-MM'，返 {days:[{checkinDate,count,visibility,dishIds}]}
    calendar: (month) => http.get('/checkin/calendar', { params: { month } }),
    // 统计：{totalDays, monthDays, continuousDays, monthCanteens}，无记录各项为 0
    stats: () => http.get('/checkin/stats'),
    remove: (id) => http.delete(`/checkin/${id}`),
};

export const api_notification = {
    mine: () => http.get('/notifications'),
    read_all: () => http.post('/notifications/read'),
};

export const api_report = {
    create: (data) => http.post('/reports', data),
    // 我的举报记录（T-30）：分页 {page,size}，status open/resolved/rejected
    mine: (params) => http.get('/me/reports', { params }),
};

/* 个人贴图库（r52 手账贴纸）：上传自动抠图 / 列表 / 删除 */
export const api_sticker = {
    extract: (formData) => http.post('/stickers/extract', formData),
    list: () => http.get('/stickers'),
    remove: (id) => http.delete(`/stickers/${id}`),
};

/* 美食手账（r52 手账编辑器）：手账排版画布 CRUD + 自定义纸面背景上传 */
export const api_journal = {
    save_bg: (formData) => http.post('/journal/bg', formData),
    list: () => http.get('/journal'),
    get: (id) => http.get(`/journal/${id}`),
    create: (data) => http.post('/journal', data),
    update: (id, data) => http.put(`/journal/${id}`, data),
    remove: (id) => http.delete(`/journal/${id}`),
};


export const api_upload = {
    image: (formData) => http.post('/uploads', formData),
};

export const api_admin = {
    audit_list: (page) => http.get('/admin/audit/pending', { params: { page } }),
    audit_handle: (id, data) => http.post(`/admin/audit/${id}`, data),
    canteens: () => http.get('/admin/canteens'),
    create_canteen: (d) => http.post('/admin/canteens', d),
    update_canteen: (id, d) => http.put(`/admin/canteens/${id}`, d),
    set_canteen_status: (id, enabled) => http.put(`/admin/canteens/${id}/status`, { enabled }),
    update_position: (id, d) => http.put(`/admin/canteens/${id}/position`, d),
    stations: () => http.get('/admin/stations'),
    create_station: (d) => http.post('/admin/stations', d),
    update_station: (id, d) => http.put(`/admin/stations/${id}`, d),
    delete_station: (id) => http.delete(`/admin/stations/${id}`),
    set_station_status: (id, status) => http.put(`/admin/stations/${id}/status`, { status }),
    set_station_manager: (id, userId) => http.put(`/admin/stations/${id}/manager`, { userId }),
    dishes: (q) => http.get('/admin/dishes', { params: { q } }),
    create_dish: (d) => http.post('/admin/dishes', d),
    update_dish: (id, d) => http.put(`/admin/dishes/${id}`, d),
    set_dish_status: (id, status) => http.put(`/admin/dishes/${id}/status`, { status }),
    reports: (status) => http.get('/admin/reports', { params: { status } }),
    handle_report: (id, d) => http.post(`/admin/reports/${id}/handle`, d),
    users: (q) => http.get('/admin/users', { params: { q } }),
    set_user_status: (id, d) => http.post(`/admin/users/${id}/status`, d),
    words: () => http.get('/admin/words'),
    add_word: (d) => http.post('/admin/words', d),
    delete_word: (id) => http.delete(`/admin/words/${id}`),
    posts: () => http.get('/admin/posts'),
    create_post: (d) => http.post('/admin/posts', d),
    delete_post: (id) => http.delete(`/admin/posts/${id}`),
    recalc: () => http.post('/admin/maintenance/recalc'),
    dashboard: () => http.get('/admin/dashboard'),
};

export const api_manager = {
    summary: (stationId) => http.get(`/manager/stations/${stationId}/summary`),
    create_post: (stationId, d) => http.post(`/manager/stations/${stationId}/posts`, d),
};
