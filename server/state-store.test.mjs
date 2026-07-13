import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadStoredState, saveStoredState } from "./state-store.mjs";

const defaultState = {
  players: [{ id: "player-1", name: "玩家 1" }],
  sets: [],
  squadResults: [],
  history: [],
  updatedAt: 100,
};

let tempDirs = [];

function makeStateFile() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "randomhd2-state-"));
  tempDirs.push(tempDir);
  return path.join(tempDir, "sync-state.json");
}

afterEach(() => {
  for (const tempDir of tempDirs) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
  tempDirs = [];
});

describe("server state store", () => {
  it("returns the default state when no local state file exists", () => {
    const filePath = makeStateFile();

    expect(loadStoredState(filePath, defaultState)).toEqual(defaultState);
  });

  it("persists and restores shared history and pool state", () => {
    const filePath = makeStateFile();
    const state = {
      players: [{ id: "player-1", name: "玩家 1" }],
      sets: [
        {
          id: "set-1",
          ownerName: "玩家 1",
          name: "测试组合",
          stratagemIds: ["a", "b", "c", "d"],
        },
      ],
      squadResults: [],
      history: [
        {
          id: "history-1",
          playerName: "玩家 1",
          drawnAt: 123,
          set: {
            id: "set-1",
            ownerName: "玩家 1",
            name: "测试组合",
            stratagemIds: ["a", "b", "c", "d"],
          },
        },
      ],
      updatedAt: 200,
    };

    saveStoredState(filePath, state);

    expect(loadStoredState(filePath, defaultState)).toEqual(state);
  });

  it("fills missing lists when loading an older state file", () => {
    const filePath = makeStateFile();
    fs.writeFileSync(filePath, JSON.stringify({ players: defaultState.players, updatedAt: 50 }), "utf8");

    expect(loadStoredState(filePath, defaultState)).toEqual({
      ...defaultState,
      updatedAt: 50,
    });
  });
});
