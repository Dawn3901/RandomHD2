import { useEffect, useMemo, useRef, useState } from "react";
import { catalog } from "./data/generatedCatalog";
import {
  MAX_CUSTOM_ITEMS,
  MAX_SVG_BYTES,
  STRATAGEM_KINDS,
  STRATAGEM_KIND_LABELS,
  WEAPON_SLOTS,
  WEAPON_SLOT_LABELS,
  activeCustomItems,
  applyUndo,
  bytesToBase64,
  countSetUsage,
  createCustomItem,
  customItemIcon,
  customOpLabel,
  deletedCustomItems,
  mergeCustomItems,
  nameFromFileName,
  purgeCustomItem,
  pushCustomOp,
  readIconFile,
  restoreCustomItem,
  softDeleteCustomItem,
  validateCustomUpload,
  type CustomItemInput,
  type CustomItemOp,
  type IconFormat,
} from "./lib/customItems";
import { drawSquadSets, rollQuickLoadout } from "./lib/random";
import { loadJson, saveJson } from "./lib/storage";
import { historyEntryToSet, recordCreatedSetHistory, removeHistoryEntry } from "./lib/sync";
import { getRandomizableStratagems } from "./lib/stratagems";
import type {
  ClientSyncMessage,
  CustomItem,
  DrawHistoryEntry,
  Player,
  QuickLoadout,
  ServerSyncMessage,
  SquadDrawResult,
  Stratagem,
  StratagemSet,
  SyncPatch,
  Weapon,
  WikiAssetItem,
} from "./types";

const STORAGE_KEYS = {
  enabledIds: "randomhd2.enabledItems",
  players: "randomhd2.players",
  sets: "randomhd2.stratagemSets",
  lastRoll: "randomhd2.lastRoll",
  history: "randomhd2.drawHistory",
  squadCooldownHours: "randomhd2.squadCooldownHours",
  customItems: "randomhd2.customItems",
  seenCustomIds: "randomhd2.seenCustomIds",
};

const defaultPlayers: Player[] = [
  { id: "player-1", name: "玩家 1" },
  { id: "player-2", name: "玩家 2" },
];

const NEED_SERVER_MESSAGE =
  "无法读取 Wiki 清单：没有连上随机服务。npm run dev 只有前端，请改用 npm run share 启动（或部署到 Docker 后访问）。";

const APP_VERSION = typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "0.0.0";
const BUILD_TIME = typeof __BUILD_TIME__ === "string" ? __BUILD_TIME__ : "";

function itemLabel(item: { nameZh?: string; nameEn: string }) {
  return item.nameZh || item.nameEn;
}

function formatHistoryTime(timestamp: number) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

