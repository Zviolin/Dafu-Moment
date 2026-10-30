/**
 * 管理后台 API（admin 视图专用，与 api/index.js 解耦；snake_case 命名）
 * v2.0：新增点位提交审核；看板/审核队列对齐维度化新口径
 */
import http from './http';

export const api_admin = {
    /* ---- 数据看板 ---- */
    dashboard: () => http.get('/admin/dashboard'),
    recalc: () => http.post('/admin/maintenance/recalc'),

    /* ---- 审核队列（待人工评价） ---- */
    audit_list: (page) => http.get('/admin/audit/pending', { params: { page } }),
    audit_handle: (id, data) => http.post(`/admin/audit/${id}`, data),

    /* ---- 点位提交审核（v2.0 新增：用户众包报点位/档口/菜品） ---- */
    point_submits: (status = 0) => http.get('/admin/point-submits', { params: { status } }),
    approve_point_submit: (id, comment) => http.post(`/admin/point-submits/${id}/approve`, { comment: comment || '' }),
    reject_point_submit: (id, comment) => http.post(`/admin/point-submits/${id}/reject`, { comment }),

    /* ---- 内容维护：点位（食堂） ---- */
    canteens: () => http.get('/admin/canteens'),
    create_canteen: (d) => http.post('/admin/canteens', d),
    update_canteen: (id, d) => http.put(`/admin/canteens/${id}`, d),
    set_canteen_status: (id, enabled) => http.put(`/admin/canteens/${id}/status`, { enabled }),
    update_position: (id, d) => http.put(`/admin/canteens/${id}/position`, d),

    /* ---- 内容维护：档口（窗口） ---- */
    stations: () => http.get('/admin/stations'),
    create_station: (d) => http.post('/admin/stations', d),
    update_station: (id, d) => http.put(`/admin/stations/${id}`, d),
    delete_station: (id) => http.delete(`/admin/stations/${id}`),
    set_station_status: (id, status) => http.put(`/admin/stations/${id}/status`, { status }),
    set_station_manager: (id, userId) => http.put(`/admin/stations/${id}/manager`, { userId }),

    /* ---- 内容维护：菜品 ---- */
    dishes: (q) => http.get('/admin/dishes', { params: { q } }),
    create_dish: (d) => http.post('/admin/dishes', d),
    update_dish: (id, d) => http.put(`/admin/dishes/${id}`, d),
    set_dish_status: (id, status) => http.put(`/admin/dishes/${id}/status`, { status }),

    /* ---- 内容维护：档口公告 ---- */
    posts: () => http.get('/admin/posts'),
    create_post: (d) => http.post('/admin/posts', d),
    delete_post: (id) => http.delete(`/admin/posts/${id}`),

    /* ---- SSO 账号管理（r80：福大统一身份口令托管，重置/指定新口令） ---- */
    fzu_accounts: (params) => http.get('/admin/fzu-accounts', { params }),
    reset_fzu_password: (uid, newPassword) => http.put(`/admin/fzu-accounts/${uid}/password`, { newPassword: newPassword || '' }),

    /* ---- AI 供应商注册表（r45：模型设置下拉/文档链接数据源） ---- */
    ai_providers: () => http.get('/admin/ai-providers'),
    create_ai_provider: (d) => http.post('/admin/ai-providers', d),
    update_ai_provider: (id, d) => http.put(`/admin/ai-providers/${id}`, d),
    delete_ai_provider: (id) => http.delete(`/admin/ai-providers/${id}`),

    /* ---- 平台托管模型（r52：后台配置含密钥，前台用户免配置直接选用） ---- */
    platform_models: () => http.get('/admin/platform-models'),
    // 平台模型连通性测试（r89）：已保存配置传 id（可复用原密钥），新配置直接传表单值；真实请求放宽超时
    test_platform_model: (d) => http.post('/admin/platform-models/test', d, { timeout: 70000 }),
    create_platform_model: (d) => http.post('/admin/platform-models', d),
    update_platform_model: (id, d) => http.put(`/admin/platform-models/${id}`, d),
    delete_platform_model: (id) => http.delete(`/admin/platform-models/${id}`),
};
