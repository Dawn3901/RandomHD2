import { describe, expect, it } from "vitest";
import type { Catalog, CustomItem, StratagemSet } from "../types";
import {
  MAX_PNG_BYTES,
  MAX_SVG_BYTES,
  MAX_UNDO_STACK,
  activeCustomItems,
  applyUndo,
  bytesToBase64,
  countSetUsage,
  createCustomItem,
  customItemIcon,
  customItemToStratagem,
  customItemToWeapon,
  customOpLabel,
  deletedCustomItems,
  isPngBytes,
  mergeCustomItems,
  nameFromFileName,
  purgeCustomItem,
  pushCustomOp,
  restoreCustomItem,
  sanitizeSvg,
  softDeleteCustomItem,
  svgToDataUri,
  validateCustomUpload,
  type CustomItemOp,
} from "./customItems";

const SVG = '<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>';

const catalog: Catalog = {
  factions: [{ id: "terminids", nameZh: "终结族", nameEn: "Terminids", icon: "/t.svg" }],
  stratagems: [
    { id: "s1", nameEn: "Built In", kind: "red", category: "红色战备", icon: "/1.svg", selectable: true, enabled: true },
  ],
  weapons: [
    { id: "p1", nameEn: "Primary", slot: "primary", category: "Primary", icon: "/p.svg", enabled: true },
  ],
  grenades: [
    { id: "g1", nameEn: "Grenade", slot: "grenade", category: "Grenade", icon: "/g.svg", enabled: true },
  ],
};

function makeItem(overrides: Partial<CustomItem> = {}): CustomItem {
  return {
    id: "custom-1",
    kind: "stratagem",
    nameEn: "Meltagun",
    stratagemKind: "blue",
    category: "蓝色战备",
    svg: SVG,
    createdAt: 100,
    ...overrides,
  };
}

function upload(overrides: Record<string, unknown> = {}) {
  return validateCustomUpload({
    kind: "stratagem",
    nameEn: "Meltagun",
    stratagemKind: "blue",
    svg: SVG,
    ...overrides,
  } as never);
}

describe("sanitizeSvg", () => {
  it("removes scripts, event handlers, javascript urls, and foreignObject", () => {
    const dirty = [
      '<svg xmlns="http://www.w3.org/2000/svg">',
      '<script>alert(1)</script>',
      '<rect width="10" height="10" onload="steal()" onclick=\'x()\'/>',
      '<a href="javascript:alert(2)">x</a>',
      "<foreignObject><body>hi</body></foreignObject>",
      '<circle r="4"/>',
      "</svg>",
    ].join("");

    const clean = sanitizeSvg(dirty);

    expect(clean).not.toMatch(/<script/i);
    expect(clean).not.toMatch(/onload|onclick/i);
    expect(clean).not.toMatch(/javascript:/i);
    expect(clean).not.toMatch(/foreignObject/i);
    expect(clean).toContain('<rect width="10" height="10"');
    expect(clean).toContain('<circle r="4"/>');
  });
});

