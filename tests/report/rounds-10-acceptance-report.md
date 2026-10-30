# 大福食刻 · 十轮全量验收测试报告

- 测试时间：2026-10-28（Asia/Shanghai）
- 被测版本：`项目代码`（backend 镜像重建后，含 `/reviews` sort 白名单校验）
- 测试脚本：`tests/rounds-10-acceptance.test.mjs`
- 数据基线：[Zviolin/Dafu-Moment](https://github.com/Zviolin/Dafu-Moment) 最新 PR（#3，head `1b6a19a`，已并入 main `d4d0e48`）。PR #3 以业务代码为主、未改动 SQL，故 SQL 数据取 main 上最新一份 `data/db3/sql/*`（最近一次 SQL 提交 `2ba6db7`，2026-10-25）
- **结论：106 条用例全部通过，0 失败**（`tests/report/run.log`、`tests/report/rounds-10-report.json`）

```json
{ "pass": 106, "fail": 0, "failures": [] }
```

---

## 一、测试环境

| 项 | 值 |
| --- | --- |
| 部署 | `docker compose`（mysql 8 / redis 7 / minio / matting(rembg) / backend / frontend 六容器） |
| 访问入口 | 前端 `http://localhost:8095`，API `http://localhost:8095/api` |
| 后端调试位 | `DEBUG=true`（仅联调：验证码接口回显 `debugCode`），测试结束后恢复 `false` |
| 浏览器 | Playwright Chromium（`ms-playwright/chromium-1208`），桌面 1280×900 + 移动 390×844 |
| 库 | `dafu`（35 张表），全新安装副本 `dafu_verify` 用于验证 init.sql + seed 可复现 |
| 临时账号 | `acc10_<时间戳>`，用例结束由 C-01 清理（含动态/点评/金币流水/装扮/宠物/提交记录） |

## 二、真实数据基线（Dafu-Moment 最新 PR 的 SQL）

| 指标 | 期望 | 实测 |
| --- | --- | --- |
| 点位 | 60（校内食堂 12 / 学生街 24 / 周边 24） | 60 |
| 档口 | 42，无「默认档口」占位 | 42 / 0 |
| 菜品 | 158（全部估算价） | 158 / `is_estimated=0` 为 0 |
| 37 道源码「估算演示价」 | 37 | 37 |
| 权威坐标（05_collected_map_locations.sql） | 53 点 1e-6 容差命中 | 53 |
| 真实营业时间 / 人均价 | 52 / 45 | 52 / 45 |
| 任务定义 / 装扮 / 评分维度 | 12 / 9 / 7 | 12 / 9 / 7 |
| 无菜单点位（客观缺口） | 18（12 食堂 + 6 门店） | 18 |
| 归档孤儿行（A1~A14） | 全 0 | 全 0 |

价格口径说明：37 道沿用 `06_estimated_menu_seed.sql`（单位「份（估算演示价）」），其余 121 道按公开人均与招牌菜折算，**全站不存在任何「商家核实的明码实价」**，前端统一展示「估算」角标。

## 三、十轮方法与角度

| 轮次 | 角度 / 方法 | 通过 | 失败 |
| --- | --- | --- | --- |
| R1 | 静态代码一致性（源码正则断言，20 条修复点在代码层的证据） | 20 | 0 |
| R2 | 数据库结构与可复现性（线上库 / 全新建库 / init+seed / 迁移与回滚幂等） | 8 | 0 |
| R3 | 真实数据完整性（对齐最新 PR：数量、坐标、单位、营业时间、无伪造） | 9 | 0 |
| R4 | 认证、鉴权与越权（注册/登录/JWT/角色/403/422） | 11 | 0 |
| R5 | 任务·金币·宠物闭环（打卡→道具→喂食→领奖→购买装扮扣费） | 12 | 0 |
| R6 | 社交动态（发布/双口径排序/点赞/评论/软删） | 7 | 0 |
| R7 | 点评体系（分项打分/重复拦截/聚合刷新/点赞/评论/删除回落） | 8 | 0 |
| R8 | 边界值、异常输入与安全（404/422/分页收敛/枚举白名单/注入/XSS） | 10 | 0 |
| R9 | 《测试记录》20 项逐条行为回归 | 17 | 0 |
| R10 | 浏览器运行时（控制台异常 / 路由可达 / 移动端不溢出） | 3 | 0 |
| C | 清理与干净度核验 | 1 | 0 |
| **合计** | | **106** | **0** |

## 四、逐条用例与结果

### R1 静态代码一致性（20）

| 编号 | 用例 | 结果 |
| --- | --- | --- |
| R1-01 | 评分默认 0 星全灰（测试记录第 1 条） | PASS |
| R1-02 | 搜索页隐藏顶栏搜索框（第 9 条） | PASS |
| R1-03 | 地图页有搜索框 + 四类筛选可点（第 10 条） | PASS |
| R1-04 | 点评圈推荐与最新双口径排序（第 11 条） | PASS |
| R1-05 | 饮食目标多选 + 自定义忌口（第 12/15 条） | PASS |
| R1-06 | MBTI 12 题 / 16 型 / 分享网址（第 12/13/14 条） | PASS |
| R1-07 | 转盘按当前角算目标、结果与指针一致（第 14 条） | PASS |
| R1-08 | 成就页使用真实统计（第 16 条） | PASS |
| R1-09 | 设置页账号安全走弹层、档口走独立页（第 17~20 条） | PASS |
| R1-10 | 档口入驻页提交 submitType=3（第 18 条） | PASS |
| R1-11 | 宠物广场取真实总数，无 1207 假数据（第 4 条） | PASS |
| R1-12 | 20 张宠物表情均为透明 PNG（第 8 条） | PASS |
| R1-13 | 前端源码无 1207/1208/127 天等假数据常量 | PASS |
| R1-14 | History 路由 + 档口入驻路由已注册 | PASS |
| R1-15 | 菜品卡展示价格单位与估算角标 | PASS |
| R1-16 | 任务中心领取后按 coin_balance 刷新 | PASS |
| R1-17 | 宠物页点亮天数取接口字段、无包子底部装饰（第 6/7 条） | PASS |
| R1-18 | 动态详情支持 p- 前缀并分流评论/点赞 | PASS |
| R1-19 | 我的页响应 ?dialog= 打开对应弹层（第 17 条） | PASS |
| R1-20 | 首页/点评/地图无页内假数据数组 | PASS |

### R2 数据库结构与可复现性（8）

| 编号 | 用例 | 结果 |
| --- | --- | --- |
| R2-01 | 线上库 35 张表（含 r80 fzu_account） | PASS |
| R2-02 | 全新库 init.sql 建表 35 张且空库 | PASS |
| R2-03 | 全新库 seed 结果与线上一致（60/42/158） | PASS |
| R2-04 | 迁移 007 幂等（重复执行不报错） | PASS |
| R2-05 | 回滚 007 幂等并可重新升级 | PASS |
| R2-06 | 线上库营业时间列与 52 条真实值 | PASS |
| R2-07 | 核心引用完整性（孤儿行 = 0） | PASS |
| R2-08 | 索引与唯一键规模（≥ 60 个索引，实测 71） | PASS |

### R3 真实数据完整性（9）

R3-01 60/42/158；R3-02 158 道全估算 + 37 道源码标识；R3-03 53 点权威坐标容差命中；R3-04 坐标全部落在旗山校区；R3-05 营业时间 52 / 人均 45；R3-06 无「默认档口」且档口名=店铺名（42/42）；R3-07 JSON 与库内一致；R3-08 API 输出 `price_unit`/`is_estimated`；R3-09 无菜单点位结构合理（12 食堂 + 6 门店）——全部 PASS。

### R4 认证、鉴权与越权（11）

验证码 `captchaId` 返回、注册参数校验（422）、注册签发 JWT、重名 409、错密码 422、登录成功并读 `/auth/me`、无 token 401、普通用户访问后台审核队列 403、管理员 role=1、昵称非法 422、删除他人动态 403 —— 全部 PASS。

### R5 任务·金币·宠物闭环（12）

新账号点亮 1 天 / 金币 0 / 无道具；任务 12 条（6 每日 + 6 成长）；无道具无金币喂食被拒；打卡发 1 道具；喂食扣道具并累计；任务领取加金币；重复领取 409；**金币不足购买装扮 422**；**注入足额金币后购买成功并按真实价格扣费**；**已拥有再次切换不扣费**；**另一件未拥有且不足仍 422**；全服福宝数 = `pet` 真实计数 —— 全部 PASS。
（装扮主键为字符串 `d1~d9`，用例从 `/me/pet` 的 `dresses[]` 动态取价与 id，不写死价格。）

### R6 社交动态（7）

发布成功；`tab=recommend` 与 `tab=latest` 均含新动态；推荐把高人气（like×3 + comment×2 + 24h 新鲜度）排前、最新严格 `created_at DESC`；点赞幂等且计数同步；评论写入并同步 `comment_count`；详情可读作者；删除本人动态后详情 404 —— 全部 PASS。

### R7 点评体系（8）

`sort=hot/new` 可读；按维度分项打分发布成功（返回 `reviewId`）；同对象重复点评 4xx；点评进入对象列表且 `review_summary.review_count/rating_avg` 刷新；点赞幂等；点评评论可写可读；**缺对象的 `sort=dim:<key>` → 422**；删除后聚合点评数回落 —— 全部 PASS。

### R8 边界、异常与安全（10）

不存在资源统一 404；非法 id 格式 422；`page=0/pageSize=0/99999` 被收敛不 500；**非法枚举（`subjectType=9`、`sort=nope`）→ 422**；未登录写接口 401；入驻申请手机号/店名校验 422；SQL 注入（`' OR 1=1 --`）不放大结果集；超长内容不 500；XSS 载荷按纯文本存储；健康检查与未知路由 —— 全部 PASS。

### R9《测试记录》20 项逐条回归（17 个用例覆盖 20 项）

| 用例 | 覆盖条目 | 结果 |
| --- | --- | --- |
| R9-01 | ① 评分默认灰色（0 星 + 「未评分」+ 灰度） | PASS |
| R9-02 | ② 任务中心喂养闭环（打卡得道具 → 喂食成功） | PASS |
| R9-03 | ③ 收藏/分享任务进度随行为更新 | PASS |
| R9-04 | ④⑤⑥ 全服福宝数与点亮天数均为真实值（非 1207 / 127 天） | PASS |
| R9-05 | ⑦ 宠物页无「包子底托」装饰层 | PASS |
| R9-06 | ⑧ 表情透明抠图 + 装扮购买扣币流水（`change_type=2`/`biz_type=3`/金额=真实价） | PASS |
| R9-07 | ⑨ 搜索页仅一个搜索框（顶栏隐藏） | PASS |
| R9-08 | ⑩ 地图四类筛选与搜索框可用（地图 API ≥60 点位且坐标齐全） | PASS |
| R9-09 | ⑪ 推荐流与最新流排序不同（R6-03 实测） | PASS |
| R9-10 | ⑫ 饮食目标多选 + MBTI 12 题 | PASS |
| R9-11 | ⑬ MBTI 结果命名与 4 字母代码（16 型） | PASS |
| R9-12 | ⑭ 分享文案带测试网址（MBTI / 动态） | PASS |
| R9-13 | ⑮ 忌口支持自定义新增 | PASS |
| R9-14 | ⑯ 成就进度取真实统计 | PASS |
| R9-15 | ⑰ 设置-账号与安全跳转到我的页弹层 | PASS |
| R9-16 | ⑱ 档口入驻申请真实落库（`audit_status=0` 待审核） | PASS |
| R9-17 | ⑲⑳ 设置分组不重复、举报记录单一入口、档口入口独立页 | PASS |

### R10 浏览器运行时（3）

- R10-01：`/`、`/list`、`/circle`、`/map`、`/rank`、`/search`、`/me`、`/tasks`、`/pet`、`/pet/community`、`/ai/mbti`、`/ai/diet/profile`、`/settings`、`/achievements`、`/vendor/apply` 全部可达且无未捕获 JS 异常。
- R10-02：首页渲染真实口碑榜（非空壳）。
- R10-03：移动端 390×844 下 `/list` `/circle` `/pet` `/tasks` 横向溢出 ≤ 2px。
- C-01：临时账号及其关联数据全部清除（`user`/`post`/`post_comment`/`post_like`/`review`/`review_like`/`favorite`/`check_in`/`feed_record`/`coin_transaction`/`task_claim`/`user_dress`/`pet`/`point_submit`/`notification`），清理后残留计数 0。

## 五、本轮为通过测试而做的优化

| 文件 | 改动 | 目的 |
| --- | --- | --- |
| `backend/src/routes/index.js` | `GET /reviews`、`GET /points/:id/reviews` 增加 `sort` 白名单（`hot`/`new`/`dim:<key>`，其余 422） | 非法枚举不再静默回落成 `new`，与 422 口径一致（测试记录要求参数严格校验） |
| `tests/rounds-10-acceptance.test.mjs` | 装扮用例改为从接口目录动态取 `d1~d9` 真实 id/价格 | 纠正原先写死 `dress_id: 2` 导致的 404 |
| 同上 | `/pet/community` 调用补 token（`auth_required`） | 纠正 401 |
| 同上 | 动态排序改 `tab=latest|recommend`；菊花链参数与接口契约对齐 | 纠正排序断言失真 |
| 同上 | 聚合断言改 `summary.review_count`/`rating_avg`，点评用返回的 `reviewId` 精确定位 | 纠正字段命名与「找到别人的点评」风险 |
| 同上 | 扣币流水改 `change_type=2 AND biz_type=3 AND amount=真实价` | `coin_transaction.amount` 按 schema 恒为正数，`change_type` 表收支 |
| 同上 | 档口待审断言改 `audit_status` | `point_submit` 主表字段为 `audit_status` |
| 同上 | 中文 SQL 比较改 `CONVERT(0x... USING utf8mb4)` | 规避 Windows 命令行中文编码损坏导致的假结果 |
| `tests/sql/verify-real-data.sql` | 价格口径标签改为「0 明码 / 158 估算」 | 与真实数据口径一致 |
| `README.md` | 真实数据口径（158 全估算、52 营业时间、53 权威坐标、迁移 007）、`/reviews` sort 白名单、测试章节与目录结构 | 文档与实现同步 |

## 六、已知客观缺口与风险（非缺陷，数据源限制）

1. **价格均为估算**：上游只提供 11 份「用户授权的估算演示菜单」，其余按公开人均折算，项目不声称商家核实价；前端已用「估算」角标与单位文案显式标注。
2. **18 个点位无菜单/档口**（12 个校内食堂 + 6 家门店）：上游无公开菜单数据，按「不造假」原则留空，详情页提示未录入。
3. **部分点位无评分/人均**：公开数据源覆盖率所致（人均 45/60，评分仅覆盖有聚合评价的对象）。
4. **无物理外键**：项目库以唯一键 + 业务校验保证一致性，测试用 14 条孤儿行扫描等价验证（全 0）。若后续引入物理外键，需先做历史数据清洗。
5. **`/pet/community` 需登录**：属产品设计（登录后才有「我的排名」语义），非接口缺陷。

## 七、复跑步骤

```powershell
cd "项目代码"
$env:DEBUG='true'
docker compose up -d --build           # 首次或改动后端后需要 build
node tests/rounds-10-acceptance.test.mjs
$env:DEBUG='false'; docker compose up -d backend   # 恢复生产口径
```

结果文件：

- `tests/report/run.log`：逐条 PASS/FAIL 全量日志
- `tests/report/rounds-10-report.json`：汇总与失败明细（本次 `fail: 0`）
- `tests/report/verify-real-data.out`：真实数据只读校验输出
- 本报告：`tests/report/rounds-10-acceptance-report.md`

## 八、r80 增量（统一身份口令托管）后的复跑记录

- 变更：新增 `fzu_account` 表（迁移 `008_fzu_account.sql`）、统一初始口令 `FZU521`、本人三重输入改密、后台 SSO 账号管理；表数 34 → 35。
- 复跑结果（2026-10-29）：**106 / 106 通过，0 失败**；`dafu_verify` 已按最新 `init.sql` 重建并重新 seed（60 点位 / 42 档口 / 158 菜）。
- 新增走查：`walkthrough-r80-fzu-initial-password.test.mjs`（API 18/18）、`walkthrough-r80-fzu-password-ui.test.mjs`（UI 15/15）。
- 关联回归：`walkthrough-r50.test.mjs`（12/12，SSO 口令改为 `FZU521`）、`walkthrough-r73-review-dim-sort.test.mjs`（4/4）、`walkthrough-r77-station-compare.test.mjs`（7/7）。
- 注意：SSO 限流为 10 次/10 分钟，连续跑多个走查前需清 `rl:fzu_sso:*`（两个 r80 脚本与 r50 已在启动时自清）。

## 九、r81 增量（QA 测试文档 4 项反馈修复）后的复跑记录

- 变更：饮食档案「严重过敏 / 一般不喜欢」支持自定义添加；打卡页在无在售菜品点位（含麦当劳 3 家周边餐厅）提供手动填写菜品兜底并在保存时保留自填菜；`init.sql` 增加 `SET NAMES utf8mb4;` + 迁移 `009_fix_mojibake.sql` 修复中文列默认值与存量宠物名乱码；装扮贴纸 d1~d9 重压至 0.97MB 并加懒加载 / `?v=r81` 缓存键。
- 复跑结果（2026-10-29）：**106 / 106 通过，0 失败**；`dafu_verify` 已按最新 `init.sql` 重建并 seed（35 表 / 60 点位 / 42 档口 / 158 菜，三列中文默认值正确）。
- 新增走查：`walkthrough-r81-qa-doc-fixes.test.mjs`（数据/静态 21/21）、`walkthrough-r81-qa-doc-ui.test.mjs`（浏览器 28/28）、`walkthrough-r81-qa-doc-edge.test.mjs`（边界/移动端/缓存 18/18）。
- 测试卫生：`r77` 补收尾清理（原先会遗留 r77 点位/档口，导致 60/42 口径失败）；`r71` 补删除临时账号。复跑后线上库无测试残留。
- 第二轮复核（2026-10-29，DEBUG 已恢复 false）：**106 / 106 再次通过**；同批复核 r71 15/15、r73 4/4、r77 7/7、r50 12/12、r80 API 18/18、r80 UI 15/15 ×2、r81 data 21/21 ×2（DEBUG true/false 两种口径）、r81 UI 28/28 ×2、r81 edge 18/18，合计 **265 项 0 失败**；收尾后 `user=13`（全为种子演示账号）、`pet=0`。
- 完整审核：见 `tests/report/r81-qa-doc-fixes-report.md`（4 条反馈逐条映射 + 20 轮不同角度审核，全部结论「符合」）。
