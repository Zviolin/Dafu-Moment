# 大福食刻 · 服务器部署指南

> 本目录（`deploy/`）提供离线镜像包、服务器编排、环境变量模板与启停脚本。服务器上不需要 Node、不需要构建，`docker load` 后一条 `docker compose up -d` 即可上线。

## 一、包内容

| 文件                       | 说明                                                                                                                                                                                       |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `images/dafu-images.tar` | 离线镜像包（r89，2026-10-30 构建）776,754,688 字节（约 0.72 GB），含 `mysql:8.0`、`redis:7-alpine`、`minio/minio:latest`、`dafu-backend:v1.0-alpha`（内置 147 张种子封面）、`dafu-frontend:v1.0-alpha`、`dafu-matting:v1.0-alpha` |
| `images/SHA256SUMS.txt` | 镜像包 SHA256 校验和（`sha256sum -c` 或 `Get-FileHash` 校验） |
| `docker-compose.yml`     | 服务器编排：六容器，不构建，只引用镜像；前端对外 8095；**matting 默认不启动（profile）**                                                                                                  |
| `.env.example`           | 环境变量模板（含数据库 / MinIO / JWT / AI / 福大 CAS），复制成 `.env` 后改                                                                                    |
| `sql/init.sql`           | MySQL 首次启动建表脚本（35 张表，与 `backend/sql/init.sql` 同步）                                                                                            |
| `build-and-pack.ps1`     | Windows 侧构建 + 打 tag +`docker save` 打包                                                                                                                                              |
| `load-and-up.sh`         | Linux 侧加载镜像 + 启动 + 健康检查                                                                                                                                                         |
| `deploy.md`              | 本文档                                                                                                                                                                                     |

## 二、环境要求

| 项     | 要求                                           |
| ------ | ---------------------------------------------- |
| 系统   | Linux（Ubuntu / Debian / CentOS 均可）         |
| Docker | 20.10 及以上，含 `docker compose` 插件       |
| 架构   | x86_64（amd64）                                |
| 端口   | 对外只开**8095**；后端 3000 不对公网暴露 |
| 资源   | 内存 ≥ 4 GB，磁盘 ≥ 10 GB                    |

```bash
docker --version
docker compose version
```

## 三、快速开始

把整个 `deploy/` 上传到服务器，例如 `/opt/dafu`：

```bash
cd /opt/dafu
cp .env.example .env
sha256sum -c images/SHA256SUMS.txt     # 校验镜像包完整性（Windows 侧用 Get-FileHash）
docker load -i images/dafu-images.tar
docker compose up -d
docker compose ps
curl -I http://localhost:8095/
```

默认启动 **五个容器**（mysql / redis / minio / backend / frontend），`curl` 返回 200 即主链可用。首次启动 MySQL 会自动执行 `sql/init.sql`，后端 `seed_if_empty()` 自动灌种子数据。

抠图容器默认不启动，2 GB 内存机器上它加载模型会 OOM（容器 `Restarting (137)`）。需要在线抠图时再单独拉起：

```bash
docker compose --profile matting up -d matting
docker compose logs -f matting
```

### 抠图方案怎么选

| 方案 | 内存 | 说明 |
| -- | -- | -- |
| 离线预生成贴纸（推荐） | 0 | 用 `tools/make-stickers.py` 本地批量抠图，PNG 存 MinIO 或静态目录，运行期不跑模型 |
| **`u2net`（当前默认）** | 批量峰值约 1.39 GB | 边缘明显比 u2netp 干净；2 GB 机器需 2 GB swap，或仅演示时单独起 |
| `u2netp` 轻量模型 | 批量峰值约 0.93 GB | 单张约 0.8s；宽幅锅类会留桌面，质量一般 |
| 免费/试用 API | 0 本地 | remove.bg 每月少量免费预览、Clipdrop/Photoroom 有试用额度；都要密钥与公网，额度用完即失败 |
| 不启用 | 0 | 设计允许“抠图不可用不影响主链”，贴纸功能降级 |

## 四、常用配置

### 换对外端口

