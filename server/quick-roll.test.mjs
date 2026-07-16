import { describe, expect, it } from "vitest";
import { createQuickRollPng, createQuickRollSvg, createQuickRollText } from "./quick-roll.mjs";

const catalog = {
  factions: [
    { id: "terminids", nameZh: "终结族", nameEn: "Terminids", icon: "/assets/wiki/factions/Terminid_Icon.svg" },
    { id: "automatons", nameZh: "机器人", nameEn: "Automatons", icon: "/assets/wiki/factions/Automaton_Icon.svg" },
  ],
  stratagems: [
    { id: "s1", nameEn: "Eagle Airstrike", kind: "red", icon: "/assets/wiki/stratagems/eagle.svg", selectable: true, enabled: true },
    { id: "s2", nameEn: "Orbital Laser", kind: "red", icon: "/assets/wiki/stratagems/laser.svg", selectable: true, enabled: true },
    { id: "s3", nameEn: "Supply Pack", kind: "blue", icon: "/assets/wiki/stratagems/supply.svg", selectable: true, enabled: true },
    { id: "s4", nameEn: "Autocannon Sentry", kind: "green", icon: "/assets/wiki/stratagems/sentry.svg", selectable: true, enabled: true },
    { id: "s5", nameEn: "Mission Stratagem", kind: "yellow", icon: "/assets/wiki/stratagems/mission.svg", selectable: false, enabled: true },
  ],
  weapons: [
    { id: "p1", nameEn: "Liberator", icon: "/assets/wiki/weapons/liberator.svg", slot: "primary", enabled: true },
    { id: "sec1", nameEn: "Redeemer", icon: "/assets/wiki/weapons/redeemer.svg", slot: "secondary", enabled: true },
  ],
  grenades: [{ id: "g1", nameEn: "Impact Grenade", icon: "/assets/wiki/weapons/impact.svg", slot: "grenade", enabled: true }],
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

  it("formats one quick loadout as an SVG image card", () => {
    const svg = createQuickRollSvg(catalog, "https://example.test", sequenceRng([0.9, 0, 0, 0, 0, 0, 0]));

    expect(svg).toContain("<svg");
    expect(svg).toContain("地狱潜兵2 随机配装");
    expect(svg).toContain("机器人");
    expect(svg).toContain("Eagle Airstrike");
    expect(svg).toContain("https://example.test/assets/wiki/stratagems/eagle.svg");
    expect(svg).toContain("#f05a4f");
    expect(svg).not.toContain("Mission Stratagem");
  });

  it("renders one quick loadout as a PNG image card", async () => {
    const png = await createQuickRollPng(catalog, "https://example.test", sequenceRng([0.9, 0, 0, 0, 0, 0, 0]));

    expect(Buffer.isBuffer(png)).toBe(true);
    expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  });
});
