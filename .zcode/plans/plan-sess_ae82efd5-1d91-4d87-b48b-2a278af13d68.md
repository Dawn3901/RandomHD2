## 需求
多人战备池抽取改为「长周期冷却加权抽取 + 手动重置」：
- 组合被抽中后，在冷却周期（默认 **72 小时**，界面可调，0 表示关闭冷却回到均匀抽取）内抽取权重从 10% 线性回升到 100%，超期自动恢复正常。
- 「多人战备池」面板提供「重置冷却」按钮，一键清除所有组合的冷却状态，全部恢复全权重（适合新开一场时使用）。

## 改动方案

### 1. `src/types.ts` — 数据结构
`StratagemSet` 增加可选字段 `lastDrawnAt?: number`（上次被抽中的时间戳）。旧数据没有该字段 → 视为从未被抽过（全权重），无需迁移。

### 2. `src/lib/random.ts` — 加权抽取算法
- 常量 `DEFAULT_SQUAD_COOLDOWN_MS = 72 * 60 * 60 * 1000`（72 小时）、`DEFAULT_SQUAD_MIN_WEIGHT = 0.1`。
- 新增纯函数 `squadSetWeight(set, now, cooldownMs, minWeight)`：
  - 从未被抽过或已过冷却期 → 权重 1
  - 冷却期内 → `minWeight + (1 - minWeight) * (elapsed / cooldownMs)`（线性回升，刚抽完为 0.1）
- `drawSquadSets(players, pool, rng, options?)` 增加可选参数 `{ now, cooldownMs, minWeight }`（便于测试注入），内部改用 **Efraimidis–Spirakis 加权不放回抽样**：每组合计算 `key = rng() ** (1 / weight)`，取 key 最大的 N 个。保留现有校验（池子数量不足等）。

### 3. `src/App.tsx` — 界面与状态
- 新增 `squadCooldownHours` 状态（localStorage `randomhd2.squadCooldownHours`，默认 72），「多人战备池」面板加「重复冷却（小时）」数字输入框（min 0，0 = 关闭冷却；因为默认值是 72 小时量级，用小时作单位）。
- `drawSquad()`：调 `drawSquadSets` 时传入当前冷却小时数；抽完后给被抽中的组合盖上 `lastDrawnAt = Date.now()`，与 `squadResults` 一起通过 `sendSyncPatch` 同步（所有客户端可见最新冷却状态）。
- 「多人战备池」面板「抽取」按钮旁新增「重置冷却」按钮：清除所有组合的 `lastDrawnAt` 并同步。只影响未来抽取概率，不动历史记录和已显示的结果。

### 4. 测试 `src/lib/random.test.ts`
- 单测 `squadSetWeight`：从未抽过=1、刚抽完=0.1、冷却中途=线性值、超过周期=1。
- 单测加权抽取：3 组组合中 1 组刚被抽过（权重 0.1），固定 rng（`() => 0.5`，低权重组 key 远小于其他组）抽 2 组，断言低权重组不被抽中；无 `lastDrawnAt` 时保持原有行为。
- 现有 `drawSquadSets` 测试（`sequenceRng([0, 0])` → 全 0 key，稳定排序取前两个）不受影响，应原样通过。

### 5. 服务器与同步
零改动：`sync-server.mjs` / `state-store.mjs` 对 sets 数组原样透传，`lastDrawnAt` 随 set 对象自动持久化与广播。

### 验证
- `npm test` 全部通过（现有 20 个 + 新增若干）；`npm run build` 成功。
- 行为验证：72 小时内再次抽取，刚抽中的组合概率显著降低；「重置冷却」后立即恢复全权重；冷却设为 0 时回到均匀抽取。

### 边界说明
- 冷却计时从「抽中并同步」那一刻开始。
- 从历史「加入池子」复用的组合生成新 id → 视为从未抽过（全权重），符合直觉。
- 「重置冷却」由任意一个客户端点击即同步到所有人，无需每人操作。