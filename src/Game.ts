import { ReturnCode } from "./SushiGoClient";
import { GameLobby } from "./GameLobby";

export interface Game {
  id: number;
  name: string;
  playerCount: number;
  maxPlayers: number;
}

const createGame = (data: { name: string }, lobby: GameLobby): Game => {
  lobby.currentId++;
  return {
    id: lobby.currentId,
    name: data.name,
    playerCount: 0,
    maxPlayers: 5,
  };
};

export const parseGame = (
  data: unknown,
  lobby: GameLobby,
): { error: true; message: any } | { error: false; game: Game } => {
  if (typeof data !== "object" || data === null)
    return { error: true, message: "Expected JSON object" };
  if (!hasName(data)) return { error: true, message: { name: "Missing name" } };
  return {
    error: false,
    game: createGame(data, lobby),
  };
};

const hasName = <O extends object>(data: O): data is O & { name: string } => {
  return "name" in data && typeof (data as { name: unknown }).name === "string";
};
