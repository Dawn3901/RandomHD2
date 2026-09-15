import type { Catalog, CustomItem, CustomItemKind, Stratagem, StratagemSet, Weapon } from "../types";

export const MAX_SVG_BYTES = 256 * 1024;
export const MAX_PNG_BYTES = 512 * 1024;
export const MAX_CUSTOM_ITEMS = 200;
export const MAX_UNDO_STACK = 20;

export type IconFormat = "svg" | "png";

const PNG_BASE64_PREFIX = "iVBORw0KGgo";

export const STRATAGEM_KINDS: Stratagem["kind"][] = ["red", "blue", "green", "yellow"];
export const WEAPON_SLOTS: Weapon["slot"][] = ["primary", "secondary", "grenade"];

export const STRATAGEM_KIND_LABELS: Record<Stratagem["kind"], string> = {
  red: "红色战备",
  blue: "蓝色战备",
  green: "绿色战备",
  yellow: "黄色任务战备",
};

export const WEAPON_SLOT_LABELS: Record<Weapon["slot"], string> = {
  primary: "主武器",
  secondary: "副武器",
  grenade: "手雷",
};

export type CustomItemInput = {
  kind: CustomItemKind;
  nameEn: string;
  nameZh?: string;
  stratagemKind?: string;
  slot?: string;
  category?: string;
  format?: string;
  /** 图标源数据：format 为 svg 时是 SVG 文本，为 png 时是 base64 数据 */
  svg: string;
};

export type ValidatedCustomItem = {
  kind: CustomItemKind;
  nameEn: string;
  nameZh?: string;
  stratagemKind?: Stratagem["kind"];
  slot?: Weapon["slot"];
  category: string;
  format: IconFormat;
  svg: string;
};

export type ValidationResult =
  | { ok: true; value: ValidatedCustomItem }
  | { ok: false; error: string };

/**
 * 图标最终只在 <img src="data:..."> 里渲染，本身不会执行脚本；
 * 这里剥离可执行内容属于纵深防御，避免有人直接把图标地址当页面打开。
 */
export function sanitizeSvg(svg: string): string {
  return svg
    .replace(/<script[\s\S]*?<\/script\s*>/gi, "")
    .replace(/<script\b[^>]*\/?>/gi, "")
    .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/\b(href|src|xlink:href)\s*=\s*(?:"\s*javascript:[^"]*"|'\s*javascript:[^']*'|javascript:[^\s>]+)/gi, "")
    .replace(/<foreignObject[\s\S]*?<\/foreignObject\s*>/gi, "")
    .replace(/<foreignObject\b[^>]*\/?>/gi, "");
}

export function validateCustomUpload(input: CustomItemInput): ValidationResult {
  const nameEn = input.nameEn.trim();
  if (!nameEn) return { ok: false, error: "请填写名称" };
  if (nameEn.length > 60) return { ok: false, error: "名称过长，最多 60 个字符" };

  const format: IconFormat = input.format === "png" ? "png" : "svg";
  const raw = input.svg ?? "";

  let payload: string;
  if (format === "png") {
    payload = raw.trim();
    if (!payload) return { ok: false, error: "请选择 PNG 文件" };
    if (payload.length > MAX_PNG_BYTES) {
      return { ok: false, error: `PNG 过大，上限 ${Math.round(MAX_PNG_BYTES / 1024)} KB` };
    }
    if (!payload.startsWith(PNG_BASE64_PREFIX)) return { ok: false, error: "文件内容不是有效的 PNG" };
  } else {
    payload = sanitizeSvg(raw).trim();
    if (!payload) return { ok: false, error: "请选择 SVG 文件" };
    if (payload.length > MAX_SVG_BYTES) {
      return { ok: false, error: `SVG 过大，上限 ${Math.round(MAX_SVG_BYTES / 1024)} KB` };
    }
    if (!/<svg[\s>]/i.test(payload)) return { ok: false, error: "文件内容不是有效的 SVG" };
  }

  const nameZh = input.nameZh?.trim() || undefined;

  if (input.kind === "stratagem") {
    if (!input.stratagemKind || !STRATAGEM_KINDS.includes(input.stratagemKind as Stratagem["kind"])) {
      return { ok: false, error: "请选择战备类别" };
    }
    const stratagemKind = input.stratagemKind as Stratagem["kind"];
    return {
      ok: true,
      value: {
        kind: "stratagem",
        nameEn,
        nameZh,
        stratagemKind,
        category: STRATAGEM_KIND_LABELS[stratagemKind],
        format,
        svg: payload,
      },
    };
  }

  if (!input.slot || !WEAPON_SLOTS.includes(input.slot as Weapon["slot"])) {
    return { ok: false, error: "请选择武器槽位" };
  }
  const slot = input.slot as Weapon["slot"];
  return {
    ok: true,
    value: {
      kind: "weapon",
      nameEn,
      nameZh,
      slot,
      category: input.category?.trim() || WEAPON_SLOT_LABELS[slot],
      format,
      svg: payload,
    },
  };
}

