import { describe, expect, it } from "vitest";
import { createQuickRollText } from "./quick-roll.mjs";

const catalog = {
  factions: [
    { id: "terminids", nameZh: "终结族", nameEn: "Terminids" },
    { id: "automatons", nameZh: "机器人", nameEn: "Automatons" },
  ],
  stratagems: [
    { id: "s1", nameEn: "Eagle Airstrike", kind: "red", selectable: true, enabled: true },
    { id: "s2", nameEn: "Orbital Laser", kind: "red", selectable: true, enabled: true },
    { id: "s3", nameEn: "Supply Pack", kind: "blue", selectable: true, enabled: true },
    { id: "s4", nameEn: "Autocannon Sentry", kind: "green", selectable: true, enabled: true },
    { id: "s5", nameEn: "Mission Stratagem", kind: "yellow", selectable: false, enabled: true },
  ],
  weapons: [
    { id: "p1", nameEn: "Liberator", slot: "primary", enabled: true },
    { id: "sec1", nameEn: "Redeemer", slot: "secondary", enabled: true },
  ],
  grenades: [{ id: "g1", nameEn: "Impact Grenade", slot: "grenade", enabled: true }],
};

const sequenceRng = (values) => {
  let index = 0;
  return () => values[index++ % values.length];
};

describe("quick roll API text", () => {
  it("formats one quick loadout for QQ messages", () => {
    const text = createQuickRollText(catalog, sequenceRng([0.9, 0, 0, 0, 0, 0, 0]));

    expect(text).toContain("地狱潜兵2 随机配装");
    expect(text).toContain("敌方阵营：机器人");
    expect(text).toContain("1. Eagle Airstrike");
    expect(text).toContain("4. Autocannon Sentry");
    expect(text).toContain("主武器：Liberator");
    expect(text).toContain("副武器：Redeemer");
    expect(text).toContain("手雷：Impact Grenade");
    expect(text).not.toContain("Mission Stratagem");
  });
});
