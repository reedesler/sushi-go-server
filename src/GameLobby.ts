import { Game, parseGame } from "./Game";
import { ReturnCode, send, SushiGoClient, Command, waitForCommand } from "./SushiGoClient";

export interface GameLobby {
  games: Game[];
  currentId: number;
}

export const createLobby = (): GameLobby => ({
  games: [],
  currentId: 0,
});

const lobbyCommands: Command<GameLobby>[] = [
  { action: "JOIN", isJSON: false, arguments: ["gameId"], handle: () => {} },
  {
    action: "NEW",
    isJSON: true,
    arguments: ["gameConfig"],
    handle: (client, data, retry, lobby) => {
      const parsedGame = parseGame(data, lobby);
      if (parsedGame.error) return retry(parsedGame.message);
      lobby.games.push(parsedGame.game);
      enterLobby(lobby, client);
    },
  },
];

export const enterLobby = (lobby: GameLobby, client: SushiGoClient) => {
  send(client, ReturnCode.OK, lobby.games);
  waitForCommand(client, lobbyCommands, lobby);
};
