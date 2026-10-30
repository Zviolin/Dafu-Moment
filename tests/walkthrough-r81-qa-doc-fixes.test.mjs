/**
 * r81 走查（数据 / 静态资源层）：按《测试文档》4 条 QA 反馈逐条验收
 *
 * 图 1 饮食档案「严重过敏 / 一般不喜欢」需要和忌口一样可自定义添加 → 源码结构断言
 * 图 2 打卡页选中周边餐厅后「吃了什么」全不可选 → 数据口径 + 前端自填兜底源码断言
 * 图 3 宠物名乱码「å°ç¦å®」 → initdb 字符集 / 迁移 009 / information_schema 默认值 / pet 实际数据
 * 图 4 宠物装扮图加载慢 → 贴纸体积 / 尺寸 / 懒加载 / 版本号换缓存键
 *
 * 运行：node tests/walkthrough-r81-qa-doc-fixes.test.mjs
 * 前置：docker compose up -d（mysql/backend/frontend 健康）；只读校验，除 009 幂等重放外不改数据
 * 幂等：009 迁移为纯 DDL 默认值 + 幂等 UPDATE，可重复执行
 */
import { execSync } from 'child_process';
import { readFileSync, statSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');            // 项目代码根目录
const FRONT = path.join(ROOT, 'frontend');
const DRESS_DIR = path.join(FRONT, 'public', 'assets', 'pet-dress');
const BASE = process.env.LB_BASE || 'http://localhost:8095';

/** 计数器与用例登记 */
const cases = [];
let pass = 0;
let fail = 0;

/**
 * 登记一个用例
 * @param {string} id - 用例编号
 * @param {string} desc - 用例说明
 * @param {Function} fn - 断言体，throw 即失败
 */
async function case_it(id, desc, fn) {
    try {
        await fn();
        pass++;
        cases.push({ id, desc, ok: true });
        console.log(`  [PASS] ${id} ${desc}`);
    } catch (e) {
        fail++;
        cases.push({ id, desc, ok: false, msg: String(e.message || e).slice(0, 200) });
        console.log(`  [FAIL] ${id} ${desc} -> ${String(e.message || e).slice(0, 200)}`);
    }
}

/** 断言工具 */
function assert(cond, msg) {
    if (!cond) throw new Error(msg || 'assert failed');
}

/**
 * MySQL 批处理查询（-N -B：无表头、制表符分隔，便于逐行断言）
 * @param {string} sql - SQL 语句
 * @returns {string[]} 每行结果
 */
function sql(sql) {
    const out = execSync(
        `docker exec dafu-mysql mysql -uroot -pdafu_root_2026 --default-character-set=utf8mb4 -N -B -e "${sql}"`,
        { stdio: 'pipe' }
    ).toString();
    return out.split(/\r?\n/).map((s) => s.trim()).filter((s) => s && !s.startsWith('mysql: [Warning]'));
}

/**
 * 读取文件（UTF-8）
 * @param {string} p
 * @returns {string}
 */
function read(p) {
    return readFileSync(p, 'utf8');
}

/**
 * 解析 PNG 宽高（读 IHDR 块，固定偏移 16..23）
 * @param {string} p - PNG 路径
 * @returns {{width:number,height:number}}
 */
function png_size(p) {
    const buf = readFileSync(p);
    assert(buf.slice(1, 4).toString() === 'PNG', `${path.basename(p)} 不是 PNG`);
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

/** 乱码特征串（UTF-8 被 latin1 重编码后的典型字节组合） */
const MOJIBAKE_RE = /å°|ç¦|å®|æ–|é…|Â|Ã/;

console.log('=== r81 测试文档 4 项 QA 修复 · 数据 / 静态资源层 ===');

/* ---------------- 图 3：宠物名乱码（initdb 字符集 + 迁移 009） ---------------- */

await case_it('Q1-01', 'init.sql 头部声明 SET NAMES utf8mb4（堵住 initdb latin1 通道）', () => {
    const src = read(path.join(ROOT, 'backend', 'sql', 'init.sql'));
    const lines = src.split(/\r?\n/);
    const idx = lines.findIndex((l) => /SET\s+NAMES\s+utf8mb4/i.test(l));
    assert(idx >= 0, 'init.sql 未找到 SET NAMES utf8mb4');
    assert(idx < 40, `SET NAMES 应位于脚本前 40 行（实际第 ${idx + 1} 行）`);
});

await case_it('Q1-02', 'canteen.campus 列默认值 = 旗山校区（无乱码）', () => {
    const rows = sql("SELECT COLUMN_DEFAULT FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='dafu' AND TABLE_NAME='canteen' AND COLUMN_NAME='campus';");
    assert(rows[0] === '旗山校区', `实际默认值「${rows[0]}」`);
});

await case_it('Q1-03', 'dish.price_unit 列默认值 = 元', () => {
    const rows = sql("SELECT COLUMN_DEFAULT FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='dafu' AND TABLE_NAME='dish' AND COLUMN_NAME='price_unit';");
    assert(rows[0] === '元', `实际默认值「${rows[0]}」`);
});

await case_it('Q1-04', 'pet.name 列默认值 = 小福宝', () => {
    const rows = sql("SELECT COLUMN_DEFAULT FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='dafu' AND TABLE_NAME='pet' AND COLUMN_NAME='name';");
    assert(rows[0] === '小福宝', `实际默认值「${rows[0]}」`);
});

await case_it('Q1-05', '全库不存在任何乱码列默认值（information_schema 扫描）', () => {
    const rows = sql("SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='dafu' AND COLUMN_DEFAULT REGEXP 'å|æ|ç|é|Â|Ã';");
    assert(rows[0] === '0', `仍有 ${rows[0]} 个可疑默认值`);
});

await case_it('Q1-06', 'pet 表现存数据全部为正常中文名（无 mojibake）', () => {
    const total = sql('SELECT COUNT(*) FROM dafu.pet;')[0];
    // 表为空时用探针插入校验默认值落库结果（断言后立即删除，不留下演示数据）
    if (total === '0') {
        sql('INSERT INTO dafu.pet (user_id, name) VALUES (999999, DEFAULT);');
        const probe = sql('SELECT name FROM dafu.pet WHERE user_id=999999;')[0];
        sql('DELETE FROM dafu.pet WHERE user_id=999999;');
        assert(probe === '小福宝', `探针插入落库「${probe}」`);
        return;
    }
    const rows = sql('SELECT name FROM dafu.pet;');
    for (const n of rows) {
        assert(!MOJIBAKE_RE.test(n), `发现乱码名「${n}」`);
        assert(/^[\u4e00-\u9fa5A-Za-z0-9_·]+$/.test(n), `名「${n}」含非法字符`);
    }
});

await case_it('Q1-07', '迁移 009 覆盖三列默认值 + pet 存量修复', () => {
    const p = path.join(ROOT, 'backend', 'sql', 'migration', '009_fix_mojibake.sql');
    assert(existsSync(p), '缺少 migration/009_fix_mojibake.sql');
    const src = read(p);
    assert(/canteen[`\s\S]{0,80}campus/i.test(src), '缺少 canteen.campus 默认值修复');
    assert(/dish[`\s\S]{0,80}price_unit/i.test(src), '缺少 dish.price_unit 默认值修复');
    assert(/pet[`\s\S]{0,80}name/i.test(src), '缺少 pet.name 默认值修复');
    assert(/UPDATE\s+`?pet`?\s+SET\s+`?name`?/i.test(src), '缺少 pet 存量乱码数据修复');
});

await case_it('Q1-08', '回滚脚本 009 存在并说明无结构回滚', () => {
    const p = path.join(ROOT, 'backend', 'sql', 'rollback', '009_fix_mojibake.sql');
    assert(existsSync(p), '缺少 rollback/009_fix_mojibake.sql');
    assert(/无结构|no structure|note/i.test(read(p)), '回滚脚本缺少说明');
});

await case_it('Q1-09', '迁移 009 可重复执行（幂等）且默认值保持正确', () => {
    const p = path.join(ROOT, 'backend', 'sql', 'migration', '009_fix_mojibake.sql');
    execSync('docker exec -i dafu-mysql mysql -uroot -pdafu_root_2026 --default-character-set=utf8mb4 dafu', {
        input: readFileSync(p),
        stdio: ['pipe', 'pipe', 'pipe'],
    });
    const rows = sql("SELECT TABLE_NAME, COLUMN_NAME, COLUMN_DEFAULT FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='dafu' AND ((TABLE_NAME='canteen' AND COLUMN_NAME='campus') OR (TABLE_NAME='dish' AND COLUMN_NAME='price_unit') OR (TABLE_NAME='pet' AND COLUMN_NAME='name')) ORDER BY TABLE_NAME;");
    const map = Object.fromEntries(rows.map((r) => {
        const [t, c, d] = r.split('\t');
        return [`${t}.${c}`, d];
    }));
    assert(map['canteen.campus'] === '旗山校区', `canteen.campus=${map['canteen.campus']}`);
    assert(map['dish.price_unit'] === '元', `dish.price_unit=${map['dish.price_unit']}`);
    assert(map['pet.name'] === '小福宝', `pet.name=${map['pet.name']}`);
});

await case_it('Q1-10', '存量业务数据未被乱码污染（campus / price_unit 取值合法）', () => {
    const camps = sql('SELECT DISTINCT campus FROM dafu.canteen;');
    for (const c of camps) assert(!MOJIBAKE_RE.test(c), `campus 出现乱码「${c}」`);
    assert(camps.includes('旗山校区'), `campus 缺「旗山校区」，实为 ${camps.join('/')}`);
    const units = sql('SELECT DISTINCT price_unit FROM dafu.dish;');
    for (const u of units) assert(!MOJIBAKE_RE.test(u), `price_unit 出现乱码「${u}」`);
    assert(units.includes('元'), `price_unit 缺「元」，实为 ${units.join('/')}`);
});

/* ---------------- 图 2：打卡「吃了什么」不可选 ---------------- */

await case_it('Q1-11', '麦当劳三家周边餐厅（13/14/15）在售菜品为 0（复现截图场景）', () => {
    const rows = sql("SELECT c.id, COUNT(d.id) FROM dafu.canteen c LEFT JOIN dafu.station s ON s.canteen_id=c.id LEFT JOIN dafu.dish d ON d.station_id=s.id AND d.status=0 WHERE c.id IN (13,14,15) GROUP BY c.id;");
    assert(rows.length === 3, `应查到 3 个点位，实际 ${rows.length}`);
    for (const r of rows) {
        const [id, n] = r.split('\t');
        assert(n === '0', `点位 ${id} 在售菜品应为 0，实际 ${n}`);
    }
});

await case_it('Q1-12', '/api/dishes?canteenId=13 返回空列表（接口与数据同口径）', async () => {
    const r = await fetch(`${BASE}/api/dishes?canteenId=13&page=1&size=60`);
    assert(r.status === 200, `HTTP ${r.status}`);
    const j = await r.json();
    assert(j.code === 0, `code=${j.code} msg=${j.msg}`);
    const list = Array.isArray(j.data) ? j.data : (j.data?.list || []);
    assert(list.length === 0, `应返回空列表，实际 ${list.length} 条`);
});

await case_it('Q1-13', '/api/canteens 含「福州麦当劳国宾大道DT餐厅」且 type=3', async () => {
    const r = await fetch(`${BASE}/api/canteens`);
    const j = await r.json();
    const list = Array.isArray(j.data) ? j.data : (j.data?.list || []);
    const hit = list.find((c) => c.name === '福州麦当劳国宾大道DT餐厅');
    assert(hit, '点位列表缺少该餐厅');
    assert(hit.type === 3, `type 应为 3，实际 ${hit.type}`);
});

await case_it('Q1-14', '打卡页源码：自填菜品入口 + 空态兜底文案 + 保存不丢自填菜', () => {
    const src = read(path.join(FRONT, 'src', 'views', 'checkin-view.vue'));
    assert(/dish-chip custom/.test(src), '缺少自填菜品 chip 样式绑定');
    assert(/function add_dish/.test(src), '缺少 add_dish()');
    assert(/这个点位暂时没有在售菜品，可在下方手动填写/.test(src), '缺少空态兜底文案');
    assert(/手动填写你吃到的/.test(src), '缺少自填输入框占位提示');
    assert(/return hit \|\| \{ id: null, name, price: 0, img: '' \};/.test(src), '保存时未给自填菜补最小记录');
});

/* ---------------- 图 1：饮食档案两组可自定义添加 ---------------- */

await case_it('Q1-15', '饮食档案：三组均有「自定义 + 添加」入口（忌口/严重过敏/一般不喜欢）', () => {
    const src = read(path.join(FRONT, 'src', 'views', 'diet-profile-view.vue'));
    const addRows = (src.match(/class="add-row"/g) || []).length;
    assert(addRows >= 3, `add-row 应至少 3 处，实际 ${addRows}`);
    for (const p of ['自定义忌口，如「不吃苦瓜」', '自定义过敏原，如「腰果」', '自定义不喜欢，如「苦瓜」']) {
        assert(src.includes(p), `缺少占位文案「${p}」`);
    }
    for (const f of ['function add_avoid', 'function add_severe', 'function add_mild']) {
        assert(src.includes(f), `缺少 ${f}()`);
    }
    assert(/custom_severe/.test(src) && /custom_mild/.test(src), '缺少自定义项回显 computed');
    assert(/if \(!Array\.isArray\(form\[k\]\)\) form\[k\] = \[\];/.test(src), '缺少旧数据数组兜底');
});

/* ---------------- 图 4：宠物装扮贴纸体积与加载策略 ---------------- */

await case_it('Q1-16', '装扮图 d1..d9 单张体积 ≤ 200KB', () => {
    for (let i = 1; i <= 9; i++) {
        const p = path.join(DRESS_DIR, `d${i}.png`);
        assert(existsSync(p), `缺少 d${i}.png`);
        const kb = statSync(p).size / 1024;
        assert(kb <= 200, `d${i}.png 体积 ${kb.toFixed(1)}KB 超过 200KB`);
    }
});

await case_it('Q1-17', '装扮图总体积 ≤ 1.5MB（原 26.8MB，降幅 ≥ 90%）', () => {
    let total = 0;
    for (let i = 1; i <= 9; i++) total += statSync(path.join(DRESS_DIR, `d${i}.png`)).size;
    const mb = total / 1024 / 1024;
    assert(mb <= 1.5, `合计 ${mb.toFixed(2)}MB 超过 1.5MB`);
    assert(mb <= 26.8 * 0.1, `降幅不足 90%（当前 ${mb.toFixed(2)}MB）`);
});

await case_it('Q1-18', '装扮图最长边 ≤ 320px（橱窗展示 72px，2x 屏足够）', () => {
    for (let i = 1; i <= 9; i++) {
        const { width, height } = png_size(path.join(DRESS_DIR, `d${i}.png`));
        const max = Math.max(width, height);
        assert(max <= 320, `d${i}.png ${width}x${height} 最长边超过 320`);
        assert(max >= 144, `d${i}.png ${width}x${height} 过小，2x 屏会糊`);
    }
});

await case_it('Q1-19', '版本号常量 ?v=r82 已抽出并被宠物页 / 社区页引用', () => {
    const vp = path.join(FRONT, 'src', 'utils', 'asset-version.js');
    assert(existsSync(vp), '缺少 utils/asset-version.js');
    assert(/PET_DRESS_VER\s*=\s*'\?v=r82'/.test(read(vp)), 'PET_DRESS_VER 应为 ?v=r82');
    for (const f of ['pet-view.vue', 'pet-community-view.vue']) {
        const src = read(path.join(FRONT, 'src', 'views', f));
        assert(/import \{ PET_DRESS_VER \}/.test(src), `${f} 未引用 PET_DRESS_VER`);
        assert(/pet-dress\/\$\{[^}]+\}\.png\$\{PET_DRESS_VER\}/.test(src), `${f} 装扮图未拼接版本号`);
    }
});

await case_it('Q1-20', '宠物页装扮图具备懒加载 + 异步解码 + 显式尺寸', () => {
    const src = read(path.join(FRONT, 'src', 'views', 'pet-view.vue'));
    assert(/width="72" height="72" loading="lazy" decoding="async"/.test(src), '橱窗图缺少 72x72 / lazy / async');
    assert(/d9\.png\$\{PET_DRESS_VER\}/.test(src), '皇冠图未统一使用 PET_DRESS_VER 缓存键');
    const csrc = read(path.join(FRONT, 'src', 'views', 'pet-community-view.vue'));
    assert(/loading="lazy"/.test(csrc) && /decoding="async"/.test(csrc), '社区页装扮图缺少 lazy/async');
});

await case_it('Q1-21', '线上 d5.png?v=r82 与本地一致且 ≤ 200KB（缓存键生效）', async () => {
    const r = await fetch(`${BASE}/assets/pet-dress/d5.png?v=r82`);
    assert(r.status === 200, `HTTP ${r.status}`);
    const buf = Buffer.from(await r.arrayBuffer());
    const local = statSync(path.join(DRESS_DIR, 'd5.png')).size;
    assert(buf.length === local, `线上 ${buf.length}B ≠ 本地 ${local}B`);
    assert(buf.length <= 200 * 1024, `线上体积 ${(buf.length / 1024).toFixed(1)}KB 超过 200KB`);
});

console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
if (fail) {
    console.log('失败用例：');
    for (const c of cases.filter((x) => !x.ok)) console.log(`  - ${c.id} ${c.desc} -> ${c.msg}`);
}
process.exit(fail ? 1 : 0);
