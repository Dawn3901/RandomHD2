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
  updatedAt: number;
};

export type SyncPatch = Partial<Pick<SyncState, "players" | "sets" | "squadResults" | "history">>;

export type ServerSyncMessage =
  | { type: "state"; state: SyncState }
  | { type: "presence"; clients: number };

export type ClientSyncMessage = {
  type: "patch";
  patch: SyncPatch;
};
