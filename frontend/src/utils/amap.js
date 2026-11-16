/**
 * 高德 JS API 2.0 公共加载器（r42 起 Leaflet+栅格瓦片全面换官方矢量渲染）：
 * - 矢量地图文字/图标任意缩放锐利，自带中文注记（替代此前手拼的 256px 栅格注记层）
 * - key/安全密钥走 Vite 环境变量（VITE_AMAP_KEY / VITE_AMAP_SECURITY_CODE），不写死在代码里
 * - 安全密钥必须在 loader 触发加载前挂到 window._AMapSecurityConfig（官方 jscode 机制）
 * - 全站共用单例 Promise，避免重复注入脚本
 * 注意：AMap 坐标序为 [lng, lat]（Leaflet 是 [lat, lng]），调用侧务必转换
 */
import AMapLoader from '@amap/amap-jsapi-loader';

window._AMapSecurityConfig = { securityJsCode: import.meta.env.VITE_AMAP_SECURITY_CODE };

let loading = null;

/**
 * 单例加载 AMap 2.0（并发调用共享同一次加载）
 * @returns {Promise<Object>} AMap 命名空间对象
 */
export function load_amap() {
    if (!loading) {
        loading = AMapLoader.load({
            key: import.meta.env.VITE_AMAP_KEY,
            version: '2.0',
            plugins: ['AMap.ToolBar'], // 缩放工具条（2.0 无 Leaflet 式 zoomControl 选项，需显式加控件）
        });
    }
    return loading;
}

/** 校区中心（GCJ-02 火星坐标，AMap [lng, lat] 序：福州大学旗山校区图书馆主馆） */
export const AMAP_CENTER = [119.1961, 26.0568];

/**
 * 食区默认落点（GCJ-02 火星坐标）：餐厅名取自福大后勤管理处官网公告（hqc.fzu.edu.cn）。
 * 仅作 DB 无坐标时的兜底——后台「地图点位」拖拽校准后以前端 DB 值为准。
 * 注意美岐必须用火星坐标（poi86 火星 119.191987,26.059497），误用大地坐标 119.187,26.063 会偏约 500 米
 */
export const PIN_POS = [
    // 生活一区（丁香园·学府北路福大生活1区：119.192162,26.056662）· 海棠园一楼
    { kw: '京元', lat: 26.0567, lng: 119.1927, short: '京元' },
    // 丁香园·临青春广场（生活一区中南部，锚点以南数十米）
    { kw: '丁香园', lat: 26.0559, lng: 119.1920, short: '丁香园' },
    // 丹桂园朝阳餐厅（原丁香园二楼楼群，丁香园西北侧近似）
    { kw: '朝阳', lat: 26.0565, lng: 119.1914, short: '朝阳' },
    // 玫瑰园·生活三区大门旁，与紫荆园并排（临生活二区）
    { kw: '玫瑰园', lat: 26.0523, lng: 119.1917, short: '玫瑰园' },
    // 紫荆园（捷祥）·生活三区（百度系 26.05867,119.198516 → GCJ-02 26.0528,119.1926）
    { kw: '紫荆园', lat: 26.0528, lng: 119.1926, short: '紫荆园' },
    // 桃李园·教学区东三教学楼旁（图书馆主馆官方 26.056812,119.198453 西侧教学区，楼栋级近似）
    { kw: '桃李园', lat: 26.0576, lng: 119.1962, short: '桃李园' },
    // 佳客来西餐厅·源库 map_location 无此点，仅作地图兜底示意（与桃李园同片区，待实地校准）
    { kw: '佳客来', lat: 26.057, lng: 119.194, short: '佳客来' },
    // 紫竹园到口餐厅·源库 map_location 无此点，仅作地图兜底示意（生活三区北侧，待实地校准）
    { kw: '紫竹园', lat: 26.053, lng: 119.192, short: '紫竹园' },
    // 美岐学生街·岐安村福大学生街（poi86 火星坐标：119.191987,26.059497）
    { kw: '美岐', lat: 26.0595, lng: 119.1920, short: '美岐学生街' },
];

/**
 * 点位落点计算：坐标优先级 DB（后台拖拽校准值）> PIN_POS 关键字兜底；两者皆无才顺排沿线
 * @param {Array<Object>} list - /canteens 返回的点位列表
 * @returns {Array<Object>} 带 lat/lng/short 的点位列表
 */
export function place_pins(list) {
    const placed = [];
    const rest = [];
    for (const c of list) {
        const pos = PIN_POS.find((p) => c.name.includes(p.kw));
        const db_pos = (c.lat != null && c.lng != null) ? { lat: Number(c.lat), lng: Number(c.lng) } : null;
        if (pos) placed.push({ ...c, short: pos.short, ...(db_pos || { lat: pos.lat, lng: pos.lng }) });
        else if (db_pos) placed.push({ ...c, short: c.name.slice(0, 3), ...db_pos });
        else rest.push(c);
    }
    rest.forEach((c, i) => placed.push({ ...c, lat: 26.0602 + i * 0.0008, lng: 119.1940 - i * 0.0012, short: c.name.slice(0, 3) }));
    return placed;
}

/**
 * 生成水滴 pin 的 HTML（前台地图/后台校位图共用同款贴纸语言）
 * @param {Object} [opts]
 * @param {boolean} [opts.on] - 选中态（加深橙）
 * @param {boolean} [opts.gray] - 已下架态（灰身、无脉冲）
 * @returns {string} marker content HTML
 */
export function pin_html({ on = false, gray = false } = {}) {
    const fill = gray ? '#a99a80' : (on ? '#A8720F' : '#C98A1E');
    const pulse = gray ? '' : '<span class="pulse"></span>';
    return `<div class="pin${on ? ' on' : ''}">${pulse}<svg width="30" height="38" viewBox="0 0 30 38"><path d="M15 36 C15 36 27 22.8 27 13.5 A12 12 0 1 0 3 13.5 C3 22.8 15 36 15 36 Z" fill="${fill}" stroke="#fff" stroke-width="2.5"/><circle cx="15" cy="13.5" r="4.6" fill="#fff"/></svg></div>`;
}
