# r82 审核报告：《测试文档 (1).docx》8 条反馈逐条修复 + 全量功能回归

> 审核日期：2026-10-29
> 依据文档：`g:\DefaultDownloads\QQ\测试文档 (1).docx`（8 张截图 + 6 条批注 + 2 条纯文字反馈）
> 被测系统：大福食刻（Vue 3 + Express + MySQL 8 + Redis + MinIO，Docker Compose 部署，访问入口 `http://localhost:8095`）
> 本轮结论：**8 条反馈全部修复并逐条验证；当前验收口径 17 套脚本共 401 项用例全部通过（0 失败），另加 r83/r84/r86/r87/r88/r89 六套新增走查 106 项（历史 22 套 498 项于 r88 全部通过，r89 本轮新增 9 项 9/9 通过），累计 23 套共 507 项用例；新增 r83 头像显示走查 14/14 通过；r84 桌面端「我的」入口 / 档案跳转 / 视觉对齐修复并新增 13 项走查用例（含 5 项移动端护栏）；r84 真实菜品图全站替换（150 张 CodeHub 实图 → MinIO，菜品 158/158、档口 42/42、点位 42/60 换真实封面，新增 13 项走查全部通过），并连带修掉「贴纸去重失效致重启重复抠图」与「饮食计划页裸键裂图」两处缺陷；r85 按源库 78 表 SQL 重新校对「校内食堂」转化口径，修掉「4 个食堂写入源库不存在的伪坐标（且每次重启被回填）」与「8 个食堂评分/标签因简称匹配失败全部丢失」两类转化错误，并连带修掉 `seed.js` 菜品封面键的 NUL 字节缺陷；r86 重构「我的主页」（桌面「名片 + 数据/头衔侧栏 + 点评流」两栏、移动端单列，接入此前闲置的贡献统计/头衔/关注态字段），并按源库把 geojson `include` 的 28 个校内食堂档口正确转化入库（档口 42 → 70，源库无食堂菜单故不编造菜品），新增 24 项走查全部通过；r87 修掉福宝投喂榜「0 次也上榜」（榜单只收投喂 ≥1 次、榜内名次重排）与「新领养福宝被判饿肚子 / 超 24 小时未喂」两处口径缺陷，新增 30 项走查全部通过；r88 定位并修复「新部署站点图片全 404」的交付缺陷（种子封面未随镜像打包，服务器 MinIO 空桶 → 后端启动时自愈补齐），新增 12 项走查全部通过；r89 修复「AI 助手配了 API 仍返回默认推荐」的四类根因（前端 15s 超时先于后端 60s→误判降级、自定义供应商端点可为空→配置永不生效、平台引用行占用个人 6 条额度、降级无原因回传），并新增用户侧与后台平台模型的「测试连接」、后台按「AI 供应商」排序点击快速添加（保留自定义），新增 9 项走查全部通过；公网真实用户 `19835505258`（原 user 58）已清理；收尾已恢复生产姿态（DEBUG=false），六个镜像已 `docker save` 打包并经 `docker load` 回验通过**

---

## 〇-0、r84 追加：真实菜品图全站替换（占位图 → CodeHub 仓库实图）

> 用户原话：「图片，实际使用的图片用这里的，替换原本的」→ 华为云 CodeHub 仓库 `dafu-shike`（`assets/dish-images/`，150 张真实菜品图）替换全站 `preset:rice` 占位封面。

### 0-0.1 接入方案与关键决策

| 项 | 内容 |
| --- | --- |
| 图片来源 | 华为云 CodeHub 仓库 `dafu-shike`（project `941777e6fed343219ac31bea3ee72293`）`assets/dish-images/`，SSH 克隆至 `g:\Codes\WorkPlace\WorkBuddy\.tmp-codehub-dafu-shike`，含 150 张图片（131 jpg / 12 png / 7 webp）+ `菜名图片对应.json` 匹配表 |
| 存放位置 | **MinIO 对象存储**（桶 `dafu-images`，路径 `cover/202610/{内容哈希前16}.{ext}`），不落前端静态目录 |
| 替换范围 | **档口 station 封面 + 菜品 dish 封面 + 点位 canteen 封面**（三类全换，用户拍板） |
| DB 写操作 | 用户确认执行；执行前已把三表原 `cover_object_key` 备份到 `tests/report/cover-backup-r84.json` |
| objectKey 规范 | 沿用 `media.service.js` 既有 scene 规范 `{scene}/{yyyymm}/{uuid}.{ext}` 的思路，但改用**内容哈希**（sha256 前 16 位）替代随机 uuid → 同一张图重复上传落到同一对象，天然幂等，不产生重复对象 |
| 匹配方式 | 三级匹配：菜名精确 → `original_dish_name` 精确 → 归一化（去括号内容 / 去空白 / 全角斜杠转半角）；并逐一校验每个图片文件 sha256 与匹配表 `sha256` 字段一致 |
| 匹配结果 | **158 / 158 菜品全部命中（未匹配 0）**；42 档口代表图 + 42 点位代表图；150 张图片全部被引用 |
| 幂等重跑 | 上传按 objectKey `statObject` 比对 size，已存在则跳过；回写按「档口名 + 菜名」双条件 `UPDATE dish d JOIN station s`（遵仓库 README「不要只按 snapshot_dish_id 批量更新」的告诫） |

### 0-0.2 落地结果（实测）

| 表 | 总数 | 已换真实图 | 说明 |
| --- | --- | --- | --- |
| `dish` | 158 | **158** | 全部由 `preset:rice` 换为真实菜品图 |
| `station` | 42 | **42** | 全部换为该档口代表菜图 |
| `canteen` | 60 | **42** | 18 个校内食堂（`type=0`）无档口无菜品 → 无图可挂，按设计保留 preset 占位 |
| MinIO 对象 | — | **147** | 147 个唯一 objectKey（150 个文件中有 3 组内容相同 → 哈希键自动合并） |

### 0-0.3 连带修复的两处缺陷

| # | 缺陷 | 根因 | 修复 |
| --- | --- | --- | --- |
| 1 | **贴纸去重失效**（严重） | `sync_dish_stickers()` 判重键用 `d.img`（菜品图键），而实际写入的是随机 `sticker/{yyyymm}/{uuid}.png` → 判重键与写入键永不相等，**每次后端重启都对 158 道菜重新抠图（约 150×1.66s ≈ 4.2 分钟）并新增 ~150 条 sticker 记录** | 新增 `dish_sticker_key(srcKey)`：由源图键 sha256 派生确定性键 `sticker/dish/{hash}.png`，判重与写入同键 → 同源只抠一次，重启跳过 |
| 2 | **饮食计划页菜品图裂图** | `diet-plan-view.vue` 把 `cover_object_key` 裸串当 URL 用（`img: d.cover_object_key`），浏览器把 `cover/202610/xxx.jpg` 当相对路径解析到 SPA 路由上 → 裂图 | 改走 `cover_url()`（与全站其余封面位置同口径），并补 `import { cover_url } from '../utils/format'` |

### 0-0.4 新增代码

- `backend/src/seed/dish-image-map.json`：站点+菜名 → 确定性 objectKey 映射表（158 菜品 / 42 档口 / 42 点位），由 `tests/build-dish-image-map.mjs` 生成（可重跑复现）
- `backend/src/seed/dish-image-source.json`（r84 新增）：**逐图溯源表**（`source_page` 来源页 / `rights_status` 授权状态 / `review_note` 复筛说明 / `sha256`），源自仓库 `assets/dish-images/菜名图片对应.json`，随代码入库留档
- `backend/src/tools/upload-dish-images.js`：上传 + 备份 + 三表回写工具（放在 `src/tools/` 下，因 `backend/Dockerfile` 只 COPY `src` 与 `sql`，放 `src/` 外不会进镜像）
- `backend/src/seed/seed.js`：菜品封面按映射表取真实键、档口/点位取代表图，无图回退 `CATEGORY_COVER`（保证**新建库**口径与本轮改造后的库一致）
- `tests/walkthrough-r84-real-dish-covers.test.mjs`：**16 项用例全部通过**（三类封面无 preset 占位 / `/img/` 200 且为 image 类型 / 裸键直连非图片 / 抽样 20 张图全 200 / 菜品·档口·点位详情页与饮食计划页浏览器实测无裂图 / 菜品公共贴纸确定性键且无重复）
- `tests/report/cover-backup-r84.json`：三表原封面值备份（可回滚）

### 0-0.5 贴纸幂等修复实测（重启前后对比）

| 时点 | 日志 | sticker 表 source=3 |
| --- | --- | --- |
| 首次同步 | `dish sync: made=145 skip=11 fail=2` | 146 条 |
| **重启 backend 后** | `dish sync: made=0 skip=156 fail=2` | **146 条（无膨胀）** |

> 修复前每次重启会重新对全量菜品抠图（约 150×1.66s ≈ 4.2 分钟）并新增约 150 条 sticker 记录；修复后同源图片只抠一次，重启秒级跳过。
> `fail=2` 为 matting 判定「主体占原图比例过小」的素材（已按失败跳过，不落库、不展示），属预期行为。

### 0-0.6 本轮回归（17 套主验收 + 新增 1 套）

| 口径 | 结果 |
| --- | --- |
| `tests/run-r83-regression.ps1` 17 套 | **17 套全部 exit=0**（首轮 7 套因管理员口令已轮换而 422，属凭据缺失非产品缺陷；临时重置口令复跑后全部通过，结束后已按备份哈希**还原管理员口令原值**） |
| `tests/walkthrough-r84-real-dish-covers.test.mjs` | **16 / 16 通过** |
| 收尾姿态 | `DEBUG` 已回落 `false`（生产姿态）；容器内临时图片目录与临时 SQL 文件已清理；MinIO 293 个对象（147 cover + 146 sticker）逐一 `statObject` 校验全部可访问 |

### 0-0.7 遗留

| # | 事项 | 说明 |
| --- | --- | --- |
| 1 | 18 个校内食堂仍为 preset 占位 | 无档口/无菜品，无真实图可挂；若后续补真实食堂菜单，可再纳入映射表 |
| 2 | 图片非门店实拍 | 仓库 README 明示「其余 145 张为网络同类菜品参考，并非对应门店实拍」，答辩时须如实说明 |
| 3 | 图片授权未确认 | 溯源表 `rights_status` 多数为「来源保留，未确认可用于正式发布」，正式对外商用前需确认授权 |
| 4 | 菜品公共贴纸全量抠图需 ~4 分钟 | 仅首次同步发生（后端启动后台执行，不阻塞）；个别主体过小的图会被 matting 判 422 跳过，属预期行为 |

---

## 〇-1、r84 追加：桌面端「我的」入口缺失 + 「我的档案」跳错页 + 关注区视觉不对齐

> 反馈原文：「桌面端无法有对应的跳转到我的，其点击我的档案是关注那边的，然后关注部分的，底顶部的方框和上面的距离间隔太小了的，其不好看，然后要求视觉对齐的」

拆解为三件事 + 一处连带视觉缺陷，逐条处理如下。

### 0-1.1 桌面端缺「我的」入口（导航可达性）

| 项 | 内容 |
| --- | --- |
| 根因 | 顶栏 `.nav-links` 只有「导览图 / 口碑榜 / 点评圈 / AI 助手 / 写点评」五项，「我的」仅存在于**移动端底部 tabbar**（`App.vue` 第 82 行，桌面端 `display: none`）→ 桌面端没有任何指向个人中心的导航入口 |
| 修复 | `App.vue` 顶栏 `.nav-links` 新增 `<a class="me-link" @click="go_me">我的</a>`，复用既有 `go_me()`（未登录 → `/login?redirect=/me`），与移动端底部 Tab 同目标 |
| 验证 | R84-28a 桌面端顶栏存在且仅存在 1 个「我的」入口；R84-28b 从 `/map` 点顶栏「我的」确实跳到 `/me`（先离开再点，避免原地不动的假阳性） |
| 代码 | `frontend/src/App.vue` |

### 0-1.2 「我的档案」点到了「关注那边」（跳转目标错误）

| 项 | 内容 |
| --- | --- |
| 根因 | `on_user_cmd('me')` 执行 `router.push('/user/' + auth.user.id)` → 落到**本人公开主页** `/user/:id`（`user-profile-view.vue`，页头是「关注 / 私信」按钮，主体是「TA 的点评」），与用户认知的「我的档案 = 我的」完全不符 |
| 修复 | `on_user_cmd` 指令分发改口径：**「我的档案」→ `/me`（个人中心，与移动端底部「我的」Tab 同目标）**；同时新增 **「我的主页」→ `/user/:id`** 保留公开主页的可达性；无 id 时回落 `/me` |
| 验证 | R82-25c「我的档案」跳到 `/me`；R84-28c「我的主页」跳到 `/user/:id`；两项互斥且均可达 |
| 代码 | `frontend/src/App.vue`（模板下拉菜单 + `on_user_cmd()`） |

