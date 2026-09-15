import type { CustomItem, DrawHistoryEntry, Player, StratagemSet, SyncPatch, SyncState } from "../types";

export function createSyncState(players: Player[], now = Date.now()): SyncState {
  return {
    players: [...players],
    sets: [],
    squadResults: [],
    history: [],
    customItems: [],
    updatedAt: now,
  };
}

export function applySyncPatch(state: SyncState, patch: SyncPatch, now = Date.now()): SyncState {
  return {
    players: patch.players ? [...patch.players] : [...state.players],
    sets: patch.sets ? [...patch.sets] : [...state.sets],
    squadResults: patch.squadResults ? [...patch.squadResults] : [...state.squadResults],
    history: patch.history ? [...patch.history] : [...state.history],
    customItems: patch.customItems ? ([...patch.customItems] as CustomItem[]) : [...state.customItems],
    updatedAt: now,
  };
}

export function recordCreatedSetHistory(
  history: DrawHistoryEntry[],
  set: StratagemSet,
  now = Date.now(),
): DrawHistoryEntry[] {
  return [
    {
      id: `history-set-${now}-${set.id}`,
      playerName: set.ownerName,
      set,
      drawnAt: now,
    },
    ...history,
  ];
}

export function removeHistoryEntry(history: DrawHistoryEntry[], id: string): DrawHistoryEntry[] {
  return history.filter((entry) => entry.id !== id);
}

export function historyEntryToSet(entry: DrawHistoryEntry, now = Date.now()): StratagemSet {
  return {
    ...entry.set,
    id: `set-from-history-${now}-${entry.id}`,
    name: `${entry.set.name} 复用`,
    lastDrawnAt: undefined,
  };
}

export type SetGroup = {
  ownerName: string;
  sets: StratagemSet[];
};

/**
 * 按创建者分组。顺序上已知玩家优先（与界面上玩家列表一致），
 * 玩家改名后残留的旧名字排在后面，组内保持原有加入顺序。
 */
export function groupSetsByOwner(sets: StratagemSet[], playerNames: string[] = []): SetGroup[] {
  const groups = new Map<string, StratagemSet[]>();

  for (const set of sets) {
    const ownerName = set.ownerName || "未署名";
    const bucket = groups.get(ownerName);
    if (bucket) bucket.push(set);
    else groups.set(ownerName, [set]);
  }

  const known = playerNames.filter((name, index) => groups.has(name) && playerNames.indexOf(name) === index);
  const unknown = Array.from(groups.keys())
    .filter((name) => !known.includes(name))
    .sort((a, b) => (a === b ? 0 : a < b ? -1 : 1));

  return [...known, ...unknown].map((ownerName) => ({ ownerName, sets: groups.get(ownerName) ?? [] }));
}

/**
 * 就地更新一个组合。保留 id 与 lastDrawnAt：编辑内容不应该重置它的抽取冷却。
 * 找不到 id 时原样返回（例如编辑期间该组合被其他客户端删掉了）。
 */
export function updateSetInList(
  sets: StratagemSet[],
  id: string,
  changes: Partial<Omit<StratagemSet, "id" | "lastDrawnAt">>,
): StratagemSet[] {
  return sets.map((set) => (set.id === id ? { ...set, ...changes } : set));
}
