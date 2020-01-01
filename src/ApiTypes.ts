export enum ReturnCode {
  GIVE_NAME = "100",
  LOBBY_INFO = "200",
  GAME_CREATED = "201",
  INVALID_COMMAND = "400",
  INVALID_JSON = "401",
  COMMAND_NOT_FOUND = "404",
  TOO_MANY_RETRIES = "499",
  GAME_DELETED = "500",
  UNIMPLEMENTED = "504",
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
