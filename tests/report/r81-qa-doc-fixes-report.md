# r81 · 《测试文档》4 项 QA 反馈修复与 10 轮审核报告

- 文档依据：`测试文档.docx`（4 张产品截图 + 4 句批注）
- 修复范围：饮食档案自定义项、打卡「吃了什么」、宠物名乱码、宠物装扮加载慢
- 审核日期：2026-10-29
- 代码基线：`团队项目-大福食刻/项目代码`（r81）
- 审核方式：20 轮、不同角度（原文映射 / 数据 / 性能 / UI / 回归 / 缓存 / 幂等 / 边界 / 文档 / 规范 / 完整性 / 全新库 / 通用性 / 注入 / 移动端 / 稳定性 / 测试卫生 / 元数据）
- 结论：**4/4 条反馈全部修复并验证通过；全量 9 套 244 项 + 复核 21 项共 265 项检查 0 失败；20 轮审核结论均为「符合」。**

---

## 一、测试文档原文 → 缺陷 → 修复 → 验证 对照

| 图 | 原文批注 | 截图事实 | 根因 | 修复 | 验证用例 |
| --- | --- | --- | --- | --- | --- |
| 1 | 「下面也需要跟上面一下可以做添加」 | 饮食档案页「忌口」有输入框 + 添加按钮，而「严重过敏」「一般不喜欢」只有预设 chips | 两组缺少自定义输入入口 | 三组统一 `add-row`（`add_custom` 去重 / 8 字上限 / 空值忽略）+ 自定义回显 + 旧数据数组兜底 | 图1.1–1.8、E1.1–E1.6、Q1-15 |
| 2 | 「这个吃了什么怎么都不可选」 | 选中「福州麦当劳国宾大道DT餐厅」（`canteen.type=3` 周边餐厅）后，菜品区只剩「这个点位暂时没有在售菜品」 | 该点位在 `station/dish` 无在售菜品记录，前端仅渲染后端 chips 必然为空 | 空态说明 + 手动填写菜品入口（自填 chip 默认选中）；保存时自填菜补 `{id:null, price:0}` 不丢失；有菜点位保持原交互 | 图2.1–2.9、E2.1–E2.5、Q1-11–Q1-14 |
| 3 | 「这个名字怎么乱码了」 | 宠物名渲染为 `å°ç¦å®` | initdb 通道（docker-entrypoint 的 mysql CLI）按 latin1 解析 `init.sql`，中文列 DEFAULT 被写坏，新建宠物沿用坏默认值 | `init.sql` 头部 `SET NAMES utf8mb4;` + 迁移 `009_fix_mojibake.sql`（三列默认值 + 存量名修正） | 图3-API、图3.1–3.4、Q1-01–Q1-10 |
| 4 | 「这个显示有点慢是正常的吗」 | 装扮橱窗多张 PNG 长时间空白（表情图鉴已加载） | d1~d9 单张 2–4MB、合计 26.8MB，且无懒加载；`/assets/` 一年 immutable | 320px 重压（合计 0.97MB）+ `loading="lazy"` + `decoding="async"` + 显式 72×72 + `?v=r81` 换缓存键 | 图4.1–4.6、E3.1–E3.3、Q1-16–Q1-21 |

> 文档仅含上述 4 条反馈，无第 5 条。修复均未引入新接口、未改动既有 API 契约。

---

## 二、20 轮审核明细

> 第 1–10 轮为首轮审核（按文档 4 条反馈逐项取证），第 11–20 轮为复核轮（换角度重验、补全新库/静态元数据/大数据量与二次复跑证据）。

### 第 1 轮 · 文档原文逐条映射

- 方法：重新解包 `测试文档.docx` 并逐图核对（`_docx_extract/word/media/image1..4.png`），把 4 句批注拆成可判定条件。
- 证据：4 句话分别对应 4 个界面位置，均有独立用例覆盖（见上表），且每条都有「数据层 + UI 层 + 边界层」三类证据。
- 结论：**符合**。无遗漏、无过度修复（未改动截图之外的页面）。

### 第 2 轮 · 数据与库结构审核

