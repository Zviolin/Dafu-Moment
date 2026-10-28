/**
 * 业务异常与统一响应封装
 * 响应体 code 为五位业务码（03-详细设计 §5.9）：
 *   40001 参数 / 40101 未登录 / 40301 无权 / 40302 封禁禁言 / 40401 不存在 /
 *   40402 重复 / 42901 频控 / 50001 内部 / 50301 服务暂不可用
 * HTTP 状态码保持语义对应（422/401/403/404/409/429/500/503），成功仍 code=0
 */
class ApiError extends Error {
    /**
     * @param {number} status - HTTP 状态码
     * @param {string} msg - 用户可读文案
     * @param {number} biz - 五位业务码（响应体 code 字段）
     * @param {*} [data] - 随错误回带的业务数据（如 409 重复打卡带既有 checkinId；error.js 渲染层已输出该字段）
     */
    constructor(status, msg, biz, data) {
        super(msg);
        this.status = status;
        this.biz = biz;
        this.data = data;
    }
}

/**
 * 成功响应 {code:0, msg:'ok', data}
 * @param {import('express').Response} res
 * @param {*} data - 业务数据
 */
function ok(res, data = null) {
    res.json({ code: 0, msg: 'ok', data });
}

/**
 * 抛出业务异常的快捷工厂（业务码对照 03 §5.9 错误码简表）
 */
const err = {
    invalid: (msg = '参数不合法') => new ApiError(422, msg, 40001),
    unauthorized: (msg = '请先登录') => new ApiError(401, msg, 40101),
    forbidden: (msg = '无权操作') => new ApiError(403, msg, 40301),
    banned: (msg = '账号当前状态不可进行该操作') => new ApiError(403, msg, 40302),
    not_found: (msg = '内容不存在') => new ApiError(404, msg, 40401),
    conflict: (msg = '操作冲突', data) => new ApiError(409, msg, 40402, data),
    too_many: (msg = '手速太快啦，休息一下') => new ApiError(429, msg, 42901),
    unavailable: (msg = '服务暂不可用，请稍后再试') => new ApiError(503, msg, 50301),
};

module.exports = { ApiError, ok, err };
