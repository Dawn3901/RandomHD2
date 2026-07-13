import { describe, expect, it } from "vitest";
import type { Player, StratagemSet, SquadDrawResult, SyncState } from "../types";
import { applySyncPatch, createSyncState } from "./sync";

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

describe("sync state helpers", () => {
  it("creates a room state with players and empty shared lists", () => {
    expect(createSyncState(players, 100)).toEqual({
      players,
      sets: [],
      squadResults: [],
      updatedAt: 100,
    });
  });

  it("applies shared state patches without mutating the previous state", () => {
    const state: SyncState = createSyncState(players, 100);
    const next = applySyncPatch(state, { sets: [set], squadResults: [result] }, 200);

    expect(next).toEqual({
      players,
      sets: [set],
      squadResults: [result],
      updatedAt: 200,
    });
    expect(state.sets).toEqual([]);
    expect(next.sets).not.toBe(state.sets);
  });
});
