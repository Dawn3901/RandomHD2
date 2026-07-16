import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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

const copyAssets = () => {
  fs.mkdirSync(publicAssetsDir, { recursive: true });
  for (const category of ["factions", "stratagems", "weapons"]) {
    const from = path.join(root, "assets", "wiki", category);
    const to = path.join(publicAssetsDir, category);
    fs.mkdirSync(to, { recursive: true });
    for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
      if (!entry.isFile()) continue;
      fs.copyFileSync(path.join(from, entry.name), path.join(to, entry.name));
    }
  }
};

const byCategory = (category) => manifest.filter((item) => item.category === category);

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
fs.mkdirSync(outputDir, { recursive: true });

const generated = `import type { Catalog, Faction, Stratagem, Weapon } from "../types";

export const factions = ${JSON.stringify(factions, null, 2)} satisfies Faction[];

export const stratagems = ${JSON.stringify(stratagems, null, 2)} satisfies Stratagem[];

export const weapons = ${JSON.stringify(weapons, null, 2)} satisfies Weapon[];

export const grenades = ${JSON.stringify(grenades, null, 2)} satisfies Weapon[];

export const catalog = {
  factions,
  stratagems,
  weapons,
  grenades,
} satisfies Catalog;
`;

fs.writeFileSync(outputFile, generated, "utf8");
fs.mkdirSync(serverDataDir, { recursive: true });
fs.writeFileSync(serverCatalogFile, JSON.stringify({ factions, stratagems, weapons, grenades }, null, 2), "utf8");

console.log(`Generated ${path.relative(root, outputFile)}`);
console.log(`Generated ${path.relative(root, serverCatalogFile)}`);
console.log(`Factions: ${factions.length}`);
console.log(`Stratagems: ${stratagems.length}`);
console.log(`Weapons: ${weapons.length}`);
console.log(`Grenades: ${grenades.length}`);
