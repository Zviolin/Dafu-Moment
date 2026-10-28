/**
 * 格式化工具：日期 / 分数色阶 / 对象类型 / 评价状态
 */
export const SUBJECT_TYPE_NAME = { 0: '菜品', 1: '窗口', 2: '食堂' };
// 点位五类型文案（canteen.type：0 校内食堂 / 1 永嘉天地 / 2 学生街 / 3 周边其他 / 4 外卖（AC01））
export const CANTEEN_TYPE_NAME = { 0: '校内食堂', 1: '永嘉天地', 2: '学生街', 3: '周边其他', 4: '外卖' };
export const REVIEW_STATUS = {
    0: { text: '已发布', type: 'success' },
    1: { text: '待人工', type: 'warning' },
    2: { text: '已下架', type: 'info' },
    3: { text: '已驳回', type: 'danger' },
};

/**
 * 时间友好化：刚刚 / N 天前 / 日期
 * @param {string} dt - ISO 或 SQL 时间
 * @returns {string}
 */
export function time_ago(dt) {
    if (!dt) return '';
    // 直接交给 Date 解析：后端 JSON 为带 Z 的 UTC 时刻（ISO），浏览器按真实时差计算，跨时区正确；
    // 兼容 'YYYY-MM-DD HH:mm:ss' 形态（按本地时区解析，库为北京墙上时间，结果一致）
    // 注意不可剥掉 Z 再解析：会把 UTC 时刻错当本地墙上时间，产生 8 小时偏差
    const d = new Date(dt);
    if (Number.isNaN(d.getTime())) return '';
    const diff = Date.now() - d.getTime();
    if (diff < 3600000) return '刚刚';
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`;
    if (diff < 7 * 86400000) return `${Math.floor(diff / 86400000)} 天前`;
    return `${d.getMonth() + 1}-${d.getDate()}`;
}

/**
 * 分数格式化：兼容后端返回字符串数字，统一转 number 再保留 1 位小数
 * @param {number|string} v - 分数
 * @returns {string} 无效值返回 '—'
 */
export function fmt_score(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return '—';
    return n.toFixed(1);
}

/**
 * WR 分配色：≥4.5 绿 / 3.5-4.5 橙 / <3.5 红
 * @param {number} score
 * @returns {string}
 */
export function score_color(score) {
    const n = Number(score);
    if (n >= 4.5) return 'var(--good)';
    if (n >= 3.5) return 'var(--brand)';
    return 'var(--bad)';
}

/**
 * 图片 URL：objectKey → /img/ 路径
 * @param {string} key
 * @returns {string}
 */
export function img_url(key) {
    return key ? `/img/${key}` : '';
}

/**
 * 封面 URL：MinIO objectKey → /img/；预设封面（preset: 前缀）→ /preset-cover/ 静态贴纸 SVG
 * @param {string} key
 * @returns {string}
 */
export function cover_url(key) {
    if (!key) return '';
    if (key.startsWith('preset:')) return `/preset-cover/${key.slice(7)}.svg`;
    return `/img/${key}`;
}

export const PWD_STRENGTH_TEXT = ['', '弱', '中', '强'];

/**
 * 密码强度评估：0 未达 / 1 弱 / 2 中 / 3 强
 * 规则：≥6 位为基础；小写/大写/数字/符号四类命中越多越强；长密码加分
 * @param {string} pwd
 * @returns {number}
 */
export function pwd_strength(pwd) {
    if (!pwd || pwd.length < 6) return 0;
    let k = 0;
    if (/[a-z]/.test(pwd)) k++;
    if (/[A-Z]/.test(pwd)) k++;
    if (/\d/.test(pwd)) k++;
    if (/[^a-zA-Z0-9]/.test(pwd)) k++;
    if (k >= 3 || (pwd.length >= 10 && k >= 2)) return 3;
    if (k >= 2 || pwd.length >= 8) return 2;
    return 1;
}
