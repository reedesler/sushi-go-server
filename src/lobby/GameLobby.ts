import { GameQueue, parseGame } from "./GameQueue";
import { Command, interceptWithCommands, Message, send, waitForCommand } from "../SushiGoClient";
import { ReturnCode } from "../ApiTypes";
import { remove } from "../util";
import { startGame } from "../game/Game";
import {
  ClientState,
  ClientStateAction,
  mergeActions,
  retry,
  setState,
  SushiGoClient,
} from "../NewSushiGoClient";

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
    arguments: ["gameId"],
    handle: id => {
      const game = lobby.games.find(g => g.id === id);
      if (!game)
        return retry(client, { data: "No game with that id", code: ReturnCode.INVALID_COMMAND });
      if (game.players.length === game.maxPlayers)
        return retry(client, { data: "Game is full", code: ReturnCode.INVALID_COMMAND });
      return {}; //mergeActions(addClientToGame(lobby, client, game), setState(client, []));
    },
  },
  {
    action: "NEW",
    isJSON: true,
    arguments: ["gameConfig"],
    handle: data => {
      const parsedGame = parseGame(data, lobby, client);
      if (parsedGame.error)
        return retry(client, { data: parsedGame.message, code: ReturnCode.INVALID_COMMAND });
      return {}; //createGame(lobby, client, parsedGame.game);
    },
  },
];

// const inQueueCommands: Command<GameLobby>[] = [
//   {
//     action: "LEAVE",
//     isJSON: false,
//     arguments: [],
//     handle: (client, args, retry, lobby) => removeClientFromGame(lobby, client),
//   },
// ];

export const enterLobby = (lobby: GameLobby, client: SushiGoClient): ClientStateAction => {
  lobby.clientsInLobby.add(client);
  return {
    [client.id]: {
      messages: [getLobbyInfoMessage(lobby, client)],
      newState: lobbyCommands(client, lobby),
      onClose: () => ({}), //() => removeClientFromLobby(lobby, client)
    },
  };
};

const getClientGame = (lobby: GameLobby, client: SushiGoClient) =>
  lobby.games.find(g => g.players.includes(client));

// const removeClientFromLobby = (lobby: GameLobby, client: SushiGoClient) => {
//   lobby.clientsInLobby.delete(client);
//   const game = getClientGame(lobby, client);
//   if (game) {
//     if (game.creator === client) {
//       deleteGameFromLobby(lobby, client, game);
//     } else {
//       remove(client, game.players);
//     }
//     updateLobbyInfoForAll(lobby);
//   }
// };

const getLobbyInfo = (lobby: GameLobby, client: SushiGoClient) => {
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

// const createGame = (
//   lobby: GameLobby,
//   client: SushiGoClient,
//   game: GameQueue,
// ): ClientStateAction => {
//   send(client, { code: ReturnCode.GAME_CREATED, data: game.id });
//   lobby.games.push(game);
//   addClientToGame(lobby, client, game);
//   return waitForCommand(client, gameCreatorCommands, lobby);
// };
//
// const deleteGame = (lobby: GameLobby, client: SushiGoClient) => {
//   const game = getClientGame(lobby, client);
//   if (game && game.creator === client) {
//     deleteGameFromLobby(lobby, client, game);
//     updateLobbyInfoForAll(lobby);
//   }
//   return waitForCommand(client, lobbyCommands, lobby);
// };
//
// const deleteGameFromLobby = (lobby: GameLobby, creator: SushiGoClient, game: GameQueue) => {
//   remove(creator, game.players);
//   game.players.forEach(p => {
//     interceptWithCommands(p, lobbyCommands, lobby, {
//       code: ReturnCode.GAME_DELETED,
//       data: "The game you were in was deleted",
//     });
//   });
//   remove(game, lobby.games);
// };
//
// const addClientToGame = (lobby: GameLobby, client: SushiGoClient, game: GameQueue) => {
//   game.players.push(client);
//   return updateLobbyInfoForAll(lobby);
// };
//
// const removeClientFromGame = (lobby: GameLobby, client: SushiGoClient) => {
//   const game = getClientGame(lobby, client);
//   if (game) {
//     remove(client, game.players);
//     updateLobbyInfoForAll(lobby);
//   }
//   return waitForCommand(client, lobbyCommands, lobby);
// };
//
// const startGameFromLobby = (lobby: GameLobby, client: SushiGoClient) => {
//   const game = getClientGame(lobby, client);
//   if (game) {
//     remove(game, lobby.games);
//     for (const p of game.players) {
//       const onLeave = lobby.clientsInLobby.get(client);
//       if (onLeave) {
//         client.socket.removeListener("close", onLeave);
//         lobby.clientsInLobby.delete(p);
//       }
//     }
//     updateLobbyInfoForAll(lobby);
//     return startGame(game, lobby, client);
//   }
//   return waitForCommand(client, lobbyCommands, lobby);
// };
