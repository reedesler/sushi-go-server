import { GameQueue, parseGame } from "./GameQueue";
import {
  Command,
  interceptWithCommands,
  Message,
  send,
  SushiGoClient,
  waitForCommand,
} from "../SushiGoClient";
import { LobbyInfo, ReturnCode } from "../ApiTypes";
import { remove } from "../util";
import { startGame } from "../game/Game";

export interface GameLobby {
  games: GameQueue[];
  currentId: number;
  clientsInLobby: Map<SushiGoClient, () => void>;
}

export const createLobby = (): GameLobby => ({
  games: [],
  currentId: 0,
  clientsInLobby: new Map<SushiGoClient, () => void>(),
});

const lobbyCommands: Command<GameLobby>[] = [
  {
    action: "JOIN",
    isJSON: true,
    arguments: ["gameId"],
    handle: (client, id, retry, lobby) => {
      const game = lobby.games.find(g => g.id === id);
      if (!game) return retry({ data: "No game with that id" });
      if (game.players.length === game.maxPlayers) return retry({ data: "Game is full" });
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
      if (parsedGame.error) return retry({ data: parsedGame.message });
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

const joinLobby = (lobby: GameLobby, client: SushiGoClient) => {
  sendLobbyInfo(lobby, client);
  const onLeave = () => removeClientFromLobby(lobby, client);
  lobby.clientsInLobby.set(client, onLeave);
  client.socket.on("close", onLeave);
};

export const enterLobby = (lobby: GameLobby, client: SushiGoClient) => {
  joinLobby(lobby, client);
  return waitForCommand(client, lobbyCommands, lobby);
};

export const interceptLobby = (lobby: GameLobby, client: SushiGoClient, message: Message) => {
  joinLobby(lobby, client);
  interceptWithCommands(client, lobbyCommands, lobby, message);
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
    updateLobbyInfoForAll(lobby);
  }
};

const sendLobbyInfo = (lobby: GameLobby, client: SushiGoClient) => {
  const gameList = lobby.games.map(g => ({
    ...g,
    creator: g.creator.name,
    players: g.players.map(p => p.name),
  }));
  send<LobbyInfo>(client, {
    code: ReturnCode.LOBBY_INFO,
    data: {
      gameList,
      queuedForGame: getClientGame(lobby, client)?.id ?? null,
    },
  });
};

const updateLobbyInfoForAll = (lobby: GameLobby) => {
  lobby.clientsInLobby.forEach((v, c) => sendLobbyInfo(lobby, c));
};

const gameCreatorCommands: Command<GameLobby>[] = [
  {
    action: "DELETE",
    isJSON: false,
    arguments: [],
    handle: (client, args, retry, lobby) => deleteGame(lobby, client),
  },
  {
    action: "START",
    isJSON: false,
    arguments: [],
    handle: (client, args, retry, lobby) => startGameFromLobby(lobby, client),
  },
];

const createGame = (lobby: GameLobby, client: SushiGoClient, game: GameQueue) => {
  send(client, { code: ReturnCode.GAME_CREATED, data: game.id });
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

const deleteGameFromLobby = (lobby: GameLobby, creator: SushiGoClient, game: GameQueue) => {
  remove(creator, game.players);
  game.players.forEach(p => {
    interceptWithCommands(p, lobbyCommands, lobby, {
      code: ReturnCode.GAME_DELETED,
      data: "The game you were in was deleted",
    });
  });
  remove(game, lobby.games);
};

const addClientToGame = (lobby: GameLobby, client: SushiGoClient, game: GameQueue) => {
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

const startGameFromLobby = (lobby: GameLobby, client: SushiGoClient) => {
  const game = getClientGame(lobby, client);
  if (game) {
    remove(game, lobby.games);
    for (const p of game.players) {
      const onLeave = lobby.clientsInLobby.get(client);
      if (onLeave) {
        client.socket.removeListener("close", onLeave);
        lobby.clientsInLobby.delete(p);
      }
    }
    updateLobbyInfoForAll(lobby);
    return startGame(game, lobby, client);
  }
  return waitForCommand(client, lobbyCommands, lobby);
};
