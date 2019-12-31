import { GameLobby } from "./GameLobby";
import { SushiGoClient } from "./SushiGoClient";

export interface Game {
  id: number;
  name: string;
  players: SushiGoClient[];
  maxPlayers: number;
  creator: SushiGoClient;
}

const createGame = (data: { name: string }, lobby: GameLobby, creator: SushiGoClient): Game => {
  lobby.currentId++;
  return {
    id: lobby.currentId,
    name: data.name,
    players: [],
    maxPlayers: 5,
    creator,
  };
};

export const parseGame = (
  data: unknown,
  lobby: GameLobby,
  creator: SushiGoClient,
): { error: true; message: any } | { error: false; game: Game } => {
  if (typeof data !== "object" || data === null)
    return { error: true, message: "Expected JSON object" };
  if (!hasName(data)) return { error: true, message: { name: "Missing name" } };
  if (data.name.length > 20)
    return { error: true, message: { name: "Name must be <= 20 characters" } };
  return {
    error: false,
    game: createGame(data, lobby, creator),
  };
};

const hasName = <O extends object>(data: O): data is O & { name: string } => {
  return "name" in data && typeof (data as { name: unknown }).name === "string";
};