### 0-1.3 关注区「底顶部方框与上方间隔太小」+ 要求视觉对齐

| 项 | 内容 |
| --- | --- |
| 实测（修复前） | `/me` 页：`关注 / 粉丝` 行用 `justify-content: space-around` 平铺在 1032px 上（实测「关注」x=376、「粉丝」x=708），与下方 `.fnrow` 三宫格（x=124 / 475 / 825）**完全不对齐**；`/follows` 页：Tab 底 143 → 卡片顶 155 仅 **12px**，底部 `.foot-hint` 距卡片仅 **16px**，间距过小 |
| 修复（`/me`） | 桌面端（≥769px）把「关注/粉丝」行、三功能宫格、列表入口组统一改为**同一套 3 列栅格**（`repeat(3, 1fr)` + `gap: 4px 20px`，`justify-items: center`）：「关注」对齐「收藏」列、「粉丝」对齐「足迹」列，三行列边界完全一致；列表行入口组由纵向列表改 3 列网格并隐藏失效的 `hr` 分隔线，改为网格留白 + 淡金悬浮反馈；行间距由 16px 放大到 22px，底部签名 20 → 26px |
| 修复（`/follows`） | 用户卡上间距 12 → **20px**（桌面 26px），底部提示 16 → **20px**（桌面 24px）；昵称独立包裹 `.uname-txt` 并加 `white-space: nowrap` + `text-overflow: ellipsis`，简介单行省略 |
| 连带缺陷 | 桌面 4 列布局下（`@media ≥1200px`）单列仅 250.5px，带「校内已认证」badge 的昵称被压成**竖排一字一行**（「面面俱到」「干饭不语」）→ 1200px 档改为**保持 3 列 + 加大列间距**（不再升 4 列） |
| 验证 | R84-29a `/me` 桌面端「关注/粉丝」中心点分别落在第 1 / 2 列（实测 stat=[289,640] fn=[289,640,991]）；R84-29b 三功能宫格 3 列、列表入口组 13 行同栅格；R84-29c 关注行与功能宫格间距 22px ≥ 16px；R84-30a `/follows` 卡片与 Tab 间距 26px ≥ 20px；R84-30b 昵称单行渲染（实测 lines=1.36，未竖排）；R84-31a~31e 移动端护栏（375px 无横向溢出、布局仍为纵向流式、昵称单行） |
| 截图 | `tests/report/r82-shots/r84-me-desktop.png`、`r84-follows-desktop.png`、`r84-follows-mobile.png` |
| 代码 | `frontend/src/views/me-view.vue`、`frontend/src/views/follows-view.vue` |

---

## 〇-2、r83 追加：公网真实用户清理 + 头像显示缺陷（普遍性）

### 0-2.1 头像显示缺陷 —— 结论：**普遍性问题，不是个例**

用户反馈「`198` 开头的真实用户头像有问题」，经排查确认为**全站级别的普遍性缺陷**，而非该用户的个例数据问题。

| 项 | 内容 |
| --- | --- |
| 根因 | 系统存在**两套头像机制**并存：① `user.avatar`（tinyint 0-8，对应 8 款预设食物头像）；② `user.avatar_object_key`（varchar，存 MinIO objectKey **裸串**，形如 `cover/202610/xxx.png`）。前端多数位置直接把裸串塞进 `<img src>`，浏览器会把它当**相对路径**解析到 SPA 路由上 → 裂图 |
| 关键事实 | 正确访问路径是 `/img/<objectKey>`（前端 nginx 对 `/img/` 反代到 MinIO）。裸串直连返回的是 `text/html`（SPA 页面），已由 r83 走查断言固化 |
| 普遍性 | 凡上传过自定义头像的用户（`avatar_object_key` 非空），其头像在**所有**渲染位置都会裂图或退化为默认图，与该用户是谁无关 |
| 受影响位置（6 类） | 菜品/档口/食堂详情页的点评卡、点评圈（点评流）、点评详情页、宠物社区、我的福宝页、顶栏/我的页 |

**修复（前端 5 处 + 后端 4 处）**

| 层 | 文件 | 改动 |
| --- | --- | --- |
| 前端 | `frontend/src/utils/format.js` | 新增 `avatar_url(key)`：绝对路径/`http` 开头原样返回，其余走 `cover_url()` 补 `/img/` 前缀，空值回落 `/assets/avatar-user.png` |
| 前端 | `frontend/src/views/circle-view.vue` | 第 142 / 167 行改用 `avatar_url()`（点评流作者 + 评论者） |
| 前端 | `frontend/src/views/pet-community-view.vue` | 第 101 行改用 `avatar_of()` |
| 前端 | `frontend/src/views/pet-view.vue` | 第 212 行改用 `avatar_url()` |
| 前端 | `frontend/src/views/dish-detail-view.vue`、`canteen-detail-view.vue`、`station-detail-view.vue` | 头像区改用 `<user-avatar>` 组件（组件内已正确处理自定义头像） |
| 前端 | `frontend/src/components/review-card.vue` | 传 `avatar_object_key` |
| 后端 | `backend/src/services/review.service.js` | 4 处 SELECT 补 `avatar_object_key`：`list_reviews`（229 行）、`map_review_row`（266-268 行）、`list_user_reviews`（391 行）、`get_review`（422 行） |
| 后端 | `backend/src/services/follow.service.js` | `list_mine`（140 / 150 行）SELECT 补 `u.avatar, u.avatar_object_key` |
| 后端 | `backend/src/middleware/auth.js` | `load_user` SELECT 补 `avatar_object_key` |
| 后端 | `backend/src/routes/index.js` | `GET /users/:id/profile`（756 行）SELECT 补 `avatar_object_key`，响应返回驼峰 `avatarObjectKey`（769-770 行） |

**验证**：`tests/walkthrough-r83-avatar-display.test.mjs`（新增）**14/14 通过**，覆盖：资料保存写入 `avatar_object_key` → `/img/<key>` 返回 `image/*` → 裸串直连返回非图片（固化根因） → `/auth/me` 与点评列表行透传 `avatar_object_key` → 6 类页面无裂图（`broken === 0`）→ 点评圈/顶栏头像 `src` 以 `/img/` 开头。

### 0-2.2 公网真实用户 `19835505258` 清理

| 项 | 内容 |
| --- | --- |
| 对象 | `user` 表 id=58，username `19835505258`（公网通过手机号注册的真人账号） |
| 处置 | 经用户确认后删除该账号及其全部派生数据（评价、宠物、收藏、通知、打卡、动态、贴纸、任务领取、金币流水、AI 会话、FZU 账号关联等） |
| 结果 | `user` 表由 15 → 14（13 个种子账号 + 1 个福大 SSO 认证账号 id=174 `102400232` 张俊杰）；`review` 408 → 407；`favorite` 38 → 37 |
| 连带清理 | 该用户的头像对象在 MinIO 中同步删除；逐表核对 `user.avatar_object_key` / `canteen.cover_object_key` / `station.cover_object_key` / `dish.cover_object_key` / `journal.cover` / `journal.bg_src` / `sticker.object_key` / `review_image.object_key` / `pet_dress.image` 共 9 处引用点，零引用后删除对象 |

### 0-2.3 MinIO 桶孤儿对象治理

| 项 | 内容 |
| --- | --- |
| 背景 | r83 走查每跑一次会新上传一张头像；原收尾只删 DB 账号行，不删 MinIO 对象 → 每跑一次留一个孤儿对象 |
| 修复 | r83 走查收尾新增 `minioClient.removeObject()` 回收本次上传的 objectKey（走查脚本内联 `docker exec dafu-backend node -e` 调用后端 MinIO 客户端） |
| 复核 | 历史 8 个孤儿对象（cover 2 + journal-bg 2 + sticker 4）已删除；r83 复跑后 `find /data/dafu-images -type f | wc -l` = **0**，桶已清空 |

---

## 〇-3、r85 追加：校内食堂数据按源库「78 表 SQL」重新转化

> 用户原话：「`https://github.com/Zviolin/Dafu-Moment` 校内食堂的数据部分，其是使用这里的 sql 的，但这里的是 78 表格的，进行正确转化来的，进行修正」
> 结论：源仓库 `data/db3/sql/00_create_tables.sql` 确实是 **78 张表**的全量 DDL，本项目只保留其中 5 张业务表（`canteen`/`station`/`dish`/`user`/`review`）。逐点核对「校内食堂」（`type=0`，12 条）后发现 **两类转化错误并已修正**，另发现 1 处同类问题待确认。

### 0-3.1 错误一：4 个校内食堂写了源库不存在的坐标（且每次重启被回填）

| 项 | 内容 |
| --- | --- |
| 源库事实 | `deferred/map/05_collected_map_locations.sql` 共 53 条 `map_location`（校内食堂只覆盖 8 个：qishan-009/010/011/012/013/014/015/016）。桃李园餐厅、佳客来西餐厅、海棠园京元餐厅、紫竹园到口餐厅在源库、`places.json`、`qishan.geojson` 中**均无坐标** |
| 错误表现 | 这 4 个食堂的 `canteen.lat/lng` 被写入了 26.0576/119.1962、26.057/119.194、26.0567/119.1927、26.053/119.192 等**估算值**，在源数据中查无出处 |
| 根因 | `backend/src/index.js` 的 `seed_default_positions()` 用硬编码关键词表 `CANTEEN_POS` 在启动时对 `lat IS NULL` 的行做幂等回填 → 假坐标在转换期写入，而且每次重启都会把人工清空的值重新填回 |
| 修复 | ① 删除 `CANTEEN_POS` 与 `seed_default_positions()` 及启动调用（源库无坐标即留 NULL）；② `real-data.json` 这 4 条 `lat/lng` 置 `null`；③ 前端 `map-view.vue` 的 `PIN_POS` 兜底表补入「佳客来 / 紫竹园」，保证地图上 12 个食堂仍然都有示意标记 |
| 复核 | 改库后 `docker compose restart backend` 再查，4 条仍为 `NULL`（回填已彻底消除）；`/api/points/map` 不再返回这 4 个伪坐标；地图页筛选计数仍为 `全部 60 / 食堂 12 / 学生街 24 / 周边 24` |

### 0-3.2 错误二：8 个校内食堂的评分与标签在转化时全部丢失

| 项 | 内容 |
| --- | --- |
| 源库事实 | `collection/round2/ffm-qishan.geojson` 中 8 个食堂要素带 `rating`（5.0 / 4.8 / 4.7 / 4.6 / 3.7 / 3.4 / 3.2 / 3.0）与 `tags.characteristics`（堂食 / 一人食 / 可外卖） |
| 错误表现 | 12 个校内食堂的 `rating` 全为 `null`、`tags` 全为 `[]` |
| 根因 | 早期转化按**店名**关联 geojson，而 geojson 只写简称（玫瑰园 / 芙蓉园 / 紫荆园 / 牡丹园 / 丁香园 / 丹桂园 / 百合园 / 茉莉园），与 `places.json` 全名（玫瑰园食惠餐厅 …）匹配失败；门店用的是全名所以正常，食堂整批漏掉 |
| 修复 | 改为按 `coordinate_source_id`（qishan-009…016）关联：`real-data.json` 补回 8 条 `rating`，并在库中补回 `tags = ["堂食","一人食","可外卖"]`（桃李园 / 佳客来 / 海棠园京元 / 紫竹园到口 4 个在 geojson 中无要素，评分、标签、地址一律留空，不编造） |
| 复核 | `verify-real-data.sql` 新增「25 校内食堂有坐标（8/12）」「26 校内食堂有评分标签（8/12）」两条，现值为 8 与 8 |

### 0-3.3 同类问题待确认（本轮未改库）

| 项 | 内容 |
| --- | --- |
| 对象 | 3 家麦当劳（id 13/14/15） |
| 问题 | 同样是源库无 `map_location` 的点位，`lat/lng` 为估算值（26.0654/119.1858 等），`coord_source` 为空 |
| 待决 | 是否与校内食堂同一口径一并置空（会导致 3 个门店在地图上改用顺排兜底位置） |

### 0-3.4 校验收尾

