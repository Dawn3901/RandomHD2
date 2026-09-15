import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";
import { createQuickRollPng, createQuickRollSvg, createQuickRollText } from "./quick-roll.mjs";
import { loadStoredState, normalizeCustomItems, saveStoredState } from "./state-store.mjs";
import {
  FACTION_TITLES,
  WIKI_SOURCE_PAGES,
  buildManifestEntry,
  classifyTitle,
  displayNameFromTitle,
  fetchWikiEntries,
  fetchWikiImage,
  stratagemKindFromSvg,
  wikiFileName,
} from "./wiki-assets.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const distDir = path.join(root, "dist");
const publicDir = path.join(root, "public");
const catalogPath = path.join(root, "server", "generated-catalog.json");
const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8"));

const args = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  const key = process.argv[index];
  const value = process.argv[index + 1];
  if (key?.startsWith("--") && value) {
    args.set(key.slice(2), value);
  }
}

const host = args.get("host") || process.env.HOST || "127.0.0.1";
const port = Number(args.get("port") || process.env.PORT || 5173);
const stateFilePath = path.resolve(
  args.get("state-file") || process.env.RANDOMHD2_STATE_FILE || path.join(root, ".randomhd2", "sync-state.json"),
);

const defaultPlayers = [
  { id: "player-1", name: "玩家 1" },
  { id: "player-2", name: "玩家 2" },
];

const initialState = {
  players: defaultPlayers,
  sets: [],
  squadResults: [],
  history: [],
  customItems: [],
  updatedAt: Date.now(),
};

let state = loadStoredState(stateFilePath, initialState);

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

function sendJson(response, status, payload) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

function sendText(response, status, payload) {
  response.writeHead(status, { "content-type": "text/plain; charset=utf-8" });
  response.end(payload);
}

function sendSvg(response, status, payload) {
  response.writeHead(status, {
    "content-type": "image/svg+xml; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(payload);
}

function sendPng(response, status, payload) {
  response.writeHead(status, {
    "content-type": "image/png",
    "cache-control": "no-store",
  });
  response.end(payload);
}

function publicBaseUrlFor(request) {
  const protocol = request.headers["x-forwarded-proto"] || "http";
  const requestHost = request.headers["x-forwarded-host"] || request.headers.host || `${host}:${port}`;
  return `${protocol}://${requestHost}`;
}

const WIKI_CACHE_MS = 10 * 60 * 1000;
const WIKI_IMAGE_CACHE_MAX = 80;
let wikiCache = { fetchedAt: 0, items: [] };
const wikiImageCache = new Map();

/** 缩略图缓存：面板每次打开都会请求预览图，缓存可以避免反复抓取 Wiki */
async function cachedWikiImage(title, thumb) {
  const key = `${thumb ? "thumb" : "full"}:${title}`;
  if (wikiImageCache.has(key)) return wikiImageCache.get(key);

  const { items } = await buildWikiUpdates();
  // 客户端只能传标题，真实地址由服务端从自己的清单里查出来，
  // 因此这个接口无法被用来请求任意 URL
  const item = items.find((entry) => entry.title === title);
  if (!item) throw new Error("清单里没有这个图标");

  const buffer = await fetchWikiImage(thumb ? item.thumbUrl : item.iconUrl);
  const payload = { buffer, mime: item.mime };

  if (wikiImageCache.size >= WIKI_IMAGE_CACHE_MAX) {
    wikiImageCache.delete(wikiImageCache.keys().next().value);
  }
  wikiImageCache.set(key, payload);
  return payload;
}

/** 内置目录里已登记的文件名，用来判断哪些是「新内容」 */
function knownAssetFiles() {
  const all = [].concat(catalog.factions, catalog.stratagems, catalog.weapons, catalog.grenades);
  return new Set(all.map((item) => item.icon.split("/").pop()));
}

/**
 * 列出 Wiki 上可用、但本地还没有的图标。
 * 只做只读查询，结果缓存 10 分钟，避免每次点按钮都去打 Wiki。
 */
async function buildWikiUpdates() {
  if (Date.now() - wikiCache.fetchedAt < WIKI_CACHE_MS) return wikiCache;

  const [pageEntries, factionEntries] = await Promise.all([
    fetchWikiEntries({ titles: WIKI_SOURCE_PAGES, thumbWidth: 128 }),
    fetchWikiEntries({ titles: FACTION_TITLES.join("|"), byPage: false, pageSize: 50, thumbWidth: 128 }),
  ]);

  const known = knownAssetFiles();
  const seen = new Set();
  const items = [];

  for (const raw of [...pageEntries, ...factionEntries]) {
    const classified = classifyTitle(raw.title);
    if (!classified || seen.has(raw.title)) continue;
    seen.add(raw.title);

    const item = {
      title: raw.title,
      nameEn: displayNameFromTitle(raw.title),
      category: classified.category,
      slot: classified.slot,
      mime: raw.mime,
      size: raw.size,
      thumbUrl: raw.thumbUrl ?? raw.url,
      iconUrl: raw.url,
      known: known.has(wikiFileName(raw.title)),
      suggestedKind: null,
    };
    // 预览图与图标一律经由 /api/wiki/icon 转发，不在页面上热链 Wiki 地址，
    // 这样浏览器访问不到 wiki.gg 时也能正常显示

    // 新战备顺便读出颜色分类，省得用户自己判断
    if (!item.known && classified.category === "stratagems") {
      try {
        const svg = await fetchWikiImage(raw.url);
        item.suggestedKind = stratagemKindFromSvg(svg.toString("utf8"));
      } catch {
        item.suggestedKind = null;
      }
    }

    items.push(item);
  }

  wikiCache = { fetchedAt: Date.now(), items };
  return wikiCache;
}

function resolveStaticPath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split("?")[0] || "/");
  const requested = decoded === "/" ? "/index.html" : decoded;
  const resolved = path.resolve(distDir, `.${requested}`);

  if (!resolved.startsWith(distDir)) {
    return null;
  }

  if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
    return resolved;
  }

  return path.join(distDir, "index.html");
}

