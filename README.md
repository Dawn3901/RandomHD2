# RandomHD2

Helldivers 2 本地随机器。用来在开局前快速生成随机配装，也支持开黑时从大家自建的战备组合池里不重复抽取。

数据与图标全部随项目本地保存，不依赖外部接口；多人同步通过项目自带的一个 WebSocket 服务完成。

## 功能特性

- **快速随机**：随机敌方阵营、4 个战备、主武器、副武器、手雷各一个，也可以单独重抽某一项。
- **多人战备池**：2-4 名玩家各自创建多组 4 战备组合加入公共池，抽取时每人拿到一组且互不重复。
- **冷却加权抽取**：刚被抽中的组合在一段时间内被再次抽到的概率会降低（详见[随机逻辑](#随机逻辑)）。
- **历史配装**：创建组合时自动记录，可随时「加入池子」复用。
- **实时同步**：同一地址下的玩家列表、组合池、抽取结果、历史记录会实时同步给所有人。
- **随机池开关**：可以在网页上勾选/取消任意战备与武器，控制它们是否参与随机。

## 技术栈

Vite + React 19 + TypeScript，随机逻辑为纯函数，数据由脚本从本地 Wiki 图标资源生成。多人同步由 Node 原生 `http` + `ws` 实现，无数据库、无外部服务。

## 快速开始

```bash
npm install

npm run dev        # 本地开发，打开 http://127.0.0.1:5173/
npm test           # 运行全部测试
npm run build      # 类型检查 + 构建到 dist/
```

`dev` / `build` / `sync` 都会先自动执行 `generate:data`，从 `assets/wiki/` 生成图标目录与战备数据，所以**克隆下来直接跑命令即可**，不需要手动准备生成产物。

### 生成产物说明

以下三份文件是生成产物，**不纳入版本控制**（已在 `.gitignore` 中）：

| 产物 | 用途 |
| --- | --- |
| `public/assets/wiki/` | 从 `assets/wiki/` 复制的图标，供网页访问 |
| `src/data/generatedCatalog.ts` | 网页端使用的战备/武器目录（编译期导入） |
| `server/generated-catalog.json` | 服务端随机配装接口使用的目录（运行期读取） |

它们都由 `npm run generate:data` 产出，源数据是 `assets/wiki/`（图标 + `manifest.json`）——也就是说**图标与 manifest 才是唯一的真实数据源**，改动它们后重新执行一次构建即可。

### 本地开黑（不用 Docker）

```bash
npm run share      # 先构建，再启动同步服务，地址 http://127.0.0.1:5173/
```

`npm run share` 会同时提供网页和 WebSocket 同步。想要让外网的朋友访问，用内网穿透工具把隧道指向 `127.0.0.1:5173`，把公网地址发给朋友即可。

## Docker 部署（推荐）

```bash
docker compose up --build -d
```

启动后网页和控制台在同一地址：`http://<服务器IP>:5173/`。需要在云服务商的安全组里放行 5173 端口。

更新代码后的标准流程：

```bash
git pull
docker compose up --build -d
docker compose logs --tail 50     # 确认启动正常
```

常用运维命令：

```bash
docker compose ps                 # 查看运行状态
docker compose logs -f            # 实时日志
docker compose restart            # 重启（代码没变时比重建快）
docker compose down               # 停止并删除容器（不影响数据）
```

### 数据持久化

所有共享状态（玩家、组合池、抽取结果、历史记录）保存在容器内的 `/app/.randomhd2/sync-state.json`，而 `compose.yml` 把这个路径挂载到了宿主机的 `./data` 目录：

```yaml
volumes:
  - ./data:/app/.randomhd2
```

因此**重新构建镜像、重建容器都不会丢失历史数据**。唯一会丢数据的操作是手动删除宿主机的 `./data` 目录。更新前想稳妥一点可以先备份：

```bash
cp -r data data.bak
```

## 目录结构

```text
RandomHD2/
  assets/wiki/            # 【数据源】图标资源 + manifest.json
  public/assets/wiki/     # 生成：图标副本，供网页访问
  scripts/
    generate-data.mjs     # 由 manifest.json 生成下列三份产物
  src/
    App.tsx               # 页面与交互
    types.ts              # 领域类型定义
    styles.css
    data/
      generatedCatalog.ts # 生成：网页端使用的战备/武器目录
    lib/
      random.ts           # 纯随机函数（快速随机 + 战备池抽取）
      stratagems.ts       # 战备筛选与排序
      storage.ts          # localStorage 读写
      sync.ts             # 同步状态与历史记录的纯函数
  server/
    sync-server.mjs       # HTTP 静态服务 + WebSocket 同步 + 图片接口
    quick-roll.mjs        # 配装卡生成（文本 / SVG / PNG）
    generated-catalog.json# 生成：服务端使用的目录
    state-store.mjs       # 状态文件读写
  integrations/
    astrbot_plugin_randomhd2/  # AstrBot（QQ 机器人）插件
```

标「生成」的路径不在版本库中，由 `npm run generate:data` 产出。

## 随机逻辑

### 快速随机

从「已启用的战备（排除黄色任务战备）」中不重复抽 4 个，再从主武器、副武器、手雷中各抽 1 个（`src/lib/random.ts` 的 `rollQuickLoadout`）。启用了哪些项目由各浏览器自己的 localStorage 决定，不参与多人同步。

### 多人战备池抽取

从组合池中为每名玩家抽一组、互不重复，并且**带冷却加权**：

- 组合每被抽中一次，就记录一个抽中时间戳 `lastDrawnAt`。
- 在冷却周期内，该组合的抽取权重从 `10%` 随时间**线性回升到 100%**，超出周期后恢复正常权重：

  ```text
  权重 = 0.1 + 0.9 × (已过时间 / 冷却周期)
  ```

- 从未被抽过的组合权重恒为 100%。
- 抽取算法为加权不放回抽样（Efraimidis–Spirakis：`key = rng() ^ (1 / 权重)`，取 key 最大的前 N 个）。

界面上的设置：

- **重复冷却（小时）**：默认 `72`（3 天），填 `0` 即关闭冷却、回到均匀抽取。
- **重置冷却**：一键清除所有组合的冷却状态，全部恢复全权重，适合新开一场时使用。任意一人点击即可同步给所有人。

冷却状态随组合一起同步，所以所有玩家看到的概率分布是一致的。从历史记录「加入池子」复用的组合会获得新 id，视为从未抽过。

## 新增战备（以热熔枪为例）

战备列表不是手工维护的，而是由 `assets/wiki/manifest.json` 自动生成，所以只需要三步：

**1. 把图标放进源目录**（注意是 `assets/` 而不是 `public/`，后者是脚本的输出目录）：

```text
assets/wiki/stratagems/Meltagun_Stratagem_Icon_Background.svg
```

**2. 在 `assets/wiki/manifest.json` 中登记一条**：

```json
{
    "category":  "stratagems",
    "title":  "File:Meltagun Stratagem Icon Background.svg",
    "aliases":  [
                    "File:Meltagun Stratagem Icon Background.svg"
                ],
    "file":  "assets/wiki/stratagems/Meltagun_Stratagem_Icon_Background.svg",
    "sourceUrl":  "https://helldivers.wiki.gg/images/Meltagun_Stratagem_Icon_Background.svg",
    "descriptionUrls":  [
                            "https://helldivers.wiki.gg/wiki/File:Meltagun_Stratagem_Icon_Background.svg"
                        ],
    "mime":  "image/svg+xml",
    "width":  512,
    "height":  512,
    "size":  9094
}
```

脚本实际只用到 `category`（归入战备）、`title`（去掉 `File:` 与 `Stratagem Icon Background` 后缀后即英文名）和 `file`（图标路径），其余是元数据，照格式填即可。

**3. 重新生成数据**：

```bash
npm run generate:data     # 也可以直接跑 npm run dev 或 npm run build，会自动执行这一步
```

该脚本会重新生成 `src/data/generatedCatalog.ts` 与 `server/generated-catalog.json`，并把 `assets/wiki/` 下的图标同步到 `public/assets/wiki/`。之后新战备会自动出现在网页的随机池中，无需改动任何代码；服务端的随机配装接口读取的也是同一份数据。

### 分类由图标颜色决定

脚本通过读取 SVG 中**第一个出现的 `fill:#XXXXXX`** 来判断战备颜色：

| 颜色 | 分类 |
| --- | --- |
| `#190301` | 红色（进攻） |
| `#011419` | 蓝色（支援） |
| `#081901` | 绿色（防御） |
| `#363426` | 黄色（任务） |
| 其他 | 默认按蓝色处理 |

黄色任务战备的 `selectable` 会被设为 `false`，自动排除在随机池之外。新增战备时请确认 SVG 中第一个颜色是背景色，否则分类会不正确。

## HTTP 接口

服务端（`server/sync-server.mjs`）在网页同端口上提供以下接口：

| 接口 | 说明 |
| --- | --- |
| `GET /api/quick-roll` | 生成一次随机配装，纯文本 |
| `GET /api/quick-roll.svg` | 随机配装图片卡（SVG） |
| `GET /api/quick-roll.png` | 随机配装图片卡（PNG） |
| `GET /health` | 健康检查，返回 `{ ok, clients }` |
| `WS /sync` | 多人同步通道 |

## AstrBot 集成

`integrations/astrbot_plugin_randomhd2/` 是一个 AstrBot 插件，提供 `/随机配装` 指令，调用上面的图片接口并把配装卡发到当前会话。

插件配置项（`_conf_schema.json`）：

| 配置 | 默认值 | 说明 |
| --- | --- | --- |
| `quick_roll_url` | `http://randomhd2:5173/api/quick-roll` | 文本接口地址，两个容器在同一 Docker 网络时用默认值 |
| `quick_roll_image_url` | `http://randomhd2:5173/api/quick-roll.png` | 图片接口地址，若 QQ 端无法显示容器内网地址，改为公网地址 |
| `timeout` | `10` | 请求超时秒数 |

插件会优先发送图片，图片接口失败时回退到纯文本。

## 图标资源与许可

`assets/wiki/` 下的图标来自 [helldivers.wiki.gg](https://helldivers.wiki.gg/)，通过 MediaWiki API 下载，`manifest.json` 记录了每个文件的来源地址与元数据。

Wiki 声明其可授权的内容基于 CC BY-NC-SA 4.0；游戏品牌、美术与相关知识产权归各自所有者。这些资源适合本地、非商业的粉丝用途，如需更广泛的使用请先确认授权。详见 [`assets/wiki/README.md`](assets/wiki/README.md)。

## 相关文档

- [`设计.md`](设计.md)：项目定位与设计方案
- [`需求.md`](需求.md)：最初的需求清单
