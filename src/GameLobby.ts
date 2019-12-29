import { Game, parseGame } from "./Game";
import { ReturnCode, send, SushiGoClient, Command, waitForCommand } from "./SushiGoClient";

export interface GameLobby {
  games: Game[];
  currentId: number;
  clientsInLobby: Set<SushiGoClient>;
}

export const createLobby = (): GameLobby => ({
  games: [],
  currentId: 0,
  clientsInLobby: new Set<SushiGoClient>(),
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
      updateGamesForAll(lobby);
      waitForCommand(client, lobbyCommands, lobby);
    },
  },
];

export const enterLobby = (lobby: GameLobby, client: SushiGoClient) => {
  sendGames(lobby, client);
  lobby.clientsInLobby.add(client);
  client.socket.on("close", () => lobby.clientsInLobby.delete(client));
  waitForCommand(client, lobbyCommands, lobby);
};

const sendGames = (lobby: GameLobby, client: SushiGoClient) =>
  send(client, ReturnCode.OK, lobby.games);

const updateGamesForAll = (lobby: GameLobby) => {
  lobby.clientsInLobby.forEach(c => sendGames(lobby, c));
};
