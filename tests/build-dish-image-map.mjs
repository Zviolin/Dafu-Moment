/**
 * 生成 backend/src/seed/dish-image-map.json（菜品 → MinIO objectKey 映射表）
 *
 * 数据源：
 *   - backend/src/seed/real-data.json（种子口径的点位/档口/菜品，seed.js 的唯一来源）
 *   - 华为云 CodeHub 仓库 dafu-shike 的 assets/dish-images/菜名图片对应.json + 图片文件
 *     （SSH 克隆至 g:\Codes\WorkPlace\WorkBuddy\.tmp-codehub-dafu-shike）
 *
 * 输出：菜品（档口名 + 菜名）→ 确定性 MinIO objectKey（cover/{yyyymm}/{sha256前16}.{ext}）
 *      同时给出档口代表图、点位代表图（点位名与档口名一一对应）
 *
 * 运行：node tests/build-dish-image-map.mjs
 */
import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';

const REPO = 'g:\\Codes\\WorkPlace\\WorkBuddy\\软件工程作业\\团队项目-大福食刻\\项目代码';
const CLONE = 'g:\\Codes\\WorkPlace\\WorkBuddy\\.tmp-codehub-dafu-shike\\assets\\dish-images';
const OUT = `${REPO}\\backend\\src\\seed\\dish-image-map.json`;
const YYYYMM = '202610';

/** 读取 JSON 文件 */
function read_json(p) {
    return JSON.parse(readFileSync(p, 'utf8'));
}

/** 归一化菜名：去括号内容、去空白、斜杠统一 */
function norm(s) {
    return String(s).replace(/[（(].*?[)）]/g, '').replace(/[\s　]/g, '').replace(/／/g, '/').trim();
}

const real = read_json(`${REPO}\\backend\\src\\seed\\real-data.json`);
const mapping = read_json(`${CLONE}\\菜名图片对应.json`);

// 按 档口名 → 候选条目分组
const by_station = new Map();
for (const m of mapping) {
    if (!by_station.has(m.station_name)) by_station.set(m.station_name, []);
    by_station.get(m.station_name).push(m);
}

/**
 * 在档口候选中找匹配条目：菜名精确 → original 精确 → 归一化
 * @param {Array} cands 候选条目
 * @param {string} dish 菜名
 * @returns {Object|null}
 */
function pick(cands, dish) {
    let hit = cands.find((c) => c.dish_name === dish);
    if (!hit) hit = cands.find((c) => c.original_dish_name === dish);
    if (!hit) {
        const t = norm(dish);
        const hits = cands.filter((c) => norm(c.dish_name) === t || norm(c.original_dish_name) === t);
        if (hits.length === 1) hit = hits[0];
    }
    return hit || null;
}

const dishes = [];
const stations = {};
const canteens = {};
const unmatched = [];
let file_count = 0;
const used_files = new Set();

for (const place of real.places) {
    const st_list = place.stations || [];
    for (const st of st_list) {
        const cands = by_station.get(st.name) || [];
        let station_cover = '';
        for (const d of st.dishes || []) {
            const name = String(d.name || '').slice(0, 64);
            if (!name) continue;
            const hit = pick(cands, name);
            if (!hit) { unmatched.push({ station: st.name, dish: name }); continue; }
            const file = hit.image_file;
            const abs = `${CLONE}\\${file}`;
            try { statSync(abs); } catch { unmatched.push({ station: st.name, dish: name, reason: 'file_missing', file }); continue; }
            const buf = readFileSync(abs);
            const sha = createHash('sha256').update(buf).digest('hex');
            if (hit.sha256 && hit.sha256 !== sha) {
                unmatched.push({ station: st.name, dish: name, reason: 'sha_mismatch', file });
                continue;
            }
            const ext = file.slice(file.lastIndexOf('.') + 1).toLowerCase();
            const object_key = `cover/${YYYYMM}/${sha.slice(0, 16)}.${ext}`;
            if (!used_files.has(file)) { used_files.add(file); file_count += 1; }
            if (!station_cover) station_cover = object_key;
            dishes.push({ station: st.name, dish: name, file, object_key });
        }
        if (station_cover) {
            stations[st.name] = station_cover;
            // 点位名与档口名一一对应（已核对 DB：42 档口 42 点位同名）
            if (place.name !== st.name) canteens[place.name] = station_cover;
        }
    }
}

// 点位名 == 档口名 的情况直接沿用
for (const [name, cover] of Object.entries(stations)) {
    if (!canteens[name]) canteens[name] = cover;
}

console.log('菜品条目:', dishes.length, '/ 未匹配:', unmatched.length);
for (const u of unmatched) console.log('  UNMATCHED', JSON.stringify(u));
console.log('档口代表图:', Object.keys(stations).length, ' 点位代表图:', Object.keys(canteens).length);
console.log('涉及图片文件:', used_files.size, '引用条目总数:', dishes.length);

const out = {
    version: 'r84-real-dish-covers',
    source: '华为云 CodeHub 仓库 dafu-shike（master）assets/dish-images/，150 张真实菜品图',
    note: '图片为网络同类菜品示意参考，非门店实拍；object_key 为内容哈希确定性键，可重复上传不产生重复对象',
    yyyymm: YYYYMM,
    dishes,
    stations,
    canteens,
};
writeFileSync(OUT, JSON.stringify(out, null, 1) + '\n', 'utf8');
console.log('已写入:', OUT);
