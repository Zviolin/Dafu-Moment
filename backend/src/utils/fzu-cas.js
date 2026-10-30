/**
 * 福州大学统一身份认证（FZU SSO · CAS 协议）双模式适配（r51）
 *
 * real 模式：FZU_CAS_BASE_URL + FZU_CAS_SERVICE 均配置时启用，走标准 CAS 3.0 流程——
 *   ① GET /auth/fzu/cas/login → 302 跳学校登录页（${base}/login?service=...）
 *   ② 校方登录成功后 302 回 service（前端回调页，URL 带 ticket）
 *   ③ 后端拿 ticket 调 ${base}/serviceValidate?ticket=...&service=... 校验，解析 XML 取学号与姓名
 *   真实接入需向福大网信办申请应用注册（service 回调白名单），凭证填入 env 即切换，代码不变
 *
 * demo 模式：任一 env 缺失时的演示桩——学号（福州大学 9 位数字）+ 统一初始口令（默认 FZU521），
 *   口令托管在 fzu_account 表（r80）：首次登录建档并强制改密，之后可用本人改密后的口令登录；
 *   姓名由学号确定性映射（同学号恒同名，演示稳定）；答辩如实说明，数据模型与接口协议与真实一致
 */
const config = require('../config');
const fzu_account = require('../services/fzu-account.service');
const { err } = require('./api-error');

/** 当前 CAS 模式：env 凭证齐备 → real，否则 demo */
function cas_mode() {
    return config.fzu_cas.base_url && config.fzu_cas.service ? 'real' : 'demo';
}

/** 学校统一身份认证登录页地址（real 模式 302 目标）；demo 模式返回 null */
function cas_login_url() {
    if (cas_mode() !== 'real') return null;
    const { base_url, service } = config.fzu_cas;
    return `${base_url.replace(/\/+$/, '')}/login?service=${encodeURIComponent(service)}`;
}

/**
 * 模拟 CAS 校验（demo 模式专用，r80 起为口令托管口径）
 * @param {string} studentId - 学号/工号（9 位数字，如 102400207；与 db3 身份口径一致）
 * @param {string} password - 统一身份认证口令（首次登录须为统一初始口令，如 FZU521）
 * @returns {Promise<{uid: string, name: string, must_change: boolean}>} 学号、姓名与「是否仍用初始口令」
 * @throws {Error} 业务码 40001（invalid）：学号格式或口令不合法
 */
async function assert_fzu_cas(studentId, password) {
    return fzu_account.verify_credential(studentId, password);
}

/**
 * 从 CAS serviceValidate 的 XML 响应中提取学号与姓名（零依赖正则解析）
 * 兼容标准 CAS 2.0/3.0 与金智 authserver 变体：
 *   <cas:serviceResponse><cas:authenticationSuccess><cas:user>102400207</cas:user>
 *   <cas:attributes><cas:cn>张三</cas:cn>...</cas:attributes>
 * 姓名属性依次尝试 cn / name / displayName / 姓名（取不到时回退学号，仅头衔展示少真名）
 * @param {string} xml - 响应原文
 * @returns {{uid: string, name: string}|null} 成功返回身份，失败（authenticationFailure）返回 null
 */
function parse_cas_xml(xml) {
    if (!/<cas:authenticationSuccess>/.test(xml)) return null;
    const user = xml.match(/<cas:user>([\s\S]*?)<\/cas:user>/i);
    if (!user) return null;
    const uid = user[1].trim();
    const attr = (key) => {
        const m = xml.match(new RegExp(`<cas:${key}>([\\s\\S]*?)</cas:${key}>`, 'i'));
        return m ? m[1].trim() : '';
    };
    const name = attr('cn') || attr('name') || attr('displayName') || attr('姓名') || uid;
    return { uid, name };
}

/**
 * 真实 CAS ticket 校验（real 模式专用）：调学校 serviceValidate 接口
 * @param {string} ticket - 校方回调带回的一次性票据（ST-xxx）
 * @returns {Promise<{uid: string, name: string}|null>} 校验成功返回身份；票据无效/过期/网络异常返回 null
 */
async function validate_cas_ticket(ticket) {
    const { base_url, service, validate_path, timeout_ms } = config.fzu_cas;
    const url = `${base_url.replace(/\/+$/, '')}${validate_path}`
        + `?ticket=${encodeURIComponent(ticket)}&service=${encodeURIComponent(service)}`;
    try {
        const resp = await fetch(url, { signal: AbortSignal.timeout(timeout_ms) });
        if (!resp.ok) return null;
        return parse_cas_xml(await resp.text());
    } catch {
        // 校方接口超时/不可达：按校验失败处理（前端提示重新授权登录）
        return null;
    }
}

/**
 * 按当前模式校验 SSO/绑定凭据（routes 层统一入口）
 * real 模式只认 ticket（防伪造学号绕过真实认证）；demo 模式认学号 + 托管口令
 * @param {Object} body - 请求体（{ticket} 或 {studentId, password}）
 * @returns {Promise<{uid: string, name: string, must_change: boolean}>} 校验通过的身份
 * @throws {Error} 业务码 40001：模式不匹配或校验不通过
 */
async function assert_cas_credential(body) {
    const { ticket, studentId, password } = body || {};
    if (cas_mode() === 'real') {
        if (!ticket) {
            throw err.invalid('当前已接入真实统一身份认证，请通过「福州大学统一身份认证」页面授权');
        }
        const cas = await validate_cas_ticket(String(ticket));
        if (!cas) throw err.invalid('统一身份认证校验失败或票据已过期，请重新授权登录');
        // 真实 CAS 的口令由校方托管，本地无「初始口令」概念
        return { ...cas, must_change: false };
    }
    if (ticket) throw err.invalid('当前环境未配置真实 CAS，请使用学号 + 口令登录');
    return assert_fzu_cas(studentId, password);
}

module.exports = { cas_mode, cas_login_url, assert_fzu_cas, validate_cas_ticket, assert_cas_credential };