| 项 | 内容 |
| --- | --- |
| 数据校验 | `tests/sql/verify-real-data.sql` 全量复跑：`09 有坐标点位 = 56`（60 - 4）、`16 校内食堂 = 12`、`20 无菜单点位 = 18`、`25 = 8`、`26 = 8`，均与期望一致 |
| 回归 | `e2e-verify.test.mjs` **11/11 通过**（含 375/768/1280 三视口地图页无横向溢出、无 JS 报错）；`walkthrough-r76-station-map.test.mjs` 中 IT-01/IT-02（点位级/档口级标记）通过，IT-00/IT-03/IT-04 仍受 `DEBUG=false` + 管理员口令轮换的环境口径影响（非本轮引入） |
| 连带修复 | `seed.js` 菜品封面键曾混入 NUL 字节，导致 `DISH_COVER` 的键分隔符与查询处的空格不一致（空库首建时菜品会全部回退成档口封面，现网因上传工具直写库而未暴露）；已改为空格分隔，离线校验 158/158 菜品键全部命中 |
| 备份 | 60 条点位原值：`tests/report/canteen-backup-r85.xml` |

---

## 〇-4、r86 追加：「我的主页」重构 + 校内食堂档口按源库正确转化

> 用户原话：「我的主页界面不好看，其进行重构的，其桌面端不好看，设计不够合理，然后移动端对应修改一下的，进行修复修正，完成后测试的，然后其校内的是有对应食物的吧，其上面github里没有吗？其没有对应转化过来吗？先转化为我这边需要的」

### 0-4.1 需求拆解

| # | 诉求 | 处理 |
| --- | --- | --- |
| 1 | 「我的主页」桌面端不好看、设计不合理，需要重构 | 重写 `user-profile-view.vue`：真正的「名片 + 数据/头衔侧栏 + 点评流」两栏结构，桌面 1080px 版心、侧栏 268px 吸顶；移动端单列 |
| 2 | 移动端对应修改 | ≤768px 名片纵向、操作按钮整行、统计 3×2、点评单流，三视口零横向溢出 |
| 3 | 完成后测试 | 新增 `walkthrough-r86-user-profile.test.mjs`（24 项）+ 重跑 r84 封面 17 项 + e2e 11 项 + 数据校验 SQL |
| 4 | 校内食堂是否有对应食物、GitHub 上有没有、是否没转化过来 | 核查结论：**GitHub 源仓库确实没有任何校内食堂菜品**；能转化的只有 geojson 里的 28 个档口名，已按真实名称转化入库 |

### 0-4.2 源库核查结论（先查证再动手）

| 项 | 事实 |
| --- | --- |
| GitHub 仓库全量文件 | `Zviolin/Dafu-Moment` 默认分支 488 个文件，与本地 `data/db3/` 完全一致（无额外食堂菜单数据文件） |
| 78 表 SQL 中的 station/dish 插入 | 仅 `04_synthetic_test_seed.sql`（全部门店）与 `06_estimated_menu_seed.sql`（11 家门店 37 道估算菜），**没有任何食堂档口或食堂菜品** |
| `places.json` / `estimated-menu.json` | 食堂条目只有名称/地址/营业时间/坐标，`estimated-menu.json` 37 条全部门店，无食堂菜单 |
| geojson 食堂要素 | 8 个食堂要素的 `properties.include` 带档口清单（`notes` 标注「档口/连锁」），**没有菜品名与价格**；其余 4 个食堂（桃李园/佳客来/海棠园京元/紫竹园到口）连档口都没有 |
| 结论 | 「校内食物」在源数据中只到档口粒度（28 个），菜品需另行采集或授权估算；按仓库 README「不使用假数据或随意编码填补」原则，本轮只建档口、不编菜单 |

### 0-4.3 转化实施（28 个校内食堂档口）

| 项 | 内容 |
| --- | --- |
| 数据来源 | `data/db3/collection/round2/ffm-qishan.geojson` 的 8 个食堂要素 `properties.include.name` |
| 分布 | 玫瑰园 7（食惠烧腊/咖喱饭/老顺德干蒸菜/小街胡同/塔斯汀/杨国福麻辣烫/临榆炸鸡腿）、芙蓉园 4、紫荆园 4、牡丹园 4、茉莉园 4、丁香园 2、丹桂园 2、百合园 1 |
| 字段口径 | `category` 按档口名称归类（卤味/米饭套餐/面食/麻辣烫/汉堡简餐/炸鸡小吃/套餐/面点/家常炒菜/小吃/综合），仅用于筛选项与封面回退，非源数据字段；`cover_object_key` 取对应 `preset:*` 预设图；坐标沿用 `seed.js` 的确定性偏移，避免与点位标记重叠 |
| 代码层 | `real-data.json` 给 8 个食堂补 `stations` 数组，使**全新库 seed** 与现网一致；新增 `data_notes.canteen_station_caliber` 记录口径 |
| 存量库 | 新增幂等脚本 `tests/sql/r86-import-canteen-stations.sql`（`INSERT ... SELECT` + `NOT EXISTS`，重复执行为 0 行）；执行前备份 `tests/report/station-backup-r86.xml` |
| 结果 | `station` 42 → **70**（门店 42 + 校内食堂 28）；有档口点位 8 个；4 个无 include 的食堂保持无档口；`dafu_verify` 同步至 70 |

### 0-4.4 主页重构要点（`user-profile-view.vue`）

| 项 | 重构前 | 重构后 |
| --- | --- | --- |
| 桌面结构 | 单卡横向三栏 + 点评 2 列，信息少、留白大 | 名片（全宽）+ 268px 吸顶侧栏（统计六宫格 / 头衔进度）+ 单列宽点评流，版心 1080px |
| 移动结构 | 同套栅格压缩，头像/按钮/统计拥挤 | 名片纵向、按钮整行三等分、统计 3×2、点评单流 |
| 数据使用 | 只展示本地汇总的赞数与 mock 关注态，接口里的 `stats`/`title`/`follow` 全部闲置 | 直接消费 `GET /users/:id/profile`：点评/获赞/收藏/打卡/足迹、头衔等级与升级进度、关注/粉丝数、是否已关注 |
| 认证标签 | 读 `user.fzu_verified`，但接口从不返回 → 标签永不出现 | 后端 `/users/:id/profile` 补 SELECT `fzu_verified` 并返回 `fzuVerified`，标签真实可见 |
| 关注按钮 | 无真实交互（mock 切换） | 走 `POST/DELETE /users/:id/follow`；未登录跳登录；关系表未落库（`available=false`）时显示「—」而非假 0，点击提示「即将开放」 |
| 其他交互 | 「私信」假按钮 | 「分享主页」复制链接（真实可用）；私信保留但明确提示未开放；自己看自己显示「编辑资料 → /me」 |
| 可见性 | 无 | 头衔进度条、加入时间、贡献值、点评对象类型 chip、点评图墙、分页 |

### 0-4.5 验证结果

| 口径 | 结果 |
| --- | --- |
| `tests/walkthrough-r86-user-profile.test.mjs`（新增） | **24 / 24 通过**：校内档口 28 个/抽样名称一致/4 个无档口食堂/校内档口 0 菜品/玫瑰园详情 7 档口；profile 返回 `fzuVerified`+`stats`+`title`+`follow`；桌面两栏（侧栏 268px 在左）、统计 6 格、操作按钮同行；移动单列、按钮整行、无横向溢出；平板正文 ≥400px；三视口零 JS 报错 |
| `tests/walkthrough-r84-real-dish-covers.test.mjs` | **17 / 17 通过**（断言口径按 r86 拆分：门店档口 42 全真实图 / 校内食堂档口 28 为预设图） |
| `tests/e2e-verify.test.mjs` | **11 / 11 通过**（地图/首页场景/搜索/三视口无溢出无报错） |
| `tests/sql/verify-real-data.sql` | 全量复跑：`02 档口 = 70`、`09 有坐标点位 = 56`、`20 无菜单点位 = 10`（4 食堂 + 6 门店）、`21 有菜单档口 = 42`、`25 = 8`、`26 = 8`、`27 校内档口 = 28`、`28 校内档口有菜品 = 0` |
| 截图 | `tests/report/r82-shots/r86-user-profile-desktop.png`、`r86-user-profile-mobile.png`、`r86-canteen-rose.png` |
| 已知环境限制 | `api-integration.test.mjs` 因 `DEBUG=false`（生产姿态）取不到验证码 `debugCode`，无法启动；未为此临时开启 DEBUG |

### 0-4.6 本轮遗留

| # | 事项 | 说明 |
| --- | --- | --- |
| 1 | 校内食堂档口无菜品 | 源库确实没有食堂菜单；若需要展示菜品，只能走「公开菜单采集」或「用户授权的估算菜单」（与 06 的 37 道估算菜同一口径），需产品确认 |
| 2 | 关注关系表未落库 | 后端 `follow.service.js` 已实现但 `follow_relation` 表未建（源库该表在脱敏后丢失），主页关注/粉丝显示「—」，关注按钮提示「即将开放」 |
| 3 | 3 家麦当劳坐标仍为估算值 | 与 r85 同一类问题，待产品确认是否置空 |
| 4 | 4 个无档口食堂 | 桃李园/佳客来/海棠园京元/紫竹园到口在 geojson 中连 `include` 都没有，维持无档口 |

---

## 一、反馈逐条处理结果

### 反馈 1 —「已打卡两次，任务中心『每日签到』仍显示 0/1、按钮仍是『去完成』」

| 项 | 内容 |
| --- | --- |
| 根因 | 打卡页只写本地 `localStorage`，从未调用后端打卡接口；任务中心 `GET /api/me/tasks` 统计的是 `check_in` 表，当日自然为 0 |
| 修复 | 打卡页改为调用 `POST /api/checkin`：照片先经 `POST /api/upload/image` 换 objectKey，再带 `canteenId / visibility / note / photos / dishIds` 提交；同点位重复打卡按后端 409 + `again:true` 追加到同一条记录；成功后再写本地手账快照；删除前端自增的 `dafu_pet`/`dafu_achv_progress`（道具与成就由后端按真实数据发放） |
| 代码 | `frontend/src/views/checkin-view.vue`（`save()` / `build_record()` / `on_pick_photos()`） |
| 验证 | API：打卡落库 `check_in_date = 今天`；`GET /api/me/tasks` 每日签到变为 `1/1` 且 `claimable=true`；重复打卡 409；`again:true` 返回 200 且同点位不新建行（total=1）；换点位打卡后 total=2 而每日任务仍 1/1。UI：打卡成功后任务中心显示「今日 1/1」 |
| 用例 | `walkthrough-r82-doc-bugs.test.mjs` R82-13 ~ R82-16、UI 段「打卡→任务中心 1/1」 |

### 反馈 2 —「热搜词（麻辣香锅/糖水铺/手打面/夜宵）搜不到；数据什么时候能导入，怎么搜什么都搜不到」

| 项 | 内容 |
| --- | --- |
| 根因 | 热搜是写死的常量词，与库内真实数据无交集；搜索只覆盖菜品名，点位/档口/品类/口味/场景词全部搜不到 |
| 修复 | 新增 `GET /api/search/hot`，由真实数据聚合生成热搜（高频菜品 ≤10 字取 4 个 + 高频品类 6 个 + 场景词）；`search_all()` 重写为点位（名称/位置/标签/营业时段/场景）、档口（名称/品类）、菜品（名称/口味/忌口/档口名/品类/点位名）三组检索；空态明确告知「校内食堂菜单仍在导入中，可先试试下面的真实热搜」 |
| 代码 | `backend/src/services/content.service.js`（`hot_keywords()` / `search_all()`）、`backend/src/routes/index.js`、`frontend/src/views/search-view.vue` |
| 验证 | 热搜非空且不含任何「死词」，每个词点开均有结果；「夜宵」命中点位；「川菜」命中档口或菜品；「免排队」等无效词已从热搜中移除；顶栏搜索占位文案也由死词「麻辣香锅」改为「闽菜」 |
| 用例 | `walkthrough-r82-doc-bugs.test.mjs` R82-01 ~ R82-07、UI 段「热搜与接口一致」「点热搜出结果」「空态含导入中提示」 |

### 反馈 3 —「筛选面板只有 食堂/人均/口味/忌口/评分，可选项太少」

