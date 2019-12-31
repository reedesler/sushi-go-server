import { Game, parseGame } from "./Game";
import { Command, ReturnCode, send, SushiGoClient, waitForCommand } from "./SushiGoClient";

export interface GameLobby {
  games: Game[];
  currentId: number;
  clientsInLobby: Set<SushiGoClient>;
  gameQueue: Map<SushiGoClient, Game>; // TODO: maybe don't need this?
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
      return waitForCommand(client, inQueueCommands, lobby);
    },
  },
  {
    action: "NEW",
    isJSON: true,
    arguments: ["gameConfig"],
    handle: (client, data, retry, lobby) => {
      const parsedGame = parseGame(data, lobby, client);
      if (parsedGame.error) return retry(parsedGame.message);
      return createGame(lobby, client, parsedGame.game);
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
  sendLobbyInfo(lobby, client);
  lobby.clientsInLobby.add(client);
  client.socket.on("close", () => lobby.clientsInLobby.delete(client));
  return waitForCommand(client, lobbyCommands, lobby);
};

interface LobbyInfo {
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

const sendLobbyInfo = (lobby: GameLobby, client: SushiGoClient) => {
  const gameList = lobby.games.map(g => ({
    ...g,
    creator: g.creator.name,
    players: g.players.map(p => p.name),
    queued: lobby.gameQueue.get(client) === g,
  }));
  send<LobbyInfo>(client, ReturnCode.GAME_LIST, {
    gameList,
    queuedForGame: lobby.gameQueue.get(client)?.id ?? null,
  });
};

const updateGamesForAll = (lobby: GameLobby) => {
  lobby.clientsInLobby.forEach(c => sendLobbyInfo(lobby, c));
};

const createGame = (lobby: GameLobby, client: SushiGoClient, game: Game) => {
  send(client, ReturnCode.GAME_CREATED, game.id);
  lobby.games.push(game);
  addClientToGame(lobby, client, game);
  // TODO: creator commands: REMOVE, START
  return Promise.resolve({ message: "Client created game" });
};

const addClientToGame = (lobby: GameLobby, client: SushiGoClient, game: Game) => {
  game.players.push(client);
  lobby.gameQueue.set(client, game);
  updateGamesForAll(lobby);
};

const removeClientFromGame = (lobby: GameLobby, client: SushiGoClient) => {
  const game = lobby.gameQueue.get(client);
  if (game) {
    game.players.splice(game.players.indexOf(client), 1);
    lobby.gameQueue.delete(client);
    updateGamesForAll(lobby);
  }
  return waitForCommand(client, lobbyCommands, lobby);
};
