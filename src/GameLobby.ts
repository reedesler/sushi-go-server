import { Game, parseGame } from "./Game";
import { Command, ReturnCode, send, SushiGoClient, waitForCommand } from "./SushiGoClient";

export interface GameLobby {
  games: Game[];
  currentId: number;
  clientsInLobby: Set<SushiGoClient>;
  gameQueue: Map<SushiGoClient, Game>;
}

export const createLobby = (): GameLobby => ({
  games: [],
  currentId: 0,
  clientsInLobby: new Set<SushiGoClient>(),
  gameQueue: new Map<SushiGoClient, Game>(),
});

const lobbyCommands: Command<GameLobby>[] = [
  {
    action: "JOIN",
    isJSON: true,
    arguments: ["gameId"],
    handle: (client, id, retry, lobby) => {
      const game = lobby.games.find(g => g.id === id);
      if (!game) return retry("No game with that id");
      if (game.players.length === game.maxPlayers) return retry("Game is full");
      addClientToGame(lobby, client, game);
    },
  },
  {
    action: "NEW",
    isJSON: true,
    arguments: ["gameConfig"],
    handle: (client, data, retry, lobby) => {
      const parsedGame = parseGame(data, lobby, client);
      if (parsedGame.error) return retry(parsedGame.message);
      send(client, ReturnCode.GAME_CREATED, parsedGame.game.id);
      lobby.games.push(parsedGame.game);
      updateGamesForAll(lobby);
      waitForCommand(client, lobbyCommands, lobby);
      // TODO: creator commands: REMOVE, START
    },
  },
];

const inQueueCommands: Command<GameLobby>[] = [
  {
    action: "LEAVE",
    isJSON: false,
    arguments: [],
    handle: (client, args, retry, lobby) => removeClientFromGame(lobby, client),
  },
];

export const enterLobby = (lobby: GameLobby, client: SushiGoClient) => {
  sendGames(lobby, client);
  lobby.clientsInLobby.add(client);
  client.socket.on("close", () => lobby.clientsInLobby.delete(client));
  waitForCommand(client, lobbyCommands, lobby);
};

const sendGames = (lobby: GameLobby, client: SushiGoClient) =>
  send(
    client,
    ReturnCode.GAME_LIST,
    lobby.games.map(g => ({
      ...g,
      creator: g.creator.name,
      players: g.players.map(p => p.name),
    })),
  );

const updateGamesForAll = (lobby: GameLobby) => {
  lobby.clientsInLobby.forEach(c => sendGames(lobby, c));
};

const addClientToGame = (lobby: GameLobby, client: SushiGoClient, game: Game) => {
  game.players.push(client);
  lobby.gameQueue.set(client, game);
  updateGamesForAll(lobby);
  waitForCommand(client, inQueueCommands, lobby);
};

const removeClientFromGame = (lobby: GameLobby, client: SushiGoClient) => {
  const game = lobby.gameQueue.get(client);
  if (game) {
    game.players.splice(game.players.indexOf(client), 1);
    lobby.gameQueue.delete(client);
    updateGamesForAll(lobby);
  }
  waitForCommand(client, lobbyCommands, lobby);
};
