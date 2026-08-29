import type { DrawHistoryEntry, Player, StratagemSet, SyncPatch, SyncState } from "../types";

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
