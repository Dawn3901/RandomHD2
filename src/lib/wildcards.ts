import type { Stratagem } from "../types";
import { svgToDataUri } from "./customItems";

export type WildcardKind = "red" | "blue" | "green";

/**
 * 沿用真实战备图标的三色配色（背景 + 高光 + 近白图案），
 * 让占位图标看起来和内置图标是同一套设计。
 */
const WILDCARD_PALETTE: Record<WildcardKind, { background: string; accent: string }> = {
  red: { background: "#190301", accent: "#dc6455" },
  blue: { background: "#011419", accent: "#55b9d2" },
  green: { background: "#081901", accent: "#699655" },
};

const WILDCARD_LABELS: Record<WildcardKind, { nameZh: string; nameEn: string }> = {
  red: { nameZh: "任意红色战备", nameEn: "Any Red Stratagem" },
  blue: { nameZh: "任意蓝色战备", nameEn: "Any Blue Stratagem" },
  green: { nameZh: "任意绿色战备", nameEn: "Any Green Stratagem" },
};

export const WILDCARD_CATEGORY = "通用占位";

/**
 * 空槽占位图标：底色为该颜色的战备底色，内嵌虚线方框表示「空位」，
 * 中间一个问号表示「任意」。虚线方框本身就是提示，所以即使字体缺失也能看懂。
 *
 * 尺寸上刻意贴近真实图标：真实图标的美术几乎铺满整格（实测两类图标渲染尺寸相同），
 * 所以这里虚线框只内缩 4%、问号也放大，否则视觉上会比旁边的图标「小一圈」。
 */
export function wildcardIconSvg(kind: WildcardKind): string {
  const { background, accent } = WILDCARD_PALETTE[kind];

  return [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">',
    `<rect width="100" height="100" fill="${background}"/>`,
    `<rect x="4" y="4" width="92" height="92" fill="none" stroke="${accent}"`,
    ' stroke-width="6" stroke-dasharray="15 9"/>',
    `<text x="50" y="76" fill="#FFFFEE" font-family="sans-serif" font-size="72"`,
    ' font-weight="700" text-anchor="middle">?</text>',
    "</svg>",
  ].join("");
}

/**
 * 三个颜色占位项。`selectable: false` 是关键：它同时保证
 * 「不进入随机池的可选列表」和「不会被全部随机抽到」。
 */
export const WILDCARD_STRATAGEMS: Stratagem[] = (["red", "blue", "green"] as const).map((kind) => ({
  id: `wildcard-${kind}`,
  nameZh: WILDCARD_LABELS[kind].nameZh,
  nameEn: WILDCARD_LABELS[kind].nameEn,
  kind,
  category: WILDCARD_CATEGORY,
  icon: svgToDataUri(wildcardIconSvg(kind)),
  selectable: false,
  enabled: true,
}));

const WILDCARD_IDS = new Set(WILDCARD_STRATAGEMS.map((item) => item.id));

export function isWildcardStratagem(id: string): boolean {
  return WILDCARD_IDS.has(id);
}
