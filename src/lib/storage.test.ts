import { describe, expect, it } from "vitest";
import { createMemoryStorage, loadJson, saveJson } from "./storage";

describe("storage helpers", () => {
  it("returns fallback data when stored JSON is invalid", () => {
    const storage = createMemoryStorage({ broken: "{not json" });

    expect(loadJson(storage, "broken", { ok: true })).toEqual({ ok: true });
  });

  it("saves and loads JSON values", () => {
    const storage = createMemoryStorage();

    saveJson(storage, "players", [{ id: "p1", name: "Dawn" }]);

    expect(loadJson(storage, "players", [])).toEqual([{ id: "p1", name: "Dawn" }]);
  });
});