let webSocketServer;

const server = http.createServer(async (request, response) => {
  if (request.url === "/health") {
    sendJson(response, 200, { ok: true, clients: webSocketServer?.clients.size || 0 });
    return;
  }

  if (request.method === "GET" && request.url?.split("?")[0] === "/api/quick-roll") {
    try {
      sendText(response, 200, createQuickRollText(catalog));
    } catch (error) {
      sendJson(response, 500, { error: error instanceof Error ? error.message : "随机失败" });
    }
    return;
  }

  // 只读的 Wiki 图标清单与图标代理，必须放在 resolveStaticPath 之前，
  // 否则未知路径会被 SPA 兜底当成 index.html 返回
  if (request.method === "GET" && request.url?.split("?")[0] === "/api/wiki/updates") {
    try {
      const { fetchedAt, items } = await buildWikiUpdates();
      // 只暴露客户端需要的字段，不下发原始 Wiki 地址
      const publicItems = items.map(({ title, nameEn, category, slot, mime, size, known, suggestedKind }) => ({
        title,
        nameEn,
        category,
        slot,
        mime,
        size,
        known,
        suggestedKind,
      }));
      sendJson(response, 200, { fetchedAt, source: "helldivers.wiki.gg", items: publicItems });
    } catch (error) {
      sendJson(response, 502, {
        error: `无法访问 helldivers.wiki.gg：${error instanceof Error ? error.message : error}`,
        hint: "服务器可能无法访问外网。可以在本地运行 npm run update:assets 更新内置目录。",
      });
    }
    return;
  }

  if (request.method === "GET" && request.url?.split("?")[0] === "/api/wiki/icon") {
    try {
      const params = new URL(request.url, `http://${request.headers.host || "localhost"}`).searchParams;
      const title = params.get("title") || "";
      const { buffer, mime } = await cachedWikiImage(title, params.get("thumb") === "1");

      response.writeHead(200, {
        "content-type": mime === "image/png" ? "image/png" : "image/svg+xml; charset=utf-8",
        "content-length": buffer.length,
        "cache-control": "no-store",
      });
      response.end(buffer);
    } catch (error) {
      sendJson(response, 404, { error: error instanceof Error ? error.message : "图标下载失败" });
    }
    return;
  }

  const filePath = resolveStaticPath(request.url || "/");
  if (!filePath) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  if (request.method === "GET" && request.url?.split("?")[0] === "/api/quick-roll.svg") {
    try {
      sendSvg(response, 200, createQuickRollSvg(catalog, publicBaseUrlFor(request), undefined, { assetRoot: publicDir }));
    } catch (error) {
      sendJson(response, 500, { error: error instanceof Error ? error.message : "随机失败" });
    }
    return;
  }

  if (request.method === "GET" && request.url?.split("?")[0] === "/api/quick-roll.png") {
    try {
      sendPng(response, 200, await createQuickRollPng(catalog, publicBaseUrlFor(request), undefined, { assetRoot: publicDir }));
    } catch (error) {
      sendJson(response, 500, { error: error instanceof Error ? error.message : "随机失败" });
    }
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }

    response.writeHead(200, {
      "content-type": mimeTypes[path.extname(filePath)] || "application/octet-stream",
    });
    response.end(data);
  });
});

webSocketServer = new WebSocketServer({ server, path: "/sync" });

function broadcast(payload) {
  const message = JSON.stringify(payload);
  for (const client of webSocketServer.clients) {
    if (client.readyState === 1) {
      client.send(message);
    }
  }
}

function broadcastPresence() {
  broadcast({ type: "presence", clients: webSocketServer.clients.size });
}

webSocketServer.on("connection", (socket) => {
  socket.send(JSON.stringify({ type: "state", state }));
  broadcastPresence();

  socket.on("message", (raw) => {
    let message;
    try {
      message = JSON.parse(String(raw));
    } catch {
      return;
    }

    if (message?.type !== "patch" || typeof message.patch !== "object") {
      return;
    }

    state = {
      players: Array.isArray(message.patch.players) ? message.patch.players : state.players,
      sets: Array.isArray(message.patch.sets) ? message.patch.sets : state.sets,
      squadResults: Array.isArray(message.patch.squadResults) ? message.patch.squadResults : state.squadResults,
      history: Array.isArray(message.patch.history) ? message.patch.history : state.history,
      customItems: normalizeCustomItems(message.patch.customItems, state.customItems),
      updatedAt: Date.now(),
    };
    saveStoredState(stateFilePath, state);

    broadcast({ type: "state", state });
  });

  socket.on("close", () => {
    broadcastPresence();
  });
});

server.listen(port, host, () => {
  console.log(`RandomHD2 sync server ready at http://${host}:${port}/`);
  console.log(`Local shared state is stored at ${stateFilePath}`);
  console.log("Expose this HTTP address with SakuraFRP to share both the page and WebSocket sync.");
});