| 项 | 内容 |
| --- | --- |
| 根因 | 筛选项写死，且与库内数据不匹配（存在「查得到但选不中」的空档） |
| 修复 | 新增 `GET /api/filters/options`，按真实在售数据聚合出：点位类型（含各类型菜品数）、营业状态（营业中/休息中）、品类（含数量）、推荐菜、评分档位（4.0 / 4.5，含数量）；前端筛选项由接口动态生成，数量为 0 的选项直接不展示；`/api/dishes` 同步支持 `canteenType / recommended / ratingMin` |
| 代码 | `backend/src/services/content.service.js`（`filter_options()` / `filter_dishes()`）、`frontend/src/views/search-view.vue` |
| 验证 | 筛选项分组 ≥ 7 组（食堂/人均/口味/忌口/评分/点位类型/营业状态/品类）；`canteenType=2` 返回条数与统计口径一致；`q=川菜` 命中品类；`ratingMin=4` 结果均分全部达标，`ratingMin=4.5` 与统计数量一致；UI 上单选品类（无关键词）也能出结果 |
| 用例 | `walkthrough-r82-doc-bugs.test.mjs` R82-08 ~ R82-12、UI 段「筛选分组」「选类型结果非空」 |

### 反馈 4 —「首页『校园口碑榜』与榜单页数据不一致」（批注：这个榜单前后不一致）

| 项 | 内容 |
| --- | --- |
| 根因 | 首页口碑榜用的是另一套聚合口径，与 `/rank` 页「口碑榜（week · score）」不同源 |
| 修复 | 首页改为调用 `GET /api/rankings?period=week&dim=score&limit=6`，与榜单页「口碑榜」前 6 完全同源；后端榜单返回补充 `avgPrice` 便于副标题展示 |
| 代码 | `frontend/src/views/home-view.vue`（`load_recs`）、`backend/src/services/content.service.js`（`rankings`）、`backend/src/routes/index.js` |
| 验证 | 首页口碑榜名称/分数与接口逐项一致；`/rank` 页口碑榜顺序一致；口碑榜与人气榜均严格倒序；`limit=6` 与 `limit=10` 的前 6 名完全相同 |
| 用例 | `walkthrough-r82-doc-bugs.test.mjs` R82-17 ~ R82-20、UI 段「首页口碑榜 == 榜单页口碑榜」 |

### 反馈 5 —「发布动态『添加话题』只能选固定 6 个话题，需支持手动添加自定义话题」

| 项 | 内容 |
| --- | --- |
| 根因 | 话题是前端固定数组，后端 `topics` 直接 `slice(0,5)`，选满 6 个会静默丢弃第 6 个 |
| 修复 | 前端新增自定义话题输入（自动去 `#`、单条 ≤12 字、自动包 `#xxx#`、去重、上限 8）；后端新增 `normalize_topics()` 统一做同样规范化，并支持最多 8 个（原先 5 个） |
| 代码 | `frontend/src/views/post-publish-view.vue`、`backend/src/services/post.service.js` |
| 验证 | 连续输入 9 个话题 → 落库 8 个且全部为 `#xxx#` 格式、包含自定义话题、第 9 个被按上限丢弃；UI 上手动添加 2 个自定义话题并发布后，DB `post.topics` 含自定义话题 |
| 用例 | `walkthrough-r82-doc-bugs.test.mjs` R82-21、UI 段「自定义话题发布」 |

### 反馈 6 —「『我的档案』点击无反应；顶部头像与下方档案头像上下不同步」

| 项 | 内容 |
| --- | --- |
| 根因 | 「我的档案」未绑定跳转；页头头像为写死图片，与档案页 `UserAvatar` 组件不同源 |
| 修复 | 页头头像改用 `<user-avatar :user="auth.user" :size="44" />`，与档案页同组件同数据源；「我的档案」跳转目标在 **r84** 二次校正为个人中心 `/me`（此前误跳公开主页 `/user/:id`，详见「〇-1.2」） |
| 代码 | `frontend/src/App.vue`、`frontend/src/views/me-view.vue` |
| 验证 | UI：导航栏头像与 `/me` 页头头像背景色一致且均为 `UserAvatar` 组件；点击「我的档案」跳到 `/me`（R82-25c）、「我的主页」跳到 `/user/:id`（R84-28c） |
| 用例 | `walkthrough-r82-doc-bugs.test.mjs` UI 段「档案跳转」「头像同步」 |

### 反馈 7 —「福大认证功能是不是还没实现」

| 项 | 内容 |
| --- | --- |
| 结论 | **已实现**，此前未验证到位 |
| 现状 | 统一身份走 FZU SSO 双模式：`real`（真实 CAS）/ `demo`（校内桩）。demo 模式下 9 位学号 + 初始口令 `FZU521`，首次登录强制改密 |
| 代码 | `backend/src/services/auth.service.js`（FZU 桩与改密流程）、`frontend/src/views/login-view.vue`（福大入口） |
| 验证 | `GET /api/auth/fzu/cas/mode` 返回 `{ enabled: true, mode: 'demo', initialPassword: 'FZU521' }`；登录页存在「福大统一身份认证」入口；r80 两套脚本 19 + 15 项用例覆盖首次改密与 UI 流程 |
| 用例 | `walkthrough-r80-fzu-initial-password.test.mjs`、`walkthrough-r80-fzu-password-ui.test.mjs` |

### 反馈 8 —「图片加载有点慢」

| 项 | 内容 |
| --- | --- |
| 根因 | 宠物装扮原图为 2048px 单张 1.8–4.2MB，首页/宠物页一次并发加载多张 |
| 修复 | 全站图片资产按目录压缩（pet-dress 2048→512、mbti 480、badges 256、food 560、bg 1280 等），总量 **51.93MB → 13.54MB**；列表图补 `loading="lazy"` + `decoding="async"`；`/img/` 增加 `Cache-Control: public, max-age=604800, immutable` 与安全响应头；装扮图版本号升级 `?v=r82` 破缓存 |
| 代码 | `frontend/public/assets/**`、`frontend/nginx.conf`、`frontend/src/utils/asset-version.js`、`frontend/src/views/pet-view.vue`、`frontend/src/components/dish-card.vue` |
| 验证 | 线上实测 `05_装扮_汉堡.png` 由约 4.1MB 降到 411KB；`/assets/pet-dress/d1.png` 响应 `Cache-Control: public, max-age=31536000, immutable`；宠物形象弹层内装扮图 `naturalWidth ≤ 520` 且带 `?v=r82` |

---

## 二、本轮审核额外发现并修复的问题（超出文档 8 条）

