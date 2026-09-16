import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { clearIconCache, createQuickRollPng, createQuickRollSvg, createQuickRollText, iconCacheStats } from "./quick-roll.mjs";

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

function createAssetRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "randomhd2-assets-"));
  const files = [
    "assets/wiki/factions/Automaton_Icon.svg",
    "assets/wiki/stratagems/eagle.svg",
    "assets/wiki/stratagems/laser.svg",
    "assets/wiki/stratagems/supply.svg",
    "assets/wiki/stratagems/sentry.svg",
    "assets/wiki/weapons/liberator.svg",
    "assets/wiki/weapons/redeemer.svg",
    "assets/wiki/weapons/impact.svg",
  ];

  for (const file of files) {
    const fullPath = path.join(root, file);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="#fff"/></svg>');
  }

  return root;
}

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

  it("inlines local asset icons into the SVG image card", () => {
    const assetRoot = createAssetRoot();
    const svg = createQuickRollSvg(catalog, "https://example.test", sequenceRng([0.9, 0, 0, 0, 0, 0, 0]), { assetRoot });

    expect(svg).toContain("data:image/svg+xml;base64,");
    expect(svg).not.toContain("https://example.test/assets/wiki/stratagems/eagle.svg");
  });

  it("renders one quick loadout as a PNG image card", async () => {
    const assetRoot = createAssetRoot();
    const png = await createQuickRollPng(catalog, "https://example.test", sequenceRng([0.9, 0, 0, 0, 0, 0, 0]), { assetRoot });

    expect(Buffer.isBuffer(png)).toBe(true);
    expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  });
});

describe("icon thumbnails and cache", () => {
  const THUMB_MARKER = "THUMBNAIL-MARKER";

  /** 卡片里还有阵营图标等，所以要把所有内嵌图标都解出来判断，不能只看第一个 */
  function decodeIcons(svg) {
    return [...svg.matchAll(/data:image\/svg\+xml;base64,([A-Za-z0-9+/=]+)/g)].map((match) =>
      Buffer.from(match[1], "base64").toString("utf8"),
    );
  }

  /** 真实图标会带 thumbIcon；这里造一个内容明显不同的缩略图以便断言用的是哪一份 */
  function catalogWithThumbs(assetRoot) {
    fs.mkdirSync(path.join(assetRoot, "assets/wiki/thumbs"), { recursive: true });
    fs.writeFileSync(
      path.join(assetRoot, "assets/wiki/thumbs/eagle.svg"),
      `<svg xmlns="http://www.w3.org/2000/svg"><text>${THUMB_MARKER}</text></svg>`,
    );

    return {
      ...catalog,
      stratagems: catalog.stratagems.map((item) =>
        item.id === "s1" ? { ...item, thumbIcon: "/assets/wiki/thumbs/eagle.svg" } : item,
      ),
    };
  }

  it("prefers the thumbnail over the full size icon", () => {
    const assetRoot = createAssetRoot();
    const svg = createQuickRollSvg(catalogWithThumbs(assetRoot), "", sequenceRng([0.9, 0, 0, 0, 0, 0, 0]), { assetRoot });

    const icons = decodeIcons(svg);
    expect(icons.some((icon) => icon.includes(THUMB_MARKER))).toBe(true);
    // 用了缩略图之后，就没有任何一处再读原图了
    expect(icons).toHaveLength(8);
  });

  it("falls back to the full size icon when there is no thumbnail", () => {
    const assetRoot = createAssetRoot();
    const svg = createQuickRollSvg(catalog, "", sequenceRng([0.9, 0, 0, 0, 0, 0, 0]), { assetRoot });

    const icons = decodeIcons(svg);
    expect(icons.length).toBeGreaterThan(0);
    expect(icons.every((icon) => !icon.includes(THUMB_MARKER))).toBe(true);
    expect(icons.some((icon) => icon.includes('fill="#fff"'))).toBe(true);
  });

  it("reads each icon from disk only once across repeated renders", () => {
    clearIconCache();
    const assetRoot = createAssetRoot();
    const spy = vi.spyOn(fs, "readFileSync");

    createQuickRollSvg(catalog, "", sequenceRng([0.9, 0, 0, 0, 0, 0, 0]), { assetRoot });
    const firstPass = spy.mock.calls.length;
    expect(firstPass).toBeGreaterThan(0);

    createQuickRollSvg(catalog, "", sequenceRng([0.9, 0, 0, 0, 0, 0, 0]), { assetRoot });
    expect(spy.mock.calls.length).toBe(firstPass);

    spy.mockRestore();
    expect(iconCacheStats().entries).toBeGreaterThan(0);
  });

  it("re-reads an icon whose file changed", () => {
    clearIconCache();
    const assetRoot = createAssetRoot();
    const iconPath = path.join(assetRoot, "assets/wiki/stratagems/eagle.svg");

    createQuickRollSvg(catalog, "", sequenceRng([0.9, 0, 0, 0, 0, 0, 0]), { assetRoot });
    const before = iconCacheStats().entries;

    fs.writeFileSync(iconPath, '<svg xmlns="http://www.w3.org/2000/svg"><text>CHANGED</text></svg>');
    fs.utimesSync(iconPath, new Date(), new Date(Date.now() + 2000));

    const svg = createQuickRollSvg(catalog, "", sequenceRng([0.9, 0, 0, 0, 0, 0, 0]), { assetRoot });

    expect(decodeIcons(svg).some((icon) => icon.includes("CHANGED"))).toBe(true);
    expect(iconCacheStats().entries).toBe(before);
  });

  it("ignores a missing icon instead of throwing", () => {
    clearIconCache();
    const assetRoot = createAssetRoot();

    expect(() =>
      createQuickRollSvg(catalog, "https://example.test", sequenceRng([0.9, 0, 0, 0, 0, 0, 0]), {
        assetRoot: path.join(assetRoot, "does-not-exist"),
      }),
    ).not.toThrow();
  });
});