/** 构建时间以 ISO 注入，这里按访问者本地时区显示 */
function formatBuildTime(iso: string) {
  if (!iso) return "未知";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "未知";

  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function AssetIcon({ src, alt }: { src: string; alt: string }) {
  return (
    <div className="assetIcon">
      <img src={src} alt={alt} loading="lazy" />
    </div>
  );
}

function MiniItem({ item }: { item: Stratagem | Weapon }) {
  const isStratagem = "kind" in item;

  return (
    <div className="miniItem">
      <AssetIcon src={item.icon} alt={itemLabel(item)} />
      <div>
        <strong>{itemLabel(item)}</strong>
        {!isStratagem && <span>{item.category}</span>}
      </div>
    </div>
  );
}

function ResultCard({ roll }: { roll: QuickLoadout | null }) {
  if (!roll) {
    return (
      <div className="emptyState">
        <strong>等待随机</strong>
        <span>点击全部随机，生成本轮任务配装。</span>
      </div>
    );
  }

  return (
    <div className="resultGrid">
      <div className="resultFaction">
        <AssetIcon src={roll.faction.icon} alt={roll.faction.nameZh} />
        <div>
          <span>敌方阵营</span>
          <strong>{roll.faction.nameZh}</strong>
          <em>{roll.faction.nameEn}</em>
        </div>
      </div>
      <div className="resultBlock">
        <span className="blockLabel">战备</span>
        <div className="itemGrid four">
          {roll.stratagems.map((item) => (
            <MiniItem key={item.id} item={item} />
          ))}
        </div>
      </div>
      <div className="resultBlock">
        <span className="blockLabel">武器</span>
        <div className="itemGrid three">
          <MiniItem item={roll.primary} />
          <MiniItem item={roll.secondary} />
          <MiniItem item={roll.grenade} />
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [customItems, setCustomItems] = useState<CustomItem[]>(() =>
    loadJson(window.localStorage, STORAGE_KEYS.customItems, []),
  );

  const mergedCatalog = useMemo(() => mergeCustomItems(catalog, customItems), [customItems]);
  const randomizableStratagems = useMemo(
    () => getRandomizableStratagems(mergedCatalog.stratagems),
    [mergedCatalog],
  );
  const allDefaultEnabledIds = useMemo(
    () => [...randomizableStratagems, ...mergedCatalog.weapons, ...mergedCatalog.grenades].map((item) => item.id),
    [mergedCatalog, randomizableStratagems],
  );

  const [enabledIds, setEnabledIds] = useState<string[]>(() =>
    loadJson(window.localStorage, STORAGE_KEYS.enabledIds, allDefaultEnabledIds),
  );
  const [players, setPlayers] = useState<Player[]>(() =>
    loadJson(window.localStorage, STORAGE_KEYS.players, defaultPlayers),
  );
  const [sets, setSets] = useState<StratagemSet[]>(() =>
    loadJson(window.localStorage, STORAGE_KEYS.sets, []),
  );
  const [quickRoll, setQuickRoll] = useState<QuickLoadout | null>(() =>
    loadJson<QuickLoadout | null>(window.localStorage, STORAGE_KEYS.lastRoll, null),
  );
  const [quickError, setQuickError] = useState("");
  const [setName, setSetName] = useState("");
  const [setOwner, setSetOwner] = useState(players[0]?.name || "玩家 1");
  const [selectedStratagemIds, setSelectedStratagemIds] = useState<string[]>([]);
  const [squadResults, setSquadResults] = useState<SquadDrawResult[]>([]);
  const [history, setHistory] = useState<DrawHistoryEntry[]>(() =>
    loadJson(window.localStorage, STORAGE_KEYS.history, []),
  );
  const [squadError, setSquadError] = useState("");
  const [squadCooldownHours, setSquadCooldownHours] = useState<number>(() =>
    loadJson(window.localStorage, STORAGE_KEYS.squadCooldownHours, 72),
  );
  const [seenCustomIds, setSeenCustomIds] = useState<string[]>(() =>
    loadJson(window.localStorage, STORAGE_KEYS.seenCustomIds, []),
  );
  const [uploadKind, setUploadKind] = useState<"stratagem" | "weapon">("stratagem");
  const [uploadName, setUploadName] = useState("");
  const [uploadNameZh, setUploadNameZh] = useState("");
  const [uploadStratagemKind, setUploadStratagemKind] = useState<Stratagem["kind"]>("blue");
  const [uploadSlot, setUploadSlot] = useState<Weapon["slot"]>("primary");
  const [uploadCategory, setUploadCategory] = useState("");
  const [uploadSvg, setUploadSvg] = useState("");
  const [uploadFormat, setUploadFormat] = useState<IconFormat>("svg");
  const [uploadError, setUploadError] = useState("");
  const [undoStack, setUndoStack] = useState<CustomItemOp[]>([]);
  const [showDeleted, setShowDeleted] = useState(false);
  const [wikiOpen, setWikiOpen] = useState(false);
  const [wikiItems, setWikiItems] = useState<WikiAssetItem[] | null>(null);
  const [wikiError, setWikiError] = useState("");
  const [wikiLoading, setWikiLoading] = useState(false);
  const [wikiSelected, setWikiSelected] = useState<string[]>([]);
  const [wikiShowAll, setWikiShowAll] = useState(false);
  const [wikiImporting, setWikiImporting] = useState(false);
  const [browserTab, setBrowserTab] = useState<"stratagems" | "weapons" | "grenades">("stratagems");
  const [query, setQuery] = useState("");
  const [showEnabledOnly, setShowEnabledOnly] = useState(false);
  const [syncStatus, setSyncStatus] = useState<"connecting" | "connected" | "local">("connecting");
  const [syncClients, setSyncClients] = useState(1);
  const wsRef = useRef<WebSocket | null>(null);

  const enabledSet = useMemo(() => new Set(enabledIds), [enabledIds]);
  const customItemIds = useMemo(() => new Set(activeCustomItems(customItems).map((item) => item.id)), [customItems]);

  const importedNames = useMemo(
    () => new Set(customItems.map((item) => item.nameEn.trim().toLowerCase())),
    [customItems],
  );

  /** Wiki 上「本地内置目录里没有、也还没作为自定义项导入过」的图标 */
  const wikiImportCandidates = useMemo(() => {
    if (!wikiItems) return [];
    return wikiItems.filter((item) => !item.known && !importedNames.has(item.nameEn.trim().toLowerCase()));
  }, [wikiItems, importedNames]);

  const wikiVisibleItems = useMemo(
    () => (wikiShowAll ? (wikiItems ?? []) : wikiImportCandidates),
    [wikiShowAll, wikiItems, wikiImportCandidates],
  );

  useEffect(() => saveJson(window.localStorage, STORAGE_KEYS.enabledIds, enabledIds), [enabledIds]);
  useEffect(() => saveJson(window.localStorage, STORAGE_KEYS.players, players), [players]);
  useEffect(() => saveJson(window.localStorage, STORAGE_KEYS.sets, sets), [sets]);
  useEffect(() => saveJson(window.localStorage, STORAGE_KEYS.lastRoll, quickRoll), [quickRoll]);
  useEffect(() => saveJson(window.localStorage, STORAGE_KEYS.history, history), [history]);
  useEffect(() => saveJson(window.localStorage, STORAGE_KEYS.customItems, customItems), [customItems]);
  useEffect(() => saveJson(window.localStorage, STORAGE_KEYS.seenCustomIds, seenCustomIds), [seenCustomIds]);
  useEffect(
    () => saveJson(window.localStorage, STORAGE_KEYS.squadCooldownHours, squadCooldownHours),
    [squadCooldownHours],
  );

  // 只对「第一次见到」的自定义项自动启用：别人新建的战备在自己浏览器里默认可用，
  // 但自己手动取消过的勾选不会被重新加上
  useEffect(() => {
    const seen = new Set(seenCustomIds);
    const fresh = activeCustomItems(customItems)
      .map((item) => item.id)
      .filter((id) => !seen.has(id));
    if (fresh.length === 0) return;

    setSeenCustomIds((current) => [...current, ...fresh]);
    setEnabledIds((current) => [...current, ...fresh.filter((id) => !current.includes(id))]);
  }, [customItems, seenCustomIds]);

  useEffect(() => {
    if (!players.some((player) => player.name === setOwner)) {
      setSetOwner(players[0]?.name || "玩家 1");
    }
  }, [players, setOwner]);

  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const socket = new WebSocket(`${protocol}://${window.location.host}/sync`);
    wsRef.current = socket;

    socket.onopen = () => {
      setSyncStatus("connected");
    };

    socket.onmessage = (event) => {
      let message: ServerSyncMessage;
      try {
        message = JSON.parse(String(event.data)) as ServerSyncMessage;
      } catch {
        return;
      }

      if (message.type === "state") {
        setPlayers(message.state.players);
        setSets(message.state.sets);
        setSquadResults(message.state.squadResults);
        setHistory(message.state.history || []);
        setCustomItems(message.state.customItems || []);
      }

      if (message.type === "presence") {
        setSyncClients(message.clients);
      }
    };

    socket.onerror = () => {
      setSyncStatus("local");
    };

    socket.onclose = () => {
      if (wsRef.current === socket) {
        wsRef.current = null;
        setSyncStatus("local");
        setSyncClients(1);
      }
    };

    return () => {
      socket.close();
    };
  }, []);

  const sendSyncPatch = (patch: SyncPatch) => {
    const socket = wsRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;

    const message: ClientSyncMessage = { type: "patch", patch };
    socket.send(JSON.stringify(message));
  };

  const enabledCounts = useMemo(
    () => ({
      stratagems: randomizableStratagems.filter((item) => enabledSet.has(item.id)).length,
      primaries: mergedCatalog.weapons.filter((item) => item.slot === "primary" && enabledSet.has(item.id)).length,
      secondaries: mergedCatalog.weapons.filter((item) => item.slot === "secondary" && enabledSet.has(item.id)).length,
      grenades: mergedCatalog.grenades.filter((item) => enabledSet.has(item.id)).length,
    }),
    [enabledSet, mergedCatalog, randomizableStratagems],
  );

  const browserItems = useMemo(() => {
    const source =
      browserTab === "stratagems"
        ? randomizableStratagems
        : browserTab === "weapons"
          ? mergedCatalog.weapons
          : mergedCatalog.grenades;
    const normalized = query.trim().toLowerCase();

    return source.filter((item) => {
      if (showEnabledOnly && !enabledSet.has(item.id)) return false;
      if (!normalized) return true;
      return item.nameEn.toLowerCase().includes(normalized) || item.category.toLowerCase().includes(normalized);
    });
  }, [browserTab, enabledSet, query, showEnabledOnly]);

  const rollAll = () => {
    try {
      const roll = rollQuickLoadout(mergedCatalog, enabledIds);
      setQuickRoll(roll);
      setQuickError("");
    } catch (error) {
      setQuickError(error instanceof Error ? error.message : "随机失败");
    }
  };

  const rerollPart = (part: "faction" | "stratagems" | "primary" | "secondary" | "grenade") => {
    try {
      const next = rollQuickLoadout(mergedCatalog, enabledIds);
      setQuickRoll((current) => {
        if (!current) return next;
        return {
          ...current,
          [part]: next[part],
        };
      });
      setQuickError("");
    } catch (error) {
      setQuickError(error instanceof Error ? error.message : "重抽失败");
    }
  };

  const toggleEnabled = (id: string) => {
    setEnabledIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  };

  const commitCustomItems = (next: CustomItem[]) => {
    setCustomItems(next);
    sendSyncPatch({ customItems: next });
  };

  const recordCustomOp = (op: CustomItemOp) => setUndoStack((current) => pushCustomOp(current, op));

  const handleUploadFile = async (file: File | undefined) => {
    setUploadError("");
    if (!file) {
      setUploadSvg("");
      return;
    }

    const icon = await readIconFile(file);
    if (icon.format === "svg" && icon.payload.length > MAX_SVG_BYTES) {
      setUploadError(`SVG 过大，上限 ${Math.round(MAX_SVG_BYTES / 1024)} KB`);
      return;
    }

    setUploadFormat(icon.format);
    setUploadSvg(icon.payload);
    if (!uploadName.trim()) setUploadName(nameFromFileName(file.name));
  };

  const submitCustomItem = () => {
    if (customItems.length >= MAX_CUSTOM_ITEMS) {
      setUploadError(`自定义图标已达上限 ${MAX_CUSTOM_ITEMS} 个，请先彻底删除一些`);
      return;
    }

    const input: CustomItemInput = {
      kind: uploadKind,
      nameEn: uploadName,
      nameZh: uploadNameZh,
      stratagemKind: uploadStratagemKind,
      slot: uploadSlot,
      category: uploadCategory,
      format: uploadFormat,
      svg: uploadSvg,
    };

    const result = validateCustomUpload(input);
    if (!result.ok) {
      setUploadError(result.error);
      return;
    }

    const item = createCustomItem(result.value);
    commitCustomItems([...customItems, item]);
    recordCustomOp({ type: "create", itemId: item.id, label: customOpLabel("create", item) });

    setUploadName("");
    setUploadNameZh("");
    setUploadCategory("");
    setUploadSvg("");
    setUploadFormat("svg");
    setUploadError("");
  };

  const loadWikiUpdates = async () => {
    setWikiLoading(true);
    setWikiError("");

    try {
      const response = await fetch("/api/wiki/updates");
      const text = await response.text();

      let payload: { items?: WikiAssetItem[]; error?: string; hint?: string };
      try {
        payload = JSON.parse(text) as typeof payload;
      } catch {
        // npm run dev 只有前端：未匹配的路径会被 Vite 当成页面返回 HTML
        throw new Error(NEED_SERVER_MESSAGE);
      }

      if (!response.ok) throw new Error([payload.error, payload.hint].filter(Boolean).join(" "));
      setWikiItems(payload.items ?? []);
    } catch (error) {
      setWikiItems(null);
      const message = error instanceof Error ? error.message : "";
      const isNetworkError = !message || /failed to fetch|networkerror|load failed/i.test(message);
      setWikiError(isNetworkError ? NEED_SERVER_MESSAGE : message);
    } finally {
      setWikiLoading(false);
    }
  };

  const toggleWikiOpen = () => {
    const next = !wikiOpen;
    setWikiOpen(next);
    if (next && wikiItems === null) void loadWikiUpdates();
  };

  const toggleWikiSelection = (title: string) => {
    setWikiSelected((current) =>
      current.includes(title) ? current.filter((item) => item !== title) : [...current, title],
    );
  };

  const selectAllNewWikiItems = () => {
    const candidates = wikiImportCandidates.map((item) => item.title);
    setWikiSelected((current) => Array.from(new Set([...current, ...candidates])));
  };

  const importSelectedWikiItems = async () => {
    const chosen = wikiImportCandidates.filter((item) => wikiSelected.includes(item.title));
    if (chosen.length === 0) return;

    if (customItems.length + chosen.length > MAX_CUSTOM_ITEMS) {
      setWikiError(`导入后会超过 ${MAX_CUSTOM_ITEMS} 个上限，请减少选择`);
      return;
    }

    setWikiImporting(true);
    setWikiError("");

    const created: CustomItem[] = [];
    const failed: string[] = [];

    for (const entry of chosen) {
      try {
        const isWeapon = entry.category === "weapons";
        const url = `/api/wiki/icon?title=${encodeURIComponent(entry.title)}${isWeapon ? "&thumb=1" : ""}`;
        const response = await fetch(url);
        if (!response.ok) throw new Error(`下载失败（HTTP ${response.status}）`);

        const bytes = new Uint8Array(await response.arrayBuffer());
        const isPng = isWeapon || /png/i.test(entry.mime);
        const payload = isPng ? bytesToBase64(bytes) : new TextDecoder().decode(bytes);

        const result = validateCustomUpload({
          kind: isWeapon ? "weapon" : "stratagem",
          nameEn: entry.nameEn,
          stratagemKind: entry.suggestedKind ?? "blue",
          slot: entry.slot ?? "primary",
          format: isPng ? "png" : "svg",
          svg: payload,
        });

        if (!result.ok) throw new Error(result.error);
        created.push(createCustomItem(result.value));
      } catch (error) {
        failed.push(`${entry.nameEn}：${error instanceof Error ? error.message : error}`);
      }
    }

    if (created.length > 0) {
      commitCustomItems([...customItems, ...created]);
      created.forEach((item) =>
        recordCustomOp({ type: "create", itemId: item.id, label: customOpLabel("create", item) }),
      );
      setWikiSelected([]);
    }

    if (failed.length > 0) setWikiError(`以下图标导入失败：${failed.join("；")}`);
    setWikiImporting(false);
  };

  const deleteCustomItem = (item: CustomItem) => {
    commitCustomItems(softDeleteCustomItem(customItems, item.id));
    recordCustomOp({ type: "delete", itemId: item.id, label: customOpLabel("delete", item) });
  };

  const restoreCustomItemById = (item: CustomItem) => {
    commitCustomItems(restoreCustomItem(customItems, item.id));
    recordCustomOp({ type: "restore", itemId: item.id, label: customOpLabel("restore", item) });
  };

  const purgeCustomItemById = (item: CustomItem) => {
    const usage = countSetUsage(sets, item.id);
    const warning = usage > 0 ? `\n\n它被 ${usage} 个战备组合引用，删除后这些组合里的对应图标会变成空白。` : "";
    if (!window.confirm(`彻底删除「${itemLabel(item)}」？此操作无法撤销。${warning}`)) return;

    commitCustomItems(purgeCustomItem(customItems, item.id));
    setUndoStack((current) => current.filter((op) => op.itemId !== item.id));
  };

  const undoLastCustomOp = () => {
    const op = undoStack[undoStack.length - 1];
    if (!op) return;
    commitCustomItems(applyUndo(customItems, op));
    setUndoStack((current) => current.slice(0, -1));
  };

  const updatePlayerCount = (count: number) => {
    setPlayers((current) => {
      const next = [...current];
      while (next.length < count) {
        next.push({ id: `player-${next.length + 1}`, name: `玩家 ${next.length + 1}` });
      }
      const sliced = next.slice(0, count);
      sendSyncPatch({ players: sliced });
      return sliced;
    });
  };

  const updatePlayerName = (index: number, name: string) => {
    setPlayers((current) => {
      const next = current.map((player, itemIndex) => (itemIndex === index ? { ...player, name } : player));
      sendSyncPatch({ players: next });
      return next;
    });
    if (index === 0 && setOwner === players[0]?.name) setSetOwner(name);
  };

  const toggleStratagemInSet = (id: string) => {
    setSelectedStratagemIds((current) => {
      if (current.includes(id)) return current.filter((item) => item !== id);
      if (current.length >= 4) return current;
      return [...current, id];
    });
  };

  const addSet = () => {
    if (selectedStratagemIds.length !== 4) return;
    const owner = setOwner.trim() || players[0]?.name || "玩家";
    const name = setName.trim() || `${owner} 的战备 ${sets.length + 1}`;
    const createdSet: StratagemSet = {
      id: `set-${Date.now()}`,
      ownerName: owner,
      name,
      stratagemIds: selectedStratagemIds as [string, string, string, string],
    };

    setSets((current) => {
      const next = [...current, createdSet];
      sendSyncPatch({ sets: next });
      return next;
    });
    setHistory((current) => {
      const next = recordCreatedSetHistory(current, createdSet);
      sendSyncPatch({ history: next });
      return next;
    });
    setSetName("");
    setSelectedStratagemIds([]);
    setSquadError("");
  };

  const drawSquad = () => {
    try {
      const results = drawSquadSets(players, sets, undefined, {
        cooldownMs: squadCooldownHours * 60 * 60 * 1000,
      });
      const drawnIds = new Set(results.map((result) => result.set.id));
      const nextSets = sets.map((set) =>
        drawnIds.has(set.id) ? { ...set, lastDrawnAt: Date.now() } : set,
      );
      setSets(nextSets);
      setSquadResults(results);
      sendSyncPatch({ sets: nextSets, squadResults: results });
      setSquadError("");
    } catch (error) {
      setSquadError(error instanceof Error ? error.message : "抽取失败");
    }
  };

  const resetSquadCooldown = () => {
    const nextSets = sets.map((set) => {
      const next = { ...set };
      delete next.lastDrawnAt;
      return next;
    });
    setSets(nextSets);
    sendSyncPatch({ sets: nextSets });
    setSquadError("");
  };

  const removeSet = (id: string) => {
    setSets((current) => {
      const next = current.filter((item) => item.id !== id);
      sendSyncPatch({ sets: next });
      return next;
    });
  };

  const removeHistory = (id: string) => {
    setHistory((current) => {
      const next = removeHistoryEntry(current, id);
      sendSyncPatch({ history: next });
      return next;
    });
  };

  const addHistoryToPool = (entry: DrawHistoryEntry) => {
    const reusedSet = historyEntryToSet(entry);
    setSets((current) => {
      const next = [...current, reusedSet];
      sendSyncPatch({ sets: next });
      return next;
    });
  };

  const stratagemById = useMemo(
    () => new Map(mergedCatalog.stratagems.map((item) => [item.id, item])),
    [mergedCatalog],
  );

  return (
    <main className="appShell">
      <section className="hero">
        <div>
          <span className="eyebrow">FOR LOCAL DEMOCRACY</span>
          <h1>RandomHD2</h1>
          <p>Helldivers 2 本地随机器。快速随机配装，也支持朋友开黑时从自定义战备池不重复抽取。</p>
        </div>
        <div className="heroStats">
          <strong>{syncStatus === "connected" ? syncClients : "本地"}</strong>
          <span>{syncStatus === "connected" ? "同步在线" : syncStatus === "connecting" ? "尝试同步" : "本地模式"}</span>
          <strong>{randomizableStratagems.length}</strong>
          <span>可选战备</span>
          <strong>{mergedCatalog.weapons.length + mergedCatalog.grenades.length}</strong>
          <span>武器与手雷</span>
        </div>
      </section>

      <section className="panel quickPanel">
        <div className="sectionHead">
          <div>
            <span className="eyebrow">QUICK ROLL</span>
            <h2>快速随机</h2>
          </div>
          <div className="actions">
            <button className="primary" onClick={rollAll}>全部随机</button>
            <button onClick={() => rerollPart("faction")}>重抽阵营</button>
            <button onClick={() => rerollPart("stratagems")}>重抽战备</button>
            <button onClick={() => rerollPart("primary")}>重抽主武器</button>
            <button onClick={() => rerollPart("secondary")}>重抽副武器</button>
            <button onClick={() => rerollPart("grenade")}>重抽手雷</button>
          </div>
        </div>
        {quickError && <div className="notice error">{quickError}</div>}
        <ResultCard roll={quickRoll} />
      </section>

      <section className="twoColumn">
        <div className="panel">
          <div className="sectionHead">
            <div>
              <span className="eyebrow">SQUAD POOL</span>
              <h2>多人战备池</h2>
            </div>
            <div className="actions">
              <button className="primary" onClick={drawSquad}>抽取</button>
              <button onClick={resetSquadCooldown}>重置冷却</button>
            </div>
          </div>

          <div className="fieldRow two">
            <label>
              玩家人数
              <select value={players.length} onChange={(event) => updatePlayerCount(Number(event.target.value))}>
                <option value={2}>2 人</option>
                <option value={3}>3 人</option>
                <option value={4}>4 人</option>
              </select>
            </label>
            <label>
              重复冷却（小时）
              <input
                type="number"
                min={0}
                step={1}
                value={squadCooldownHours}
                onChange={(event) => {
                  const value = Number(event.target.value);
                  setSquadCooldownHours(Number.isFinite(value) ? Math.max(0, value) : 0);
                }}
              />
            </label>
          </div>

          <div className="playersGrid">
            {players.map((player, index) => (
              <label key={player.id}>
                玩家 {index + 1}
                <input value={player.name} onChange={(event) => updatePlayerName(index, event.target.value)} />
              </label>
            ))}
          </div>

          {squadError && <div className="notice error">{squadError}</div>}

          <div className="drawResults">
            {squadResults.map((result) => (
              <div key={`${result.playerName}-${result.set.id}`} className="drawCard">
                <strong className="drawPlayerName">{result.playerName}</strong>
                <span className="drawSetName">{result.set.name}</span>
                <div className="iconStrip">
                  {result.set.stratagemIds.map((id) => {
                    const item = stratagemById.get(id);
                    return item ? <AssetIcon key={id} src={item.icon} alt={itemLabel(item)} /> : null;
                  })}
                </div>
              </div>
            ))}
          </div>

          <div className="historyBlock">
            <div className="historyHead">
              <div>
                <span className="eyebrow">HISTORY</span>
                <h3>历史配装</h3>
              </div>
              <span>{history.length} 条</span>
            </div>

            <div className="historyList">
              {history.map((entry) => (
                <div key={entry.id} className="historyItem">
                  <div className="historyMeta">
                    <strong>{entry.set.name}</strong>
                    <span>
                      {entry.playerName} · {formatHistoryTime(entry.drawnAt)}
                    </span>
                  </div>
                  <div className="iconStrip">
                    {entry.set.stratagemIds.map((id) => {
                      const item = stratagemById.get(id);
                      return item ? <AssetIcon key={id} src={item.icon} alt={itemLabel(item)} /> : null;
                    })}
                  </div>
                  <div className="historyActions">
                    <button onClick={() => addHistoryToPool(entry)}>加入池子</button>
                    <button onClick={() => removeHistory(entry.id)}>删除</button>
                  </div>
                </div>
              ))}
              {history.length === 0 && <div className="emptyLine">创建组合后会自动保存到这里。</div>}
            </div>
          </div>
        </div>

        <div className="panel">
          <div className="sectionHead compact">
            <div>
              <span className="eyebrow">CUSTOM SETS</span>
              <h2>创建组合</h2>
            </div>
            <button className="primary" disabled={selectedStratagemIds.length !== 4} onClick={addSet}>
              加入池子
            </button>
          </div>

          <div className="fieldRow two">
            <label>
              创建者
              <select value={setOwner} onChange={(event) => setSetOwner(event.target.value)}>
                {players.map((player) => (
                  <option key={player.id} value={player.name}>{player.name}</option>
                ))}
              </select>
            </label>
            <label>
              组合名
              <input value={setName} onChange={(event) => setSetName(event.target.value)} placeholder="全轨道快乐组" />
            </label>
          </div>

          <div className="selectedCount">{selectedStratagemIds.length}/4 已选择</div>
          <div className="selectGrid">
            {randomizableStratagems.map((item) => (
              <button
                key={item.id}
                className={selectedStratagemIds.includes(item.id) ? "iconChoice selected" : "iconChoice"}
                onClick={() => toggleStratagemInSet(item.id)}
                title={itemLabel(item)}
              >
                <img src={item.icon} alt="" loading="lazy" />
              </button>
            ))}
          </div>

          <div className="poolList">
            {sets.map((set) => (
              <div key={set.id} className="poolItem">
                <div>
                  <strong>{set.name}</strong>
                  <span>{set.ownerName}</span>
                </div>
                <button onClick={() => removeSet(set.id)}>删除</button>
              </div>
            ))}
            {sets.length === 0 && <div className="emptyLine">还没有自定义组合。</div>}
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="sectionHead">
          <div>
            <span className="eyebrow">CATALOG</span>
            <h2>随机池</h2>
          </div>
          <div className="statsLine">
            战备 {enabledCounts.stratagems} / 主武器 {enabledCounts.primaries} / 副武器 {enabledCounts.secondaries} / 手雷 {enabledCounts.grenades}
          </div>
        </div>

        <div className="browserToolbar">
          <div className="tabs">
            <button className={browserTab === "stratagems" ? "active" : ""} onClick={() => setBrowserTab("stratagems")}>战备</button>
            <button className={browserTab === "weapons" ? "active" : ""} onClick={() => setBrowserTab("weapons")}>主/副武器</button>
            <button className={browserTab === "grenades" ? "active" : ""} onClick={() => setBrowserTab("grenades")}>手雷</button>
          </div>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索名称或分类" />
          <label className="checkLine">
            <input type="checkbox" checked={showEnabledOnly} onChange={(event) => setShowEnabledOnly(event.target.checked)} />
            仅启用
          </label>
        </div>

        <div className="catalogGrid">
          {browserItems.map((item) => (
            <button
              key={item.id}
              className={enabledSet.has(item.id) ? "catalogItem enabled" : "catalogItem"}
              onClick={() => toggleEnabled(item.id)}
            >
              <AssetIcon src={item.icon} alt={itemLabel(item)} />
              <strong>{itemLabel(item)}</strong>
              {!("kind" in item) && <span>{item.category}</span>}
              {customItemIds.has(item.id) && <em className="customTag">自定义</em>}
            </button>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="sectionHead">
          <div>
            <span className="eyebrow">CUSTOM ICONS</span>
            <h2>自定义图标</h2>
          </div>
          <div className="actions">
            <button disabled={undoStack.length === 0} onClick={undoLastCustomOp}>
              {undoStack.length > 0 ? `撤销：${undoStack[undoStack.length - 1].label}` : "撤销"}
            </button>
            <button onClick={toggleWikiOpen}>{wikiOpen ? "收起 Wiki 导入" : "从 Wiki 导入"}</button>
            <label className="checkLine">
              <input type="checkbox" checked={showDeleted} onChange={(event) => setShowDeleted(event.target.checked)} />
              显示已删除
            </label>
          </div>
        </div>

        <p className="panelHint">
          上传图标并指定类别后会自动保存并加入随机池，可随时删除（删除可撤销、可恢复）。
          {syncStatus !== "connected" && " 当前未连接同步服务，改动只保存在本机浏览器。"}
        </p>

        {wikiOpen && (
          <div className="wikiPanel">
            <div className="wikiHead">
              <div>
                <strong>Helldivers Wiki 新内容</strong>
                <span>
                  {wikiLoading
                    ? "正在读取清单…"
                    : wikiItems === null
                      ? "读取失败"
                      : `${wikiImportCandidates.length} 个未导入（Wiki 共 ${wikiItems.length} 个图标）`}
                </span>
              </div>
              <div className="actions">
                <button onClick={() => void loadWikiUpdates()} disabled={wikiLoading}>
                  刷新
                </button>
                <button onClick={selectAllNewWikiItems} disabled={wikiImportCandidates.length === 0}>
                  全选新项
                </button>
                <button
                  className="primary"
                  disabled={wikiSelected.length === 0 || wikiImporting}
                  onClick={() => void importSelectedWikiItems()}
                >
                  {wikiImporting ? "导入中…" : `导入所选 (${wikiSelected.length})`}
                </button>
                <label className="checkLine">
                  <input
                    type="checkbox"
                    checked={wikiShowAll}
                    onChange={(event) => setWikiShowAll(event.target.checked)}
                  />
                  显示已导入
                </label>
              </div>
            </div>

            <p className="panelHint">
              战备取 SVG 原图，武器取 128px 缩略图（原图单张 3MB 以上，不适合放进同步状态）。
              导入后即为自定义图标，可以删除或撤销。支援武器（Support Render）不在列表里——
              它们在游戏里本就是蓝色战备，且已有对应图标。
            </p>

            {wikiError && <div className="notice error">{wikiError}</div>}

            {wikiItems !== null && wikiVisibleItems.length === 0 && !wikiLoading && (
              <div className="emptyLine">
                {wikiShowAll
                  ? "Wiki 上没有可用图标。"
                  : `Wiki 上共 ${wikiItems.length} 个图标，都已在内置目录里（用 npm run update:assets 同步的）。`
                    + "想重复导入某个图标，勾选右上角「显示已导入」。"}
              </div>
            )}

            <div className="wikiGrid">
              {wikiVisibleItems.map((item) => {
                const selected = wikiSelected.includes(item.title);
                const imported = importedNames.has(item.nameEn.trim().toLowerCase());
                return (
                  <button
                    key={item.title}
                    className={selected ? "wikiItem selected" : "wikiItem"}
                    onClick={() => toggleWikiSelection(item.title)}
                    title={item.title}
                  >
                    <img
                      src={`/api/wiki/icon?title=${encodeURIComponent(item.title)}${item.category === "weapons" ? "&thumb=1" : ""}`}
                      alt=""
                      loading="lazy"
                    />
                    <strong>{item.nameEn}</strong>
                    <span>
                      {item.category === "stratagems"
                        ? item.suggestedKind
                          ? STRATAGEM_KIND_LABELS[item.suggestedKind]
                          : "战备"
                        : item.slot
                          ? WEAPON_SLOT_LABELS[item.slot]
                          : item.category}
                      {item.known || imported ? " · 已导入" : ""}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="fieldRow two">
          <label>
            类型
            <select
              value={uploadKind}
              onChange={(event) => setUploadKind(event.target.value as "stratagem" | "weapon")}
            >
              <option value="stratagem">战备</option>
              <option value="weapon">武器 / 手雷</option>
            </select>
          </label>
          {uploadKind === "stratagem" ? (
            <label>
              战备类别
              <select
                value={uploadStratagemKind}
                onChange={(event) => setUploadStratagemKind(event.target.value as Stratagem["kind"])}
              >
                {STRATAGEM_KINDS.map((kind) => (
                  <option key={kind} value={kind}>{STRATAGEM_KIND_LABELS[kind]}</option>
                ))}
              </select>
            </label>
          ) : (
            <label>
              武器槽位
              <select
                value={uploadSlot}
                onChange={(event) => setUploadSlot(event.target.value as Weapon["slot"])}
              >
                {WEAPON_SLOTS.map((slot) => (
                  <option key={slot} value={slot}>{WEAPON_SLOT_LABELS[slot]}</option>
                ))}
              </select>
            </label>
          )}
        </div>

        <div className="fieldRow two">
          <label>
            名称（英文/显示名）
            <input value={uploadName} onChange={(event) => setUploadName(event.target.value)} placeholder="Meltagun" />
          </label>
          <label>
            中文名（可选）
            <input value={uploadNameZh} onChange={(event) => setUploadNameZh(event.target.value)} placeholder="热熔枪" />
          </label>
        </div>

        <div className="fieldRow two">
          {uploadKind === "weapon" && (
            <label>
              分类（可选）
              <input
                value={uploadCategory}
                onChange={(event) => setUploadCategory(event.target.value)}
                placeholder={WEAPON_SLOT_LABELS[uploadSlot]}
              />
            </label>
          )}
          <label>
            图标文件（SVG 或 PNG）
            <input
              type="file"
              accept=".svg,.png,image/svg+xml,image/png"
              onChange={(event) => void handleUploadFile(event.target.files?.[0])}
            />
          </label>
        </div>

        <div className="uploadFooter">
          <div className="uploadPreview">
            {uploadSvg ? (
              <>
                <AssetIcon src={customItemIcon({ svg: uploadSvg, format: uploadFormat })} alt="预览" />
                <span>预览</span>
              </>
            ) : (
              <span>选择 SVG 后会在这里预览</span>
            )}
          </div>
          <button className="primary" disabled={!uploadSvg} onClick={submitCustomItem}>
            上传并加入随机池
          </button>
        </div>

        {uploadError && <div className="notice error">{uploadError}</div>}

        <div className="poolList">
          {(showDeleted ? customItems : activeCustomItems(customItems)).map((item) => {
            const isDeleted = item.deletedAt !== undefined;
            const usage = countSetUsage(sets, item.id);

            return (
              <div key={item.id} className={isDeleted ? "poolItem customRow deleted" : "poolItem customRow"}>
                <div className="customRowMain">
                  <AssetIcon src={customItemIcon(item)} alt={itemLabel(item)} />
                  <div>
                    <strong>{itemLabel(item)}</strong>
                    <span>
                      {item.category}
                      {isDeleted ? " · 已删除" : ""}
                      {usage > 0 ? ` · 被 ${usage} 个组合使用` : ""}
                    </span>
                  </div>
                </div>
                <div className="historyActions">
                  {isDeleted ? (
                    <>
                      <button onClick={() => restoreCustomItemById(item)}>恢复</button>
                      <button onClick={() => purgeCustomItemById(item)}>彻底删除</button>
                    </>
                  ) : (
                    <button onClick={() => deleteCustomItem(item)}>删除</button>
                  )}
                </div>
              </div>
            );
          })}
          {customItems.length === 0 && <div className="emptyLine">还没有自定义图标。</div>}
          {customItems.length > 0 && !showDeleted && activeCustomItems(customItems).length === 0 && (
            <div className="emptyLine">所有自定义图标都已删除，勾选「显示已删除」可以恢复。</div>
          )}
          {showDeleted && deletedCustomItems(customItems).length === 0 && (
            <div className="emptyLine">没有已删除的自定义图标。</div>
          )}
        </div>
      </section>

      <footer className="appFooter">
        <span>{`RandomHD2 v${APP_VERSION}`}</span>
        <span>{`更新于 ${formatBuildTime(BUILD_TIME)}`}</span>
      </footer>
    </main>
  );
}
