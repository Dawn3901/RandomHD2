import fs from "node:fs";
import path from "node:path";

function normalizeState(value, fallback) {
  const source = value && typeof value === "object" ? value : {};

  return {
    players: Array.isArray(source.players) ? source.players : fallback.players,
    sets: Array.isArray(source.sets) ? source.sets : fallback.sets,
    squadResults: Array.isArray(source.squadResults) ? source.squadResults : fallback.squadResults,
    history: Array.isArray(source.history) ? source.history : fallback.history,
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