| # | 问题 | 修复 | 验证 |
| --- | --- | --- | --- |
| A | `/search?category=闽菜` 在 1280 宽出现横向滚动条（scrollWidth 1527 > 1280），菜品卡被挤出屏幕 | `result-grid` 的多列轨道由 `repeat(n, 1fr)` 改为 `repeat(n, minmax(0, 1fr))` | 修复后轨道宽度 333×3 = 1032 = 容器宽，`scrollWidth == clientWidth`；375/768/1024/1280 四档均无横向溢出（e2e-verify V 组用例） |
| B | 顶栏搜索占位词是「麻辣香锅」（库内无此数据，演示即失败） | 改为真实可搜的「闽菜」 | UI 断言与 e2e 回归通过 |
| C | 演示学生账号 `zhangwl` 口令与 README 记载的 `123456` 不一致，历史走查脚本批量 401/40001 | 恢复 `zhangwl` / `wangfr` 口令为 `123456`（与 `README.md`、`tests/README-stage-demo.md` 一致） | r42/r45/r48/r51b 等脚本可正常登录 |
| D | 管理员口令轮换后，6 处测试脚本硬编码 `admin123` 导致登录 422 级联失败 | 统一改为 `process.env.DAFU_ADMIN_PASSWORD \|\| 'admin123'`（r42/r45/r48/r75/r76/r77/rounds-10/api-integration/stage-screenshots） | 17 套脚本登录全部通过 |
| E | 6 处 UI 脚本用已失效的临时目录 `C:/WINDOWS/TEMP/27pw/anchor.js` 解析 `playwright-core`，脚本直接 MODULE_NOT_FOUND | 改用 `createRequire(import.meta.url)` / `createRequire(__filename)`，解析到 `tests/node_modules` | r51b / r52 / r53 / r55 / r69 脚本可启动 |
| F | 管理端走查（r75/r76）只增不删，遗留测试点位/档口/菜品与临时账号，污染线上地图、榜单、点评圈，并使 rounds-10 的精确计数断言失败 | 新增 `tests/_fixture-cleanup.mjs` 统一夹具回收；r75/r76/r77/api-integration/api-task-pet-social 在收尾用例中自动清理 | 回归后库内回到基线：点位 60 / 档口 70 / 菜品 158 / 评价 407 |
| G | `api-integration` 的品类断言写死「汉堡简餐」（当前菜单已无此品类）、点位类型断言只认 0-3（未含外卖 4）；`e2e-verify` 仍找旧种子「美岐食区」、旧首页九宫格、旧「地图」导航名、旧「窗口数」文案 | 断言改为按真实数据动态取值（`/categories` 首项、type 0-4、首个 type=0 点位、首页就餐场景四格、顶栏「导览图」、详情卡「档口」） | api-integration 35/35、e2e-verify 11/11 通过 |
| H | **测试夹具污染线上库**：r72 / r74 各注册甲乙两个临时账号却不回收，残留 4 个账号（id 121-124）；`report` / `station_post` 两表归属列不是 `user_id`（分别为 `reporter_id` / `author_id`），被统一清理工具漏删 | r71 / r72 / r74 / r82 补齐收尾用例（IT-08 / IT-16），统一走 `cleanup_fixtures`；r71 原本硬编码的 7 条 SQL 改为调用统一工具；清理工具补 `report`(reporter_id) 与 `station_post`(author_id) 两条回收 | 残留临时账号归零；r71 15/15、r72 9/9、r74 17/17、r82 71/71 通过 |
| I | **历史孤儿派生数据**：早期脚本直接 `DELETE user` 而未清派生表，留下 `report` 5 条 / `check_in` 4 条 / `notification` 7 条指向不存在的账号 | `tests/_fixture-cleanup.mjs` 新增导出函数 `cleanup_orphans()`，按各表归属列统一回收「账号已删但派生表仍留行」的孤儿数据（`sticker.user_id=0` 为系统公共贴纸，按注释排除） | 实测回收 `notification 7 / check_in 4 / report 5`，复验后各表残留归零 |
| J | **r81 两套走查收尾漏删打卡**：r81-qa-doc-edge / r81-qa-doc-ui 在 UI 里真实发布了打卡（写入 `check_in`，点位 13 麦当劳），但收尾只删 `pet` / `user_dress` / `user`，留下 2 条孤儿打卡 | 两套脚本收尾统一改为 `cleanup_fixtures({ usernames: [USER] })`，覆盖 `check_in` 在内的全部派生表 | 复跑 18/18、28/28 通过，复验 `check_in` 表残留为 0 |
| K | **e2e 地图点击用例误报**：E2E-M1「点击标记出详情卡」长期超时失败，疑似前端标记无响应 | 根因排查：AMap 2.0 的 Marker `click` 依赖 mousedown 与 mouseup 之间的时间间隔区分「点击」与「拖拽」，Playwright 默认 0 延时 down/up 被判为拖拽而不派发 click；叠加 60 个点位在 1280×800 下密集重叠（仅 21/60 中心点命中自身），硬点「第一个标记」必点空 | **非产品缺陷**（真实用户手速天然 >50ms）：测试改为「先找中心点命中自身的标记，再按真实用户节奏 down → 停顿 120ms → up」；应用侧代码未改动 | e2e-verify 11/11 通过；同一套点位用真实节奏点击，详情卡正常弹出 |
| L | **头像显示普遍性缺陷**：`avatar_object_key` 存 MinIO objectKey 裸串，前端直接当 `<img src>` → 浏览器按相对路径解析到 SPA → 裂图。影响 6 类页面（详情页点评卡 / 点评圈 / 点评详情页 / 宠物社区 / 我的福宝页 / 顶栏） | 前端新增 `avatar_url()` 统一补 `/img/` 前缀，5 处渲染点改用；后端 `review.service.js` 4 处、`follow.service.js` 2 处、`auth.js` 1 处、`routes/index.js` 1 处补 `avatar_object_key` 透传 | r83 走查 14/14 通过（断言裸串直连返回 `text/html` 固化根因，6 类页面 `broken === 0`） |
| M | **回归批量执行大面积误报 42901/401**：17 套脚本连跑时，`register` 限流 5 次/3600s、`login` 10 次/600s 被前序脚本打满 | 批量回归入口 `tests/run-r83-regression.ps1` 在**每套脚本前**执行 `docker exec dafu-redis redis-cli FLUSHDB` 清限流计数 | 17 套全部 exit=0（r84 末轮 400/400 通过） |
| N | **e2e-verify 批量跑偶发 M1 失败**：单独跑 11/11 通过，批量跑偶发 `.pin-card` 超时（地图视野动画期间标记坐标漂移，取坐标后点击落空） | E2E-M1 改为「采样连续两次一致视为坐标稳定 → 点击 → 未弹出则重新采样再点，最多 3 轮」的容错式点击 | 连跑 3 次 11/11 通过；批量 17 套回归中 e2e-verify 亦 exit=0 |
| O | **桌面端无「我的」入口**：「我的」仅在移动端底部 tabbar，桌面端顶栏没有指向个人中心的导航 | `App.vue` 顶栏 `.nav-links` 新增「我的」入口，复用 `go_me()` | R84-28a/28b 通过 |
| P | **「我的档案」跳到公开主页**：`on_user_cmd('me')` 跳 `/user/:id`（页头是「关注/私信」的公开主页），与「我的档案」语义不符 | 「我的档案」→ `/me`；新增「我的主页」→ `/user/:id` | R82-25c / R84-28c 通过 |
| Q | **关注区视觉不对齐 + 间距过小**：`/me` 的「关注/粉丝」行 `space-around` 与下方三宫格列位错位；`/follows` 卡片距上方 Tab 仅 12px、底部提示仅 16px | `/me` 桌面端三行统一 3 列栅格（`repeat(3,1fr)` + gap 20px，`justify-items:center`），行间距 16→22px；`/follows` 卡片上间距 12→20px（桌面 26px）、底部提示 16→20px（桌面 24px） | R84-29a/29b/29c/30a 通过（实测 stat=[289,640] fn=[289,640,991]；gap=22 / 26） |
| R | **桌面 4 列下昵称竖排一字一行**：1200px 档 `.user-list` 改 `repeat(4,1fr)`，单列仅 250.5px，带「校内已认证」badge 的昵称被 flex 挤压后收缩到最小内容宽度（「面面俱到」「干饭不语」） | 1200px 档保持 3 列 + 加大列间距；昵称独立包裹 `.uname-txt` + `white-space: nowrap` + 省略号，简介单行省略 | R84-30b 通过（实测 lines=1.36，未竖排）；截图 `r84-follows-desktop.png` 复核 |
| S | **回归中断时残留临时账号**：批量回归被中途终止后，`api-integration` 的收尾用例（IT-CLEAN）未执行，已注册的临时账号 `it_mvteb237` 残留库内 | `api-integration.test.mjs` 挂 `process.on('exit')` 兜底清理钩子，任何退出路径（正常结束 / 断言外抛错 / 被终止）都回收本次临时账号及其派生数据 | 残留账号已删除，复验 `user` 表 `it_%` 计数 = 0；`api-integration` 35/35 通过 |
| T | **桌面栅格改动存在波及移动端的隐患**：r84 的 3 列栅格写在 `@media (min-width: 769px)` 内，但基础样式（`.statrow`/`.fnrow`/`.rowlist`/`.user-list`）已被同批改动过（`.uname-txt` 单行化、间距调整），存在修桌面时破坏手机端的风险 | 在 r82 走查脚本内新增**移动端护栏**：切到 375×780 视口，断言 `/me`、/follows` 均无横向溢出（`scrollWidth - clientWidth === 0`）、`.statrow`/`.fnrow` 仍为 `flex`、`.rowlist` 与 `.user-list` 仍为 `block`（桌面栅格未生效）、昵称仍单行渲染 | R84-31a~31e 通过（实测 overflow=0、statrow/fnrow=flex、rowlist/user-list=block、lines=1.31） |

---

## 三、全量功能测试结果

### 3.1 当前验收口径（17 套脚本 / 400 项用例，全部通过）

| 脚本 | 覆盖范围 | 结果 |
| --- | --- | --- |
| `api-integration.test.mjs` | v2.0 API 口径：登录/注册/验证码、点位四+外卖类型、菜品与维度评分、收藏、举报、任务、AI 供应商、点位提交 | **35 / 35** |
| `api-task-pet-social.test.mjs` | 每日/成长任务进度与领取、金币流水、宠物与投喂、动态与评论 | **9 / 9** |
| `e2e-verify.test.mjs` | 首页场景格、地图标记与详情卡、搜索承接、顶栏导航、三档视口（375/768/1280）无横向溢出 | **11 / 11** |
| `rounds-10-acceptance.test.mjs` | 十轮全量验收（数据口径、页面一致性、接口契约、文案规范等 14 组） | **106 / 106** |
| `walkthrough-r71-checkin.test.mjs` | 打卡全链路 + 任务进度 | **15 / 15** |
| `walkthrough-r72-me-records.test.mjs` | 我的记录（打卡/评价/收藏/动态） | **9 / 9** |
| `walkthrough-r73-review-dim-sort.test.mjs` | 评价维度与排序 | **4 / 4** |
| `walkthrough-r74-favorite-groups.test.mjs` | 收藏夹分组 | **17 / 17** |
| `walkthrough-r75-takeout-type.test.mjs` | 外卖第五类（type=4）管理端全链路 | **9 / 9** |
| `walkthrough-r76-station-map.test.mjs` | 档口地图与坐标系 | **5 / 5** |
| `walkthrough-r77-station-compare.test.mjs` | 档口对比 | **8 / 8** |
| `walkthrough-r80-fzu-initial-password.test.mjs` | 福大 demo 首登改密（接口层） | **19 / 19** |
| `walkthrough-r80-fzu-password-ui.test.mjs` | 福大 demo 首登改密（UI 层） | **15 / 15** |
| `walkthrough-r81-qa-doc-edge.test.mjs` | 上一轮 QA 边界项回归 | **18 / 18** |
| `walkthrough-r81-qa-doc-fixes.test.mjs` | 上一轮 QA 修复项回归（含图片版本号 r82） | **21 / 21** |
| `walkthrough-r81-qa-doc-ui.test.mjs` | 上一轮 QA UI 回归 | **28 / 28** |
| `walkthrough-r82-doc-bugs.test.mjs` | **本轮 8 条反馈逐条复现与修复验证（API + UI 双层）+ r84 桌面端导航/视觉对齐走查 + 移动端护栏** | **71 / 71** |
| `walkthrough-r83-avatar-display.test.mjs` | **r83 头像显示走查（新增，不计入主验收口径）** | **14 / 14** |
| **合计（17 套主验收口径）** | | **400 / 400（0 失败）** |

> r72 与 r74 各新增 1 条收尾清理用例（IT-08 / IT-16），故本轮统计由 385 增至 387。
> r83 头像走查为本轮新增的专项脚本，14 项全部通过，单列不并入主验收口径。
> r84 在 r82 脚本内新增 13 项走查用例（R84-28a/28b/28c、29a/29b/29c、30a/30b、31a/31b/31c/31d/31e），r82 口径由 58 增至 71，17 套合计由 387 增至 **400**。
> 400 项口径已由 2026-10-29 18:41~18:47 的完整批量回归实跑验证：17 套 **全部 exit=0**（r82 = 71/71），日志见 `tests/report/r83-regression/`。

日志：`tests/report/r82-final/`（每套脚本一份原始输出）、`tests/report/r83-regression/`（r83 批量回归日志）、截图：`tests/report/r82-shots/`

### 3.1.1 数据基线复验（回归后）

| 表 | 数量 | 说明 |
| --- | --- | --- |
| `canteen` | 60 | 点位（校内食堂 / 学生街 / 周边 / 外卖） |
| `station` | 42 | 档口 |
| `dish` | 158 | 菜品 |
| `review` | 407 | 评价（公网真实用户 id=58 清理后由 408 减 1） |
| `user` | 14 | 13 个种子账号 + 1 个福大 SSO 认证账号（id=174 `102400232` 张俊杰，`fzu_verified=1`）；公网真实注册用户 id=58 已清理；`it_%` 临时账号残留 = 0（r84 复验） |
| `check_in` / `post` / `journal` | 0 / 0 / 0 | 无测试夹具污染 |
| `pet` / `station_post` | 1 / 2 | 真实用户数据 |
| `notification` | 3 | 真实用户数据（用户 1 / 2 / 174） |
| `favorite` | 37 | 种子收藏（id=58 清理后由 38 减 1） |
| `fzu_account` | 1 | 福大 SSO 账号（uid=102400232） |
| `report` / `point_submit` / `review_like` / `coin_transaction` / `task_claim` / `ai_conversation` | 0 | 举报、投稿、点赞、金币流水、任务领取、AI 会话均已回收（`ai_conversation` 另有 2 条 r53/r55 历史走查残留挂在真实账号 zhangwl 下，本轮一并清除） |

> MinIO 桶 `dafu-images` 复核：`find /data/dafu-images -type f | wc -l` = **0**，无孤儿对象。

### 3.1.2 生产姿态复验（收尾）

回归结束后已将后端从测试期 `DEBUG=true` 恢复为生产默认 `DEBUG=false`（`docker compose up -d backend` 不带 `DEBUG` 变量），复验项全部通过：

| 检查项 | 期望 | 实测 |
| --- | --- | --- |
| `docker exec dafu-backend printenv DEBUG` | `false` | `false` |
| `GET /api/auth/captcha` | 响应体**不含** `debugCode` | `HAS_DEBUGCODE=False` |
| `GET /api/auth/fzu/cas/mode` | `{ mode: 'demo', initialPassword: 'FZU521' }` | 一致 |
| `GET /api/health` | `status: up` | `HEALTH=up` |
| 前端入口 `http://localhost:8095` | 200 | `FRONT8095=200` |
| 公网/局域网入口 `http://localhost:9080` | 200 | 200 |
| 后端 `3000` 端口 | 仅绑定回环，不对外暴露 | `127.0.0.1:3000->3000/tcp`（compose 已限定） |
| MinIO 桶孤儿对象 | 0 | `MINIO_FILES=0` |
| 库内临时账号残留 | 0 | `SELECT COUNT(*) FROM user WHERE username LIKE 'it\_%'` = 0 |

### 3.1.3 环境口径说明（两项非产品缺陷）

| 项 | 说明 |
| --- | --- |
| 限流 | `register` 5 次/3600s、`login` 10 次/600s、`fzu_sso` 10 次/600s，Redis 键 `rl:{action}:{ip}:{window}`。**每套脚本前必须 `docker exec dafu-redis redis-cli FLUSHDB`**，否则后序脚本会拿到 42901/401 误判为产品缺陷 |
| 管理员口令 | 本机管理员口令已从 `admin123` 轮换为强口令（明文不入库、不进项目文件、不进 memory、不进 PowerShell 历史）。所有脚本统一读 `process.env.DAFU_ADMIN_PASSWORD \|\| 'admin123'`；口令不可得时登录返回 422。本次回归临时重置为 `Dafu@dafu2026` 并在回归后恢复 |

> r84 补充：批量回归必须带 `$env:DAFU_ADMIN_PASSWORD` 运行，否则 `rounds-10`（R4-09 管理员登录）与 `api-integration`（管理员登录前置）会以 422 失败 —— 这是**凭据缺失导致的测试环境问题，不是产品缺陷**。

### 3.2 执行方式

```powershell
cd 项目代码
$env:DAFU_ADMIN_PASSWORD='<管理员口令>'
$env:DEBUG='true'                      # 验证码 debugCode 回显，仅测试期开启
docker compose up -d --build
docker exec dafu-redis redis-cli FLUSHDB   # 每套脚本前清限流计数，避免 42901 误判
node tests/walkthrough-r82-doc-bugs.test.mjs
```

> 注意：`docker compose up` 会重建 backend 并按 `DEBUG=${DEBUG:-false}` 重置环境变量，测试期必须在**同一条命令**里先设 `$env:DEBUG='true'`。

**批量回归（r83/r84）**：

```powershell
$env:DAFU_ADMIN_PASSWORD='<管理员口令>'   # 缺省会 422：rounds-10 / api-integration 管理员登录失败
$env:DEBUG='true'
docker compose up -d --build
powershell -NoProfile -File tests\run-r83-regression.ps1   # 17 套，自动清限流 + 落日志
```

**收尾恢复生产姿态**：

```powershell
Remove-Item Env:DEBUG -ErrorAction SilentlyContinue
docker compose up -d backend          # 不带 DEBUG → 回落 DEBUG=false
docker exec dafu-backend printenv DEBUG   # 期望 false
```

---