改 `docker-compose.yml` 里 `frontend` 的 `"8095:80"`，例如：

```yaml
        ports:
            - "9090:80"
```

改完 `docker compose up -d`。

### 安全组 / 防火墙

| 场景      | 操作                                                                                |
| --------- | ----------------------------------------------------------------------------------- |
| 云安全组  | 入方向放行 TCP 8095                                                                 |
| ufw       | `sudo ufw allow 8095/tcp`                                                         |
| firewalld | `sudo firewall-cmd --permanent --add-port=8095/tcp && sudo firewall-cmd --reload` |

### 局域网 / 公网访问（Windows 本机演示）

前端只用相对路径 `/api`、`/img`，由 Nginx 反代，换 IP/域名无需重新构建前端。

| 场景 | 做法 |
| --- | --- |
| 局域网（推荐，已验证） | 管理员运行下面的端口转发 + 防火墙命令，其他设备访问 `http://<本机局域网 IP>:9080` |
| 局域网直连 8095 | 管理员运行 `deploy/open-lan-access.ps1`；WSL2 镜像网络下宿主机自测可能不通，但外部设备通常可访问，未实测前请优先用 9080 |
| 公网临时演示 | `cloudflared tunnel --url http://localhost:8095 --config deploy/cloudflared-quick.yml`，输出 `https://xxx.trycloudflare.com` |
| 公网固定域名 | 用已有命名隧道：改 `~/.cloudflared/config.yml` ingress 为 `service: http://localhost:8095`，再 `cloudflared tunnel run my-computer` + `cloudflared tunnel route dns` |

局域网端口转发（管理员 PowerShell，8095 被 WSL2 镜像网络占用时用 9080 对外）：

```powershell
# 新增（9080 对外 → 容器 8095；8080 已被占用时换 9081 等）
netsh interface portproxy add v4tov4 listenport=9080 listenaddress=0.0.0.0 connectport=8095 connectaddress=127.0.0.1
netsh advfirewall firewall add rule name='Dafu-Moment LAN 9080' dir=in action=allow protocol=TCP localport=9080 profile=any

# 撤销
netsh interface portproxy delete v4tov4 listenport=9080 listenaddress=0.0.0.0
netsh advfirewall firewall delete rule name='Dafu-Moment LAN 9080'
```

> 说明：Docker Desktop 的 WSL2 镜像网络（`networkingMode=mirrored`、`firewall=true`）会在宿主机共享网络栈里占用 8095，
> 宿主机 `netstat` 看不到该监听、且「宿主机访问自己的局域网 IP」会被拒；`portproxy` 走独立 Windows 监听，实测 200。
> 换 WiFi 后局域网 IP 变化不影响 9080 转发（`listenaddress=0.0.0.0`），但需按新 IP 分享地址。

公网注意事项：

- 快速隧道域名是**临时**的，重启即换；给同学长期用请走命名隧道 + 自有域名。
- 部分校园网 DNS 不解析 `*.trycloudflare.com` 子域（本次本机解析为 NXDOMAIN，换 8.8.8.8 可解析），分享时可提示对方换网络或改用固定域名。
- 暴露前确认 `DEBUG=false`（验证码接口不应返回 `debugCode`）、管理员口令已轮换、`.env` 中的 `JWT_SECRET` 为强随机串，并把隧道域名加入高德 Web key 域名白名单。
- 演示桩初始口令按需要选择：设 `FZU521` 时登录页会直接展示并自动填入（演示最省事，但任何人可凭它用任意 **9 位学号**建号，格式校验已与福大学号口径一致）；若要收敛，改为随机值并让 `GET /api/auth/fzu/cas/mode` 不再下发（需改 `routes/index.js` 的 demo 分支）。

### 公网暴露加固项（本项目已落地）

