import { describe, expect, it } from "vitest";
import type { Stratagem } from "../types";
import { getRandomizableStratagems } from "./stratagems";

const stratagems: Stratagem[] = [
  { id: "green", nameEn: "Green", kind: "green", category: "绿色", icon: "", selectable: true, enabled: true },
  { id: "yellow", nameEn: "Yellow", kind: "yellow", category: "黄色", icon: "", selectable: false, enabled: true },
  { id: "blue", nameEn: "Blue", kind: "blue", category: "蓝色", icon: "", selectable: true, enabled: true },
  { id: "red", nameEn: "Red", kind: "red", category: "红色", icon: "", selectable: true, enabled: true },
];

describe("stratagem catalog helpers", () => {
  it("excludes yellow mission stratagems and orders red, blue, green", () => {
    expect(getRandomizableStratagems(stratagems).map((item) => item.id)).toEqual(["red", "blue", "green"]);
  });
});
