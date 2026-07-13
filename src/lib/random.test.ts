import { describe, expect, it } from "vitest";
import type { Catalog, Player, StratagemSet } from "../types";
import { drawSquadSets, pickManyUnique, pickOne, rollQuickLoadout } from "./random";

const sequenceRng = (values: number[]) => {
  let index = 0;
  return () => values[index++ % values.length];
};

const catalog: Catalog = {
  factions: [
    { id: "terminids", nameZh: "终结族", nameEn: "Terminids", icon: "/t.svg" },
    { id: "illuminate", nameZh: "光能族", nameEn: "Illuminate", icon: "/i.svg" },
  ],
  stratagems: [
    { id: "s1", nameEn: "One", kind: "red", category: "红色", icon: "/1.svg", selectable: true, enabled: true },
    { id: "s2", nameEn: "Two", kind: "blue", category: "蓝色", icon: "/2.svg", selectable: true, enabled: true },
    { id: "s3", nameEn: "Three", kind: "green", category: "绿色", icon: "/3.svg", selectable: true, enabled: true },
    { id: "s4", nameEn: "Four", kind: "red", category: "红色", icon: "/4.svg", selectable: true, enabled: true },
    { id: "s5", nameEn: "Five", kind: "yellow", category: "黄色", icon: "/5.svg", selectable: false, enabled: true },
    { id: "s6", nameEn: "Six", kind: "blue", category: "蓝色", icon: "/6.svg", selectable: true, enabled: true },
  ],
  weapons: [
    { id: "p1", nameEn: "Primary", slot: "primary", category: "Primary", icon: "/p.svg", enabled: true },
    { id: "x1", nameEn: "Disabled Primary", slot: "primary", category: "Primary", icon: "/x.svg", enabled: true },
    { id: "sec1", nameEn: "Secondary", slot: "secondary", category: "Secondary", icon: "/s.svg", enabled: true },
  ],
  grenades: [
    { id: "g1", nameEn: "Grenade", slot: "grenade", category: "Grenade", icon: "/g.svg", enabled: true },
  ],
};

describe("random helpers", () => {
  it("throws a clear error when picking from an empty pool", () => {
    expect(() => pickOne([])).toThrow("随机池为空");
  });

  it("picks unique items without mutating the original list", () => {
    const source = ["a", "b", "c", "d"];
    const picked = pickManyUnique(source, 3, sequenceRng([0, 0.9, 0.4]));

    expect(new Set(picked).size).toBe(3);
    expect(source).toEqual(["a", "b", "c", "d"]);
  });

  it("rolls one faction, four unique stratagems, primary, secondary, and grenade", () => {
    const roll = rollQuickLoadout(catalog, ["s1", "s2", "s3", "s4", "s5", "s6", "p1", "sec1", "g1"], sequenceRng([0, 0.8, 0, 0, 0, 0, 0]));

    expect(roll.faction.id).toBe("terminids");
    expect(roll.stratagems).toHaveLength(4);
    expect(new Set(roll.stratagems.map((item) => item.id)).size).toBe(4);
    expect(roll.stratagems.map((item) => item.id)).not.toContain("s5");
    expect(roll.primary.id).toBe("p1");
    expect(roll.secondary.id).toBe("sec1");
    expect(roll.grenade.id).toBe("g1");
  });

  it("rejects quick rolls when fewer than four enabled stratagems remain", () => {
    expect(() => rollQuickLoadout(catalog, ["s1", "s2", "s3", "p1", "sec1", "g1"])).toThrow("至少需要 4 个可用战备");
  });

  it("draws one non-repeated stratagem set per player", () => {
    const players: Player[] = [
      { id: "p1", name: "Dawn" },
      { id: "p2", name: "Friend" },
    ];
    const pool: StratagemSet[] = [
      { id: "set1", ownerName: "Dawn", name: "A", stratagemIds: ["s1", "s2", "s3", "s4"] },
      { id: "set2", ownerName: "Friend", name: "B", stratagemIds: ["s2", "s3", "s4", "s5"] },
      { id: "set3", ownerName: "Dawn", name: "C", stratagemIds: ["s1", "s3", "s4", "s5"] },
    ];

    const results = drawSquadSets(players, pool, sequenceRng([0, 0]));

    expect(results).toHaveLength(2);
    expect(results.map((item) => item.playerName)).toEqual(["Dawn", "Friend"]);
    expect(new Set(results.map((item) => item.set.id)).size).toBe(2);
  });
});
