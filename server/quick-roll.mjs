import fs from "node:fs";
import path from "node:path";

import sharp from "sharp";

const defaultRng = () => Math.random();

function itemLabel(item) {
  return item.nameZh || item.nameEn;
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function absoluteAssetUrl(publicBaseUrl, icon) {
  if (!icon) return "";
  if (/^https?:\/\//i.test(icon)) return icon;
  return `${publicBaseUrl.replace(/\/$/, "")}${icon.startsWith("/") ? icon : `/${icon}`}`;
}

/** 大图优先用构建时生成的缩略图：卡片上图标只画 58px，读原图纯属浪费 */
function preferredIcon(item) {
  return item?.thumbIcon || item?.icon || "";
}

// 图标在镜像里是构建期产物、运行期不会变，所以读一次就能一直复用。
// 用 size+mtime 作为失效条件，这样本地重跑 generate:data 后会自动重新读取。
// 带字节预算：内存紧张的机器上不能把整套图标都缓存进来。
const ICON_CACHE_MAX_BYTES = 24 * 1024 * 1024;
const iconCache = new Map();
let iconCacheBytes = 0;

export function clearIconCache() {
  iconCache.clear();
  iconCacheBytes = 0;
}

export function iconCacheStats() {
  return { entries: iconCache.size, bytes: iconCacheBytes };
}

function readIconDataUri(resolved, mimeType) {
  let stamp;
  try {
    const stat = fs.statSync(resolved);
    if (!stat.isFile()) return "";
    stamp = `${stat.size}:${stat.mtimeMs}`;
  } catch {
    return "";
  }

  const cached = iconCache.get(resolved);
  if (cached && cached.stamp === stamp) return cached.dataUri;

  const dataUri = `data:${mimeType};base64,${fs.readFileSync(resolved).toString("base64")}`;

  if (cached) iconCacheBytes -= cached.dataUri.length;
  iconCache.set(resolved, { stamp, dataUri });
  iconCacheBytes += dataUri.length;

  // 超预算时按插入顺序淘汰最旧的条目
  while (iconCacheBytes > ICON_CACHE_MAX_BYTES && iconCache.size > 1) {
    const oldest = iconCache.keys().next().value;
    const entry = iconCache.get(oldest);
    iconCache.delete(oldest);
    iconCacheBytes -= entry.dataUri.length;
  }

  return dataUri;
}

function iconDataUri(icon, assetRoot) {
  if (!assetRoot || !icon || /^https?:\/\//i.test(icon)) return "";

  const normalizedIcon = icon.replace(/^\/+/, "");
  const resolved = path.resolve(assetRoot, normalizedIcon);
  const resolvedRoot = path.resolve(assetRoot);
  if (!resolved.startsWith(resolvedRoot)) return "";

  const ext = path.extname(resolved).toLowerCase();
  const mimeType =
    ext === ".svg"
      ? "image/svg+xml"
      : ext === ".png"
        ? "image/png"
        : ext === ".jpg" || ext === ".jpeg"
          ? "image/jpeg"
          : "";
  if (!mimeType) return "";

  return readIconDataUri(resolved, mimeType);
}

function iconHref(publicBaseUrl, icon, assetRoot) {
  return iconDataUri(icon, assetRoot) || absoluteAssetUrl(publicBaseUrl, icon);
}

function kindColor(kind) {
  if (kind === "red") return "#f05a4f";
  if (kind === "blue") return "#4fb6d8";
  if (kind === "green") return "#7fc96b";
  return "#d8c15a";
}

function pickOne(items, rng = defaultRng) {
  if (items.length === 0) {
    throw new Error("随机池为空");
  }
  const index = Math.min(items.length - 1, Math.floor(rng() * items.length));
  return items[index];
}

function pickManyUnique(items, count, rng = defaultRng) {
  if (items.length < count) {
    throw new Error(`随机池数量不足，需要 ${count} 个，当前只有 ${items.length} 个`);
  }

  const available = [...items];
  const picked = [];
  while (picked.length < count) {
    const index = Math.min(available.length - 1, Math.floor(rng() * available.length));
    const [item] = available.splice(index, 1);
    picked.push(item);
  }
  return picked;
}

export function createQuickRoll(catalog, rng = defaultRng) {
  const stratagems = catalog.stratagems.filter(
    (item) => item.enabled && item.selectable && item.kind !== "yellow",
  );
  const primaries = catalog.weapons.filter((item) => item.enabled && item.slot === "primary");
  const secondaries = catalog.weapons.filter((item) => item.enabled && item.slot === "secondary");
  const grenades = catalog.grenades.filter((item) => item.enabled);

  return {
    faction: pickOne(catalog.factions, rng),
    stratagems: pickManyUnique(stratagems, 4, rng),
    primary: pickOne(primaries, rng),
    secondary: pickOne(secondaries, rng),
    grenade: pickOne(grenades, rng),
  };
}

export function formatQuickRollText(roll) {
  const stratagemLines = roll.stratagems.map((item, index) => `${index + 1}. ${itemLabel(item)}`);

  return [
    "地狱潜兵2 随机配装",
    "",
    `敌方阵营：${itemLabel(roll.faction)}`,
    "",
    "战备：",
    ...stratagemLines,
    "",
    "武器：",
    `主武器：${itemLabel(roll.primary)}`,
    `副武器：${itemLabel(roll.secondary)}`,
    `手雷：${itemLabel(roll.grenade)}`,
  ].join("\n");
}

export function createQuickRollText(catalog, rng = defaultRng) {
  return formatQuickRollText(createQuickRoll(catalog, rng));
}

export function formatQuickRollSvg(roll, publicBaseUrl = "", options = {}) {
  const assetRoot = options.assetRoot || "";
  const itemRows = [
    ...roll.stratagems.map((item, index) => ({
      label: `${index + 1}. ${itemLabel(item)}`,
      icon: preferredIcon(item),
      color: kindColor(item.kind),
      x: index % 2 === 0 ? 54 : 420,
      y: 248 + Math.floor(index / 2) * 112,
    })),
    {
      label: `主武器：${itemLabel(roll.primary)}`,
      icon: preferredIcon(roll.primary),
      color: "#d4d9df",
      x: 54,
      y: 526,
    },
    {
      label: `副武器：${itemLabel(roll.secondary)}`,
      icon: preferredIcon(roll.secondary),
      color: "#d4d9df",
      x: 54,
      y: 638,
    },
    {
      label: `手雷：${itemLabel(roll.grenade)}`,
      icon: preferredIcon(roll.grenade),
      color: "#d4d9df",
      x: 420,
      y: 526,
    },
  ];

  const rows = itemRows
    .map((item) => {
      const iconUrl = iconHref(publicBaseUrl, item.icon, assetRoot);
      const icon = iconUrl
        ? `<image href="${escapeXml(iconUrl)}" x="${item.x + 14}" y="${item.y + 14}" width="58" height="58" preserveAspectRatio="xMidYMid meet"/>`
        : "";
      return `
        <g>
          <rect x="${item.x}" y="${item.y}" width="326" height="88" rx="14" fill="#182028" stroke="${item.color}" stroke-width="2"/>
          <rect x="${item.x}" y="${item.y}" width="8" height="88" rx="4" fill="${item.color}"/>
          ${icon}
          <text x="${item.x + 88}" y="${item.y + 39}" class="item">${escapeXml(item.label)}</text>
          <text x="${item.x + 88}" y="${item.y + 63}" class="sub">${escapeXml(item.color === "#d4d9df" ? "装备" : "战备")}</text>
        </g>`;
    })
    .join("");

  const factionIcon = iconHref(publicBaseUrl, preferredIcon(roll.faction), assetRoot);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="800" height="760" viewBox="0 0 800 760">
  <style>
    .title { fill: #f3f6f8; font: 700 34px Arial, "Microsoft YaHei", sans-serif; }
    .label { fill: #99a6b3; font: 500 18px Arial, "Microsoft YaHei", sans-serif; }
    .faction { fill: #f3f6f8; font: 700 30px Arial, "Microsoft YaHei", sans-serif; }
    .item { fill: #f3f6f8; font: 700 20px Arial, "Microsoft YaHei", sans-serif; }
    .sub { fill: #8794a1; font: 500 14px Arial, "Microsoft YaHei", sans-serif; }
  </style>
  <rect width="800" height="760" fill="#0d1117"/>
  <rect x="24" y="24" width="752" height="712" rx="24" fill="#111821" stroke="#2c3742"/>
  <text x="54" y="82" class="title">地狱潜兵2 随机配装</text>
  <text x="54" y="124" class="label">HELLDIVERS 2 QUICK LOADOUT</text>

  <rect x="54" y="156" width="692" height="72" rx="16" fill="#182028" stroke="#31404d"/>
  ${factionIcon ? `<image href="${escapeXml(factionIcon)}" x="74" y="166" width="52" height="52" preserveAspectRatio="xMidYMid meet"/>` : ""}
  <text x="146" y="185" class="label">敌方阵营</text>
  <text x="146" y="215" class="faction">${escapeXml(itemLabel(roll.faction))}</text>

  <text x="54" y="266" class="label">战备</text>
  <text x="54" y="504" class="label">武器</text>
  ${rows}
  <text x="54" y="714" class="sub">由 RandomHD2 生成</text>
</svg>`;
}

export function createQuickRollSvg(catalog, publicBaseUrl = "", rng = defaultRng, options = {}) {
  return formatQuickRollSvg(createQuickRoll(catalog, rng), publicBaseUrl, options);
}

export async function createQuickRollPng(catalog, publicBaseUrl = "", rng = defaultRng, options = {}) {
  const svg = createQuickRollSvg(catalog, publicBaseUrl, rng, options);
  return sharp(Buffer.from(svg)).png().toBuffer();
}
