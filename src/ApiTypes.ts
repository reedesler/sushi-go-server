export enum ReturnCode {
  GIVE_NAME = "100",
  PICK_CARD = "110",
  LOBBY_INFO = "200",
  GAME_CREATED = "201",
  GAME_STARTED = "202",
  ROUND_END = "203",
  GAME_END = "204",
  GOT_PICK = "210",
  JOINED_SERVER = "250",
  INVALID_COMMAND = "400",
  INVALID_JSON = "401",
  COMMAND_NOT_FOUND = "404",
  INVALID_CARD_INDEX = "410",
  TOO_MANY_RETRIES = "499",
  GAME_DELETED = "500",
  UNIMPLEMENTED = "504",
  GAME_INTERRUPTED = "510",
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

export type Card =
  | "tempura"
  | "sashimi"
  | "dumpling"
  | "maki3"
  | "maki2"
  | "maki1"
  | "nigiri3"
  | "nigiri2"
  | "nigiri1"
  | "pudding"
  | "wasabi"
  | "chopsticks";

export interface GameData {
  hand: Card[];
  playerStates: { id: string; name: string; cards: Card[]; scores: number[]; puddings: number }[];
  round: number;
}

export interface GameEnd {
  winner: { id: string; name: string };
  scores: Array<{
    player: {
      id: string;
      name: string;
    };
    score: number;
  }>;
}
