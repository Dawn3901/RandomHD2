import fs from "node:fs";
import path from "node:path";

const MAX_CUSTOM_ITEMS = 200;
const MAX_SVG_BYTES = 256 * 1024;
const MAX_PNG_BYTES = 512 * 1024;

const PNG_BASE64_PREFIX = "iVBORw0KGgo";
const STRATAGEM_KINDS = new Set(["red", "blue", "green", "yellow"]);
const WEAPON_SLOTS = new Set(["primary", "secondary", "grenade"]);

/**
 * 自定义图标是唯一由使用者提供的数据，落盘和广播前做基本校验：
 * 丢弃形状不合法的条目，并限制单项体积与总数。
 */
export function normalizeCustomItems(value, fallback = []) {
  if (!Array.isArray(value)) return fallback;

  const items = [];

  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    if (typeof entry.id !== "string" || !entry.id) continue;
    if (typeof entry.nameEn !== "string") continue;
    if (typeof entry.svg !== "string" || !entry.svg) continue;

    const format = entry.format === "png" ? "png" : "svg";
    if (format === "png") {
      if (entry.svg.length > MAX_PNG_BYTES || !entry.svg.startsWith(PNG_BASE64_PREFIX)) continue;
    } else if (entry.svg.length > MAX_SVG_BYTES) {
      continue;
    }

    const kind = entry.kind === "weapon" ? "weapon" : "stratagem";
    const item = {
      id: entry.id,
      kind,
      nameEn: entry.nameEn,
      category: typeof entry.category === "string" ? entry.category : "",
      svg: entry.svg,
      createdAt: typeof entry.createdAt === "number" ? entry.createdAt : 0,
    };

    if (format === "png") item.format = "png";
    if (typeof entry.nameZh === "string" && entry.nameZh) item.nameZh = entry.nameZh;

    if (kind === "stratagem") {
      if (!STRATAGEM_KINDS.has(entry.stratagemKind)) continue;
      item.stratagemKind = entry.stratagemKind;
    } else {
      if (!WEAPON_SLOTS.has(entry.slot)) continue;
      item.slot = entry.slot;
    }

    if (typeof entry.deletedAt === "number") item.deletedAt = entry.deletedAt;

    items.push(item);
    if (items.length >= MAX_CUSTOM_ITEMS) break;
  }

  return items;
}

function normalizeState(value, fallback) {
  const source = value && typeof value === "object" ? value : {};

  return {
    players: Array.isArray(source.players) ? source.players : fallback.players,
    sets: Array.isArray(source.sets) ? source.sets : fallback.sets,
    squadResults: Array.isArray(source.squadResults) ? source.squadResults : fallback.squadResults,
    history: Array.isArray(source.history) ? source.history : fallback.history,
    customItems: normalizeCustomItems(source.customItems, fallback.customItems || []),
    updatedAt: typeof source.updatedAt === "number" ? source.updatedAt : fallback.updatedAt,
  };
}

export function loadStoredState(filePath, fallback) {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    return normalizeState(JSON.parse(raw), fallback);
  } catch {
    return fallback;
  }
}

export function saveStoredState(filePath, state) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}
