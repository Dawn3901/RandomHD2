import type { Player, SyncPatch, SyncState } from "../types";

export function createSyncState(players: Player[], now = Date.now()): SyncState {
  return {
    players: [...players],
    sets: [],
    squadResults: [],
    updatedAt: now,
  };
}

export function applySyncPatch(state: SyncState, patch: SyncPatch, now = Date.now()): SyncState {
  return {
    players: patch.players ? [...patch.players] : [...state.players],
    sets: patch.sets ? [...patch.sets] : [...state.sets],
    squadResults: patch.squadResults ? [...patch.squadResults] : [...state.squadResults],
    updatedAt: now,
  };
}
