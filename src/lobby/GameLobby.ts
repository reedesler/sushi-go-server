import { GameQueue, parseGame } from "./GameQueue";
import { LobbyInfo, ReturnCode } from "../ApiTypes";
import { remove } from "../util";
import {
  ClientState,
  ClientStateAction,
  mergeActions,
  Message,
  retry,
  sendMessage,
  setState,
  SingleClientStateAction,
  SushiGoClient,
} from "../SushiGoClient";
import { startGame } from "../game/Game";

export interface GameLobby {
  games: GameQueue[];
  currentId: number;
  clientsInLobby: Set<SushiGoClient>;
}

export const createLobby = (): GameLobby => ({
  games: [],
  currentId: 0,
  clientsInLobby: new Set<SushiGoClient>(),
});

const lobbyCommands = (client: SushiGoClient, lobby: GameLobby): ClientState => [
  {
    action: "JOIN",
    isJSON: true,
    arguments: [{ name: "gameId" }],
    handle: id => {
      const game = lobby.games.find(g => g.id === id);
      if (!game)
        return retry(client, { data: "No game with that id", code: ReturnCode.INVALID_COMMAND });
      if (game.players.length === game.maxPlayers)
        return retry(client, { data: "Game is full", code: ReturnCode.INVALID_COMMAND });
      return mergeActions(
        addClientToGame(lobby, client, game),
        setState(client, inQueueCommands(client, lobby)),
      );
    },
  },
  {
    action: "NEW",
    isJSON: true,
    arguments: [{ name: "gameConfig" }],
    handle: data => {
      const parsedGame = parseGame(data, lobby, client);
      if (parsedGame.error)
        return retry(client, { data: parsedGame.message, code: ReturnCode.INVALID_COMMAND });
      return createGame(lobby, client, parsedGame.game);
    },
  },
];

const inQueueCommands = (client: SushiGoClient, lobby: GameLobby): ClientState => [
  {
    action: "LEAVE",
    isJSON: false,
    arguments: [],
    handle: () => removeClientFromGame(lobby, client),
  },
];

export const enterLobby = (
  lobby: GameLobby,
  client: SushiGoClient,
  message?: Message,
): ClientStateAction => {
  lobby.clientsInLobby.add(client);
  return {
    [client.id]: {
      messages: [...(message ? [message] : []), getLobbyInfoMessage(lobby, client)],
      newState: lobbyCommands(client, lobby),
      onClose: () => removeClientFromLobby(lobby, client),
    },
  };
};

const getClientGame = (lobby: GameLobby, client: SushiGoClient) =>
  lobby.games.find(g => g.players.includes(client));

const removeClientFromLobby = (lobby: GameLobby, client: SushiGoClient): ClientStateAction => {
  lobby.clientsInLobby.delete(client);
  const game = getClientGame(lobby, client);
  if (game) {
    let deleteAction: ClientStateAction = {};
    if (game.creator === client) {
      deleteAction = deleteGameFromLobby(lobby, client, game);
    } else {
      remove(client, game.players);
    }
    return mergeActions(deleteAction, updateLobbyInfoForAll(lobby));
  } else {
    return {};
  }
};

const getLobbyInfo = (lobby: GameLobby, client: SushiGoClient): LobbyInfo => {
  const gameList = lobby.games.map(g => ({
    ...g,
    creator: g.creator.name,
    players: g.players.map(p => p.name),
  }));
  return {
    gameList,
    queuedForGame: getClientGame(lobby, client)?.id ?? null,
  };
};

const getLobbyInfoMessage = (lobby: GameLobby, client: SushiGoClient): Message => ({
  data: getLobbyInfo(lobby, client),
  code: ReturnCode.LOBBY_INFO,
});

const updateLobbyInfoForAll = (lobby: GameLobby): ClientStateAction =>
  [...lobby.clientsInLobby].reduce(
    (action: ClientStateAction, client): ClientStateAction => ({
      ...action,
      [client.id]: {
        messages: [getLobbyInfoMessage(lobby, client)],
      },
    }),
    {},
  );

const gameCreatorCommands = (client: SushiGoClient, lobby: GameLobby): ClientState => [
  {
    action: "DELETE",
    isJSON: false,
    arguments: [],
    handle: () => deleteGame(lobby, client),
  },
  {
    action: "START",
    isJSON: false,
    arguments: [],
    handle: () => startGameFromLobby(lobby, client),
  },
];

const createGame = (
  lobby: GameLobby,
  client: SushiGoClient,
  game: GameQueue,
): ClientStateAction => {
  const sendAction = sendMessage(client, { code: ReturnCode.GAME_CREATED, data: game.id });
  lobby.games.push(game);
  const addAction = addClientToGame(lobby, client, game);
  return mergeActions(
    mergeActions(sendAction, addAction),
    setState(client, gameCreatorCommands(client, lobby)),
  );
};

const deleteGame = (lobby: GameLobby, client: SushiGoClient) => {
  const game = getClientGame(lobby, client);
  const deleteAction =
    game && game.creator === client
      ? mergeActions(deleteGameFromLobby(lobby, client, game), updateLobbyInfoForAll(lobby))
      : {};
  return mergeActions(deleteAction, setState(client, lobbyCommands(client, lobby)));
};

const deleteGameFromLobby = (
  lobby: GameLobby,
  creator: SushiGoClient,
  game: GameQueue,
): ClientStateAction => {
  remove(creator, game.players);
  remove(game, lobby.games);
  return game.players.reduce(
    (action: ClientStateAction, p) => ({
      ...action,
      [p.id]: handleDeletedGameForPlayer(p, lobby),
    }),
    {},
  );
};

const handleDeletedGameForPlayer = (
  client: SushiGoClient,
  lobby: GameLobby,
): SingleClientStateAction => ({
  messages: [
    {
      code: ReturnCode.GAME_DELETED,
      data: "The game you were in was deleted",
    },
  ],
  newState: lobbyCommands(client, lobby),
});

const addClientToGame = (lobby: GameLobby, client: SushiGoClient, game: GameQueue) => {
  game.players.push(client);
  return updateLobbyInfoForAll(lobby);
};

const removeClientFromGame = (lobby: GameLobby, client: SushiGoClient) => {
  const game = getClientGame(lobby, client);
  let updateAction: ClientStateAction = {};
  if (game) {
    remove(client, game.players);
    updateAction = updateLobbyInfoForAll(lobby);
  }
  return mergeActions(updateAction, setState(client, lobbyCommands(client, lobby)));
};

const startGameFromLobby = (lobby: GameLobby, client: SushiGoClient): ClientStateAction => {
  const game = getClientGame(lobby, client);
  if (game) {
    remove(game, lobby.games);
    for (const p of game.players) {
      lobby.clientsInLobby.delete(p);
    }
    return mergeActions(updateLobbyInfoForAll(lobby), startGame(game, lobby));
  } else {
    return setState(client, lobbyCommands(client, lobby));
  }
};
