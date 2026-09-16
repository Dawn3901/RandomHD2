import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const manifestPath = path.join(root, "assets", "wiki", "manifest.json");
const publicAssetsDir = path.join(root, "public", "assets", "wiki");
const outputDir = path.join(root, "src", "data");
const outputFile = path.join(outputDir, "generatedCatalog.ts");
const serverDataDir = path.join(root, "server");
const serverCatalogFile = path.join(serverDataDir, "generated-catalog.json");

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8").replace(/^\uFEFF/, ""));

const slugify = (value) =>
  value
    .toLowerCase()
    .replace(/^file:/, "")
    .replace(/\.(svg|png|webp|jpg|jpeg)$/i, "")
    .replace(/stratagem icon background/gi, "")
    .replace(/primary render|secondary render|support render|throwable render/gi, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const cleanName = (title) =>
  title
    .replace(/^File:/, "")
    .replace(/\.(svg|png|webp|jpg|jpeg)$/i, "")
    .replace(/\s+Stratagem Icon Background$/i, "")
    .replace(/\s+(Primary|Secondary|Support|Throwable) Render$/i, "")
    .replace(/\s+Icon$/i, "")
    .trim();

const toPublicPath = (file) => `/${file.replace(/^assets\/wiki\//, "assets/wiki/")}`;

const stratagemKindFromSvg = (file) => {
  const fullPath = path.join(root, file);
  const svg = fs.readFileSync(fullPath, "utf8");
  const match = svg.match(/fill:#([0-9a-fA-F]{6})/);
  const color = match?.[1]?.toLowerCase();
  if (color === "190301") return "red";
  if (color === "011419") return "blue";
  if (color === "081901") return "green";
  if (color === "363426") return "yellow";
  return "blue";
};

// 只复制 manifest 里登记过的文件：目录里可能存在没登记的遗留文件（例如手动另存下来的缩略图），
// 整目录复制会把它们一起带进构建产物。
const copyAssets = () => {
  let copied = 0;
  let missing = 0;

  for (const category of ["factions", "stratagems", "weapons", "thumbs"]) {
    fs.rmSync(path.join(publicAssetsDir, category), { recursive: true, force: true });
  }
  fs.mkdirSync(publicAssetsDir, { recursive: true });

  for (const item of manifest) {
    const from = path.join(root, item.file);
    if (!fs.existsSync(from)) {
      missing += 1;
      continue;
    }
    const to = path.join(root, "public", item.file.replace(/^assets\/wiki\//, "assets/wiki/"));
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(from, to);
    copied += 1;
  }

  if (missing > 0) {
    console.warn(`警告：manifest 中有 ${missing} 个文件在 assets/wiki 下不存在，已跳过`);
  }
  return copied;
};

const byCategory = (category) => manifest.filter((item) => item.category === category);

const thumbsDir = path.join(publicAssetsDir, "thumbs");
const THUMB_WIDTH = 160;
// 只给「大图」做缩略图；战备 SVG 本来就几 KB，没必要
const THUMB_MIN_SOURCE_BYTES = 60 * 1024;

/**
 * 预生成缩略图。
 *
 * 武器渲染图是 3840×2160、单张 1MB 以上，而配装卡片上图标只画到 58px——
 * 一次抽卡因此要读 2.58MB 磁盘。生成 160px 小图后单次读取降到几十 KB。
 */
const generateThumbnails = async (rawEntries) => {
  fs.mkdirSync(thumbsDir, { recursive: true });
  const thumbByIcon = new Map();
  let created = 0;
  let sourceBytes = 0;
  let thumbBytes = 0;

  for (const entry of rawEntries) {
    if (entry.mime !== "image/png") continue;

    const source = path.join(root, entry.file);
    if (!fs.existsSync(source)) continue;

    // 用本地实际体积判断，manifest 里记的是 Wiki 上报的原始体积，两者常常不同
    const sourceSize = fs.statSync(source).size;
    if (sourceSize < THUMB_MIN_SOURCE_BYTES) continue;

    const fileName = path.basename(entry.file);
    const target = path.join(thumbsDir, fileName);
    try {
      await sharp(source).resize({ width: THUMB_WIDTH, withoutEnlargement: true }).png().toFile(target);
    } catch (error) {
      console.warn(`警告：无法为 ${fileName} 生成缩略图：${error.message}`);
      continue;
    }

    const thumbSize = fs.statSync(target).size;
    if (thumbSize >= sourceSize) {
      // 缩略图反而更大（源图很小时会这样），那就别用
      fs.rmSync(target, { force: true });
      continue;
    }

    thumbByIcon.set(toPublicPath(entry.file), `/assets/wiki/thumbs/${fileName}`);
    created += 1;
    sourceBytes += sourceSize;
    thumbBytes += thumbSize;
  }

  return { thumbByIcon, created, sourceBytes, thumbBytes };
};

const attachThumbnails = (items, thumbByIcon) =>
  items.map((item) => {
    const thumbIcon = thumbByIcon.get(item.icon);
    return thumbIcon ? { ...item, thumbIcon } : item;
  });

const factions = [
  {
    id: "terminids",
    nameZh: "终结族",
    nameEn: "Terminids",
    icon: "/assets/wiki/factions/Terminid_Icon.svg",
  },
  {
    id: "illuminate",
    nameZh: "光能族",
    nameEn: "Illuminate",
    icon: "/assets/wiki/factions/Illuminate_Icon.svg",
  },
  {
    id: "automatons",
    nameZh: "机器人",
    nameEn: "Automatons",
    icon: "/assets/wiki/factions/Automaton_Icon.svg",
  },
];

const stratagemCategoryFor = (kind) => {
  if (kind === "red") return "红色战备";
  if (kind === "blue") return "蓝色战备";
  if (kind === "green") return "绿色战备";
  return "黄色任务战备";
};

const stratagemOrder = {
  red: 0,
  blue: 1,
  green: 2,
  yellow: 3,
};

const stratagems = byCategory("stratagems")
  .map((item) => {
    const nameEn = cleanName(item.title);
    const kind = stratagemKindFromSvg(item.file);
    return {
      id: slugify(nameEn),
      nameEn,
      kind,
      category: stratagemCategoryFor(kind),
      icon: toPublicPath(item.file),
      selectable: kind !== "yellow",
      enabled: true,
    };
  })
  .sort((a, b) => stratagemOrder[a.kind] - stratagemOrder[b.kind] || a.nameEn.localeCompare(b.nameEn));

const weaponSlotFor = (title) => {
  if (/Primary Render/i.test(title)) return "primary";
  if (/Secondary Render/i.test(title)) return "secondary";
  if (/Throwable Render/i.test(title)) return "grenade";
  return null;
};

const weaponCategoryFor = (title, slot) => {
  if (slot === "grenade") return "Grenade";
  if (/Pistol|SOCOM|Senator|Redeemer|Peacemaker|Verdict|Ultimatum/i.test(title)) return "Pistol";
  if (/Shotgun|Breaker|Punisher|Cookout|Halt/i.test(title)) return "Shotgun";
  if (/Liberator|Tenderizer|Adjudicator|Coyote|Pacifier|Suppressor|One Two/i.test(title)) return "Assault Rifle";
  if (/Diligence|Constitution/i.test(title)) return "Marksman Rifle";
  if (/Scythe|Sickle|Blitzer|Purifier|Plas|Laser|Arc/i.test(title)) return "Energy";
  return slot === "primary" ? "Primary" : "Secondary";
};

const weaponItems = byCategory("weapons")
  .map((item) => {
    const slot = weaponSlotFor(item.title);
    if (!slot) return null;
    const nameEn = cleanName(item.title);
    return {
      id: slugify(nameEn),
      nameEn,
      slot,
      category: weaponCategoryFor(item.title, slot),
      icon: toPublicPath(item.file),
      enabled: true,
    };
  })
  .filter(Boolean)
  .sort((a, b) => a.nameEn.localeCompare(b.nameEn));

const weapons = weaponItems.filter((item) => item.slot === "primary" || item.slot === "secondary");
const grenades = weaponItems.filter((item) => item.slot === "grenade");

copyAssets();
const thumbs = await generateThumbnails(byCategory("weapons"));
const weaponsWithThumbs = attachThumbnails(weapons, thumbs.thumbByIcon);
const grenadesWithThumbs = attachThumbnails(grenades, thumbs.thumbByIcon);
fs.mkdirSync(outputDir, { recursive: true });

const generated = `import type { Catalog, Faction, Stratagem, Weapon } from "../types";

export const factions = ${JSON.stringify(factions, null, 2)} satisfies Faction[];

export const stratagems = ${JSON.stringify(stratagems, null, 2)} satisfies Stratagem[];

export const weapons = ${JSON.stringify(weaponsWithThumbs, null, 2)} satisfies Weapon[];

export const grenades = ${JSON.stringify(grenadesWithThumbs, null, 2)} satisfies Weapon[];

export const catalog = {
  factions,
  stratagems,
  weapons,
  grenades,
} satisfies Catalog;
`;

fs.writeFileSync(outputFile, generated, "utf8");
fs.mkdirSync(serverDataDir, { recursive: true });
fs.writeFileSync(
  serverCatalogFile,
  JSON.stringify({ factions, stratagems, weapons: weaponsWithThumbs, grenades: grenadesWithThumbs }, null, 2),
  "utf8",
);

console.log(`Generated ${path.relative(root, outputFile)}`);
console.log(`Generated ${path.relative(root, serverCatalogFile)}`);
console.log(`Factions: ${factions.length}`);
console.log(`Stratagems: ${stratagems.length}`);
console.log(`Weapons: ${weapons.length}`);
console.log(`Grenades: ${grenades.length}`);
if (thumbs.created > 0) {
  const saved = thumbs.sourceBytes - thumbs.thumbBytes;
  console.log(
    `Thumbnails: ${thumbs.created} 张，` +
      `${(thumbs.sourceBytes / 1024 / 1024).toFixed(1)}MB -> ${(thumbs.thumbBytes / 1024 / 1024).toFixed(2)}MB` +
      `（每次抽卡少读 ${(saved / 1024 / 1024).toFixed(2)}MB）`,
  );
}