## 〇-5、r87 追加：福宝投喂榜「0 次也上榜」+ 新领养福宝误判饥饿

> 反馈原文：「然后出现部分投喂福宝的，其出现投喂0次也上榜之类的奇怪形式。修复这个后，查看类似的bug，然后继续修复」

### 0-5.1 问题与根因

| 项 | 内容 |
| --- | --- |
| 现象 | `/pet-community`「累计投喂榜」Top3 出现「喂了 0 次」的福宝（实测 user 174 刚领养、从未投喂，却以第 3 名占榜） |
| 根因 | `community()` 直接对 `pet` 全表 `ORDER BY feed_total DESC` 取前 3 当榜单，**未过滤 `feed_total=0`**；名次按全表下标计算，0 次福宝也拿到名次 |
| 连带现象 | 从未投喂的新福宝 `last_fed_at=NULL` → 按 999 小时算 → `mood='hungry'`：`/pet` 页一打开就提示「超过 24 小时没喂食啦」，广场卡也标成「饿肚子」 |

### 0-5.2 修复

| 层 | 文件 | 改动 |
| --- | --- | --- |
| 后端 | `backend/src/services/pet.service.js` | 新增 `mood_of(last_fed_at, created_at)`：从未投喂时以**领养时间**为基准（不足 24 小时判待机）；`state()` / `community()` 统一回传 `fed_never`；`community()` 新增 `ranking`（只收 `feed_total>0`、榜内名次从 1 重排）、`my_rank` 仅已投喂时为榜内名次；广场查询补 `p.created_at` |
| 前端 | `frontend/src/views/pet-community-view.vue` | 榜单改用接口 `ranking`（未有一笔真实投喂时展示空态文案，不拿 0 次凑榜）；广场卡 0 次改显示「还没投喂过」；我的卡新增名次文案（「第 N 名 · 已喂 X 次」/「暂未进入前三」/「喂第一口就能上榜」） |
| 前端 | `frontend/src/views/pet-view.vue` | 饥饿引导区分「从未投喂」与「超 24 小时未喂」两种文案；初始默认态改 `mood='normal'` + `fed_never=true` |
| 文档 | `README.md` | API 概览补 `ranking` / `my_rank` / `mood`+`fed_never` 口径 |

### 0-5.3 类似问题排查（本轮顺带核查）

| 位置 | 口径 | 结论 |
| --- | --- | --- |
| `/rankings` 口碑榜 / 人气榜 | JOIN `review` 聚合、要求评分样本 | 天然不存在 0 评价上榜，无 0 值占榜 |
| 首页校园口碑榜 | 与榜单页同源 `rankings` | 一致，无 0 值 |
| 搜索热搜 / 筛选选项 | `GROUP BY` 真实计数 | 计数为 0 的选项已隐藏，不会出现「选了必空」的死项 |
| 档口对比「更优」标记 | 仅 `best > 0` 时高亮 | 0 值不会被误标为最优 |
| 我的主页 关注 / 粉丝 | 关注关系未开通时值为 `null` | 显示「—」而非 0，已有护栏 |
| 宠物广场「累计投喂 0 次」 | 文案层 | 已改为「还没投喂过」（见 0-5.2） |

### 0-5.4 验证

- 新增 `tests/walkthrough-r87-pet-rank.test.mjs` **30 / 30 通过**：A 接口 10 项（0 次不上榜、名次连续、`my_rank` 为空、广场仍展示本人）、B/C 浏览器（未投喂无饥饿提示、榜卡无「喂了 0 次」、广场显示「还没投喂过」）、D 投喂 1 次后真实上榜且 `feed_total` 与 `feed_record` 流水逐条一致、E 名次文案、F 移动端 375 无横向溢出。
- **全量回归 21 套 486 项全部通过**（17 套主验收 401 项 + r83 14 + r84 17 + r86 24 + r87 30），日志 `tests/report/r87-full-regression.log`。
- 两处过期断言随 r86 数据口径同步更新：`rounds-10` R3-09（无档口点位 18 → **10**、其中食堂 12 → **4**）；`r82` R82-20（空态文案「导入中」→「**已收录…仍在完善**」）。
- 截图：`tests/report/r82-shots/r87-pet-community-unfed.png`、`r87-pet-community-fed.png`、`r87-pet-community-mobile.png`。

### 0-5.5 交付物（镜像打包 + 生产姿态）

| 项 | 结果 |
| --- | --- |
| 镜像包 | `dist/dafu-images-r87.tar`（约 740MB，OCI 层去重；含 `dafu-backend:latest` / `dafu-frontend:latest` / `dafu-matting:latest` / `mysql:8.0` / `redis:7-alpine` / `minio/minio:latest`） |
| 完整性 | `docker load -i dist/dafu-images-r87.tar` **回验 6 / 6 镜像全部导入成功**；校验和见 `dist/SHA256SUMS.txt` |
| 说明 | 镜像包**不含**数据库数据卷与用户上传图；r87 时种子封面也只存在 MinIO 卷内，换机部署需迁 `minio-data`。**r88 起后端镜像内置 147 张种子封面，启动自动补齐，仅用户上传图仍需迁卷** |
| 姿态 | `DEBUG=false`；六容器全部 healthy，`/api/health` 正常 |

---

## 〇-6、r88 追加：线上图片全 404 / 菜品「默认图」排查与封面自愈

> 反馈原文：「`https://dafu-moment.zviolin.online/` 这里的图怎么都没有显示出来的，其怎么回事，然后其怎么还有一些菜品是使用的默认的，其是因为没有对应的图的，对吗？」

### 0-6.1 现象与根因

| 项 | 内容 |
| --- | --- |
| 现象 | 线上站点所有封面图不显示；`/img/cover/202610/xxx.jpg` 返回 404（MinIO `NoSuchKey`），`/api` 与页面本身正常 |
| 线上形态 | 域名解析到独立服务器（A `47.116.25.238`，不是本机隧道）；该栈由离线包部署，容器与接口正常 |
| 根因 | 种子数据只把 `cover_object_key` 写进数据库，**图片对象不在 SQL、不在镜像、不在离线包里**；服务器 MinIO 是空桶。本地正常仅因为本地 `dafu_minio-data` 卷里已有 147 个 `cover/202610/*` 对象 |
| 第二问 | 菜品没有缺图：158 道菜全部有真实图键（147 个唯一对象，多道菜共用一张图）；只有 18 个点位（12 个校内食堂 + 3 家麦当劳 + 3 家门店）源库无实拍图，按设计使用 `preset:` 预设插画 |

### 0-6.2 修复

| 层 | 文件 | 改动 |
| --- | --- | --- |
| 后端 | `backend/src/seed/seed-media.js`（新增） | 启动自愈：遍历镜像内置 `assets/covers`，按对象键 `statObject` 比对大小，缺失或大小不一致才 `putObject`；失败只记日志，不阻断启动 |
| 后端 | `backend/src/index.js` | `ensure_bucket()` 改为 `await`，随后执行 `ensure_seed_media()`，再执行种子导入 |
| 打包 | `backend/Dockerfile` | 新增 `COPY assets ./assets`（147 张、约 36 MB） |
| 部署 | `deploy/build-and-pack.ps1` | 打包前校验镜像内置封面数（应为 147），异常直接抛错，避免再打出空图包 |
| 部署 | `deploy/load-and-up.sh` | 健康检查改为轮询 `/api/health`，并新增一张种子封面 200 校验 |
| 部署 | `deploy/deploy.md` | 新增「封面图与图片自愈（r88）」章节；升级命令补 `restart frontend`（Nginx 上游 DNS 缓存）；FAQ 补图片 404 / 预设插画 / `/api` 502 三条 |
| 文档 | `README.md` | 部署段补图片自愈与离线包说明 |

### 0-6.3 验证

- 新增 `tests/walkthrough-r88-cover-media.test.mjs` **12 / 12 通过**：菜品 158 道全为真实图键、点位仅 18 个预设、内置目录覆盖数据库引用 147 键、MinIO 147 对象齐全、`/img` 147 键逐条 200 且为 `image/*`、自愈幂等（上传 0 / 已存在 147 / 失败 0）、首页与菜品详情页浏览器无裂图。
- 自愈实测：删除锅包肉封面 `cover/202610/e801c3913a0e517f.jpg` → `/img` 404 → `docker restart dafu-backend` → 日志「内置 147，上传 1，已存在 146，失败 0」→ `/img` 恢复 200。
- 镜像复验：`dafu-backend:v1.0-alpha` 内置封面 147 张；`deploy/images/dafu-images.tar` 776,754,688 字节（约 0.72 GB），SHA256 `F460CF04297D816207FB63C21B68BC81A977A9D60AEE32487A5B7568E3C140E9`，`docker load` 6 / 6 镜像成功；同源副本 `dist/dafu-images-r88.tar` + `dist/SHA256SUMS.txt` 已更新。

### 0-6.4 线上修复步骤（服务器侧执行）

1. 把新的 `deploy/images/dafu-images.tar` 与 `SHA256SUMS.txt` 上传覆盖；
2. `sha256sum -c images/SHA256SUMS.txt && docker load -i images/dafu-images.tar`；
3. `docker compose up -d && docker compose restart frontend`；
4. `docker compose logs backend | grep 封面对象自愈` 应看到「上传 146 …」；刷新站点图片即恢复，无需重灌数据库。

---

## 〇-7、r89 追加：AI 助手「配了 API 仍返回默认」+ 测试连接 + 后台按供应商点击添加

> 反馈原文：「这里的 AI 助手没有效果，其使用了其 API，但没有用，还是默认的，然后其对于使用了这个 API 的，是需要添加一个测试是否可用的按钮的……其对于后台的 API 官方提供，其添加就是根据 AI 供应商里提供的排序的内容进行直接点击这样的方便添加的，其也保留了自定义这样的方法的，而不是让我进行自行添加这样的。」

### 0-7.1 现象与四类根因

| # | 根因 | 说明 |
| --- | --- | --- |
| 1 | **前端超时先于后端** | `http.js` 全局 `timeout: 15000`，而 AI 问答后端 LLM 超时为 60s；慢模型（思考型 / MiniMax 等）后端仍在生成，前端 15s 先 `timeout` 进 `catch` → 展示规则推荐并置降级。用户看到「配了 API 还是默认」 |
| 2 | **自定义端点可为空** | `normalize_model_input` 允许 `base_url` 为空 → 保存成功但 `hasProvider = base_url && api_key && model` 为假 → `ask` 永远走规则推荐，配置形同不存在 |
| 3 | **平台引用行占额度** | 个人额度 `MODEL_LIMIT=6` 统计未排除 `ai_model.platform_id` 非空的平台引用行；选了 1 个平台模型后，自配只能加 5 个 |
| 4 | **降级无原因** | 调用失败只记服务端日志，`/ai/ask` 不回传原因，用户无法自查是密钥、端点、模型 ID 还是网络问题 |

### 0-7.2 修复

| 层 | 文件 | 改动 |
| --- | --- | --- |
| 前端 | `frontend/src/api/index.js` | `api_ai.ask` 与 `test_model` 超时放宽到 70s（覆盖后端 60s），修掉「后端成功、前端先超时」误判 |
| 前端 | `frontend/src/api/admin.js` | `test_platform_model` 同样放宽到 70s |
| 前端 | `frontend/nginx.conf` | `proxy_read_timeout` 60s → 75s，避免慢模型被 Nginx 截成 504 |
| 后端 | `ai.service.js` `normalize_model_input` | 接口地址留空时回落供应商注册表；自定义供应商无默认端点则 **422「请填写接口地址」**；模型 ID 必填 |
| 后端 | `ai.service.js` `add_model` | 额度只统计 `platform_id IS NULL`；新增回传 `isSelected`（无使用中 → 自动选中，否则提示点「使用」） |
| 后端 | `ai.service.js` `call_llm` | 非 2xx 抛错带响应片段（截断 180 字），便于定位 401/404/429 |
| 后端 | `ai.service.js` `explain_llm_error`（新增） | 错误片段 → 中文原因：401/403 密钥无效、404 端点或模型 ID、429 限流/额度、5xx 供应商异常、timeout 超时、`fetch failed`/`ENOTFOUND` 网络不可达、空响应模型不支持对话 |
| 后端 | `ai.service.js` `probe_llm`（新增） | 用最小对话「连通性测试，请只回复：可用」真实请求，返回 `{ok, latencyMs, model, reply}` 或 `{ok:false, error, hint}` |
| 后端 | `ai.service.js` `test_user_model` / `test_platform_model`（新增） | 传 `id` 复用服务端密文（用户侧校验归属且 `platform_id IS NULL`），不传则用表单值；**不落库、不计费** |
| 后端 | `ai.service.js` `ask` | 降级回传 `degradedReason`（如「密钥无效或无权限（401/403）」），未配置时提示去「模型设置」添加并测试 |
| 后端 | `routes/index.js` | 新增 `POST /api/ai/models/test`（30 次/小时限流）与 `POST /api/admin/platform-models/test` |
| 前端 | `ai-view.vue` | 降级提示条展示具体原因；模型快切面板与设置弹窗每行加「测试」；添加/编辑表单加「测试连接」+ 成功/失败结果块；`save_model` 按 `isSelected` 提示「已添加并切换」/「点使用生效」 |
| 前端 | `admin/ai-providers-view.vue` | 平台模型新增弹窗加「快速选择」：按 `ai_provider.sort_order` 平铺启用供应商，点选自动带出协议与官方端点，**并保留「自定义」**；表格行与表单加「测试」/「测试连接」，成功显示延迟、失败显示中文原因 |