export function svgToDataUri(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/**
 * 自定义图标的 src。`svg` 字段保存的是原始数据（SVG 文本或 PNG 的 base64），
 * 统一在这里转成可用的 data URI，其他地方不要直接读该字段。
 */
export function customItemIcon(item: Pick<CustomItem, "svg" | "format">): string {
  return item.format === "png" ? `data:image/png;base64,${item.svg}` : svgToDataUri(item.svg);
}

export function isPngBytes(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  );
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;

  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }

  return btoa(binary);
}

/** 读取用户选择的图标文件，按文件头判断是 SVG 还是 PNG */
export async function readIconFile(file: File): Promise<{ format: IconFormat; payload: string }> {
  const bytes = new Uint8Array(await file.arrayBuffer());

  if (isPngBytes(bytes)) return { format: "png", payload: bytesToBase64(bytes) };
  return { format: "svg", payload: new TextDecoder().decode(bytes) };
}

export function createCustomItem(value: ValidatedCustomItem, now = Date.now(), suffix?: string): CustomItem {
  const unique = suffix || Math.random().toString(36).slice(2, 8);
  return {
    id: `custom-${now.toString(36)}-${unique}`,
    kind: value.kind,
    nameEn: value.nameEn,
    nameZh: value.nameZh,
    stratagemKind: value.stratagemKind,
    slot: value.slot,
    category: value.category,
    format: value.format,
    svg: value.svg,
    createdAt: now,
  };
}

export function customItemToStratagem(item: CustomItem): Stratagem {
  const kind = item.stratagemKind ?? "blue";
  return {
    id: item.id,
    nameZh: item.nameZh,
    nameEn: item.nameEn,
    kind,
    category: item.category,
    icon: customItemIcon(item),
    selectable: kind !== "yellow",
    enabled: true,
  };
}

export function customItemToWeapon(item: CustomItem): Weapon {
  return {
    id: item.id,
    nameZh: item.nameZh,
    nameEn: item.nameEn,
    slot: item.slot ?? "primary",
    category: item.category,
    icon: customItemIcon(item),
    enabled: true,
  };
}

export function activeCustomItems(items: CustomItem[]): CustomItem[] {
  return items.filter((item) => item.deletedAt === undefined);
}

export function deletedCustomItems(items: CustomItem[]): CustomItem[] {
  return items.filter((item) => item.deletedAt !== undefined);
}

export function mergeCustomItems(catalog: Catalog, items: CustomItem[]): Catalog {
  const active = activeCustomItems(items);
  const customStratagems = active.filter((item) => item.kind === "stratagem").map(customItemToStratagem);
  const customWeapons = active.filter((item) => item.kind === "weapon").map(customItemToWeapon);

  return {
    ...catalog,
    stratagems: [...catalog.stratagems, ...customStratagems],
    weapons: [...catalog.weapons, ...customWeapons.filter((item) => item.slot !== "grenade")],
    grenades: [...catalog.grenades, ...customWeapons.filter((item) => item.slot === "grenade")],
  };
}

export function softDeleteCustomItem(items: CustomItem[], id: string, now = Date.now()): CustomItem[] {
  return items.map((item) => (item.id === id ? { ...item, deletedAt: now } : item));
}

export function restoreCustomItem(items: CustomItem[], id: string): CustomItem[] {
  return items.map((item) => {
    if (item.id !== id) return item;
    const next = { ...item };
    delete next.deletedAt;
    return next;
  });
}

export function purgeCustomItem(items: CustomItem[], id: string): CustomItem[] {
  return items.filter((item) => item.id !== id);
}

export function countSetUsage(sets: StratagemSet[], itemId: string): number {
  return sets.filter((set) => (set.stratagemIds as string[]).includes(itemId)).length;
}

export function nameFromFileName(fileName: string): string {
  return fileName.replace(/\.svg$/i, "").replace(/[_-]+/g, " ").trim();
}

export type CustomItemOpType = "create" | "delete" | "restore";

export type CustomItemOp = {
  type: CustomItemOpType;
  itemId: string;
  label: string;
};

export function customOpLabel(type: CustomItemOpType, item: { nameEn: string; nameZh?: string }): string {
  const name = item.nameZh || item.nameEn;
  if (type === "create") return `创建「${name}」`;
  if (type === "delete") return `删除「${name}」`;
  return `恢复「${name}」`;
}

export function pushCustomOp(stack: CustomItemOp[], op: CustomItemOp): CustomItemOp[] {
  return [...stack, op].slice(-MAX_UNDO_STACK);
}

/**
 * 撤销即应用逆操作。因为删除是软删除，撤销永远不需要保存图标原始数据：
 * 撤销「创建」和撤销「恢复」都回到已删除状态，撤销「删除」则清除删除标记。
 */
export function applyUndo(items: CustomItem[], op: CustomItemOp, now = Date.now()): CustomItem[] {
  if (op.type === "create" || op.type === "restore") {
    return softDeleteCustomItem(items, op.itemId, now);
  }
  return restoreCustomItem(items, op.itemId);
}
