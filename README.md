# TG-SignPulse

> Telegram 多账号自动签到、消息动作编排与关键词监听面板。

[English README](README_EN.md) · [健康检查](#健康检查) · [更新日志](#更新日志)

当前版本：`v0.8.6`

TG-SignPulse 是一个 Telegram 自动化管理面板。你可以在网页里管理多个账号，配置自动签到任务，并让任务按固定规则每天自动执行。

> AI 驱动：项目已集成 AI 能力（识图、计算题），可直接用于自动任务流程。

## 这个项目是做什么的？

- 统一管理多个 Telegram 账号
- 自动签到、定时发送消息、点击按钮
- 在账号卡片直接进入签到任务或消息监控，入口按账号上下文过滤
- 创建/编辑任务时支持搜索会话、多选会话，以及批量创建独立任务
- 可视化创建个人、群组、频道消息监控，支持多选会话、私聊监控、时间段和分组
- 支持 AI 识图和 AI 计算题动作
- 在网页中立即执行任务，并查看实时日志和历史执行日志
- 支持指定 Telegram 群组话题运行签到
- 支持任务剪贴板批量导入导出、全局代理、失败通知和关键词监听
- 适合 VPS 长期运行

## 项目亮点

- 多账号管理：一个面板管理多个账号
- 动作序列：支持「发送文本 / 点击文字按钮 / 发送骰子 / AI识图 / AI计算 / 关键词监听」
- 多目标任务：可从缓存会话或搜索结果中勾选多个目标；支持“一个任务多会话”或“多个独立任务”
- 可视化消息监控：可从账号卡片进入当前账号的消息监控，支持指定会话多选、私聊监控、自动回复、转发和分组展示
- 手动执行：已配置定时的任务也可在卡片上点击播放图标立即执行，不必等待调度时间
- 话题签到：支持在 Telegram Forum 群组的指定 Thread/Topic 内执行
- 任务迁移：可将当前账号下全部任务导出到剪贴板，也可一键粘贴导入并自动跳过重复任务
- 通知与状态：支持 Telegram机器人通知、关键词命中通知，以及任务执行前账号失效检测
- 日志可视化：可直接查看每次执行的流程日志和最后机器人回复
- 稳定性优化：并发控制、429/超时场景优化、长期运行内存优化
- 容器化部署：Docker / Docker Compose 开箱即用

## 功能概览

| 模块       | 能力                                                            |
| ---------- | --------------------------------------------------------------- |
| 账号管理   | 多账号登录、代理配置、状态检测、重新登录                        |
| 任务编排   | 定时/随机时间段执行，支持会话搜索、多选目标、动作序列和动作间隔 |
| 话题支持   | 群组 `Thread ID` 级别的发送与回复过滤                           |
| 关键词监听 | 可视化配置指定会话/私聊监控，命中后可通知、转发或自动回复      |
| 日志排查   | 实时运行日志、历史流程日志、最后执行结果与失败原因回看          |
| 运维能力   | Docker 部署、持久化数据目录、健康检查、配置导入导出             |

## 小白 3 步部署（推荐）

1. 安装 Docker（服务器和本机都可）
2. 执行下面命令启动容器
3. 浏览器打开 `http://服务器IP:8080`，用默认账号登录

默认凭据：

- 账号：`admin`
- 密码：`admin123`

### 一条命令启动

```bash
docker run -d \
  --name tg-signpulse \
  --restart unless-stopped \
  -p 8080:8080 \
  -v $(pwd)/data:/data \
  -e TZ=Asia/Shanghai \
  -e APP_SECRET_KEY=your_secret_key \
  ghcr.io/akasls/tg-signpulse:latest
```

### 部署自己修改后的代码

上面的命令使用的是远程官方镜像 `ghcr.io/akasls/tg-signpulse:latest`，不会包含你本地修改过的代码。若要部署自己的修改版，推荐在服务器拉取代码后本地构建镜像：

```bash
git clone https://github.com/ErkundenSie/TG-SignPulse.git TG-SignPulse
cd TG-SignPulse
```

如果服务器上已经有代码，则进入项目目录后更新：

```bash
cd TG-SignPulse
git pull
```

构建本地镜像：

```bash
docker build -t tg-signpulse:local .
```

启动本地镜像：

```bash
docker run -d \
  --name tg-signpulse \
  --restart unless-stopped \
  -p 8080:8080 \
  -v $(pwd)/data:/data \
  -e TZ=Asia/Shanghai \
  -e APP_SECRET_KEY=your_secret_key \
  -e ADMIN_PASSWORD=your_admin_password \
  tg-signpulse:local
```

如果之前已经启动过旧容器，先停止并删除旧容器：

```bash
docker stop tg-signpulse
docker rm tg-signpulse
```

以后更新自己的代码后，重新执行 `git pull`、`docker build -t tg-signpulse:local .`，再重建容器即可。只要继续挂载同一个 `data` 目录，任务、账号和配置数据不会因为删除容器而丢失。

### 更新本地构建部署

如果你是按上面的 `tg-signpulse:local` 方式部署，更新流程如下：

```bash
cd /opt/TG-SignPulse
git pull
docker build -t tg-signpulse:local .
docker stop tg-signpulse
docker rm tg-signpulse
docker run -d \
  --name tg-signpulse \
  --restart unless-stopped \
  -p 8080:8080 \
  -v $(pwd)/data:/data \
  -e TZ=Asia/Shanghai \
  -e APP_SECRET_KEY=your_secret_key \
  -e ADMIN_PASSWORD=your_admin_password \
  tg-signpulse:local
```

如果你对外使用的不是 `8080`，例如宿主机端口是 `6857`，把端口行改成：

```bash
-p 6857:8080
```

更新完成后检查容器状态和日志：

```bash
docker ps
docker logs -f tg-signpulse
```

说明：

- `docker rm tg-signpulse` 只删除容器，不会删除 `$(pwd)/data` 里的持久化数据。
- `APP_SECRET_KEY` 建议长期保持不变；随意更换可能导致已有登录态失效。
- `ADMIN_PASSWORD` 主要影响首次创建 admin 用户；如果数据库中已经存在 admin，后续修改该环境变量不一定会覆盖已有密码。

如果你走反代（如 Nginx），可改成仅本机监听：

```bash
-p 127.0.0.1:8080:8080
```

### Docker Compose 本地构建部署（推荐给修改版）

如果你要部署当前本地代码里的修改，直接使用项目自带的 `docker-compose.yml`。它使用 `build: .`，会从当前目录构建镜像，而不是拉取远程官方镜像。

推荐先在项目根目录创建 `.env`：

```env
APP_SECRET_KEY=请替换成一串长期固定的随机密钥
ADMIN_PASSWORD=请替换成你的管理员初始密码
TZ=Asia/Shanghai
HOST_PORT=8080
```

然后将 `docker-compose.yml` 配置为：

```yaml
services:
  app:
    build: .
    image: tg-signpulse:local
    container_name: tg-signpulse
    restart: unless-stopped
    ports:
      - "${HOST_PORT:-8080}:8080"
    volumes:
      - ./data:/data
    environment:
      - PORT=8080
      - APP_DATA_DIR=/data
      - TZ=${TZ:-Asia/Shanghai}
      - APP_SECRET_KEY=${APP_SECRET_KEY:-tg-signpulse-change-me}
      - ADMIN_PASSWORD=${ADMIN_PASSWORD:-admin123}
    init: true
    read_only: true
    tmpfs:
      - /tmp
    security_opt:
      - no-new-privileges:true
    cap_drop:
      - ALL
    stop_grace_period: 30s
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
```

启动或更新：

```bash
docker compose up -d --build
```

后续更新本地构建版时，推荐按下面流程执行：

```bash
cd /opt/TG-SignPulse

# 拉取最新代码
git pull

# 确认 .env 仍然存在，尤其是 APP_SECRET_KEY、ADMIN_PASSWORD、HOST_PORT 不要误删
cat .env

# 重新构建镜像并替换容器
docker compose up -d --build

# 查看容器状态和日志
docker compose ps
docker compose logs -f
```

通常不需要先执行 `docker compose down`。`docker compose up -d --build` 会用新镜像替换旧容器，只要继续保留 `./data:/data` 挂载目录，账号、任务、数据库和日志都不会丢。

如果确实想先停止并重建容器，可以执行：

```bash
docker compose down
docker compose up -d --build
```

不要执行 `docker compose down -v`，也不要删除 `data` 目录，否则可能会删除持久化数据。

如果提示 `Bind for 0.0.0.0:8080 failed: port is already allocated`，说明宿主机的 `8080` 已被占用。可以二选一处理：

```bash
# 查看哪个容器占用了 8080
docker ps --format "table {{.Names}}\t{{.Ports}}" | grep 8080

# 或直接改 .env，例如改成宿主机 18080 端口
HOST_PORT=18080
docker compose up -d --build
```

改成 `HOST_PORT=18080` 后，访问地址就是 `http://服务器IP:18080`。

查看状态和日志：

```bash
docker compose ps
docker compose logs -f
```

如果你走 Nginx / 反向代理，建议只监听本机：

```yaml
ports:
  - "127.0.0.1:${HOST_PORT:-8080}:8080"
```

说明：

- `./data:/data` 是持久化目录，账号、任务、数据库和日志都在这里；重建容器不会丢数据。
- `APP_SECRET_KEY` 建议长期固定，不要每次部署都换，否则可能导致已有登录态失效。
- `ADMIN_PASSWORD` 主要影响首次创建 `admin` 用户；数据库里已有 admin 后，改环境变量不一定覆盖已有密码。
- 面板里也可以配置“任务时区”，保存后会立即重排定时任务；`TZ` 仍建议保留为容器系统默认时区。

## 数据目录与权限说明

- 默认数据目录：`/data`
- 当 `/data` 不可写时，会自动降级到 `/tmp/tg-signpulse`（非持久化）
- 新镜像已支持根据 `/data` 挂载目录属主 UID/GID 自动适配运行身份，通常无需 `chmod 777`

容器内排查命令：

```bash
id
ls -ld /data
touch /data/.probe && rm /data/.probe
```

## 常用环境变量（简版）

- `APP_SECRET_KEY`: 面板密钥，强烈建议设置
- `ADMIN_PASSWORD`: 初次安装时 admin 账户的默认密码（安全起见强烈建议设置，未设置则默认 admin123）
- `APP_HOST`: FastAPI 容器监听 IP，防暴露默认 `127.0.0.1`（如需用公网直连或宿主机反代端口请设为 `0.0.0.0`）
- `APP_DATA_DIR`: 自定义数据目录（优先级高于面板配置）
- `TG_PROXY`: Telegram 连接代理；也可在面板设置全局代理
- `TG_SESSION_MODE`: `file`（默认）或 `string`（arm64 推荐）
- `TG_SESSION_NO_UPDATES`: `1` 启用 `no_updates`（仅 `string` 模式）
- `TG_GLOBAL_CONCURRENCY`: 全局并发（默认 `1`）
- `APP_TOTP_VALID_WINDOW`: 面板 2FA 容错窗口

## 自定义数据目录

你可以通过两种方式设置数据目录：

1. 面板设置：`系统设置 -> 全局签到设置 -> 数据目录`
2. 环境变量：`APP_DATA_DIR=/your/path`

说明：

- 修改后建议重启后端服务生效
- 该目录请务必可写，并挂载持久化卷

## 本地开发

- 推荐使用 Python 3.12；项目支持 Python `>=3.10,<3.14`
- 不建议使用 Python 3.14 及以上版本，本项目依赖的 Telegram/Pydantic 运行时组件暂未完全兼容
- 前端使用 Node.js 20，进入 `frontend/` 后执行 `npm ci`

## 常用面板设置

在 `系统设置 -> 全局签到设置` 中可以配置：

- 全局代理：账号未单独配置代理时，登录、刷新会话和执行任务会默认使用该代理
- Telegram机器人通知：填写 Bot Token 和通知 Chat ID 后，任务失败、账号登录失效或关键词命中会自动发送通知
- 数据目录：用于保存 sessions、logs、数据库和任务数据

在账号任务页可以：

- 在创建/编辑任务时搜索会话名称、用户名或 Chat ID，并从列表或搜索结果中多选目标会话
- 选择 `一个任务多会话` 时，一个任务会按同一套动作依次处理多个会话；选择 `多个独立任务` 时，会按选中会话批量创建多个任务
- 手动 Chat ID 仍保持单目标模式；如果需要多目标，请使用上方会话列表或搜索结果勾选
- “发送文本消息”动作支持多行文本，适合发送带换行的模板、口令或说明
- 点击任务卡片上的播放图标可立即执行已配置任务；关闭实时日志窗口后，可点击紫色列表图标查看历史执行日志
- 为目标群组填写 `话题 / Thread ID`，让签到只在指定话题内执行
- 在有序动作序列中添加 `关键词监听`，并在 `推送方式` 下拉框中选择 Telegram机器人、转发、Bark 或自定义 URL
- 仅当选择 `转发`、`Bark` 或 `自定义推送 URL` 时，页面才显示对应参数输入框，减少无关配置干扰
- 点击右上角导出图标，将当前账号全部任务复制到剪贴板
- 点击右上角“粘贴导入任务”，从剪贴板批量导入任务并跳过已存在的重复任务

在消息监控页可以：

- 从账号卡片的消息监控入口进入当前账号的监控配置，不需要重复选择账号
- 创建监控时可填写分组，列表会按分组展示监控卡片
- `指定会话` 支持从最近会话或搜索结果中多选多个来源会话；同一套关键词和命中处理会应用到所有选中的会话
- `私聊监控` 只监听当前账号的私人对话，适合自动回复个人消息；已移除全局监控入口，避免账号加入大量群组时监听范围过大
- 可为指定群组填写多个 `Thread ID`，留空表示监听全部话题
- 匹配方式支持 `contains`、`exact`、`regex`，页面会显示对应说明
- 可限定监控时间段，支持跨午夜时间，例如 `23:00 - 02:00`
- 命中处理支持 Telegram Bot 通知、转发消息、Bark、自定义 URL 和自动回复；默认不监听自己发送的消息，避免自动回复循环

## 健康检查

- `GET /healthz`：快速健康检查
- `GET /readyz`：服务就绪检查

## 项目结构

```text
backend/      FastAPI 后端与调度器
tg_signer/    Telegram 自动化核心
frontend/     Next.js 管理面板
```

## 更新日志

### 2026-05-10 · v0.8.6

- **账号入口优化**：账号卡片新增明确的“签到任务”和“消息监控”入口；消息监控会自动带入当前账号上下文，编辑时不再重复选择监听账号。
- **消息监控可视化配置**：新增独立消息监控页，支持指定会话多选、私聊监控、多个话题 `Thread ID`、时间段监控、分组管理和运行状态查看。
- **命中处理增强**：消息监控支持 Telegram Bot 通知、转发、Bark、自定义 URL 与自动回复；默认忽略自己发送的消息，避免自动回复循环。
- **监控列表压缩**：消息监控卡片按分组展示，减少无效信息，卡片尺寸更紧凑，便于管理多个监控任务。
- **全局监控下线**：移除全局监控入口；旧配置中残留的全局监控会被后台跳过，避免账号加入大量群组时监听范围过大。
- **本地开发说明补充**：建议 Windows 开发环境使用 PowerShell 7 或 UTF-8 编码配置，避免中文源码被终端重写成非 UTF-8。

### 2026-05-09 · v0.8.5

- **签到任务启用开关**：签到脚本新增启用/停用状态，新增任务默认启用；停用后任务不会被调度执行，面板可直接切换状态。
- **时间范围与时区优化**：签到时间范围统一改为 24 小时制显示，并在系统设置中新增任务时区配置；保存后会按配置时区重新计算随机时间段和调度任务。
- **系统设置重构**：系统设置页改为主流“左侧分类 + 右侧配置面板”交互，压缩表单间距并统一操作区，减少配置时长距离滚动。
- **通知与配置样式统一**：Telegram 机器人通知、全局设置、AI、Telegram API 和备份迁移配置统一为紧凑分组面板，移动端分类导航也更易操作。
- **前端性能优化**：账号任务页减少一次性加载内容，优化会话列表与弹窗展示，降低部署后首次进入和配置任务时的卡顿感。
- **Docker Compose 文档完善**：README 补充本地修改版构建部署流程、`.env` 示例、端口占用处理、数据持久化和时区说明。
- **项目健康检查**：已通过前端 `npm run lint`、`npx tsc --noEmit --pretty false`、`npm run build` 和 `git diff --check`。

### 2026-05-07

- **会话搜索与多选创建**：账号任务弹窗和独立创建页支持按名称、用户名或 Chat ID 搜索会话，并从列表/搜索结果中勾选多个目标；创建时可选择“一个任务多会话”或“多个独立任务”。
- **多目标编辑与任务展示**：编辑已有任务时可查看并调整多个目标会话；任务卡片会展示首个 Chat ID 和额外目标数量，避免多目标任务看起来像单目标。
- **立即执行与日志回看**：任务卡片新增播放图标，可立即执行已配置定时任务；实时窗口会显示本次目标数量和执行日志，关闭后可通过历史日志图标回看持久化记录。
- **动作输入体验优化**：发送文本/点击文本按钮动作支持多行文本输入，并优化动作行布局，让长文本模板更容易编辑。
- **本地开发兼容修复**：后端本地启动时不再强依赖 `/web/_next` 静态目录；打包配置排除前端依赖目录，降低 Windows 本地安装时的构建问题。

### 2026-05-03

- **关键词监听常驻修复**：关键词监听动作现在会被识别为需要 Telegram updates 的任务；后台监听启动时会确保账号 client 以 `no_updates=False` 运行，并在旧 client 不可接收更新时自动重建，避免保存了监听任务但实际收不到消息。
- **关键词命中后续动作修复**：命中关键词后执行“后续动作”时，点击按钮动作会等待并轮询最近消息中的可点击按钮；找不到按钮时不再直接发送按钮文本，避免把 `签到`、`Redeem Code` 等按钮名当作普通消息发出。
- **关键词监听兑换流程修复**：正则匹配现在会优先把第一个捕获组作为 `{keyword}`，例如 `gift code\s*:\s*([A-Za-z0-9-]+)` 会提取 `ABC123ABC`；点击按钮后若 callback 无法确认但聊天已推进，后续“发送文本/骰子”动作会继续执行，支持“点击 `Redeem Code` 后发送 `{keyword}`”的兑换流程。
- **关键词监听输入修复**：前端在正则模式下按行拆分关键词，不再按逗号拆分，避免 `{8,12}` 这类正则量词被切坏。
- **关键词监听日志增强**：任务日志和历史日志现在会显示后台监听状态，包括监听启动/停止、监听 Chat、匹配方式、关键词命中、捕获值，以及命中后续动作每一步的开始、成功或失败，便于确认关键词监听是否正在后台运行。
- **签到按钮流程重试增强**：普通签到任务点击按钮失败时不再发送按钮文本，而是从第 1 步重新执行完整脚本流程；默认最多重试 3 次，可通过 `SIGN_TASK_FLOW_RETRY_ATTEMPTS` 调整。
- **完整项目复检**：已通过 `python -m compileall backend tg_signer tools test_client_cache.py test_keyword_monitor.py test_keyword_monitor_logic.py`、`pytest -q`、`python -m ruff check .`、`python -m pip check`、`git diff --check`、前端 `npm run lint` 和 `npm run build`。本机仅安装 Python 3.14 且未安装 Docker，无法在本机启动生产 Python 3.12 容器；生产 Docker 镜像仍使用 Python 3.12，本地开发请继续使用 Python `>=3.10,<3.14`。

## 致谢

本项目基于原项目进行重构与扩展，感谢：

- 原项目：[tg-signer](https://github.com/amchii/tg-signer) by [amchii](https://github.com/amchii)

技术栈：FastAPI、Uvicorn、APScheduler、Pyrogram/Kurigram、Next.js、Tailwind CSS、OpenAI SDK。
