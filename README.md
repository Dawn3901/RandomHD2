# RandomHD2

Helldivers 2 本地随机器。用来在开局前快速生成随机配装，也支持开黑时从大家自建的战备组合池里不重复抽取。

数据与图标全部随项目本地保存，不依赖外部接口；多人同步通过项目自带的一个 WebSocket 服务完成。

## 功能特性

- **快速随机**：随机敌方阵营、4 个战备、主武器、副武器、手雷各一个，也可以单独重抽某一项。
- **多人战备池**：2-4 名玩家各自创建多组 4 战备组合加入公共池，抽取时每人拿到一组且互不重复；组合池按创建者分组折叠，支持编辑已有组合。
- **颜色占位图标**：组合里可用「任意红/蓝/绿色战备」占位，表示这一格随便挑该颜色的战备，且可重复选（如 2 指定 + 2 任意红）。
- **冷却加权抽取**：刚被抽中的组合在一段时间内被再次抽到的概率会降低（详见[随机逻辑](#随机逻辑)）。
- **历史配装**：创建组合时自动记录，可随时「加入池子」复用。
- **自定义图标**：上传自己的战备 / 武器图标（SVG 或 PNG）并指定类别，自动保存进随机池，支持删除、恢复与撤销。
- **从 Wiki 更新**：`npm run update:assets` 一键同步 Wiki 上的最新战备与武器；网页上也能把新图标直接导入为自定义项。
- **实时同步**：同一地址下的玩家列表、组合池、抽取结果、历史记录、自定义图标会实时同步给所有人。
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
| `public/assets/wiki/thumbs/` | 大图的 160px 缩略图（见下方「图标体积与磁盘占用」） |
| `src/data/generatedCatalog.ts` | 网页端使用的战备/武器目录（编译期导入） |
| `server/generated-catalog.json` | 服务端随机配装接口使用的目录（运行期读取） |

它们都由 `npm run generate:data` 产出，源数据是 `assets/wiki/`（图标 + `manifest.json`）——也就是说**图标与 manifest 才是唯一的真实数据源**，改动它们后重新执行一次构建即可。

### 本地开黑（不用 Docker）

```bash
npm run share      # 先构建，再启动同步服务，地址 http://127.0.0.1:5173/
```

`npm run share` 会同时提供网页和 WebSocket 同步。想要让外网的朋友访问，用内网穿透工具把隧道指向 `127.0.0.1:5173`，把公网地址发给朋友即可。

## Docker 部署（推荐）

有两种方式，按服务器配置选。

### 方式 A：在服务器上构建

```bash
cd /opt/RandomHD2
git pull
docker compose up --build -d
```

改动最小，但构建过程本身很吃资源：`npm ci` 要写几百 MB，`npm run build` 要跑 TypeScript、Vite 和 130 张图的缩略图生成。**内存小于 2GB 的服务器上，构建进程会和运行中的容器抢内存，可能触发 OOM 或疯狂 swap——表现为整机卡死。**

### 方式 B：本地构建，把镜像传过去（低配服务器推荐）

镜像构建完全在本地完成，服务器只做 `docker load`，不跑任何构建进程。

```bash
# 1) 本地：构建镜像（需先启动 Docker Desktop）
cd /path/to/RandomHD2
docker compose build --build-arg NODE_IMAGE=node:22-bookworm-slim

# 2) 本地：直接通过 SSH 把镜像送过去（不落地 tar 文件，省一次磁盘读写）
docker save randomhd2:local | gzip | ssh root@<服务器IP> 'gunzip | docker load'

# 3) 服务器：直接用这个镜像启动，--no-build 保证它不会偷偷开始构建
cd /opt/RandomHD2
git pull                      # 只为同步 compose.yml 等配置
docker compose up -d --no-build
```

> **关于 `--build-arg NODE_IMAGE`**：Dockerfile 的基础镜像默认指向 daocloud 镜像站，因为国内服务器直连 Docker Hub 不稳。但 daocloud 的分发通道（Cloudflare R2）在你本机可能连不上，报 `httpReadSeeker: failed open ... EOF`。这时用上面的参数改走 Docker Hub 即可——两个来源拉到的镜像摘要完全相同，只是通道不同。服务器端构建不需要这个参数。

`compose.yml` 里固定了 `image: randomhd2:local`，所以两种方式共用同一份配置：本地 `docker compose build` 产出的就是这个标签，服务器 `--no-build` 时用的也是它。如果镜像不存在，`--no-build` 会直接报错而不是默默开始构建——这正是我们要的行为。

几点提示：

- 传输体积通常是几百 MB（未压缩），`gzip` 能压掉一部分；你的上行带宽决定耗时。
- `docker load` 会跳过本地已有的层，所以第二次之后只写变化的层。
- 送过去之后，旧的 `randomhd2-randomhd2` 镜像就成了垃圾，可以 `docker image prune` 清掉。
- 两台机器的架构必须一致（都是 x86_64，一般没问题）；如果是 Apple Silicon 本地构建、x86 服务器运行，需要 `--platform linux/amd64`。

### 常用命令

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
    update-assets.mjs     # 从 Helldivers Wiki 更新图标资源与 manifest
  src/
    App.tsx               # 页面与交互
    types.ts              # 领域类型定义
    styles.css
    data/
      generatedCatalog.ts # 生成：网页端使用的战备/武器目录
    lib/
      random.ts           # 纯随机函数（快速随机 + 战备池抽取）
      customItems.ts      # 自定义图标的校验、映射、合并与撤销
      stratagems.ts       # 战备筛选与排序
      storage.ts          # localStorage 读写
      sync.ts             # 同步状态与历史记录的纯函数
  server/
    sync-server.mjs       # HTTP 静态服务 + WebSocket 同步 + 图片/同步接口
    quick-roll.mjs        # 配装卡生成（文本 / SVG / PNG）
    wiki-assets.mjs       # Wiki 图标清单的获取、分类与 diff（脚本与服务端共用）
    generated-catalog.json# 生成：服务端使用的目录
    state-store.mjs       # 状态文件读写
  integrations/
    astrbot_plugin_randomhd2/  # AstrBot（QQ 机器人）插件
```

标「生成」的路径不在版本库中，由 `npm run generate:data` 产出。

## 随机逻辑

### 快速随机

从「已启用的战备（排除黄色任务战备）」中不重复抽 4 个，再从主武器、副武器、手雷中各抽 1 个（`src/lib/random.ts` 的 `rollQuickLoadout`）。启用了哪些项目由各浏览器自己的 localStorage 决定，不参与多人同步。

### 组合池的管理

组合池按创建者分组显示为「XXX 的战备组」，**默认收起**，点组头展开。组头右侧显示该玩家有几组。

- **新建组合**：在「创建组合」面板选创建者、填组合名、从网格里挑 4 个战备，点「加入池子」。保存后会自动展开该创建者的分组。
- **编辑组合**：在组内点「编辑」，面板会切换为「编辑组合」模式，创建者、组合名、4 个战备都预填为该组合的当前值；改完点「保存修改」，「取消」则放弃改动。
  - 编辑**不会重置该组合的抽取冷却**（`lastDrawnAt` 保持不变）。
  - 编辑**不会写入历史配装**——历史是「创建」的日志，也兼作误删后的恢复手段，保留旧版本反而能回退。
  - 编辑中会高亮该行；若此时别的玩家把这一组删了，保存时会提示并退出编辑。
- **删除**：点「删除」直接从池中移除。

「已选」栏显示当前已选的 4 个战备，每项可单独点 × 移除。这一栏还解决了一个边界情况：组合引用的自定义图标若被「彻底删除」，该战备在下方网格里不会出现，只能靠这里移除它（会显示为红色的 `?`）。

分组按创建者名匹配，顺序是玩家列表的顺序，之后是改名后残留的旧玩家名。编辑这类旧组合时，创建者下拉会保留原名，不会强行改回当前玩家。

### 颜色占位图标（任意战备）

组合选择器最前面有三个带虚线框的图标：**任意红色战备 / 任意蓝色战备 / 任意绿色战备**。它们用来表示「这一格可以是任意该颜色的战备」，适合开黑时不想把话说死的组合。

它们是内置的占位项（`src/lib/wildcards.ts`），配色沿用真实战备图标的三色方案（红 `#190301`/`#dc6455`、蓝 `#011419`/`#55b9d2`、绿 `#081901`/`#699655`），中间的问号表示「任意」，虚线方框表示「空位」——即使字体缺失也能看懂。虚线框只内缩 4%、问号放大到与其他图标相近的视觉重量，避免看起来比旁边的图标小一圈。

**可以重复选**：点几次就加几个，例如「2 个指定战备 + 2 个任意红色战备」。被选多次时图标右上角会显示 `×2` 这样的角标；要减少数量点上方已选栏里对应的 ×（只移除一个，不会把同 id 的全部删掉）。

真实战备仍然不可重复：同一个战备在游戏里不可能带两把，所以点击是「选中/取消选中」的切换语义。

关键行为：

- **只用于组合，不进入随机池**。它们的 `selectable` 为 `false`，因此既不出现在「随机池」的目录列表里，也不会被「全部随机」抽到，也不计入「可选战备」数量。
- 可以正常放进组合、参与多人抽取；抽取结果和历史配装里会照常显示这个占位图标，提示拿到的人「这一格随便挑一个该颜色的战备」。
- 服务端的配装图片接口与 QQ 抽卡同样不会用到它们（那里只随机真实战备）。

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

## 从 Wiki 更新图标

游戏更新后，Wiki 上会出现新的战备与武器图标。有两种把它们弄进来的方式，分工互补。

### 脚本：更新内置目录（需要重新部署）

```bash
npm run update:assets -- --dry-run   # 先看差异，不写入任何文件
npm run update:assets                # 下载新增/变更的文件并重新生成目录
```

脚本会从 `helldivers.wiki.gg` 拉取 `Stratagems` / `Weapons` 两个页面用到的全部图标，与本地 `manifest.json` 比对，只下载新增和有变化的文件（**未变化的会跳过**——武器原图单张 3 MB 以上，全量约 140 MB，不能每次重下），然后重写 manifest 并执行 `generate:data`。

参数：

| 参数 | 作用 |
| --- | --- |
| `--dry-run` | 只报告差异，不写入任何文件 |
| `--force` | 忽略体积比对，全部重新下载 |
| `--only=stratagems` | 只处理指定类别（其余原样保留） |
| `--prune-files` | 同时删除 Wiki 已下架条目的本地文件，以及未登记的遗留文件 |

跑完后按提示 `git add -A && git commit` 并重新部署。新增战备的类别由图标颜色自动判定，脚本会把结果打出来——**黄色任务战备会被自动排除在随机池之外**。

**分类规则**（按 Wiki 上的文件名）：

| 文件名模式 | 归类 |
| --- | --- |
| `… Stratagem Icon Background.svg` | 战备 |
| `… Primary Render.png` | 主武器 |
| `… Secondary Render.png` | 副武器 |
| `… Throwable Render.png` | 手雷 |
| `… Support Render.png` | **跳过**——支援武器在游戏里本就是蓝色战备，且已有对应战备图标 |
| 其他（`Armor_AP*_Icon.png`、敌人图标等） | 跳过，且不认识的既有条目会原样保留 |

### 网页按钮：导入为自定义图标（立即生效，无需重新部署）

「自定义图标」面板里的**「从 Wiki 导入」**按钮会列出 Wiki 上本地还没有的图标，勾选后一键导入：

- 战备取 **SVG 原图**（约 2 KB），武器取 **128px 缩略图**（约 10-20 KB，原图太大不适合放进同步状态）
- 战备的类别由 SVG 颜色**自动预判**并显示，导入后可手动改
- 导入即成为自定义图标，因此删除、恢复、撤销全部沿用既有能力，并会同步给其他玩家

实现上由服务端的 `/api/wiki/updates`（清单）和 `/api/wiki/icon`（图标代理）两个**只读**接口提供支持，客户端只传文件名、真实地址由服务端查表，因此这两个接口无法被用来请求任意地址；页面也不热链 Wiki 图片。

> **前提**：服务器容器需要能访问 `helldivers.wiki.gg`。如果像访问 GitHub 一样被网络限制，按钮会给出明确提示，此时在本地跑 `npm run update:assets` 再部署即可（本地网络通常可以）。

### 关于文件体积

Wiki 上报的 `size` 是**原图**体积，而实际下载到的 PNG 是 Wiki 重新编码过的版本，通常小很多（SVG 则逐字节一致）。因此 manifest 里的 `size` 与本地文件大小不一致是正常现象，脚本也不以体积判断下载完整性，而是校验文件头。

## 自定义图标

页面最下方的「自定义图标」面板可以上传自己的战备 / 武器 SVG 图标，指定它属于哪一类，系统会自动保存并立刻投入随机池。

### 上传流程

1. 选择**类型**：战备，或武器 / 手雷。
2. 选择对应的**类别**：
   - 战备 → 红色 / 蓝色 / 绿色 / 黄色任务战备（沿用游戏内配色分类）
   - 武器 → 主武器 / 副武器 / 手雷
3. 填写名称（英文为显示名，中文名可选）。选择文件后会自动用文件名填一个默认名称，并显示预览。
4. 点「上传并加入随机池」。

上传成功后无需任何额外操作：它会出现在「随机池」面板对应的标签页里（带「自定义」标记）、可以参与「创建组合」、也会被「全部随机」抽到。其他同步在线的玩家会同时收到，并默认启用。

限制：单文件上限 SVG 256 KB / PNG 512 KB，总数上限 200 个。SVG 中的 `<script>`、`on*` 事件属性和 `javascript:` 链接会在保存前被剥离。

### 删除、恢复与撤销

- **删除**是软删除：图标从随机池和列表里消失，但数据保留，随时可以恢复。
- 勾选「显示已删除」可以看到已删除的图标，在这里**恢复**或**彻底删除**。
- 「撤销」按钮可以回退最近的自定义图标操作（创建 / 删除 / 恢复），显示为「撤销：删除 XX」。因为删除是软删除，撤销不需要保存图标副本，任何一次操作都能干净回退。
- **彻底删除**不可恢复。如果该图标正被某个战备组合引用，确认框会提示被引用的数量——删除后那些组合里的对应图标会变成空白。

### 存储位置

自定义图标（含 SVG 源码）保存在**同步状态**里，即 `state` 的 `customItems` 字段：

- 服务端：状态文件（Docker 下为宿主机 `./data/sync-state.json`），因此重建容器不会丢失。
- 浏览器：同时镜像一份到 localStorage，所以 `npm run dev` 这种没有同步服务的模式下也能完整使用，只是不同步给他人。

服务端会对该字段做校验（丢弃结构不合法的条目、限制单项体积与总数上限），避免异常数据进入状态文件。

### 明确边界

自定义图标**只在网页上可用**。服务端的配装图片接口（`/api/quick-roll.svg`、`/api/quick-roll.png`）与 AstrBot / QQ 抽卡仍然只使用内置战备，因此抽卡结果里不会出现自定义图标。另外，自定义图标会让状态文件变大（每个约 2-9 KB），不再需要的图标建议彻底删除以保持精简。

## 新增内置战备（以热熔枪为例）

想加入随项目分发的内置战备（图标进入版本库、对所有人生效）走这个流程；只想自己临时加一个图标，用上面的[自定义图标](#自定义图标)。

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

## 图标体积与磁盘占用

默认保存的武器渲染图是 3840×2160、单张 1MB 以上（全套 140MB+），但配装卡片上图标只画到 58px 见方——直接读原图非常浪费。因此 `generate:data` 会为所有超过 60KB 的 PNG 预生成 **160px 缩略图**（约 130 张，143MB → 约 1MB），并在目录里写成 `thumbIcon` 字段。

配套的两项优化：

- **卡片优先用缩略图**：`server/quick-roll.mjs` 里 `preferredIcon()` 优先取 `thumbIcon`。单次抽卡要从磁盘读取的数据从 **约 2.9MB 降到约 28KB（约 1/104）**，整张卡片 SVG 从 3.4MB 降到 52KB，渲染耗时也随之明显下降。
- **图标内存缓存**：图标是构建期产物、运行期不变，所以读取结果会缓存起来（以 `size+mtime` 作为失效条件，本地重跑 `generate:data` 后会自动重读）。缓存带 24MB 字节预算，超出后按插入顺序淘汰，避免在内存紧张的机器上把整套图标都缓存进来。

`thumbIcon` 缺省时自动回退到原始 `icon`，所以自定义图标和未生成缩略图的条目都不受影响。缩略图只用于渲染，不影响任何数据与随机结果。

网页端也走 `thumbIcon`（`src/App.tsx` 的 `itemIcon()`）：随机池网格、已选栏、抽取结果、历史配装里的武器图标都用缩略图，一屏十几个图标从十几 MB 降到一百多 KB。战备本身是几 KB 的 SVG，没有缩略图也不受影响。

## HTTP 接口

服务端（`server/sync-server.mjs`）在网页同端口上提供以下接口：

| 接口 | 说明 |
| --- | --- |
| `GET /api/quick-roll` | 生成一次随机配装，纯文本 |
| `GET /api/quick-roll.svg` | 随机配装图片卡（SVG） |
| `GET /api/quick-roll.png` | 随机配装图片卡（PNG） |
| `GET /api/quick-roll-stratagems` | 只随机 4 个战备，纯文本 |
| `GET /api/quick-roll-stratagems.svg` | 只要战备的图片卡（SVG） |
| `GET /api/quick-roll-stratagems.png` | 只要战备的图片卡（PNG） |
| `GET /api/wiki/updates` | Wiki 上的图标清单（含是否已导入），只读，缓存 10 分钟 |
| `GET /api/wiki/icon?title=…&thumb=1` | 代理 Wiki 图标字节，只接受清单内的文件名 |
| `GET /health` | 健康检查，返回 `{ ok, clients }` |
| `WS /sync` | 多人同步通道 |

## AstrBot 集成

`integrations/astrbot_plugin_randomhd2/` 是一个 AstrBot 插件，提供两个指令：

| 指令 | 内容 |
| --- | --- |
| `/随机配装` | 阵营 + 4 个战备 + 主副武器 + 手雷，完整配装卡 |
| `/随机战备` | 只有 4 个战备的卡片（图标 + 名称），适合只想抽战备的场合 |

插件会**自己下载图片字节再发送**（而不是把 URL 交给 QQ 端去取），所以图片地址不需要公网可达；图片接口失败时自动回退到纯文本。

插件配置项（`_conf_schema.json`）：

| 配置 | 默认值 | 说明 |
| --- | --- | --- |
| `quick_roll_url` | `http://randomhd2:5173/api/quick-roll` | 文本接口地址 |
| `quick_roll_image_url` | `http://randomhd2:5173/api/quick-roll.png` | 图片接口地址 |
| `stratagems_image_url` | 留空 | 留空则沿用 `quick_roll_image_url` 的主机与端口，只换路径 |
| `stratagems_url` | 留空 | 留空则沿用 `quick_roll_url` 的主机与端口，只换路径 |
| `timeout` | `10` | 请求超时秒数 |

默认值里的 `randomhd2` 是容器名，只在两个容器处于**同一 Docker 网络**时可用。跨网络时用宿主网关地址，例如把两个地址都设成 `http://172.18.0.1:5173/...`；只要这两个地址配对了，新指令的地址会自动跟着推导出来，不需要额外配置。

> **安装插件后注意**：新装的插件在 AstrBot 里默认是「未启用」。此时**在仪表盘点「启用」会触发 AstrBot 的一个绑定缺陷**——插件在未启用状态下已被绑定过一次处理器，启用时又绑一次，两层叠加导致 `TypeError: ... takes 2 positional arguments but 3 were given`。正确做法是**装好文件后重启 AstrBot**（`docker compose restart astrbot`），让它在启用状态下干净加载一次。若已经把插件搞坏了，重启同样能恢复。

## 图标资源与许可

`assets/wiki/` 下的图标来自 [helldivers.wiki.gg](https://helldivers.wiki.gg/)，通过 MediaWiki API 下载，`manifest.json` 记录了每个文件的来源地址与元数据。

Wiki 声明其可授权的内容基于 CC BY-NC-SA 4.0；游戏品牌、美术与相关知识产权归各自所有者。这些资源适合本地、非商业的粉丝用途，如需更广泛的使用请先确认授权。详见 [`assets/wiki/README.md`](assets/wiki/README.md)。

## 相关文档

- [`设计.md`](设计.md)：项目定位与设计方案
- [`需求.md`](需求.md)：最初的需求清单
