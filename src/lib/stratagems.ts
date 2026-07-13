import type { Stratagem } from "../types";

export const STRATAGEM_KIND_ORDER: Record<Stratagem["kind"], number> = {
  red: 0,
  blue: 1,
  green: 2,
  yellow: 3,
};

export function compareStratagemKind(a: Stratagem, b: Stratagem): number {
  const byKind = STRATAGEM_KIND_ORDER[a.kind] - STRATAGEM_KIND_ORDER[b.kind];
  if (byKind !== 0) return byKind;
  return a.nameEn.localeCompare(b.nameEn);
}

export function getRandomizableStratagems(stratagems: Stratagem[]): Stratagem[] {
  return stratagems.filter((item) => item.selectable && item.kind !== "yellow").sort(compareStratagemKind);
}