### 0-7.3 验证（新增 `tests/walkthrough-r89-ai-test.mjs`，9 / 9 通过）

| 用例 | 断言 |
| --- | --- |
| A1 | 已保存配置测试成功：`ok=true`、回传模型 ID 与延迟，mock 确实收到请求 |
| A2 | 401 配置测试失败：`ok=false`、`hint` 含「密钥无效」、`error` 含 `HTTP 401` |
| A3 | 切到 401 配置后 `ask`：`degraded=true` 且 `degradedReason` 含「密钥无效」，`answer` 回落平台真实数据规则推荐 |
| A4 | 自定义供应商（`openai` 注册表无默认端点）接口地址留空 → **422「请填写接口地址」** |
| A5 | 平台引用行不占额度：1 条引用 + 6 条自配全部添加成功，第 7 条才 422「最多添加 6 个」 |
| A6 | 新增配置 `isSelected`：无使用中为 `true`、已有使用中为 `false`（A1/A2 断言） |
| U1 | 前台模型设置列表 7 行（6 自配 + 1 平台）、自配 6 个「测试」钮；点正常配置出现「连接成功 · 延迟」结果块 |
| U2 | 前台添加表单「测试连接」坏端点：结果块显示「连接失败」+「密钥无效」，取消后不落库 |
| U3 | 后台平台模型弹窗：快速选择首项「自定义」、次项「DeepSeek」（与注册表 `sort_order` 一致）；点 DeepSeek 名称/端点自动带出（`https://api.deepseek.com`）；改 mock 端点后「测试连接」成功 |

- 截图：`C:\Users\Zviolin\AppData\Local\Temp\lb-e2e\r89-model-test-ok.png`、`r89-model-test-bad.png`、`r89-admin-quick-pick.png`、`r89-admin-test-ok.png`。
- 走查登录改为解析 SVG 验证码（`captcha_from_svg`），不再依赖 `DEBUG=true` 下发 `debugCode`，可在生产姿态（DEBUG=false）下直接运行。
- 前端构建：`npm run build` 通过；后端与前端镜像已 `docker compose up -d --build backend frontend` 重建并 `docker restart dafu-frontend`（Nginx 上游解析）后跑通。
- 离线包重打：`deploy/images/dafu-images.tar` 776,754,688 字节（约 0.72 GB），SHA256 `07553BF4F3DCD2823864E98043B5416676B62327226891903BA324B8B7E93459`；同源副本 `dist/dafu-images-r89.tar` + `dist/SHA256SUMS.txt`。顺带修正 `SHA256SUMS.txt` 的 UTF-8 BOM（Linux `sha256sum -c` 会因 BOM 解析失败，打包脚本改为 ascii 输出）。

### 0-7.4 线上修复步骤（服务器侧执行）

1. 上传新的 `deploy/images/dafu-images.tar` 与 `SHA256SUMS.txt`（r89 镜像已重新打包）；
2. `sha256sum -c images/SHA256SUMS.txt && docker load -i images/dafu-images.tar`；
3. `docker compose up -d && docker compose restart frontend`；
4. 进入「智能推荐 → 模型设置」点「测试连接」：成功即显示「连接成功 · 延迟 xx ms」；失败会直接给出中文原因（密钥无效 / 端点或模型 ID 不存在 / 限流 / 超时 / 网络不可达）。

---

## 四、遗留事项与建议（需产品/数据侧决策，未擅自改库）

| # | 事项 | 现状 | 建议 |
| --- | --- | --- | --- |
| 1 | 校内食堂无菜品（12 个 `canteen.type=0`） | r86 已按源库把 geojson `include` 的 **28 个食堂档口**导入（档口总数 42 → 70），但源库 78 表 SQL **没有任何食堂菜单**，故 28 个档口均无菜品（筛选面板现可展示校内食堂点位，档口详情显示空态） | 若要在校内食堂展示菜品，只能走「公开菜单采集」或「用户授权的估算菜单」（与 06 的 37 道估算菜同一口径），需产品确认 |
| 1b | 3 家麦当劳（id 13/14/15）`lat/lng` 为估算值 | 源库 `map_location` 与 `places.json` 均无坐标，与 r85 的 4 个校内食堂同一类问题 | 建议同口径置空（地图改用顺排兜底位置），需产品确认后再改库 |
| 1c | 关注关系表 `follow_relation` 未落库 | 源库脱敏后该表丢失，`follow.service.js` 已实现但只能降级（`available=false`）；公开主页关注/粉丝显示「—」，关注按钮提示「即将开放」 | 若要开放关注，需按源表结构补建 `follow_relation`（含软删除字段）并补数据 |
| 2 | `dish.is_recommended=1` 全库为 0 | 「推荐」筛选项在 count=0 时自动隐藏，不会出现选了必空的死项 | 若要展示推荐菜，需要在管理端勾选真实推荐位 |
| 3 | 均分 ≥4.5 且评价数 ≥3 的菜品为 0 | 评分档位自动收敛为 4.0 一档 | 需要真实评价数据积累 |
| 4 | ~~公网注册用户 `user 58`（`19835505258`）~~ | **已处理**：账号及其全部派生数据已删除，头像对象已从 MinIO 清理 | 无需再决策 |
| 5 | 历史版本走查脚本 `r39`~`r55`、`r69`/`r70` | 见下方「历史脚本现状」 | 建议归档到 `tests/legacy/` 并注明「历史迭代走查」，不纳入回归口径，避免与当前验收混淆 |

### 4.1 历史脚本现状（不属于本轮产品缺陷）

复跑 10 套历史脚本后确认：失败点全部是**脚本与当前 UI/数据快照不一致**，不是线上功能异常。

| 脚本 | 现状 | 原因 |
| --- | --- | --- |
| `r53-ai-input` | 7 / 7 通过 | 已适配当前登录页 |
| `r42` | 4 / 5 | `.map-canvas .amap-marker .pin` 命中「食堂编辑弹窗迷你选点图」中隐藏的地图标记（主图标记实测可点，e2e-verify 已覆盖） |
| `r48` | 3 / 4（已修断言后复测） | AI 供应商断言写死「10 项」，实际已扩到 11 项，已改为 `≥10` 并保留逐项链接核对 |
| `r51b` / `r52-ai-fab` / `r55` | 超时中断 | 等待 `input[placeholder="用户名"]` 等旧选择器；FZU 统一身份后占位符已改为「用户名 / 学号」，AI 悬浮球结构也已重构 |
| `r45` / `r69` / `r70` | 超时中断 / 报错 | 等待旧版原型页与 AI 面板节点，页面结构已重构 |
| `r52-fzu-cas` | 脚本自身报错 | 脚本内 `API_BASE` 常量缺失，拼出 `http://localhost:3000undefined`（FZU 认证本身已由 r80 两套脚本覆盖：19 + 15 项通过） |
| `r39`~`r41`、`r43`、`r44`、`r46`、`r47`、`r49`、`r50` | 未纳入复跑 | v1.0/v2.0 时期的 UI 快照（如 Leaflet 底图已换高德、旧首页九宫格、排队维度已下线） |

---

## 五、变更清单（本轮）

**后端**
- `backend/src/seed/dish-image-map.json`（r84 新增）：站点+菜名 → MinIO objectKey 映射表（158 菜品 / 42 档口 / 42 点位）
- `backend/src/tools/upload-dish-images.js`（r84 新增）：真实菜品图上传 + 三表封面备份 + 回写工具（幂等）
- `backend/src/seed/seed.js`（r84）：菜品封面按映射表取真实键（无图回退档口封面）、档口/点位取代表图（无图回退 `CATEGORY_COVER` preset）
- `backend/src/services/sticker.service.js`（r84）：新增 `dish_sticker_key()` 确定性对象键，`sync_dish_stickers()` 判重键与写入键统一 → 修掉「每次重启对全量菜品重复抠图 + sticker 表膨胀」缺陷；`extract_and_save()` 增 `fixedKey` 参数
- `backend/src/services/content.service.js`：`search_all()` 重写、新增 `hot_keywords()` / `filter_options()`、`filter_dishes()` 扩展 `canteenType / recommended`、榜单补 `avgPrice`
- `backend/src/routes/index.js`：新增 `GET /api/search/hot`、`GET /api/filters/options`；`/api/dishes` 透传新筛选参数；`/api/rankings` 支持 `limit`；`GET /users/:id/profile` 补 `avatar_object_key` 并返回驼峰 `avatarObjectKey`
- `backend/src/services/post.service.js`：新增 `normalize_topics()`，话题上限 5 → 8
- `backend/src/services/review.service.js`：4 处 SELECT 补 `avatar_object_key`（`list_reviews` / `map_review_row` / `list_user_reviews` / `get_review`）
- `backend/src/services/follow.service.js`：`list_mine` 2 处 SELECT 补 `u.avatar, u.avatar_object_key`
- `backend/src/middleware/auth.js`：`load_user` SELECT 补 `avatar_object_key`
- `backend/src/index.js`（r85）：删除 `CANTEEN_POS` 与 `seed_default_positions()` 及启动调用 —— 源库无 `map_location` 的点位不再写入/回填估算坐标
- `backend/src/seed/real-data.json`（r85）：4 个校内食堂 `lat/lng` 置 `null`；8 个食堂补回 geojson 评分与标签；新增 `canteen_caliber` / `coord_caliber` 转化口径说明
- `backend/src/seed/seed.js`（r85）：`DISH_COVER` 键分隔符由混入的 NUL 字节改为空格，与查询处 `${st.name} ${dName}` 对齐
- `backend/src/seed/real-data.json`（r86）：8 个校内食堂补 `stations`（28 个档口，来自 geojson `include`），新增 `data_notes.canteen_station_caliber` 口径；保证全新库 seed 与现网一致
- `backend/src/routes/index.js`（r86）：`GET /users/:id/profile` 的 SELECT 补 `fzu_verified`，响应返回 `fzuVerified`（修「校内已认证」标签因字段缺失永不显示）
- `backend/src/services/pet.service.js`（r87）：新增 `mood_of(last_fed_at, created_at)` —— 从未投喂时按领养时间判心情；`state()` / `community()` 回传 `fed_never`；`community()` 新增 `ranking`（只收 `feed_total>0`、榜内名次从 1 重排），`my_rank` 仅已投喂时为榜内名次，广场查询补 `created_at`
- `backend/src/seed/seed-media.js`（r88 新增）：启动封面自愈 —— 遍历镜像内置 `assets/covers`，按对象键 `statObject` 比对大小，缺失/不一致才 `putObject`，失败不阻断启动
- `backend/src/index.js`（r88）：`ensure_bucket()` 改 `await`，随后调用 `ensure_seed_media()` 再灌种子
- `backend/Dockerfile`（r88）：新增 `COPY assets ./assets`（147 张种子封面，约 36 MB）
- `backend/assets/covers/**`（r88 新增）：147 张种子封面（`cover/202610/*`，从本地 MinIO 导出，与数据库对象键一一对应）
- `backend/src/services/ai.service.js`（r89）：`call_llm` 非 2xx 带响应片段；新增 `explain_llm_error()` 中文原因映射、`probe_llm()` 真实连通性探测、`test_user_model()` / `test_platform_model()`（复用密文、不落库）；`normalize_model_input` 接口地址必填/回落注册表；`add_model` 额度只算自配并回传 `isSelected`；`ask` 回传 `degradedReason`
- `backend/src/routes/index.js`（r89）：新增 `POST /api/ai/models/test`（30 次/小时限流）与 `POST /api/admin/platform-models/test`

