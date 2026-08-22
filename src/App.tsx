import { useEffect, useMemo, useRef, useState } from "react";
import { catalog } from "./data/generatedCatalog";
import { drawSquadSets, rollQuickLoadout } from "./lib/random";
import { loadJson, saveJson } from "./lib/storage";
import { historyEntryToSet, recordCreatedSetHistory, removeHistoryEntry } from "./lib/sync";
import { getRandomizableStratagems } from "./lib/stratagems";
import type {
  ClientSyncMessage,
  DrawHistoryEntry,
  Player,
  QuickLoadout,
  ServerSyncMessage,
  SquadDrawResult,
  Stratagem,
  StratagemSet,
  SyncPatch,
  Weapon,
} from "./types";

const STORAGE_KEYS = {
  enabledIds: "randomhd2.enabledItems",
  players: "randomhd2.players",
  sets: "randomhd2.stratagemSets",
  lastRoll: "randomhd2.lastRoll",
  history: "randomhd2.drawHistory",
};

const randomizableStratagems = getRandomizableStratagems(catalog.stratagems);
const allItems = [...randomizableStratagems, ...catalog.weapons, ...catalog.grenades];
const allDefaultEnabledIds = allItems.map((item) => item.id);

const defaultPlayers: Player[] = [
  { id: "player-1", name: "玩家 1" },
  { id: "player-2", name: "玩家 2" },
];

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
  const [browserTab, setBrowserTab] = useState<"stratagems" | "weapons" | "grenades">("stratagems");
  const [query, setQuery] = useState("");
  const [showEnabledOnly, setShowEnabledOnly] = useState(false);
  const [syncStatus, setSyncStatus] = useState<"connecting" | "connected" | "local">("connecting");
  const [syncClients, setSyncClients] = useState(1);
  const wsRef = useRef<WebSocket | null>(null);

  const enabledSet = useMemo(() => new Set(enabledIds), [enabledIds]);

  useEffect(() => saveJson(window.localStorage, STORAGE_KEYS.enabledIds, enabledIds), [enabledIds]);
  useEffect(() => saveJson(window.localStorage, STORAGE_KEYS.players, players), [players]);
  useEffect(() => saveJson(window.localStorage, STORAGE_KEYS.sets, sets), [sets]);
  useEffect(() => saveJson(window.localStorage, STORAGE_KEYS.lastRoll, quickRoll), [quickRoll]);
  useEffect(() => saveJson(window.localStorage, STORAGE_KEYS.history, history), [history]);
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
      primaries: catalog.weapons.filter((item) => item.slot === "primary" && enabledSet.has(item.id)).length,
      secondaries: catalog.weapons.filter((item) => item.slot === "secondary" && enabledSet.has(item.id)).length,
      grenades: catalog.grenades.filter((item) => enabledSet.has(item.id)).length,
    }),
    [enabledSet],
  );

  const browserItems = useMemo(() => {
    const source =
      browserTab === "stratagems"
        ? randomizableStratagems
        : browserTab === "weapons"
          ? catalog.weapons
          : catalog.grenades;
    const normalized = query.trim().toLowerCase();

    return source.filter((item) => {
      if (showEnabledOnly && !enabledSet.has(item.id)) return false;
      if (!normalized) return true;
      return item.nameEn.toLowerCase().includes(normalized) || item.category.toLowerCase().includes(normalized);
    });
  }, [browserTab, enabledSet, query, showEnabledOnly]);

  const rollAll = () => {
    try {
      const roll = rollQuickLoadout(catalog, enabledIds);
      setQuickRoll(roll);
      setQuickError("");
    } catch (error) {
      setQuickError(error instanceof Error ? error.message : "随机失败");
    }
  };

  const rerollPart = (part: "faction" | "stratagems" | "primary" | "secondary" | "grenade") => {
    try {
      const next = rollQuickLoadout(catalog, enabledIds);
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
      const results = drawSquadSets(players, sets);
      setSquadResults(results);
      sendSyncPatch({ squadResults: results });
      setSquadError("");
    } catch (error) {
      setSquadError(error instanceof Error ? error.message : "抽取失败");
    }
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
    () => new Map(catalog.stratagems.map((item) => [item.id, item])),
    [],
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
          <strong>{catalog.weapons.length + catalog.grenades.length}</strong>
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
            <button className="primary" onClick={drawSquad}>抽取</button>
          </div>

          <div className="fieldRow">
            <label>
              玩家人数
              <select value={players.length} onChange={(event) => updatePlayerCount(Number(event.target.value))}>
                <option value={2}>2 人</option>
                <option value={3}>3 人</option>
                <option value={4}>4 人</option>
              </select>
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
            </button>
          ))}
        </div>
      </section>
    </main>
  );
}