describe("validateCustomUpload", () => {
  it("rejects an empty name", () => {
    expect(upload({ nameEn: "   " })).toEqual({ ok: false, error: "请填写名称" });
  });

  it("rejects a missing or non-svg file", () => {
    expect(upload({ svg: "" })).toEqual({ ok: false, error: "请选择 SVG 文件" });
    expect(upload({ svg: "<html><body>nope</body></html>" })).toEqual({
      ok: false,
      error: "文件内容不是有效的 SVG",
    });
  });

  it("rejects an svg over the size limit", () => {
    const huge = `<svg>${"a".repeat(MAX_SVG_BYTES)}</svg>`;
    expect(upload({ svg: huge })).toEqual({
      ok: false,
      error: `SVG 过大，上限 ${Math.round(MAX_SVG_BYTES / 1024)} KB`,
    });
  });

  it("rejects an unknown stratagem kind or weapon slot", () => {
    expect(upload({ stratagemKind: "purple" })).toEqual({ ok: false, error: "请选择战备类别" });
    expect(upload({ kind: "weapon", stratagemKind: undefined, slot: "melee" })).toEqual({
      ok: false,
      error: "请选择武器槽位",
    });
  });

  it("derives the stratagem category from its kind", () => {
    const result = upload({ nameEn: "  Meltagun  ", nameZh: " 热熔枪 " });

    expect(result).toEqual({
      ok: true,
      value: {
        kind: "stratagem",
        nameEn: "Meltagun",
        nameZh: "热熔枪",
        stratagemKind: "blue",
        category: "蓝色战备",
        format: "svg",
        svg: SVG,
      },
    });
  });

  it("falls back to the slot label for a weapon category", () => {
    const result = validateCustomUpload({
      kind: "weapon",
      nameEn: "Custom Grenade",
      slot: "grenade",
      svg: SVG,
    });

    expect(result).toEqual({
      ok: true,
      value: {
        kind: "weapon",
        nameEn: "Custom Grenade",
        nameZh: undefined,
        slot: "grenade",
        category: "手雷",
        format: "svg",
        svg: SVG,
      },
    });
  });

  it("accepts a PNG payload when format is png", () => {
    const png = `data:image/png;base64,${"iVBORw0KGgoAAAANSUhEUg=="}`;

    const result = validateCustomUpload({
      kind: "weapon",
      nameEn: "Hot-Shot",
      slot: "primary",
      format: "png",
      svg: png.replace(/^data:[^,]*,/, ""),
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.format).toBe("png");
      expect(result.value.category).toBe("主武器");
    }
  });

  it("rejects a payload that is not really a PNG", () => {
    const result = validateCustomUpload({
      kind: "weapon",
      nameEn: "Fake",
      slot: "primary",
      format: "png",
      svg: "bm90IGEgcG5n",
    });

    expect(result).toEqual({ ok: false, error: "文件内容不是有效的 PNG" });
  });

  it("rejects an oversized PNG payload", () => {
    const result = validateCustomUpload({
      kind: "weapon",
      nameEn: "Huge",
      slot: "primary",
      format: "png",
      svg: `iVBORw0KGgo${"A".repeat(MAX_PNG_BYTES)}`,
    });

    expect(result).toEqual({
      ok: false,
      error: `PNG 过大，上限 ${Math.round(MAX_PNG_BYTES / 1024)} KB`,
    });
  });
});

describe("svgToDataUri", () => {
  it("encodes characters that would break a data uri", () => {
    const uri = svgToDataUri('<svg fill="#fff"/>');

    expect(uri.startsWith("data:image/svg+xml;charset=utf-8,")).toBe(true);
    expect(uri).toContain("%23fff");
    expect(uri).not.toContain("#fff");
  });
});

describe("createCustomItem", () => {
  it("builds an item with a generated id and keeps the svg source", () => {
    const result = upload();
    if (!result.ok) throw new Error("fixture should be valid");

    const item = createCustomItem(result.value, 1000, "abc");

    expect(item.id).toBe(`custom-${(1000).toString(36)}-abc`);
    expect(item.createdAt).toBe(1000);
    expect(item.svg).toBe(SVG);
    expect(item.deletedAt).toBeUndefined();
  });
});

describe("catalog conversion", () => {
  it("maps a custom stratagem and excludes yellow from the random pool", () => {
    const blue = customItemToStratagem(makeItem());
    const yellow = customItemToStratagem(makeItem({ id: "custom-2", stratagemKind: "yellow" }));

    expect(blue).toEqual({
      id: "custom-1",
      nameZh: undefined,
      nameEn: "Meltagun",
      kind: "blue",
      category: "蓝色战备",
      icon: svgToDataUri(SVG),
      selectable: true,
      enabled: true,
    });
    expect(yellow.selectable).toBe(false);
  });

  it("maps a custom weapon", () => {
    const weapon = customItemToWeapon(
      makeItem({ id: "custom-3", kind: "weapon", stratagemKind: undefined, slot: "secondary", category: "副武器" }),
    );

    expect(weapon.slot).toBe("secondary");
    expect(weapon.enabled).toBe(true);
    expect(weapon.icon.startsWith("data:image/svg+xml")).toBe(true);
  });
});

describe("mergeCustomItems", () => {
  it("appends custom items to the matching catalog arrays", () => {
    const merged = mergeCustomItems(catalog, [
      makeItem({ id: "custom-s" }),
      makeItem({ id: "custom-w", kind: "weapon", stratagemKind: undefined, slot: "primary", category: "Primary" }),
      makeItem({ id: "custom-g", kind: "weapon", stratagemKind: undefined, slot: "grenade", category: "Grenade" }),
    ]);

    expect(merged.stratagems.map((item) => item.id)).toEqual(["s1", "custom-s"]);
    expect(merged.weapons.map((item) => item.id)).toEqual(["p1", "custom-w"]);
    expect(merged.grenades.map((item) => item.id)).toEqual(["g1", "custom-g"]);
    expect(catalog.stratagems.map((item) => item.id)).toEqual(["s1"]);
  });

  it("keeps deleted items out of the catalog", () => {
    const merged = mergeCustomItems(catalog, [makeItem({ id: "custom-gone", deletedAt: 500 })]);

    expect(merged.stratagems.map((item) => item.id)).toEqual(["s1"]);
    expect(activeCustomItems([makeItem({ deletedAt: 1 })])).toEqual([]);
    expect(deletedCustomItems([makeItem({ deletedAt: 1 })])).toHaveLength(1);
  });
});

