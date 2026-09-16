export type FactionId = "terminids" | "illuminate" | "automatons";

export type Faction = {
  id: FactionId;
  nameZh: string;
  nameEn: string;
  icon: string;
};

export type Stratagem = {
  id: string;
  nameZh?: string;
  nameEn: string;
  kind: "red" | "blue" | "green" | "yellow";
  category: string;
  icon: string;
  /** 构建时生成的小图，用于只画几十像素的场合；缺省时回退到 icon */
  thumbIcon?: string;
  selectable: boolean;
  enabled: boolean;
  tags?: string[];
};

export type Weapon = {
  id: string;
  nameZh?: string;
  nameEn: string;
  slot: "primary" | "secondary" | "grenade";
  category: string;
  icon: string;
  /** 构建时生成的小图，用于只画几十像素的场合；缺省时回退到 icon */
  thumbIcon?: string;
  enabled: boolean;
};

export type Catalog = {
  factions: Faction[];
  stratagems: Stratagem[];
  weapons: Weapon[];
  grenades: Weapon[];
};

export type QuickLoadout = {
  faction: Faction;
  stratagems: Stratagem[];
  primary: Weapon;
  secondary: Weapon;
  grenade: Weapon;
};

export type Player = {
  id: string;
  name: string;
};

export type StratagemSet = {
  id: string;
  ownerName: string;
  name: string;
  stratagemIds: [string, string, string, string];
  lastDrawnAt?: number;
};

export type CustomItemKind = "stratagem" | "weapon";

export type CustomItem = {
  id: string;
  kind: CustomItemKind;
  nameEn: string;
  nameZh?: string;
  stratagemKind?: Stratagem["kind"];
  slot?: Weapon["slot"];
  category: string;
  /** 省略视为 svg */
  format?: "svg" | "png";
  /** 图标源数据：format 为 svg 时是 SVG 文本，为 png 时是 base64 */
  svg: string;
  createdAt: number;
  deletedAt?: number;
};

export type SquadDrawResult = {
  playerName: string;
  set: StratagemSet;
};

export type DrawHistoryEntry = {
  id: string;
  playerName: string;
  set: StratagemSet;
  drawnAt: number;
};

export type SyncState = {
  players: Player[];
  sets: StratagemSet[];
  squadResults: SquadDrawResult[];
  history: DrawHistoryEntry[];
  customItems: CustomItem[];
  updatedAt: number;
};

export type SyncPatch = Partial<Pick<SyncState, "players" | "sets" | "squadResults" | "history" | "customItems">>;

/** 服务端 /api/wiki/updates 返回的 Wiki 图标条目 */
export type WikiAssetItem = {
  title: string;
  nameEn: string;
  category: "factions" | "stratagems" | "weapons";
  slot: Weapon["slot"] | null;
  mime: string;
  size: number;
  known: boolean;
  suggestedKind: Stratagem["kind"] | null;
};

export type ServerSyncMessage =
  | { type: "state"; state: SyncState }
  | { type: "presence"; clients: number };

export type ClientSyncMessage = {
  type: "patch";
  patch: SyncPatch;
};