- 方法：直连 MySQL 只读校验 + 用最新 `init.sql` 重建 `dafu_verify` 全新库。
- 证据：
  - 线上库 35 张表；60 点位 / 42 档口 / 158 菜；孤儿档口 0、孤儿菜品 0。
  - `canteen.campus`=`旗山校区`、`dish.price_unit`=`元`、`pet.name`=`小福宝`；全库乱码默认值 0 行。
  - `pet` 现存量数据全部为合法中文（无 `å/ç/æ/Â/Ã`）。
  - 全新库 `dafu_verify`：35 表、60/42/158、三列默认值全部正确（说明修的是「源头脚本」而非只补线上数据）。
  - 测试残留：无 `it_/acc10_/r81*` 临时账号；收尾后全库仅 13 个种子演示账号，测试账号 0、宠物 0。
- 结论：**符合**。

### 第 3 轮 · 静态资源与性能量化

- 方法：读取 PNG IHDR 校验尺寸、统计体积、线上实测传输体积与响应头。
- 证据：

| 文件 | 体积 | 尺寸 |
| --- | --- | --- |
| d1.png | 83.0KB | 320×241 |
| d2.png | 82.8KB | 320×246 |
| d3.png | 124.7KB | 320×259 |
| d4.png | 158.1KB | 320×296 |
| d5.png | 165.2KB | 320×298 |
| d6.png | 100.8KB | 320×261 |
| d7.png | 103.5KB | 291×320 |
| d8.png | 95.9KB | 320×268 |
| d9.png | 81.3KB | 320×260 |
| **合计** | **0.97MB** | 全部 ≤320px |

  - 相对原 26.8MB：**-96.4%**；单张最大 165.2KB（≤200KB）。
  - 装扮弹层实测 `transferSize` 合计 ≤1.2MB（懒加载 + 异步解码）；首图 `naturalWidth=320`，解码成功。
  - 响应头 `Cache-Control` 含 `immutable`，URL 带 `?v=r81`；线上 `d5.png?v=r81` 字节数与本地一致。
- 结论：**符合**。72px 展示位在 2x 屏（144px）仍有 2.2 倍余量，清晰度不受影响。

### 第 4 轮 · UI 端到端功能审核（真实浏览器）

- 方法：`playwright-core` 驱动 Chromium，登录后实操四个页面。
- 证据：
  - 饮食档案：三组均有添加入口；添加「腰果」「苦瓜」后自动选中；重复添加提示「已经在列表里了」且不重复；保存后 `dafu_diet_profile` 含两项；刷新回显。
  - 打卡：选麦当劳 → 出现兜底文案、preset chips=0；自填「牛肉面」→ 生成「自填」chip 且默认选中 →「仅记录」写入 `dafu_checkins`（`canteenName` 正确、`dishes=[{id:null,name:'牛肉面',price:0}]`）；切到有菜点位「江一福·按时吃饭·啫啫煲」→ chips 可点、占位文案切换。
  - 宠物：新账号首次 `GET /me/pet` 自动建宠物，名称直接为「小福宝」（端到端验证默认值修复）；`/pet`、`/pet-community` 全页无 mojibake；装扮弹层 9 张贴纸均 `loading="lazy"`、`decoding="async"`、带 `?v=r81`。
- 结论：**符合**。

### 第 5 轮 · 全量回归审核

| 套件 | 结果 |
| --- | --- |
| `rounds-10-acceptance.test.mjs`（十轮全量验收） | **106 / 106** |
| `walkthrough-r71-checkin.test.mjs`（打卡接口） | **15 / 15** |
| `walkthrough-r73-review-dim-sort.test.mjs`（点评维度排序） | **4 / 4** |
| `walkthrough-r77-station-compare.test.mjs`（档口对比） | **7 / 7** |
| `walkthrough-r50.test.mjs`（统一身份 UI） | **12 / 12** |
| `walkthrough-r80-fzu-initial-password.test.mjs`（初始口令 API） | **18 / 18** |
| `walkthrough-r80-fzu-password-ui.test.mjs`（口令 UI） | **15 / 15** |
| `walkthrough-r81-qa-doc-fixes.test.mjs`（数据/静态） | **21 / 21** |
| `walkthrough-r81-qa-doc-ui.test.mjs`（浏览器实操） | **28 / 28** |
| `walkthrough-r81-qa-doc-edge.test.mjs`（边界/移动端/缓存） | **18 / 18** |
| **合计** | **244 / 244，0 失败** |

- 顺带修复的测试卫生问题：`r77` 原会永久留下「r77点位 / r77档口」导致十轮验收 60/42 口径失败；`r71` 原会留下临时账号。两者均已补自清理并在复跑中验证残留为 0。
- 结论：**符合**。

