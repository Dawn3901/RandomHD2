import { describe, expect, it } from "vitest";
import type { DrawHistoryEntry, Player, StratagemSet, SquadDrawResult, SyncState } from "../types";
import {
  applySyncPatch,
  createSyncState,
  historyEntryToSet,
  recordDrawHistory,
  removeHistoryEntry,
} from "./sync";

const players: Player[] = [
  { id: "player-1", name: "玩家 1" },
  { id: "player-2", name: "玩家 2" },
];

const set: StratagemSet = {
  id: "set-1",
  ownerName: "玩家 1",
  name: "测试组合",
  stratagemIds: ["a", "b", "c", "d"],
};

const result: SquadDrawResult = {
  playerName: "玩家 1",
  set,
};

const historyEntry: DrawHistoryEntry = {
  id: "history-1",
  playerName: "玩家 1",
  set,
  drawnAt: 150,
};

describe("sync state helpers", () => {
  it("creates a room state with players and empty shared lists", () => {
    expect(createSyncState(players, 100)).toEqual({
      players,
      sets: [],
      squadResults: [],
      history: [],
      updatedAt: 100,
    });
  });

  it("applies shared state patches without mutating the previous state", () => {
    const state: SyncState = createSyncState(players, 100);
    const next = applySyncPatch(state, { sets: [set], squadResults: [result], history: [historyEntry] }, 200);

    expect(next).toEqual({
      players,
      sets: [set],
      squadResults: [result],
      history: [historyEntry],
      updatedAt: 200,
    });
    expect(state.sets).toEqual([]);
    expect(state.history).toEqual([]);
    expect(next.sets).not.toBe(state.sets);
    expect(next.history).not.toBe(state.history);
  });

  it("records every squad draw result at the front of history", () => {
    const next = recordDrawHistory([historyEntry], [result], 300);

    expect(next).toEqual([
      {
        id: "history-300-0",
        playerName: "玩家 1",
        set,
        drawnAt: 300,
      },
      historyEntry,
    ]);
  });

  it("removes a history entry by id", () => {
    expect(removeHistoryEntry([historyEntry], "history-1")).toEqual([]);
  });

  it("copies a history entry back into the set pool with a fresh id", () => {
    expect(historyEntryToSet(historyEntry, 400)).toEqual({
      ...set,
      id: "set-from-history-400-history-1",
      name: `${set.name} 复用`,
    });
  });
});
