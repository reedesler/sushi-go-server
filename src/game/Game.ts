import { GameQueue } from "../lobby/GameQueue";
import { ClientState, ClientStateAction, mergeActions, SushiGoClient } from "../SushiGoClient";
import { GameLobby } from "../lobby/GameLobby";
import { remove, shuffle } from "../util";
import { Card, GameData, ReturnCode } from "../ApiTypes";

interface PlayerState {
  cards: Card[];
  scores: number[];
  puddings: number;
  hand: Card[];
}

interface Game {
  name: string;
  players: Player[];
  deck: Card[];
  round: number;
}

interface Player extends SushiGoClient {
  game: Game;
  playerState: PlayerState;
}

const addCards = (deck: Card[], card: Card, count: number): Card[] =>
  deck.concat(...Array(count).fill(card));

const newDeck = (): Card[] => {
  let deck: Card[] = [];
  deck = addCards(deck, "tempura", 14);
  deck = addCards(deck, "sashimi", 14);
  deck = addCards(deck, "dumpling", 14);
  deck = addCards(deck, "maki2", 12);
  deck = addCards(deck, "maki3", 8);
  deck = addCards(deck, "maki1", 6);
  deck = addCards(deck, "nigiri2", 10);
  deck = addCards(deck, "nigiri3", 5);
  deck = addCards(deck, "nigiri1", 5);
  deck = addCards(deck, "pudding", 10);
  deck = addCards(deck, "wasabi", 6);
  deck = addCards(deck, "chopsticks", 4);
  return shuffle(deck);
};

const newGame = (gameInfo: GameQueue): Game => {
  return {
    name: gameInfo.name,
    players: [],
    deck: newDeck(),
    round: 1,
  };
};

export const startGame = (
  gameInfo: GameQueue,
  lobby: GameLobby,
  client: SushiGoClient,
): ClientStateAction => {
  const game = newGame(gameInfo);
  const startAction: ClientStateAction = {};
  for (const p of gameInfo.players) {
    const player: Player = {
      ...p,
      game,
      playerState: { cards: [], hand: [], puddings: 0, scores: [] },
    };
    game.players.push(player);

    startAction[p.id] = {
      messages: [{ code: ReturnCode.GAME_STARTED, data: "Game started" }],
      onClose: () => ({}), //handlePlayerDisconnect(game, player, lobby)
    };
  }

  for (const p of game.players) {
    p.playerState.hand = dealHand(game);
  }

  return mergeActions(startAction, runPick(game));
};

const dealHand = (game: Game) => {
  const n = 12 - game.players.length;
  console.log(n);
  const hand = game.deck.splice(0, n);
  console.log(hand);
  return hand;
};

const gameCommands: ClientState = [
  {
    action: "PICK",
    isJSON: false,
    arguments: [{ name: "handIndex" }, { name: "secondHandIndex", optional: true }],
    handle: args => {
      return {};
    },
  },
];

const runPick = (game: Game): ClientStateAction => {
  const pickAction: ClientStateAction = {};
  for (const p of game.players) {
    pickAction[p.id] = {
      messages: [
        {
          code: ReturnCode.PICK_CARD,
          data: getGameData(game, p),
        },
      ],
      newState: gameCommands,
    };
  }
  return pickAction;
};

const getGameData = (game: Game, player: Player): GameData => ({
  hand: player.playerState.hand,
  playerStates: game.players.map(p => ({
    id: p.id,
    name: p.name,
    cards: p.playerState.cards,
    scores: p.playerState.scores,
    puddings: p.playerState.puddings,
  })),
  round: game.round,
});
//
// const handlePlayerDisconnect = (game: Game, player: Player, lobby: GameLobby) => {
//   remove(player, game.players);
//   game.players.forEach(p => {
//     p.socket.removeListener("close", p.onLeave);
//     const client: SushiGoClient = { socket: p.socket, name: p.name, version: p.version, id: p.id };
//     interceptLobby(lobby, client, {
//       code: ReturnCode.GAME_ENDED,
//       data: "Other player disconnected",
//     });
//   });
// };