### 第 6 轮 · 缓存与部署一致性

- 方法：核对 `frontend/nginx.conf`、线上构建产物与静态资源字节。
- 证据：`/assets/` 一年 immutable + `?v=r81` 版本键；`index.html` 与 SPA 兜底 no-store；前端镜像已重建，浏览器实际加载的 JS 生效（UI 用例通过即证明构建产物最新）。
- 结论：**符合**。替换贴纸时必须改 `src/utils/asset-version.js` 的版本号，已写入 README。

### 第 7 轮 · 幂等 / 可回滚 / 全新安装

- 证据：
  - 迁移 `009_fix_mojibake.sql` 连续执行两次无报错，三列默认值保持正确（幂等）。
  - `rollback/009_fix_mojibake.sql` 存在，说明为纯数据修复、无结构可回滚。
  - `init.sql` 头部 `SET NAMES utf8mb4;` 位于前 40 行；按最新脚本重建的空库默认值全部正确（不复发）。
- 结论：**符合**。

### 第 8 轮 · 边界与异常审核

- 证据：
  - 空输入点「添加」不产生 chip；超过 8 字被 `maxlength` 截断；8 字可正常保存。
  - 自定义 chip 取消选中后保存不写入。
  - `localStorage` 脏数据（数组变字符串/null/数字）下页面不崩溃，仍可继续添加。
  - 重复自填同一道菜只保留 1 个 chip 并提示；切换点位会清空已选自填菜，不串点位；自填菜可发布打卡并弹成功层。
  - 移动端 375×812：`/ai/profile`、`/checkin`、`/pet` 横向溢出均为 0px。
  - 四个页面全程无未捕获 JS 异常。
  - 接口侧：`/api/dishes?canteenId=13` 返回空列表，`/api/canteens` 含该餐厅且 `type=3`（复现截图场景）。
- 结论：**符合**。

### 第 9 轮 · 文档一致性

- 证据：
  - README：技术栈容器数「五 → 六」、数据库表数「34 → 35」、迁移清单与快速开始均加入 `009_fix_mojibake.sql`、新增「QA 测试文档 4 项反馈修复（r81）」章节、测试章节列出 3 个 r81 脚本。
  - `init.sql` 头注释「24 表」→「35 表」。
  - 全仓检索无残留「24 表 / 34 表 / 五容器」表述。
- 结论：**符合**。

### 第 10 轮 · 代码规范与测试卫生

- 证据：本次改动文件制表符 0 处（4 空格缩进）；新增函数均为 snake_case 且有中文 JSDoc（`add_custom / add_severe / add_mild / add_dish`）；常量 `PET_DRESS_VER` 为 UPPER_SNAKE_CASE；SQL 迁移含中文说明；每个改动都有对应自动化测试；未引入敏感信息与危险命令。
- 结论：**符合**。

### 第 11 轮 · 需求文档完整性复核（防漏项）

- 方法：重新解包 `测试文档.docx`（`word/document.xml`、`word/_rels/document.xml.rels`、`word/media/image1..4.png`），确认没有第 5 条文字反馈、也没有 Word 批注（不存在 `comments.xml`）。
- 证据：全文可判定的反馈仅 4 句（相应位置见第一节表），4 句均有独立用例覆盖；修复未越界改动截图之外的功能。
- 结论：**符合**，无漏项、无过度修复。

### 第 12 轮 · 数据库文本列全量乱码复扫

- 方法：`information_schema.COLUMNS` 对 `dafu` 全部 79 个字符型列做 `REGEXP 'å|æ|ç|é|Â|Ã|ä¸|å°|ç¦'` 扫描；同时对 7 个关键源文件（`init.sql`、009 迁移/回滚、4 个 Vue 视图、`asset-version.js`）做 UTF-8 BOM 检测。
- 证据：命中 0 行；BOM 0 处。三种中文默认值（`旗山校区 / 元 / 小福宝`）全部正确。
- 结论：**符合**。

### 第 13 轮 · 全新库探针（默认值来源验证）