describe("delete and restore", () => {
  it("soft deletes, restores, and purges", () => {
    const items = [makeItem()];

    const deleted = softDeleteCustomItem(items, "custom-1", 500);
    expect(deleted[0].deletedAt).toBe(500);
    expect(items[0].deletedAt).toBeUndefined();

    expect(restoreCustomItem(deleted, "custom-1")[0].deletedAt).toBeUndefined();
    expect(purgeCustomItem(items, "custom-1")).toEqual([]);
  });

  it("counts how many sets reference an item", () => {
    const sets: StratagemSet[] = [
      { id: "set-1", ownerName: "Dawn", name: "A", stratagemIds: ["custom-1", "s1", "s2", "s3"] },
      { id: "set-2", ownerName: "Dawn", name: "B", stratagemIds: ["s1", "s2", "s3", "s4"] },
    ];

    expect(countSetUsage(sets, "custom-1")).toBe(1);
    expect(countSetUsage(sets, "missing")).toBe(0);
  });
});

describe("undo", () => {
  const op = (type: CustomItemOp["type"]): CustomItemOp => ({
    type,
    itemId: "custom-1",
    label: customOpLabel(type, { nameEn: "Meltagun", nameZh: "热熔枪" }),
  });

  it("labels operations with the display name", () => {
    expect(op("create").label).toBe("创建「热熔枪」");
    expect(op("delete").label).toBe("删除「热熔枪」");
    expect(op("restore").label).toBe("恢复「热熔枪」");
  });

  it("undoes a create by soft deleting it again", () => {
    const result = applyUndo([makeItem()], op("create"), 900);

    expect(result[0].deletedAt).toBe(900);
  });

  it("undoes a delete by restoring it", () => {
    const result = applyUndo([makeItem({ deletedAt: 500 })], op("delete"), 900);

    expect(result[0].deletedAt).toBeUndefined();
  });

  it("undoes a restore by soft deleting it", () => {
    const result = applyUndo([makeItem()], op("restore"), 900);

    expect(result[0].deletedAt).toBe(900);
  });

  it("leaves unrelated items untouched", () => {
    const result = applyUndo([makeItem({ id: "other" })], op("delete"), 900);

    expect(result[0].deletedAt).toBeUndefined();
  });

  it("caps the undo stack", () => {
    let stack: CustomItemOp[] = [];
    for (let index = 0; index < MAX_UNDO_STACK + 5; index += 1) {
      stack = pushCustomOp(stack, { type: "create", itemId: `item-${index}`, label: `op-${index}` });
    }

    expect(stack).toHaveLength(MAX_UNDO_STACK);
    expect(stack[stack.length - 1].itemId).toBe(`item-${MAX_UNDO_STACK + 4}`);
    expect(stack[0].itemId).toBe("item-5");
  });
});

describe("nameFromFileName", () => {
  it("derives a readable name from the uploaded file name", () => {
    expect(nameFromFileName("Meltagun_Stratagem.svg")).toBe("Meltagun Stratagem");
    expect(nameFromFileName("my-icon.SVG")).toBe("my icon");
  });
});

describe("PNG payloads", () => {
  it("detects the PNG signature", () => {
    expect(isPngBytes(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe(true);
    expect(isPngBytes(new TextEncoder().encode("<svg"))).toBe(false);
    expect(isPngBytes(new Uint8Array([]))).toBe(false);
  });

  it("encodes bytes as base64 with the PNG signature prefix", () => {
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

    expect(bytesToBase64(bytes)).toMatch(/^iVBORw0KGgo/);
  });

  it("picks the data uri by format", () => {
    expect(customItemIcon({ svg: "iVBORw0KGgoAAA", format: "png" })).toBe("data:image/png;base64,iVBORw0KGgoAAA");
    expect(customItemIcon({ svg: SVG })).toBe(svgToDataUri(SVG));
  });

  it("maps a png custom weapon to a png icon", () => {
    const weapon = customItemToWeapon(
      makeItem({
        id: "custom-png",
        kind: "weapon",
        stratagemKind: undefined,
        slot: "primary",
        format: "png",
        svg: "iVBORw0KGgoAAA",
      }),
    );

    expect(weapon.icon).toBe("data:image/png;base64,iVBORw0KGgoAAA");
  });
});
