import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadStoredState, normalizeCustomItems, saveStoredState } from "./state-store.mjs";

const defaultState = {
  players: [{ id: "player-1", name: "玩家 1" }],
  sets: [],
  squadResults: [],
  history: [],
  customItems: [],
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
      customItems: [
        {
          id: "custom-1",
          kind: "stratagem",
          nameEn: "Meltagun",
          category: "蓝色战备",
          stratagemKind: "blue",
          svg: "<svg/>",
          createdAt: 120,
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

describe("normalizeCustomItems", () => {
  const valid = {
    id: "custom-1",
    kind: "stratagem",
    nameEn: "Meltagun",
    category: "蓝色战备",
    stratagemKind: "blue",
    svg: "<svg/>",
    createdAt: 120,
  };

  it("keeps a well formed stratagem item", () => {
    expect(normalizeCustomItems([valid])).toEqual([valid]);
  });

  it("keeps a well formed weapon item and drops unknown fields", () => {
    const weapon = { ...valid, id: "custom-2", kind: "weapon", stratagemKind: undefined, slot: "grenade", extra: "x" };

    expect(normalizeCustomItems([weapon])).toEqual([
      {
        id: "custom-2",
        kind: "weapon",
        nameEn: "Meltagun",
        category: "蓝色战备",
        slot: "grenade",
        svg: "<svg/>",
        createdAt: 120,
      },
    ]);
  });

  it("drops entries with a missing id, svg, name, or unknown category", () => {
    expect(normalizeCustomItems([{ ...valid, id: "" }])).toEqual([]);
    expect(normalizeCustomItems([{ ...valid, svg: "" }])).toEqual([]);
    expect(normalizeCustomItems([{ ...valid, nameEn: undefined }])).toEqual([]);
    expect(normalizeCustomItems([{ ...valid, stratagemKind: "purple" }])).toEqual([]);
    expect(normalizeCustomItems([{ ...valid, kind: "weapon" }])).toEqual([]);
  });

  it("drops an oversized svg and non object entries", () => {
    expect(normalizeCustomItems([{ ...valid, svg: "a".repeat(256 * 1024 + 1) }])).toEqual([]);
    expect(normalizeCustomItems([null, "nope", 42])).toEqual([]);
  });

  it("preserves the soft delete marker", () => {
    expect(normalizeCustomItems([{ ...valid, deletedAt: 999 }])[0].deletedAt).toBe(999);
  });

  it("falls back when the value is not an array", () => {
    expect(normalizeCustomItems(undefined, ["fallback"])).toEqual(["fallback"]);
    expect(normalizeCustomItems({}, ["fallback"])).toEqual(["fallback"]);
  });
});