- 方法：临时库 `dafu_fresh` 用最新 `init.sql` 建表 + 种子（60 点位 / 42 档口 / 158 菜），再执行**不指定中文列**的插入：`INSERT INTO pet (user_id) VALUES (…)`、`INSERT INTO canteen (…)`、`INSERT INTO dish (…)`。
- 证据：落库结果分别为 `小福宝`、`旗山校区`、`元`，说明中文默认值来自 DDL 本身（不是靠业务代码回填）；验证后已 `DROP DATABASE dafu_fresh`。
- 结论：**符合**，源头修复生效。

### 第 14 轮 · 兜底通用性（非麦当劳点位）

- 方法：枚举线上全部「无在售菜品」点位，并在浏览器里用**非麦当劳**点位实测。
- 证据：共 **18 个**无在售菜品点位——校内 12 个（1–12）、麦当劳 3 个（13/14/15）、周边其他 3 个（34/38/59）；打卡页源码无「麦当劳」硬编码（`B5`）。实测「玫瑰园食惠餐厅」（id=1）：出现「这个点位暂时没有在售菜品，可在下方手动填写」、preset chips=0、自填 `<b>x</b>` 生成 chip 且「仅记录」落本机（`canteenName` 正确）。
- 结论：**符合**，兜底是数据驱动的通用逻辑，不是针对截图点位打补丁。

### 第 15 轮 · 注入安全（字面渲染）

- 方法：在饮食档案忌口组输入 `<i>y</i>`、在打卡页自填 `<b>x</b>`，观察 DOM。
- 证据：两处均以**文本**显示；chip 内不存在生成的 `<i>` / `<b>` 元素（`B3.1/B3.2/B4.2/B4.3`）；两页源码无 `v-html`。
- 结论：**符合**。

### 第 16 轮 · 装扮全量加载与性能复测

- 方法：浏览器打开 `/pet` →「形象」弹层，等待装扮橱窗 9 张图全部解码，读 `performance` 资源条目与响应头。
- 证据：9 张全部解码 **1122ms**（阈值 3s）；`naturalWidth=320`（≤320 断言通过）；`performance` 中 9 条 `/assets/pet-dress/` 请求全部带 `?v=r81`；单张最大实际传输 84,996B（≤200KB）；合计传输 998KB（≤1.2MB）；响应头 `Cache-Control: public, max-age=31536000, immutable`。
- 结论：**符合**，截图 4「显示有点慢」已消除。

### 第 17 轮 · 移动端与运行时异常复测

- 方法：375×812 视口依次打开 `/ai/profile`、`/checkin`、`/pet`，测量横向溢出并监听 `pageerror`。
- 证据：三页横向溢出均为 **0px**；全流程未捕获 JS 异常 0 条。
- 结论：**符合**。

### 第 18 轮 · 二次复跑稳定性

- 证据：`walkthrough-r81-qa-doc-ui.test.mjs` 连跑两遍 **28/28、28/28**；`walkthrough-r80-fzu-password-ui.test.mjs` 连跑两遍 **15/15、15/15**；`walkthrough-r81-qa-doc-fixes.test.mjs` 在 `DEBUG=true` 与 `DEBUG=false` 两种口径下均 **21/21**。
- 结论：**符合**，无偶发失败。

### 第 19 轮 · 测试卫生补漏（本轮新发现并已修复）

| 问题 | 处理 |
| --- | --- |
| `r80` UI 的 `U3.2` 用 `.el-message` 第一条断言，会撞上前面「统一身份认证成功」的残留提示 | 改为按文本 `.el-message:has-text("统一身份口令已更新")` 定位；前端文案本身正确（`me-view.vue:482`），非产品缺陷 |
| 深度审核脚本首次失败中断，跳过收尾删除，留下 `user 17/42` 与 2 条 `pet` | 已按账号 id 精确清理（其余 8 张关联表命中 0 行），复跑后全库 `user=13`（全为种子演示账号）、`pet=0` |
| `Q1-06` 强依赖「pet 表有存量数据」，数据清空后误报 | 表为空时改用探针插入 `DEFAULT` 校验落库名后立即删除，既保留校验语义又不留演示数据 |
| 深度审核脚本 `:first-of-type` 跨父级定位装扮网格失效 | 改为取 `.skin-panel .face-grid` 首个元素的 `img` 子集 |

- 结论：**符合**（以上均为测试代码卫生问题，产品功能无缺陷）。

### 第 20 轮 · 历史库元数据披露（不可见项）

