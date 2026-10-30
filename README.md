# 大福食刻 DAFU MOMENT

**大福食刻 DAFU MOMENT** —— 福州大学校园就餐点评平台（团队「知食份子」出品）。围绕学生就餐决策提供 **查、评、藏** 一站式闭环：查点位/档口/菜品、多维度评分点评、收藏想吃清单；配套 AI 助手「福宝」（评价即知识库）与点位众包提交审核，纯内容平台，**不做外卖、下单、支付**。

- 中文名 **大福食刻**，英文名 **DAFU MOMENT**（DAFU＝大福拼音，取传统福气的「大福」；MOMENT＝食刻，记录美食瞬间）
- 品牌口径：知食份子 · 大福食刻 DAFU MOMENT

## 功能特性

- **四类点位**：校内食堂 / 永嘉天地 / 学生街 / 周边其他（`canteen.type` 0-3），每点位带人均价 `avg_price`，地图选点校位后台拖拽即存
- **维度化评分**：7 个评分维度（口味 1.5 / 份量 / 价格实惠 / 排队 / 环境 / 配送 / 包装 0.5），按点位类型动态适配适用维度；提交分项 1-5 整数，服务端加权计算 `overall_score`，适用性校验拒绝填错维度
- **普通平均聚合**：`review_summary` 记录评价数、平均分、分项求和与 1-5 星直方图，发布/处置即时重算
- **想吃收藏**：菜品 / 档口 / 点位一键「想吃」，个人清单集中管理
- **DFA 敏感词机审**：命中 1 级词替换后直接发布，2/3 级词转人工审核队列（通过 / 下架 / 驳回，处置必填理由并通知作者）
- **举报-申诉-通知闭环**：学生举报 → 管理端处理（可连带下架）→ 举报人与作者均收通知；被下架评价可申诉复审
- **档口公告与负责人回应**：负责人可发档口公告（上新/换菜/休摊/优惠）、公开回应差评
- **AI 助手「福宝」**：评价即知识库——仅注入平台真实点位与高分评价摘录，系统提示严禁虚构；在「智能推荐 → 模型设置」可点选平台托管模型，也可按供应商注册表自配（每个模型都有「测试」/「测试连接」，失败给出中文原因）；未配置或调用失败时自动降级为规则推荐并在提示条展示原因
- **点位众包提交**：学生提交新点位 / 新档口 / 新菜品（payload 结构化），管理端审核通过后写入主表，驳回附理由并通知
- **管理后台**：内容维护 / 审核队列 / 举报处理 / 用户治理 / 敏感词库 / 点位提交审核 / 数据看板（日评价量、举报日量、评分分布、审核吞吐）

## 技术栈

| 层 | 选型 |
|--|--|
| 前端 | Vue 3 + Element Plus + ECharts（按需引入）+ Leaflet（高德 wprd 高清栅格底图） |
| 后端 | Node.js（Express）单体分层 + JWT |
| 存储 | mysql2 + MySQL 8（手写 SQL 唯一真相源）+ Redis（限流/缓存）+ MinIO（图床） |
| 部署 | Docker Compose 六容器（mysql / redis / minio / matting / backend / frontend） |

## 数据库（35 表，下表列核心业务表）