| 项 | 现状 |
| --- | --- |
| `JWT_SECRET` | 移入 `.env`（64 位随机）；默认值仅兼容本地，公网必须覆盖 |
| `FZU_CAS_INITIAL_PASSWORD` | 移入 `.env`；当前按演示口径显式设为 `FZU521`（`/api/auth/fzu/cas/mode` 会公开下发，登录页自动填充） |
| 管理员口令 | 已从 `admin123` 轮换为强口令（哈希落库，明文仅管理员保管） |
| 真实客户端 IP | Nginx 透传 `X-Forwarded-For`，后端 `trust proxy=2`；实名限流按 IP 分桶（否则全站共享一个桶） |
| 安全响应头 | `X-Content-Type-Options` / `X-Frame-Options` / `Referrer-Policy`（每个 location 重复声明，Nginx 不与父级合并） |

### 必改的四个值

`DB_PASSWORD`、`MINIO_PASSWORD`、`JWT_SECRET`、`AI_ENC_KEY`。`AI_ENC_KEY` 不配会回落 `JWT_SECRET` 派生，生产必须单独配置。`AI_BASE_URL` / `AI_API_KEY` / `AI_MODEL` 留空时 AI 走降级，不影响主链；也可让用户在前台「智能推荐 → 模型设置」自配，或由后台「AI 供应商管理」配置平台托管模型（均可用「测试连接」验证）。

福大登录：`FZU_CAS_BASE_URL` 与 `FZU_CAS_SERVICE` 均留空 → 演示桩模式（学号 + `FZU_CAS_INITIAL_PASSWORD`）；两者都配置 → 真实 CAS 3.0（`FZU_CAS_VALIDATE_PATH` 默认 `/serviceValidate`）。演示桩初始口令公网务必改成不公开的强口令。部署编排里 `DEBUG` **固定为 false**（验证码接口不返回 `debugCode`），与本地开发用的环境变量开关互不影响。

### 封面图与图片自愈（r88）

种子数据只把图片对象键（如 `cover/202610/xxx.jpg`）写进数据库，图片文件本身不在 SQL 里。若服务器 MinIO 是空桶，前端 `/img/<key>` 会全部返回 404 `NoSuchKey`，页面只剩裂图/默认占位。

r88 起后端镜像内置 `assets/covers/`（147 张、约 36 MB），启动时先建桶再执行封面自愈：逐个比对对象键，缺失或大小不一致才上传，内容哈希键天然幂等。日志形如：

```text
[minio] 桶就绪（公共读）
[minio] 封面对象自愈：内置 147，上传 147，已存在 0，失败 0（xx ms）   # 空桶首次启动
[minio] 封面对象自愈：内置 147，上传 0，已存在 147，失败 0（xx ms）   # 再次重启
```

正常启动约 10 秒内完成，不需要手工灌图。若仍 404，先看这行日志的「失败」数，以及 MinIO 账号密码是否与 `.env` 一致。18 个无实拍图的点位（12 个校内食堂 + 3 家麦当劳 + 3 家门店）按设计使用 `preset:` 预设插画，不是缺图故障。

### AI 助手配置与排查（r89）

若「配了 API 却一直返回默认推荐」，按下面顺序定位：

1. 前台「智能推荐 → 模型设置」里，每个已保存模型都有「测试」按钮；添加/编辑表单有「测试连接」。测试会真实发一次最小请求（不落库、不计费）：成功显示「连接成功 · 延迟 xx ms」，失败直接给出中文原因，并把原始错误片段附在下方。
2. 常见原因：`密钥无效或无权限（401/403）` → 换 Key 或确认开通；`接口地址或模型 ID 不存在（404）` → 核对供应商文档（OpenAI 兼容地址通常以 `/v1` 结尾）；`触发限流或额度不足（429）` → 充值/降速；`请求超时` / `网络不可达` → 检查服务器出网与代理。
3. 后台「AI 供应商管理 → 平台模型」支持按供应商注册表排序点击快速添加（自动带出协议与官方端点，也保留「自定义」），保存前同样可「测试连接」。
4. 超时链路已对齐：后端 LLM 60s → 前端 axios 70s → Nginx `proxy_read_timeout` 75s。旧版本前端 15s 会先超时并把慢模型误判为不可用（r89 已修）。
5. 个人自配上限 6 条；平台模型的引用行不占额度（r89 修正）。