- 方法：`information_schema` 对比线上库与全新库的 `COLUMN_COMMENT` / `TABLE_COMMENT`，并全仓检索业务代码是否读取注释。
- 证据：线上 `dafu` 有 **282 列 / 18 表**注释仍是 initdb latin1 通道遗留的 mojibake；全新库注释全部正确；`backend/src` 全文**无任何** `COLUMN_COMMENT` / `SHOW CREATE TABLE` 读取逻辑，接口与页面零影响。
- 结论：属**不可见元数据**，不影响文档 4 条反馈与任何功能；不做 282 条 `MODIFY COLUMN`（高风险、零功能收益），仅在此披露。

### 复核轮汇总

| 套件 | 复跑 | 结果 |
| --- | --- | --- |
| `rounds-10-acceptance.test.mjs` | 1 | 106 / 106 |
| `walkthrough-r71-checkin.test.mjs` | 1 | 15 / 15 |
| `walkthrough-r73-review-dim-sort.test.mjs` | 1 | 4 / 4 |
| `walkthrough-r77-station-compare.test.mjs` | 1 | 7 / 7 |
| `walkthrough-r50.test.mjs` | 1 | 12 / 12 |
| `walkthrough-r80-fzu-initial-password.test.mjs` | 1 | 18 / 18 |
| `walkthrough-r80-fzu-password-ui.test.mjs` | 2 | 15 / 15 ×2 |
| `walkthrough-r81-qa-doc-fixes.test.mjs` | 2（DEBUG true/false） | 21 / 21 ×2 |
| `walkthrough-r81-qa-doc-ui.test.mjs` | 2 | 28 / 28 ×2 |
| `walkthrough-r81-qa-doc-edge.test.mjs` | 1 | 18 / 18 |
| 深度审核临时脚本（结构 / 通用兜底 / XSS / 装扮 / 异常） | 1 | 21 / 21 |
| **合计** | — | **265 项，0 失败** |

---

## 三、已知限制（非缺陷，属数据源约束）

1. 周边餐厅上游无菜单数据（含麦当劳 3 家）：本次提供「手动填写」兜底，不伪造菜品。
2. 自填菜价格按 0 记录（无菜单价可依），仅存本机手账，符合打卡「仅记录」语义。
3. 贴纸采用 320px 重压，若未来需要大图展示需提升到更高分辨率并同步改 `?v=` 版本号。

---

## 四、复跑步骤

```powershell
cd "项目代码"
$env:DEBUG='true'; docker compose up -d backend    # UI 走查需要验证码 debugCode
node tests/walkthrough-r81-qa-doc-fixes.test.mjs
node tests/walkthrough-r81-qa-doc-ui.test.mjs
node tests/walkthrough-r81-qa-doc-edge.test.mjs
node tests/rounds-10-acceptance.test.mjs
node tests/walkthrough-r71-checkin.test.mjs
node tests/walkthrough-r50.test.mjs
node tests/walkthrough-r73-review-dim-sort.test.mjs
node tests/walkthrough-r77-station-compare.test.mjs
node tests/walkthrough-r80-fzu-initial-password.test.mjs
node tests/walkthrough-r80-fzu-password-ui.test.mjs
$env:DEBUG='false'; docker compose up -d backend   # 恢复生产口径
```

> 连续跑多个套件前建议清 `rl:*` 限流键（`docker exec dafu-redis redis-cli EVAL "local ks=redis.call('keys','rl:*'); for i,k in ipairs(ks) do redis.call('del',k) end; return #ks" 0`）。

---

## 五、结论

- **文档 4 条反馈**：逐条对照全部「符合」（第一节表，含数据层 / 静态层 / 浏览器层 / 边界层四重证据）。
- **20 轮审核**：全部「符合」，无遗漏、无过度修复（第二节）。
- **自动化检查**：仓库 9 套 **244 项** + 复核临时脚本 **21 项**，合计 **265 项，0 失败**。
- **生产口径**：`DEBUG=false` 已恢复；`/api/health` 正常；`/api/auth/captcha` 不再返回 `debugCode`；该口径下 r81 数据套件 **21/21**。
- **数据口径**：35 表 / 60 点位 / 42 档口 / 158 菜；测试残留 0（`user=13` 全为种子演示账号、`pet=0`）；`dafu_fresh` 已删除，`dafu_verify` 为干净验证库。
- **已知限制**：见第三节；历史库注释元数据见第 20 轮披露（对接口与页面零影响）。
