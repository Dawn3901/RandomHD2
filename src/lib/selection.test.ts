import { describe, expect, it } from "vitest";
import { MAX_SET_STRATAGEMS, addToSelection, removeFromSelectionAt, selectionCount } from "./selection";

describe("set selection", () => {
  it("adds items up to four", () => {
    let selection: string[] = [];
    for (const id of ["a", "b", "c", "d"]) selection = addToSelection(selection, id);

    expect(selection).toEqual(["a", "b", "c", "d"]);
    expect(addToSelection(selection, "e")).toEqual(["a", "b", "c", "d"]);
    expect(MAX_SET_STRATAGEMS).toBe(4);
  });

  it("refuses a duplicate when duplicates are not allowed", () => {
    const selection = ["eagle-airstrike", "b"];

    expect(addToSelection(selection, "eagle-airstrike")).toEqual(selection);
    // 原数组不被修改
    expect(selection).toEqual(["eagle-airstrike", "b"]);
  });

  it("allows duplicates for the colour placeholders", () => {
    let selection = ["eagle-airstrike", "wildcard-red"];

    selection = addToSelection(selection, "wildcard-red", true);
    selection = addToSelection(selection, "wildcard-red", true);

    expect(selection).toEqual(["eagle-airstrike", "wildcard-red", "wildcard-red", "wildcard-red"]);
    expect(selectionCount(selection, "wildcard-red")).toBe(3);
  });

  it("still stops at four even when duplicating", () => {
    const selection = ["wildcard-red", "wildcard-red", "wildcard-red", "wildcard-red"];

    expect(addToSelection(selection, "wildcard-red", true)).toEqual(selection);
  });

  it("supports the two-specific-plus-two-wildcard case", () => {
    let selection: string[] = [];
    selection = addToSelection(selection, "eagle-airstrike");
    selection = addToSelection(selection, "eagle-500kg-bomb");
    selection = addToSelection(selection, "wildcard-blue", true);
    selection = addToSelection(selection, "wildcard-blue", true);

    expect(selection).toHaveLength(4);
    expect(selectionCount(selection, "wildcard-blue")).toBe(2);
    expect(selectionCount(selection, "eagle-airstrike")).toBe(1);
  });

  it("removes only the clicked occurrence of a duplicated item", () => {
    const selection = ["wildcard-red", "a", "wildcard-red", "b"];

    expect(removeFromSelectionAt(selection, 0)).toEqual(["a", "wildcard-red", "b"]);
    expect(removeFromSelectionAt(selection, 2)).toEqual(["wildcard-red", "a", "b"]);
  });

  it("ignores an out-of-range removal", () => {
    const selection = ["a", "b"];

    expect(removeFromSelectionAt(selection, -1)).toBe(selection);
    expect(removeFromSelectionAt(selection, 5)).toBe(selection);
  });
});