未配置或调用失败时，`/api/ai/ask` 会返回 `degraded: true` + `degradedReason`，前台提示条展示原因并回落规则推荐，属于设计内的可用降级，不是白屏故障。

## 五、数据与运维

| 卷                    | 内容         |
| --------------------- | ------------ |
| `dafu_mysql-data`   | 数据库文件   |
| `dafu_minio-data`   | 用户上传图片 |
| `dafu_redis-data`   | Redis AOF    |
| `dafu_u2net-models` | 抠图模型缓存 |

| 操作       | 命令                                                                                                                 |
| ---------- | -------------------------------------------------------------------------------------------------------------------- |
| 看状态     | `docker compose ps`                                                                                                |
| 看后端日志 | `docker compose logs -f backend`                                                                                   |
| 备份 MySQL | `docker exec dafu-mysql mysqldump -uroot -p"$DB_PASSWORD" dafu > dafu-$(date +%F).sql`                             |
| 备份 MinIO | `docker run --rm -v dafu_minio-data:/data -v $(pwd):/backup alpine tar czf /backup/minio-backup.tar.gz -C /data .` |
| 重启       | `docker compose restart`                                                                                           |
| 停止       | `docker compose down`（保留卷）                                                                                    |
| 升级       | `sha256sum -c images/SHA256SUMS.txt && docker load -i images/dafu-images.tar && docker compose up -d && docker compose restart frontend`                                                    |

> 升级后必须重启 frontend：Nginx 在启动时解析上游容器地址，backend 换镜像重建后 IP 变化，若不重启 frontend 会出现 `/api` 502（图片走 MinIO 不受影响）。也可直接用 `docker compose down && docker compose up -d`（保留数据卷）。升级完成后 `docker compose logs backend | grep 封面对象自愈` 可确认图片已补齐。

**禁止 `docker compose down -v`**：`-v` 会删掉四个数据卷，等于清库。

## 六、回滚

```bash
docker tag dafu-backend:v1.0-alpha  dafu-backend:rollback
docker tag dafu-frontend:v1.0-alpha dafu-frontend:rollback
# 修改 .env 的 DAFU_TAG=rollback
docker compose up -d
```

回滚只换 backend / frontend / matting，不动 mysql、redis、minio 的数据卷。

## 七、常见问题

| 现象                                     | 原因与解决                                                           |
| ---------------------------------------- | -------------------------------------------------------------------- |
| `port is already allocated`            | 8095 被占用，改 compose 左侧端口                                     |
| `permission denied` 连 Docker          | 用户不在 docker 组：`sudo usermod -aG docker $USER` 后重新登录     |
| `no matching manifest for linux/arm64` | 镜像为 amd64，需 x86_64 服务器                                       |
| 页面打开但列表为空                       | 等 MySQL 初始化与种子导入完成，看 `docker compose logs backend`    |
| 抠图 502                                 | matting 默认不启动；需要时 `docker compose --profile matting up -d matting` |
| 图片全部裂图、`/img/...` 404 NoSuchKey   | MinIO 空桶且后端未完成封面自愈：看 `docker compose logs backend` 是否有「封面对象自愈」，确认 `.env` 的 MinIO 账号与卷未被清空；v1.0-alpha（r88 起）自带 147 张封面 |
| 图片部分显示预设插画                     | 12 个校内食堂 + 3 麦当劳 + 3 门店无实拍图，按设计使用 `preset:` 占位，不是故障 |
| `/api` 全部 502 但页面能打开              | backend 重建后 frontend 仍缓存旧上游 IP：`docker compose restart frontend` |
| matting `Restarting (137)`               | 内存不足被系统杀；加 2 GB swap，或改用离线贴纸/`u2netp` |
| AI 返回 `degraded: true`               | 未配供应商或调用失败，属可用降级；看 `degradedReason`（或前台「模型设置」点「测试」）按原因修配置（r89） |
| 数据重启后丢失                           | 确认没有执行过 `down -v`，并检查四个具名卷是否存在                 |
