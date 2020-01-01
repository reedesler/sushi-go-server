import { GameLobby } from "./GameLobby";
import { Data, SushiGoClient } from "../SushiGoClient";

export interface GameQueue {
  id: number;
  name: string;
  players: SushiGoClient[];
  maxPlayers: number;
  creator: SushiGoClient;
}

const createGame = (
  data: { name: string },
  lobby: GameLobby,
  creator: SushiGoClient,
): GameQueue => {
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
): { error: true; message: Data } | { error: false; game: GameQueue } => {
  if (typeof data !== "object" || data === null)
    return { error: true, message: "Expected JSON object" };
  if (!hasName(data)) return { error: true, message: { name: "Missing name" } };
  if (data.name.length > 20)
    return { error: true, message: { name: "Name must be <= 20 characters" } };
  if (data.name.length === 0)
    return { error: true, message: { name: "Name must be > 0 characters" } };
  return {
    error: false,
    game: createGame(data, lobby, creator),
  };
};

const hasName = <O extends object>(data: O): data is O & { name: string } => {
  return "name" in data && typeof (data as { name: unknown }).name === "string";
};