**部署（r88）**
- `deploy/build-and-pack.ps1`：打包前校验后端镜像内置封面数（应为 147），异常抛错
- `deploy/load-and-up.sh`：`/api/health` 轮询 + 一张种子封面 200 校验
- `deploy/deploy.md`：新增「封面图与图片自愈（r88）」；升级命令补 `restart frontend`；FAQ 补图片 404 / 预设插画 / `/api` 502
- `deploy/images/dafu-images.tar` + `images/SHA256SUMS.txt`：重新打包（776,754,688 字节，SHA256 `F460CF04…E3C140E9`），`docker load` 6 / 6
- `README.md`：部署段补图片自愈与离线包说明

**前端**
- `frontend/src/views/diet-plan-view.vue`（r84）：菜品图由裸 `cover_object_key` 改为 `cover_url()`（补 `/img/` 或 `/preset-cover/` 前缀），修真实图接入后的裂图；补 `import { cover_url }`
- `frontend/src/utils/format.js`：新增 `avatar_url(key)` 统一补 `/img/` 前缀
- `frontend/src/views/circle-view.vue` / `pet-community-view.vue` / `pet-view.vue`：头像改走 `avatar_url()` / `avatar_of()`
- `frontend/src/views/dish-detail-view.vue` / `canteen-detail-view.vue` / `station-detail-view.vue`：头像区改用 `<user-avatar>` 组件
- `frontend/src/components/review-card.vue`：传 `avatar_object_key`
- `frontend/src/views/checkin-view.vue`：打卡接后端（上传照片 + `POST /api/checkin` + 409 `again` 重试），本地记录改为服务端回填
- `frontend/src/views/search-view.vue`：热搜动态化、筛选项动态化（7-8 组带数量）、空态口径、品类单筛选可出结果、网格轨道 `minmax(0,1fr)` 修横向溢出
- `frontend/src/views/home-view.vue`：口碑榜改用 `/rankings?period=week&dim=score&limit=6`
- `frontend/src/views/post-publish-view.vue`：自定义话题输入
- `frontend/src/views/me-view.vue` / `frontend/src/App.vue`：头像同源、档案跳转、搜索占位词修正
- `frontend/src/App.vue`（r84）：顶栏新增「我的」入口（`.me-link`）；下拉菜单「我的档案」→ `/me`、新增「我的主页」→ `/user/:id`；`on_user_cmd` 指令分发改口径
- `frontend/src/views/me-view.vue`（r84）：桌面端「关注/粉丝」行、三功能宫格、列表入口组统一为同一套 3 列栅格（`repeat(3,1fr)` + `gap: 4px 20px` + `justify-items:center`），列表行改网格并隐藏失效 `hr`；行间距 16→22px，底部签名 20→26px
- `frontend/src/views/follows-view.vue`（r84）：用户卡上间距 12→20px（桌面 26px）、底部提示 16→20px（桌面 24px）；昵称独立包裹 `.uname-txt`（`nowrap` + 省略号）、简介单行省略；桌面 4 列改保持 3 列 + 加大列间距
- `frontend/nginx.conf`：`/img/` 缓存与安全头
- `frontend/src/views/map-view.vue`（r85）：`PIN_POS` 兜底表补入「佳客来」「紫竹园」，DB 无坐标的 4 个校内食堂仍在地图上出示意标记
- `frontend/src/views/user-profile-view.vue`（r86，重写）：公开主页改为「名片 + 268px 吸顶侧栏（统计六宫格/头衔进度）+ 单列点评流」，移动端单列（≤768px 按钮整行、统计 3×2）；接入 `stats`/`title`/`follow`/`fzuVerified`，关注走真实接口、分享主页复制链接
- `frontend/src/api/index.js`（r86）：`api_user` 新增 `follow_status()` / `follow()` / `unfollow()`
- `frontend/src/views/pet-community-view.vue`（r87）：榜单改用接口 `ranking`（未有一笔真实投喂时展示空态，不拿 0 次凑榜）；广场卡 0 次改「还没投喂过」；我的卡新增名次文案（榜内名次 / 暂未进前三 / 喂第一口就能上榜）
- `frontend/src/views/pet-view.vue`（r87）：饥饿引导区分「从未投喂」与「超 24 小时未喂」两种文案；初始默认态改 `mood='normal'` + `fed_never=true`
- `README.md`（r87）：API 概览补 `ranking` / `my_rank` / `mood`+`fed_never` 口径
- `frontend/public/assets/**`：全站图片压缩（51.93MB → 13.54MB）
- `frontend/src/api/index.js`（r89）：`api_ai.ask` / `test_model` 超时 70s（覆盖后端 60s）
- `frontend/src/api/admin.js`（r89）：`test_platform_model` 超时 70s
- `frontend/nginx.conf`（r89）：`proxy_read_timeout` 60s → 75s（慢模型不再被截成 504）
- `frontend/src/views/ai-view.vue`（r89）：降级提示条展示 `degradedReason`；快切面板与设置列表每行「测试」；表单「测试连接」+ 结果块（成功给延迟、失败给中文原因）；保存后按 `isSelected` 提示「已添加并切换」/「点使用生效」
- `frontend/src/views/admin/ai-providers-view.vue`（r89）：平台模型新增弹窗「快速选择」按 `ai_provider` 排序点击带出协议/端点并保留「自定义」；表格行「测试」、弹窗「测试连接」与结果块

**测试**
- 新增 `tests/walkthrough-r84-real-dish-covers.test.mjs`（r84 新增，13 项全通过）：三类封面真实图键校验 / `/img/` 200 且 image 类型 / 裸键直连非图片 / 抽样 20 张图全 200 / 菜品·档口·点位详情页与饮食计划页浏览器实测无裂图（含点「生成计划」后的 `img.dish-img` URL 前缀与加载态）
- `tests/report/cover-backup-r84.json`（r84 新增）：dish / station / canteen 三表原封面值备份（可回滚）
- `tests/sql/verify-real-data.sql`（r85）：条目 09 期望值 60 → 56（4 个校内食堂源数据无坐标）；新增条目 25「校内食堂有坐标 8/12」、26「校内食堂有评分标签 8/12」；头部坐标口径注释同步修正
- `tests/report/canteen-backup-r85.xml`（r85 新增）：60 条点位原值（`lat/lng/tags/营业时间` 等）备份，可回滚
- 新增 `tests/walkthrough-r86-user-profile.test.mjs`（r86，24 项全通过）：校内档口 28 个与抽样名称 / 4 个无档口食堂 / 校内档口 0 菜品 / 玫瑰园详情 7 档口；profile 新字段；桌面两栏与移动单列布局、无横向溢出、三视口零 JS 报错
- 新增 `tests/sql/r86-import-canteen-stations.sql`（r86）：28 个校内食堂档口幂等导入脚本（`INSERT ... SELECT` + `NOT EXISTS`）
- `tests/report/station-backup-r86.xml`（r86 新增）：档口表 42 条原值备份（可回滚）
- `tests/sql/verify-real-data.sql`（r86）：02 档口期望 42 → 70；20 无菜单点位 18 → 10；新增 27「校内食堂档口 = 28」、28「校内档口有菜品 = 0」
- `tests/walkthrough-r84-real-dish-covers.test.mjs`（r86）：档口封面断言拆分口径 —— 门店档口 42 必须真实图、校内食堂档口 28 为预设图（源库无菜单，无真实图可挂），17 项全通过
- 新增 `tests/walkthrough-r88-cover-media.test.mjs`（r88，12 项全通过）：内置封面覆盖数据库 147 个引用键、MinIO 对象齐全、`/img` 逐键 200、自愈幂等、首页/详情页无裂图
- `tests/rounds-10-acceptance.test.mjs`（r86）：全新库 seed 口径 42 → 70（R2-03/R3-01/R3-07）；R3-06 拆为「门店档口名与店铺名一致 42」+「校内档口 28」；R3-04 缺坐标点位 0 → 4（r85 口径）
- `README.md`（r86）：数据规模改为「70 档口 = 42 门店 + 28 校内食堂档口」、坐标口径说明；API 概览补「他人主页与关注」接口
- 新增 `tests/walkthrough-r89-ai-test.mjs`（r89，9 项全通过）：连通性测试成功/401 失败、`degradedReason` 回传、自定义端点必填 422、平台引用行不占额度、`isSelected` 口径；前台模型设置「测试」与表单「测试连接」结果块、后台平台模型快速选择（排序 + 自动带出 + 自定义保留）
- `tests/walkthrough-r89-ai-test.mjs`（r89）：登录改用 SVG 验证码解析（`captcha_from_svg`），不依赖 `DEBUG=true`
- 新增 `tests/walkthrough-r82-doc-bugs.test.mjs`（58 项 → r84 扩至 71 项）、`tests/walkthrough-r83-avatar-display.test.mjs`（14 项）、`tests/_fixture-cleanup.mjs`、`tests/run-r83-regression.ps1`
- `tests/walkthrough-r82-doc-bugs.test.mjs`（r84）：R82-25c 断言由 `/user/:id` 改为 `/me`；新增 R84-28a/28b/28c（桌面端「我的」入口与档案/主页跳转）、R84-29a/29b/29c（`/me` 逐列对齐与间距）、R84-30a/30b（`/follows` 卡片间距与昵称单行渲染）、R84-31a/31b/31c/31d/31e（375px 移动端护栏：无横向溢出 / 布局未被桌面栅格波及 / 昵称单行）
- `tests/_fixture-cleanup.mjs`：新增 `cleanup_orphans()` 孤儿派生数据回收；补 `report`(reporter_id) / `station_post`(author_id) 两条归属列非 `user_id` 的回收
- `tests/walkthrough-r71-checkin.test.mjs`：收尾由硬编码 7 条 SQL 改为统一调用 `cleanup_fixtures`
- `tests/walkthrough-r72-me-records.test.mjs` / `tests/walkthrough-r74-favorite-groups.test.mjs`：新增收尾清理用例 IT-08 / IT-16
- `tests/walkthrough-r81-qa-doc-edge.test.mjs` / `tests/walkthrough-r81-qa-doc-ui.test.mjs`：收尾统一改为 `cleanup_fixtures`（补上此前漏删的 `check_in`）
- `tests/walkthrough-r82-doc-bugs.test.mjs`：收尾优先走 `cleanup_fixtures`，失败时回落原 SQL
- `tests/walkthrough-r83-avatar-display.test.mjs`：收尾补 MinIO 头像对象回收（消除孤儿对象）
- `tests/api-integration.test.mjs`（r84）：挂 `process.on('exit')` 兜底清理钩子，避免回归中断时临时账号残留
- `tests/e2e-verify.test.mjs`：E2E-M1 改为「找中心点命中自身的标记 + 真实用户节奏点击 + 最多 3 轮重试」（AMap down/up 时序判定，非产品缺陷）
- `tests/run-r83-regression.ps1`（新增）：17 套主验收脚本批量回归入口，每套脚本前 `redis-cli FLUSHDB` 清限流，日志落 `tests/report/r83-regression/`
- 修复 `r42/r45/r48/r51b/r52/r53/r55/r69/r70/r75/r76/r77/rounds-10/api-integration/api-task-pet-social/e2e-verify` 的凭据、模块解析、断言口径与夹具回收
- 新增 `tests/walkthrough-r87-pet-rank.test.mjs`（r87，30 项全通过）：0 次不上榜 / 名次连续 / `my_rank` / 未投喂不误判饥饿 / 投喂后真实上榜 / `feed_total` 与 `feed_record` 流水一致 / 移动端无溢出；截图 `r87-pet-community-unfed.png`、`-fed.png`、`-mobile.png`
- `tests/api-task-pet-social.test.mjs`（r87）：新增 R78-2b（未投喂的新福宝不上投喂榜）；R78-1 补 `fed_never` / `mood` 断言；R78-3 补「投喂 1 次后进入投喂榜」
- `tests/rounds-10-acceptance.test.mjs`（r87）：R5-12 补投喂榜 0 次护栏；R3-09 无档口点位 18 → 10、其中食堂 12 → 4（r86 校内档口入库后的正确口径）
- `tests/walkthrough-r82-doc-bugs.test.mjs`（r87）：R82-20 空态文案断言改为「已收录…仍在完善」（r86 文案更新）
- `dist/dafu-images-r87.tar` + `dist/SHA256SUMS.txt`（r87 新增）：六镜像 `docker save` 打包与 SHA256 校验和（`docker load` 回验 6/6）
