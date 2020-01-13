export enum ReturnCode {
  GIVE_NAME = "100",
  PICK_CARD = "110",
  LOBBY_INFO = "200",
  GAME_CREATED = "201",
  GAME_STARTED = "202",
  INVALID_COMMAND = "400",
  INVALID_JSON = "401",
  COMMAND_NOT_FOUND = "404",
  TOO_MANY_RETRIES = "499",
  GAME_DELETED = "500",
  UNIMPLEMENTED = "504",
  GAME_ENDED = "510",
}

export interface LobbyInfo {
  gameList: GameInfo[];
  queuedForGame: number | null;
}

export interface GameInfo {
  id: number;
  name: string;
  players: string[];
  maxPlayers: number;
  creator: string;
}

export type Card = "t" | "s" | "d" | "m3" | "m2" | "m1" | "n3" | "n2" | "n1" | "p" | "w" | "c";

export interface GameData {
  hand: Card[];
  playerStates: { id: string; name: string; cards: Card[]; scores: number[]; puddings: number }[];
  round: number;
}
