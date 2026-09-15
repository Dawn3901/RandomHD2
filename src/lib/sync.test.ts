import { describe, expect, it } from "vitest";
import type { CustomItem, DrawHistoryEntry, Player, StratagemSet, SquadDrawResult, SyncState } from "../types";
import {
  applySyncPatch,
  createSyncState,
  historyEntryToSet,
  recordCreatedSetHistory,
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

const customItem: CustomItem = {
  id: "custom-1",
  kind: "stratagem",
  nameEn: "Meltagun",
  stratagemKind: "blue",
  category: "蓝色战备",
  svg: "<svg/>",
  createdAt: 120,
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
      customItems: [],
      updatedAt: 100,
    });
  });

  it("applies shared state patches without mutating the previous state", () => {
    const state: SyncState = createSyncState(players, 100);
    const next = applySyncPatch(
      state,
      { sets: [set], squadResults: [result], history: [historyEntry], customItems: [customItem] },
      200,
    );

    expect(next).toEqual({
      players,
      sets: [set],
      squadResults: [result],
      history: [historyEntry],
      customItems: [customItem],
      updatedAt: 200,
    });
    expect(state.sets).toEqual([]);
    expect(state.history).toEqual([]);
    expect(state.customItems).toEqual([]);
    expect(next.sets).not.toBe(state.sets);
    expect(next.customItems).not.toBe(state.customItems);
  });

  it("keeps existing custom items when a patch omits them", () => {
    const state: SyncState = applySyncPatch(createSyncState(players, 100), { customItems: [customItem] }, 200);
    const next = applySyncPatch(state, { sets: [set] }, 300);

    expect(next.customItems).toEqual([customItem]);
    expect(next.sets).toEqual([set]);
  });

  it("records a created set at the front of history", () => {
    const next = recordCreatedSetHistory([historyEntry], set, 300);

    expect(next).toEqual([
      {
        id: "history-set-300-set-1",
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
