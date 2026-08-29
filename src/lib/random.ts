import type { Catalog, Player, QuickLoadout, SquadDrawResult, StratagemSet } from "../types";
import { getRandomizableStratagems } from "./stratagems";

export type Rng = () => number;

const defaultRng: Rng = () => Math.random();

export function pickOne<T>(items: T[], rng: Rng = defaultRng): T {
  if (items.length === 0) {
    throw new Error("随机池为空");
  }

  const index = Math.min(items.length - 1, Math.floor(rng() * items.length));
  return items[index];
}

export function pickManyUnique<T>(items: T[], count: number, rng: Rng = defaultRng): T[] {
  if (count < 0) {
    throw new Error("抽取数量不能为负数");
  }
  if (items.length < count) {
    throw new Error(`随机池数量不足，需要 ${count} 个，当前只有 ${items.length} 个`);
  }

  const available = [...items];
  const picked: T[] = [];

  while (picked.length < count) {
    const index = Math.min(available.length - 1, Math.floor(rng() * available.length));
    const [item] = available.splice(index, 1);
    picked.push(item);
  }

  return picked;
}

export function rollQuickLoadout(
  catalog: Catalog,
  enabledIds: string[],
  rng: Rng = defaultRng,
): QuickLoadout {
  const enabled = new Set(enabledIds);
  const enabledStratagems = getRandomizableStratagems(catalog.stratagems).filter(
    (item) => item.enabled && enabled.has(item.id),
  );
  const enabledPrimaries = catalog.weapons.filter((item) => item.enabled && item.slot === "primary" && enabled.has(item.id));
  const enabledSecondaries = catalog.weapons.filter((item) => item.enabled && item.slot === "secondary" && enabled.has(item.id));
  const enabledGrenades = catalog.grenades.filter((item) => item.enabled && enabled.has(item.id));

  if (enabledStratagems.length < 4) {
    throw new Error("至少需要 4 个可用战备");
  }

  return {
    faction: pickOne(catalog.factions, rng),
    stratagems: pickManyUnique(enabledStratagems, 4, rng),
    primary: pickOne(enabledPrimaries, rng),
    secondary: pickOne(enabledSecondaries, rng),
    grenade: pickOne(enabledGrenades, rng),
  };
}

export function drawSquadSets(
  players: Player[],
  pool: StratagemSet[],
  rng: Rng = defaultRng,
  options: { now?: number; cooldownMs?: number; minWeight?: number } = {},
): SquadDrawResult[] {
  if (players.length < 2 || players.length > 4) {
    throw new Error("玩家人数必须为 2-4 人");
  }
  if (pool.length < players.length) {
    throw new Error("战备组合池数量少于玩家数");
  }

  const { now = Date.now(), cooldownMs = DEFAULT_SQUAD_COOLDOWN_MS, minWeight = DEFAULT_SQUAD_MIN_WEIGHT } = options;

  // 加权不放回抽样：key = rng() ** (1 / weight)，取 key 最大的前 N 个
  const weighted = pool.map((set) => ({
    set,
    key: Math.pow(rng(), 1 / squadSetWeight(set, now, cooldownMs, minWeight)),
  }));
  weighted.sort((a, b) => b.key - a.key);
  const sets = weighted.slice(0, players.length).map((item) => item.set);

  return players.map((player, index) => ({
    playerName: player.name.trim() || `玩家 ${index + 1}`,
    set: sets[index],
  }));
}

export const DEFAULT_SQUAD_COOLDOWN_MS = 72 * 60 * 60 * 1000;
export const DEFAULT_SQUAD_MIN_WEIGHT = 0.1;

export function squadSetWeight(
  set: StratagemSet,
  now: number,
  cooldownMs: number = DEFAULT_SQUAD_COOLDOWN_MS,
  minWeight: number = DEFAULT_SQUAD_MIN_WEIGHT,
): number {
  if (set.lastDrawnAt === undefined) return 1;
  const elapsed = Math.max(0, now - set.lastDrawnAt);
  if (elapsed >= cooldownMs) return 1;
  return minWeight + (1 - minWeight) * (elapsed / cooldownMs);
}
