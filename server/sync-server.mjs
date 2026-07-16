import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";
import { createQuickRollPng, createQuickRollSvg, createQuickRollText } from "./quick-roll.mjs";
import { loadStoredState, saveStoredState } from "./state-store.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const distDir = path.join(root, "dist");
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

  const filePath = resolveStaticPath(request.url || "/");
  if (!filePath) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  if (request.method === "GET" && request.url?.split("?")[0] === "/api/quick-roll.svg") {
    try {
      sendSvg(response, 200, createQuickRollSvg(catalog, publicBaseUrlFor(request)));
    } catch (error) {
      sendJson(response, 500, { error: error instanceof Error ? error.message : "随机失败" });
    }
    return;
  }

  if (request.method === "GET" && request.url?.split("?")[0] === "/api/quick-roll.png") {
    try {
      sendPng(response, 200, await createQuickRollPng(catalog, publicBaseUrlFor(request)));
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