| 表 | 说明 |
|--|--|
| user | 用户（角色/状态/AI 自配 JSON） |
| canteen | 点位（四类型 type、人均 avg_price、经纬度） |
| station | 档口（挂靠点位、负责人、休摊状态） |
| dish | 菜品（价格/价格单位 price_unit/估算价标记 is_estimated、口味/忌口标签） |
| review_dimension | 评分维度配置（键名/权重/适用点位类型） |
| review | 评价（dimension_scores JSON + 服务端计算的 overall_score，状态机 0 已发布/1 待人工/2 已下架/3 已驳回） |
| review_image | 评价图片（MinIO objectKey） |
| review_summary | 聚合（评价数/平均分 rating_avg/分项求和 dim_sums/1-5 星直方图） |
| favorite | 收藏（想吃，一人一对象一条） |
| report | 举报（open/resolved/rejected） |
| station_post | 档口公告 |
| banned_word | 敏感词库（DFA 机审词源，1/2/3 级） |
| notification | 站内通知（审核/举报/禁言等） |
| review_reply | 档口负责人对评价的公开回应 |
| point_submit | 点位/档口/菜品/档口入驻提交（submit_type 0 点位/1 档口/2 菜品/3 档口入驻，payload JSON，audit_status 0 待审/1 通过/2 驳回） |
| ai_conversation | AI 问答留痕（复盘用） |
| task | 成长任务配置（每日 task_type=1 / 成长 task_type=2） |
| task_claim | 任务领取记录（按领取日唯一，防重复领奖） |
| coin_transaction | 金币流水（任务奖励/喂食/买装扮，balance_after 为余额真相源） |
| pet | 福宝（名字/经验/等级/道具/装扮/累计投喂/点亮起始时间） |
| pet_dress | 装扮商品（d1~d9，等级门槛与金币价格） |
| user_dress | 用户已购装扮（一人一件一条） |
| feed_record | 喂食记录（道具或金币消耗留痕） |
| post | 社区动态（正文/图片/话题/关联/点赞评论计数） |
| post_like | 动态点赞（一人一条，幂等切换） |
| post_comment | 单层评论（动态 id 与评价 id 共用 parent_type 口径） |

### 真实数据口径

