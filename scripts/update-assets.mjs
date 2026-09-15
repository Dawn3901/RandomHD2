#!/usr/bin/env node
/**
 * 从 Helldivers Wiki 更新内置图标资源与 manifest.json。
 *
 *   npm run update:assets                 先看差异并下载新增/变更的文件
 *   npm run update:assets -- --dry-run    只报告差异，不写入任何文件
 *   npm run update:assets -- --force      忽略体积比对，全部重新下载
 *   npm run update:assets -- --only=stratagems
 *   npm run update:assets -- --prune-files 同时删除 Wiki 上已不存在的本地图标
 */

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  FACTION_TITLES,
  MANAGED_CATEGORIES,
  WIKI_HOST,
  WIKI_SOURCE_PAGES,
  buildManifestEntry,
  diffManifest,
  displayNameFromTitle,
  fetchWikiEntries,
  fetchWikiImage,
  looksLikeImage,
  sortManifest,
  stratagemKindFromSvg,
} from "../server/wiki-assets.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = path.join(root, "assets", "wiki", "manifest.json");

const flags = new Set(process.argv.slice(2).filter((arg) => !arg.startsWith("--only")));
const onlyArg = process.argv.slice(2).find((arg) => arg.startsWith("--only="));
const only = onlyArg ? onlyArg.slice("--only=".length) : "";
const dryRun = flags.has("--dry-run");
const force = flags.has("--force");
const pruneFiles = flags.has("--prune-files");

const KIND_LABELS = { red: "红色战备", blue: "蓝色战备", green: "绿色战备", yellow: "黄色任务战备" };

function readLocalManifest() {
  const raw = fs.readFileSync(manifestPath, "utf8").replace(/^\uFEFF/, "");
  return JSON.parse(raw);
}

function localFileSize(entry) {
  try {
    return fs.statSync(path.join(root, entry.file)).size;
  } catch {
    return -1;
  }
}

/** 本地已有同名同体积的文件时跳过下载——武器原图单张 3MB 以上，不能每次全量重下 */
function alreadyOnDisk(entry) {
  return localFileSize(entry) === entry.size;
}

async function downloadAll(entries) {
  const queue = [...entries];
  const failures = [];
  let done = 0;

  const worker = async () => {
    while (queue.length > 0) {
      const entry = queue.shift();
      const target = path.join(root, entry.file);
      try {
        const buffer = await fetchWikiImage(entry.sourceUrl);
        if (!looksLikeImage(buffer, entry.mime)) {
          throw new Error(`下载内容不是有效的 ${entry.mime}`);
        }
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, buffer);
        done += 1;
        process.stdout.write(`\r  下载中 ${done}/${entries.length}…`);
      } catch (error) {
        failures.push({ entry, error });
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(4, Math.max(1, queue.length)) }, worker));
  if (entries.length > 0) process.stdout.write("\r");
  return failures;
}

/** 找出 assets/wiki 下没有登记进 manifest 的遗留文件 */
function findOrphanFiles(manifestEntries) {
  const referenced = new Set(manifestEntries.map((entry) => entry.file));
  const orphans = [];

  for (const category of MANAGED_CATEGORIES) {
    const dir = path.join(root, "assets", "wiki", category);
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir)) {
      const relative = `assets/wiki/${category}/${name}`;
      if (!referenced.has(relative)) orphans.push(relative);
    }
  }

  return orphans;
}

function describeStratagemKind(entry) {
  try {
    const svg = fs.readFileSync(path.join(root, entry.file), "utf8");
    const kind = stratagemKindFromSvg(svg);
    return KIND_LABELS[kind] ?? kind;
  } catch {
    return "无法判类（文件缺失）";
  }
}

