import type { DrawHistoryEntry, Player, SquadDrawResult, StratagemSet, SyncPatch, SyncState } from "../types";

export function createSyncState(players: Player[], now = Date.now()): SyncState {
  return {
    players: [...players],
    sets: [],
    squadResults: [],
    history: [],
    updatedAt: now,
  };
}

export function applySyncPatch(state: SyncState, patch: SyncPatch, now = Date.now()): SyncState {
  return {
    players: patch.players ? [...patch.players] : [...state.players],
    sets: patch.sets ? [...patch.sets] : [...state.sets],
    squadResults: patch.squadResults ? [...patch.squadResults] : [...state.squadResults],
    history: patch.history ? [...patch.history] : [...state.history],
    updatedAt: now,
  };
}

export function recordDrawHistory(
  history: DrawHistoryEntry[],
  results: SquadDrawResult[],
  now = Date.now(),
): DrawHistoryEntry[] {
  const entries = results.map((result, index) => ({
    id: `history-${now}-${index}`,
    playerName: result.playerName,
    set: result.set,
    drawnAt: now,
  }));

  return [...entries, ...history];
}

export function removeHistoryEntry(history: DrawHistoryEntry[], id: string): DrawHistoryEntry[] {
  return history.filter((entry) => entry.id !== id);
}

export function historyEntryToSet(entry: DrawHistoryEntry, now = Date.now()): StratagemSet {
  return {
    ...entry.set,
    id: `set-from-history-${now}-${entry.id}`,
    name: `${entry.set.name} 复用`,
  };
}