点位、档口与菜品来自 [Zviolin/Dafu-Moment](https://github.com/Zviolin/Dafu-Moment) 最新提交中的 SQL 数据（`data/db3/sql/03_collected_places.sql`、`06_estimated_menu_seed.sql`），并合并其公开数据源 `qishan.geojson`、`data/db3/collection/places.json` 与 `data/db3/deferred/map/05_collected_map_locations.sql` 的坐标/评分/人均/招牌菜/营业时间：

- 60 个真实点位：校内食堂 12、学生街 24、周边其他 24；53 个坐标采用 `05_collected_map_locations.sql` 的权威参考坐标（`coord_source` 留痕），源库无坐标的 4 个校内食堂与 3 家麦当劳中，食堂按「不写伪坐标」原则留空（3 家麦当劳待确认）
- 70 个真实档口 = 42 个门店档口（店铺真实名，带 158 道菜）+ 28 个校内食堂档口（取自 `qishan.geojson` 中 8 个食堂要素的 `properties.include`）；校内食堂档口源库无菜单，仅建档口不编造菜品
- 158 道菜全部来自门店档口；校内食堂档口暂无菜品（源库 78 表 SQL 未插入任何食堂菜单），详情页显示「这个档口还没有录入菜品」
- 价格口径：**158 道全部为估算价**——37 道沿用 06 估算演示菜单（单位标注「份（估算演示价）」），其余 121 道按公开人均与招牌菜折算；落库统一 `dish.is_estimated=1`，前端展示「估算」角标。项目不声称任何「商家核实的明码实价」
- 真实公开资料还包含：52 个点位的营业时间（`canteen.business_hours`）、45 个点位的人均价
- 没有公开菜单/档口的点位不造假数据，详情页显示「这个点位还没有录入窗口」（当前为 4 个无档口食堂 + 6 家无菜单门店）
- 种子入口：`backend/src/seed/seed.js` + `backend/src/seed/real-data.json`（顶层 `data_notes` 写明价格/档口口径）；已有旧库依次执行 `backend/sql/migration/006_task_pet_social.sql`、`007_canteen_business_hours.sql`、`008_fzu_account.sql`、`009_fix_mojibake.sql` 即可补齐任务/宠物/社交表、营业时间列、统一身份口令托管表，并修掉 initdb latin1 通道写坏的中文列默认值，回滚脚本同名放在 `backend/sql/rollback/`

## API 概览（前缀 `/api`，统一 `{code, msg, data}` 响应）

- **认证**：`POST /auth/register`、`POST /auth/login`、`GET /auth/me`
- **浏览**：`GET /canteens`（type 筛选）、`GET /canteens/:id`、`GET /stations/:id`、`GET /dishes`（多维筛选/排序）、`GET /dishes/:id`、`GET /categories`
- **他人主页与关注**（r86）：`GET /users/:id/profile`（用户 + 公开点评分页 + 贡献统计 + 头衔进度 + 关注态）、`GET /users/:id/follow-status`、`POST|DELETE /users/:id/follow`（关注关系表未落库时降级返回 `available=false`，前端据此隐藏计数而不显示假 0）
- **评价**：`GET /reviews?subjectType&subjectId&sort=hot|new|dim:<维度>`（sort 仅这三类，非法值 422）、`POST /reviews`（dimensionScores）、`PUT /reviews/:id`、`DELETE /reviews/:id`、`POST /reviews/:id/vote`、`POST /reviews/:id/appeal`、`POST /reviews/:id/reply`、`GET /me/reviews`
- **收藏**：`POST /favorites`、`GET /favorites`、`GET /me/favorites`
- **搜索与推荐**：`GET /search?q=`（点位/档口/菜品三分组）、`GET /recommendations`（top 高分口碑 / forYou 为你推荐）
- **维度**：`GET /dimensions`、`GET /dimensions?type=`（按点位类型过滤）
- **AI**：`POST /ai/ask`（回传 `degraded` / `degradedReason`，调用失败时降级规则推荐）、`GET /ai/history`、`DELETE /ai/history(/:id)`、`GET /ai/providers`（供应商注册表）、`GET|POST /ai/models`、`PUT|DELETE /ai/models/:id`、`PUT /ai/models/:id/select`、`POST /ai/models/test`（连通性测试，复用已保存密文或表单值，不落库）、`PUT /ai/platform-models/:id/select`、`DELETE /ai/platform-models/:id`
- **点位提交**：`POST /points-submit`（submitType 3 为档口入驻申请）、`GET /me/point-submits`
- **任务与金币**：`GET /me/tasks`、`POST /tasks/:id/claim`、`GET /me/stats`
- **福宝**：`GET /me/pet`（含 `mood` 与 `fed_never`：从未投喂的新福宝按领养时间判待机，不误报「超 24 小时没喂食」）、`POST /me/pet/feed`、`POST /me/pet/dress`、`PUT /me/pet/name`、`GET /pet/community`（`list` 全服广场 / `ranking` 累计投喂榜，只收投喂 ≥1 次的福宝、名次榜内从 1 重排 / `my_rank`）
- **动态**：`GET /posts?tab=recommend|latest`、`POST /posts`、`GET /posts/:id`、`POST /posts/:id/like`、`DELETE /posts/:id`、`GET|POST /posts/:id/comments`
- **上传**：`POST /uploads`（单图 ≤3MB）
- **通知与举报**：`GET /notifications`、`POST /notifications/read`、`POST /reports`
- **统一身份口令**（r80）：`PUT /me/fzu/password`（当前口令 + 新口令 + 确认新口令，三重输入本人改密）
- **档口负责人**：`GET /manager/stations/:id/summary`、`POST /manager/stations/:id/posts`
- **管理端**（role=1）：`GET /admin/audit/pending`、`POST /admin/audit/:reviewId`（pass/fold/ban）、`GET|POST /admin/point-submits`、`POST /admin/point-submits/:id/approve|reject`、`GET|POST /admin/canteens`、`PUT /admin/canteens/:id(/status|/position)`、`GET|POST /admin/stations`、`PUT /admin/stations/:id(/status|/manager)`、`GET|POST /admin/dishes`、`PUT /admin/dishes/:id/status`、`GET /admin/reports`、`POST /admin/reports/:id/handle`、`GET /admin/users`、`POST /admin/users/:id/status`、`GET|POST /admin/words`、`DELETE /admin/words/:id`、`GET|POST /admin/posts`、`DELETE /admin/posts/:id`、`GET /admin/dashboard`、`POST /admin/maintenance/recalc`、`GET /admin/fzu-accounts`（SSO 账号列表/搜索）、`PUT /admin/fzu-accounts/:uid/password`（重置为初始口令或指定新口令）

## 快速开始

```bash
cd 项目代码
docker compose up -d --build
```

已有旧数据卷时，先执行增量迁移（不删用户数据）：

```bash
docker exec -i dafu-mysql mysql -uroot -p你的密码 dafu < backend/sql/migration/006_task_pet_social.sql
docker exec -i dafu-mysql mysql -uroot -p你的密码 dafu < backend/sql/migration/007_canteen_business_hours.sql
docker exec -i dafu-mysql mysql -uroot -p你的密码 dafu < backend/sql/migration/008_fzu_account.sql
docker exec -i dafu-mysql mysql -uroot -p你的密码 dafu < backend/sql/migration/009_fix_mojibake.sql
```

等待 1-2 分钟（首次启动自动建表、载入种子数据），然后访问：

- 平台入口（前台与后台）：<http://localhost:8095>
- 本地 API 端口：<http://localhost:3000>（健康检查 `/api/health`；已绑定 `127.0.0.1`，不对局域网/公网开放）

### 局域网 / 公网访问

前端统一走相对路径 `/api`、`/img`，由 Nginx 反代，因此换任何域名/IP 都不用改前端配置。

- **局域网**：其他设备访问 `http://<本机局域网 IP>:9080`（Windows 端口转发，实测 200；管理员执行 `netsh interface portproxy add v4tov4 listenport=9080 listenaddress=0.0.0.0 connectport=8095 connectaddress=127.0.0.1` + 放行 9080 入站）。也可试直连 `:8095`；被拦截时以管理员运行 `deploy/open-lan-access.ps1`（同时放行 Windows 防火墙与 WSL2 镜像网络的 Hyper-V 防火墙；`-Remove` 可撤销）。
- **公网（临时演示）**：`cloudflared tunnel --url http://localhost:8095 --config deploy/cloudflared-quick.yml`，输出 `https://xxx.trycloudflare.com`；`deploy/cloudflared-quick.yml` 是空配置，用于绕开 `~/.cloudflared/config.yml` 里命名隧道的 `http_status:404` 兜底。部分校园网 DNS 不解析该子域，可让对方换 8.8.8.8 或改用固定域名。
- **公网（固定域名）**：走已有命名隧道（`cloudflared tunnel run my-computer`），把 `~/.cloudflared/config.yml` 的 ingress 改成 `service: http://localhost:8095` 并 `cloudflared tunnel route dns` 绑定域名。
- 公网暴露前务必确认：`DEBUG=false`（否则验证码回显明文）、管理员默认口令已改、`.env` 的 `JWT_SECRET` 为强随机串、高德 Web 端 key 的域名白名单加入隧道域名（否则地图页空白）。`FZU_CAS_INITIAL_PASSWORD` 当前按演示口径为 `FZU521`，会由 `GET /api/auth/fzu/cas/mode` 公开下发并在登录页自动填充——只适合课程演示，正式环境应改为随机值并停止下发。详见 `deploy/deploy.md`「公网暴露加固项」。
- **图片与图床**：种子封面图随后端镜像内置（`backend/assets/covers`，147 张约 36 MB），启动时自动补齐到 MinIO（日志 `[minio] 封面对象自愈`），新部署无需手工灌图；18 个无实拍图的点位使用 `preset:` 预设插画，属正常降级。
- **离线部署**：服务器不需要 Node、不需要构建，`deploy/` 目录提供 `docker save` 镜像包、编排、env 模板与启停脚本，详见 `deploy/deploy.md`。

### 演示账号

| 角色 | 账号 | 密码 | 说明 |
|--|--|--|--|
| 管理员 | `admin` | `admin123`（全新库默认；本机已轮换为强口令，见 `deploy/deploy.md`「公网暴露加固项」） | 内容维护 / 审核队列 / 举报 / 用户治理 / 点位提交审核 / 看板 |
| 学生 | `zhangwl` | `123456` | 点评 / 收藏 / 举报 / AI 助手 / 点位提交 |
| 福大认证（演示桩） | 任一 **9 位学号**（如 `102400207`） | 首次 `FZU521` | 首次登录自动建号并强制改密，之后用本人新口令登录；真实 CAS 模式无此桩 |

## AI 配置说明

AI 助手「福宝」按以下优先级取用模型：

1. **学生自配 + 平台托管模型**：在「智能推荐 → 模型设置」里可直接点选后台配置好的「平台模型 · 官方提供」（免填密钥），也可按 AI 供应商注册表选择并填写自己的 Base URL / API Key / 模型 ID（OpenAI 兼容或 Anthropic 原生协议）。密钥仅掩码回显、服务端加密存储；每个配置都可点「测试」/「测试连接」发一次真实请求——成功显示延迟，失败直接给出中文原因（密钥无效 / 端点或模型 ID 不存在 / 限流或额度 / 超时 / 网络不可达），不落库、不计费。个人自配上限 6 条，平台模型引用不占额度。
2. **平台环境变量兜底**：在 `docker-compose.yml` / backend 环境中配置

   ```env
   AI_BASE_URL=https://api.deepseek.com   # OpenAI 兼容 Base URL
   AI_API_KEY=sk-xxxx                     # 密钥（请使用环境变量，勿写入版本库）
   AI_MODEL=deepseek-chat                 # 模型名
   ```

3. **未配置或调用失败**：AI 助手自动降级为规则推荐——基于平台真实评分数据（价格带/忌口/外卖意图解析）直接给出推荐卡，功能始终可用；`/ai/ask` 同时回传 `degradedReason`，前台提示条会明确展示原因（如「密钥无效或无权限（401/403）」），便于自查配置。

> 后台「AI 供应商管理」可维护供应商注册表（按 `sort_order` 排序、含官方端点与文档链接）。新增平台托管模型时，可直接按排序点击供应商自动带出协议与端点（也保留「自定义」手填），并可用「测试连接」验证后再保存。

## 福大统一身份认证（CAS）真实接入

SSO 为**双模式自动切换**（r51）：`FZU_CAS_BASE_URL` + `FZU_CAS_SERVICE` 两项环境变量齐备 → 真实 CAS 3.0 协议（302 跳校方登录页 → ticket 回调 → `serviceValidate` 验票）；任一缺失 → 演示桩（学号 + 口令模拟校验，答辩口径）。**两种模式共用同一套数据模型与接口协议，切换零改码。**

真实接入三步：

1. **申请接入**（制度前置，非技术问题）：福大统一身份认证平台（sso.fzu.edu.cn）**强制 service 回调白名单**——未注册的 service 直接进 service-error 页（已实测）。需向校网络安全与信息化办公室（网信办）提交应用接入申请，注册回调地址（须公网可达，课程演示通常以部署域名申请）。
2. **填入凭证**（下发后）：`docker-compose.yml` backend 环境或部署 env 中配置——

   ```env
   FZU_CAS_BASE_URL=https://sso.fzu.edu.cn/cas   # 校方发放的 CAS 根地址（登录页 ${base}/login，验票 ${base}/serviceValidate，以接入文档为准）
   FZU_CAS_SERVICE=https://你的域名/auth/fzu/callback   # 校方白名单注册的回调地址，须与登录时完全一致
   FZU_CAS_VALIDATE_PATH=/serviceValidate         # 可选：CAS 2.0 默认；CAS 3.0 为 /p3/serviceValidate
   ```

   重启 backend 即切真实模式（`GET /api/auth/fzu/cas/mode` 返回 `real` + loginUrl）。
3. **链路验证**：`node tests/walkthrough-r52-fzu-cas.test.mjs` ——自带本地模拟 CAS 服务器（/cas/login 发票 + /cas/serviceValidate 一次性验票），完整走通「302 跳板 → 校方登录 → ticket 回调 → XML 身份解析 → JWT 签发 → 票据一次性防重放」七项断言，无需等待校方凭证即可证明协议实现正确。

### 演示模式的统一初始口令（r80）

演示桩（未配置真实 CAS）不再「任意 ≥6 位口令都能过」，改为**口令托管**：

- **学号口径**：演示桩只接受**福州大学 9 位纯数字学号**（如 `102400207`），与 3.0 身份口径（`identity3.service`）一致；6-12 位的宽松区间已废弃，非 9 位或含字母一律 422 拒绝。
- **统一初始口令**：任一学号首次登录都必须用 `FZU521`（`FZU_CAS_INITIAL_PASSWORD` 可覆盖），首次登录自动建号并标记「仍用初始口令」。
- **本人改密**：登录后「我的 → 统一身份口令」三重输入（当前口令 + 新口令 + 确认新口令），两次新口令必须一致、新口令不得等于初始口令；改密成功后 `/auth/me` 的 `fzu_must_change_password` 转为 `false`，顶部提示条消失。
- **后台管理**：管理后台「统一身份账号（SSO）」页可搜索学号/姓名/昵称，查看口令状态（初始口令 / 已自行改密），一键**重置为统一初始口令**或**指定新口令**（均写 bcrypt 哈希，接口不回传口令）。
- **数据模型**：口令托管在独立表 `fzu_account`（`uid` 主键 + `user_id` 唯一关联 + `must_change` 标记），不改 `user` 表结构；增量迁移 `backend/sql/migration/008_fzu_account.sql`。
- **边界**：真实 CAS 模式下口令由校方托管，本地下发初始口令与后台重置均不生效（`must_change` 恒为 `false`）。
- **走查脚本**：`node tests/walkthrough-r80-fzu-initial-password.test.mjs`（API 18 项）、`node tests/walkthrough-r80-fzu-password-ui.test.mjs`（UI 15 项）。

### QA 测试文档 4 项反馈修复（r81）

按《测试文档》4 张截图逐条修复，并各配「数据/静态层 + 真实浏览器」双走查：

- **图 1 · 饮食档案「下面也要能添加」**：忌口 / **严重过敏** / **一般不喜欢** 三组统一支持自定义添加（`add_custom` 统一去重 + 8 字上限 + 空值忽略），自定义项与预设 chips 同样可点选/取消；保存后刷新页面可回显（`custom_severe` / `custom_mild` computed）；旧版本数据缺字段时数组兜底，避免 `.includes` 抛错。
- **图 2 · 打卡「吃了什么怎么都不可选」**：根因是周边餐厅（`canteen.type=3`）在 `station/dish` 里没有在售菜品记录（如「福州麦当劳国宾大道DT餐厅」在售菜品为 0），前端只渲染后端 chips 就必然是空的。修复 = 空态说明「这个点位暂时没有在售菜品，可在下方手动填写」+ 手动填写菜品入口（自填 chip 虚线标注「自填」、默认选中）；「仅记录 / 发布打卡」组装流水时自填菜补 `{id:null, price:0}` 最小记录，不再丢弃；有菜点位保持原 chips 交互，占位文案切换为「没找到？手动添加你吃到的」。
- **图 3 · 宠物名乱码「å°ç¦å®」**：根因是 initdb 通道（docker-entrypoint 的 mysql CLI）按 latin1 解析 `init.sql`，把 DDL 里的中文 DEFAULT 写坏（`pet.name` 小福宝 / `canteen.campus` 旗山校区 / `dish.price_unit` 元），之后新建宠物直接沿用坏默认值。修复 = `init.sql` 头部 `SET NAMES utf8mb4;` + 迁移 `009_fix_mojibake.sql`（三列默认值改回 + 存量乱码名修正，可重复执行；纯数据修复，无结构回滚）。
- **图 4 · 宠物装扮显示慢**：d1~d9 贴纸从 26.8MB 压到 **0.97MB（约 1MB）**（RGBA、最长边 320px、单张 ≤165KB，橱窗展示 72px 在 2x 屏仍清晰），装扮橱窗与表情图鉴统一 `loading="lazy"` + `decoding="async"` + 显式 72×72；图片 URL 追加 `?v=r81`（`frontend/src/utils/asset-version.js`），绕过 `/assets/` 一年 immutable 缓存。
- **走查脚本**：`node tests/walkthrough-r81-qa-doc-fixes.test.mjs`（数据/静态层 21 项）、`node tests/walkthrough-r81-qa-doc-ui.test.mjs`（真实浏览器 28 项）、`node tests/walkthrough-r81-qa-doc-edge.test.mjs`（边界/移动端/缓存 18 项）。

## 测试

需容器在跑（`docker compose up -d --build` 且健康）：

```bash
node tests/api-integration.test.mjs        # API 集成断言（IT 编号用例，node 直跑）
node tests/e2e-verify.test.mjs             # E2E 验收 + 三视口回归（E2E 编号用例）
node tests/rounds-10-acceptance.test.mjs   # 十轮全量验收（静态/DB/真实数据/权限/任务/社交/点评/边界/逐条回归/浏览器）
node tests/walkthrough-r80-fzu-initial-password.test.mjs   # 统一身份初始口令 / 本人改密 / 后台 SSO 账号管理（API 18 项）
node tests/walkthrough-r80-fzu-password-ui.test.mjs        # 同一闭环的 UI 走查（授权页提示 / 三重输入 / 后台重置，15 项）
node tests/walkthrough-r81-qa-doc-fixes.test.mjs           # QA 测试文档 4 项修复：数据 / 静态资源层（21 项）
node tests/walkthrough-r81-qa-doc-ui.test.mjs              # 同上 4 项的浏览器实操走查（28 项）
node tests/walkthrough-r81-qa-doc-edge.test.mjs            # 边界 / 移动端 / 缓存审核（18 项）
```

- 十轮验收需后端以 `DEBUG=true` 启动（验证码接口回显 `debugCode`），跑完请改回 `false`；用例会自建临时账号 `acc10_<时间戳>` 并在结束时清理其全部关联数据。
- 结果落盘：`tests/report/run.log`（逐条 PASS/FAIL）、`tests/report/rounds-10-report.json`（汇总 + 失败明细），完整报告见 `tests/report/rounds-10-acceptance-report.md`。
- 真实数据只读校验：`tests/sql/verify-real-data.sql`（点位/档口/菜品/坐标/营业时间/孤儿行扫描）。

## 目录结构

```
60-项目代码
├── docker-compose.yml        # 六容器编排（mysql/redis/minio/matting/backend/frontend），对外端口 8095
├── backend
│   ├── sql/init.sql          # 35 张表 DDL（含任务/宠物/社交 10 张 + r80 fzu_account 口令托管；r81 头部 SET NAMES utf8mb4）
│   ├── Dockerfile
│   └── src
│       ├── config.js         # 环境变量 + 数值常量（AI 配置/限流/缓存）
│       ├── db                # mysql2 池 / Redis（降级包装）/ MinIO
│       ├── middleware        # JWT 鉴权 / 限流 / 错误码
│       ├── services          # 内容/点评/维度/机审/聚合/AI/用户数据/档口/后台 九大服务
│       └── seed              # 拟真种子：校内食堂 + 永嘉天地 + 学生街 + 周边商户
├── frontend
│   ├── Dockerfile + nginx.conf   # 多阶段构建，/api 与 /img 反代
│   └── src
│       ├── views             # 前台页面 + /admin 后台四页（看板/审核/内容/治理）
│       ├── components        # 自研组件（品牌 logo/封面上传/评价卡…）
│       └── api               # axios 解包拦截器 + 按域 API（含 admin 专用）
└── tests
    ├── api-integration.test.mjs       # API 集成断言（IT 编号用例，node 直跑）
    ├── e2e-verify.test.mjs            # E2E 验收（E2E 编号用例 + 三视口回归）
    ├── rounds-10-acceptance.test.mjs  # 十轮全量验收（106 条用例，0 失败基线）
    ├── sql/verify-real-data.sql       # 真实数据只读校验（与 Dafu-Moment 最新 PR 对齐）
    └── report                         # run.log / rounds-10-report.json / 完整测试报告
```