async function main() {
  if (only && !MANAGED_CATEGORIES.includes(only)) {
    throw new Error(`--only 只支持 ${MANAGED_CATEGORIES.join(" / ")}`);
  }

  const scope = only ? [only] : MANAGED_CATEGORIES;
  console.log(`从 ${WIKI_HOST} 获取图标清单…`);

  const [pageEntries, factionEntries] = await Promise.all([
    fetchWikiEntries({ titles: WIKI_SOURCE_PAGES }),
    fetchWikiEntries({ titles: FACTION_TITLES.join("|"), byPage: false, pageSize: 50 }),
  ]);

  const seenTitles = new Set();
  const next = [];
  for (const raw of [...pageEntries, ...factionEntries]) {
    const entry = buildManifestEntry(raw);
    if (!entry || seenTitles.has(entry.title) || !scope.includes(entry.category)) continue;
    seenTitles.add(entry.title);
    next.push(entry);
  }

  const existing = readLocalManifest();
  const diff = diffManifest(existing, next, scope);
  const targets = diff.added.concat(diff.updated).filter((entry) => force || !alreadyOnDisk(entry));
  const skipped = diff.added.concat(diff.updated).length - targets.length;

  console.log("");
  console.log(`Wiki 上可用：${next.length} 个（本次管理范围：${scope.join(" / ")}）`);
  console.log(`  新增     ${diff.added.length}`);
  console.log(`  有更新   ${diff.updated.length}`);
  console.log(`  未变化   ${diff.unchanged.length}`);
  console.log(`  已下架   ${diff.removed.length}`);
  console.log(`  不归本次管（原样保留）${diff.unmanaged.length}`);
  console.log(`  需要下载 ${targets.length}${skipped > 0 ? `（另有 ${skipped} 个本地已有同体积文件，跳过）` : ""}`);

  if (diff.added.length > 0) {
    console.log("\n新增内容：");
    for (const entry of diff.added) console.log(`  + [${entry.category}] ${displayNameFromTitle(entry.title)}`);
  }
  if (diff.updated.length > 0) {
    console.log("\n内容有变化：");
    for (const entry of diff.updated) {
      const previous = existing.find((item) => item.title === entry.title);
      const willDownload = force || !alreadyOnDisk(entry);
      console.log(
        `  ~ [${entry.category}] ${displayNameFromTitle(entry.title)}` +
          `（${previous?.size ?? "?"} -> ${entry.size} 字节）` +
          (willDownload ? "" : "，本地已有同体积文件，跳过下载"),
      );
    }
  }
  if (diff.removed.length > 0) {
    console.log("\nWiki 上已下架（将从 manifest 移除）：");
    for (const entry of diff.removed) console.log(`  - [${entry.category}] ${displayNameFromTitle(entry.title)}`);
  }

  const finalManifest = sortManifest([...next, ...diff.unmanaged]);
  const orphans = findOrphanFiles(finalManifest);
  if (orphans.length > 0) {
    console.log(`\n发现 ${orphans.length} 个未登记的遗留文件（不会进入构建产物）：`);
    for (const orphan of orphans) console.log(`  ? ${orphan}`);
    if (dryRun) console.log("（--dry-run 下不删除；正式运行加 --prune-files 可删除）");
    else if (pruneFiles) {
      for (const orphan of orphans) {
        fs.rmSync(path.join(root, orphan));
        console.log(`已删除 ${orphan}`);
      }
    } else {
      console.log("（加 --prune-files 可一并删除）");
    }
  }

  if (dryRun) {
    console.log("\n--dry-run：未写入任何文件。");
    return;
  }

  if (targets.length > 0) {
    console.log("\n下载图标…");
    const failures = await downloadAll(targets);
    if (failures.length > 0) {
      console.log(`\n${failures.length} 个文件下载失败：`);
      for (const { entry, error } of failures) console.log(`  ! ${entry.title} -> ${error.message}`);
      console.log("\n已中止，manifest 未改动。请重新运行。");
      process.exitCode = 1;
      return;
    }
  }

  fs.writeFileSync(manifestPath, `${JSON.stringify(finalManifest, null, 2)}\n`, "utf8");
  console.log(`\n已更新 ${path.relative(root, manifestPath)}`);

  const newStratagems = diff.added.filter((entry) => entry.category === "stratagems");
  if (newStratagems.length > 0) {
    console.log("\n新增战备的自动判类结果：");
    for (const entry of newStratagems) {
      console.log(`  ${displayNameFromTitle(entry.title)} -> ${describeStratagemKind(entry)}`);
    }
  }

  if (pruneFiles && diff.removed.length > 0) {
    for (const entry of diff.removed) {
      const target = path.join(root, entry.file);
      if (fs.existsSync(target)) {
        fs.rmSync(target);
        console.log(`已删除 ${entry.file}`);
      }
    }
  } else if (diff.removed.length > 0) {
    console.log("（已下架条目的本地文件仍保留，如需删除请加 --prune-files）");
  }

  console.log("\n重新生成目录…");
  const generated = spawnSync(process.execPath, [path.join("scripts", "generate-data.mjs")], {
    cwd: root,
    stdio: "inherit",
  });
  if (generated.status !== 0) {
    process.exitCode = generated.status ?? 1;
    return;
  }

  console.log("\n完成。接下来：");
  console.log("  git add -A && git commit -m \"chore: update wiki assets\"");
  console.log("  docker compose up --build -d");
}

main().catch((error) => {
  console.error(`\n更新失败：${error.message}`);
  process.exitCode = 1;
});
