import { Game, parseGame } from "./Game";
import {
  Command,
  interceptWithCommands,
  send,
  SushiGoClient,
  waitForCommand,
} from "./SushiGoClient";
import { LobbyInfo, ReturnCode } from "./ApiTypes";
import { remove } from "./util";

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
  client.socket.on("close", () => removeClientFromLobby(lobby, client));
  return waitForCommand(client, lobbyCommands, lobby);
};

const getClientGame = (lobby: GameLobby, client: SushiGoClient) =>
  lobby.games.find(g => g.players.includes(client));

const removeClientFromLobby = (lobby: GameLobby, client: SushiGoClient) => {
  lobby.clientsInLobby.delete(client);
  const game = getClientGame(lobby, client);
  if (game) {
    if (game.creator === client) {
      deleteGameFromLobby(lobby, client, game);
    } else {
      remove(client, game.players);
    }
  }
  updateLobbyInfoForAll(lobby);
};

const sendLobbyInfo = (lobby: GameLobby, client: SushiGoClient) => {
  const gameList = lobby.games.map(g => ({
    ...g,
    creator: g.creator.name,
    players: g.players.map(p => p.name),
  }));
  send<LobbyInfo>(client, ReturnCode.LOBBY_INFO, {
    gameList,
    queuedForGame: getClientGame(lobby, client)?.id ?? null,
  });
};

const updateLobbyInfoForAll = (lobby: GameLobby) => {
  lobby.clientsInLobby.forEach(c => sendLobbyInfo(lobby, c));
};

const gameCreatorCommands: Command<GameLobby>[] = [
  {
    action: "DELETE",
    isJSON: false,
    arguments: [],
    handle: (client, args, retry, lobby) => deleteGame(lobby, client),
  },
];

const createGame = (lobby: GameLobby, client: SushiGoClient, game: Game) => {
  send(client, ReturnCode.GAME_CREATED, game.id);
  lobby.games.push(game);
  addClientToGame(lobby, client, game);
  return waitForCommand(client, gameCreatorCommands, lobby);
};

const deleteGame = (lobby: GameLobby, client: SushiGoClient) => {
  const game = getClientGame(lobby, client);
  if (game && game.creator === client) {
    deleteGameFromLobby(lobby, client, game);
    updateLobbyInfoForAll(lobby);
  }
  return waitForCommand(client, lobbyCommands, lobby);
};

const deleteGameFromLobby = (lobby: GameLobby, client: SushiGoClient, game: Game) => {
  remove(client, game.players);
  game.players.forEach(p => {
    send(p, ReturnCode.GAME_DELETED, "The game you were in was deleted");
    interceptWithCommands(p, lobbyCommands, lobby);
  });
  remove(game, lobby.games);
};

const addClientToGame = (lobby: GameLobby, client: SushiGoClient, game: Game) => {
  game.players.push(client);
  updateLobbyInfoForAll(lobby);
};

const removeClientFromGame = (lobby: GameLobby, client: SushiGoClient) => {
  const game = getClientGame(lobby, client);
  if (game) {
    remove(client, game.players);
    updateLobbyInfoForAll(lobby);
  }
  return waitForCommand(client, lobbyCommands, lobby);
};
