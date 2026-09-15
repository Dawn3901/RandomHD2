import { describe, expect, it } from "vitest";
import type { Stratagem } from "../types";
import { getRandomizableStratagems } from "./stratagems";
import { WILDCARD_CATEGORY, WILDCARD_STRATAGEMS, isWildcardStratagem, wildcardIconSvg } from "./wildcards";

describe("wildcard stratagems", () => {
  it("provides one placeholder per colour", () => {
    expect(WILDCARD_STRATAGEMS.map((item) => item.kind)).toEqual(["red", "blue", "green"]);
    expect(WILDCARD_STRATAGEMS.map((item) => item.id)).toEqual(["wildcard-red", "wildcard-blue", "wildcard-green"]);
    expect(new Set(WILDCARD_STRATAGEMS.map((item) => item.id)).size).toBe(3);
  });

  it("labels them clearly and groups them under a shared category", () => {
    const [red, blue, green] = WILDCARD_STRATAGEMS;

    expect(red.nameZh).toBe("任意红色战备");
    expect(blue.nameZh).toBe("任意蓝色战备");
    expect(green.nameZh).toBe("任意绿色战备");
    expect(WILDCARD_STRATAGEMS.every((item) => item.nameEn.length > 0)).toBe(true);
    expect(WILDCARD_STRATAGEMS.every((item) => item.category === WILDCARD_CATEGORY)).toBe(true);
  });

  it("is marked not selectable so it never enters the random pool", () => {
    expect(WILDCARD_STRATAGEMS.every((item) => item.selectable === false)).toBe(true);
    expect(WILDCARD_STRATAGEMS.every((item) => item.enabled === true)).toBe(true);
  });

  it("is filtered out of the randomizable list even alongside real stratagems", () => {
    const real: Stratagem = {
      id: "eagle-airstrike",
      nameEn: "Eagle Airstrike",
      kind: "red",
      category: "红色战备",
      icon: "/1.svg",
      selectable: true,
      enabled: true,
    };

    const randomizable = getRandomizableStratagems([...WILDCARD_STRATAGEMS, real]);

    expect(randomizable.map((item) => item.id)).toEqual(["eagle-airstrike"]);
  });

  it("uses the same colour palette as the built-in icons", () => {
    expect(wildcardIconSvg("red")).toContain("#190301");
    expect(wildcardIconSvg("red")).toContain("#dc6455");
    expect(wildcardIconSvg("blue")).toContain("#011419");
    expect(wildcardIconSvg("blue")).toContain("#55b9d2");
    expect(wildcardIconSvg("green")).toContain("#081901");
    expect(wildcardIconSvg("green")).toContain("#699655");
    // 虚线框是「空位」的关键视觉提示
    expect(wildcardIconSvg("red")).toContain("stroke-dasharray");
  });

  it("ships the icon as a renderable svg data uri", () => {
    for (const item of WILDCARD_STRATAGEMS) {
      expect(item.icon.startsWith("data:image/svg+xml;charset=utf-8,")).toBe(true);
      expect(decodeURIComponent(item.icon.split(",")[1])).toContain("<svg");
    }
  });

  it("recognises its own ids only", () => {
    expect(isWildcardStratagem("wildcard-red")).toBe(true);
    expect(isWildcardStratagem("wildcard-green")).toBe(true);
    expect(isWildcardStratagem("eagle-airstrike")).toBe(false);
    expect(isWildcardStratagem("")).toBe(false);
  });
});
