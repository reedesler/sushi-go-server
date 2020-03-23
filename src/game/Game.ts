import { GameQueue } from "../lobby/GameQueue";
import {
  ClientState,
  ClientStateAction,
  mergeActions,
  retry,
  setState,
  SushiGoClient,
} from "../SushiGoClient";
import { enterLobby, GameLobby } from "../lobby/GameLobby";
import { remove, shuffle } from "../util";
import { Card, GameData, ReturnCode } from "../ApiTypes";

interface PlayerState {
  cards: Card[];
  scores: number[];
  puddings: number;
  hand: Card[];
  pickedCards: [Card, Card?] | null;
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

export const startGame = (gameInfo: GameQueue, lobby: GameLobby): ClientStateAction => {
  const game = newGame(gameInfo);
  const startAction: ClientStateAction = {};
  const players = shuffle(gameInfo.players);
  for (const p of players) {
    const player: Player = {
      ...p,
      game,
      playerState: { cards: [], hand: [], puddings: 0, scores: [], pickedCards: null },
    };
    game.players.push(player);

    startAction[p.id] = {
      messages: [{ code: ReturnCode.GAME_STARTED, data: "Game started" }],
      onClose: () => handlePlayerDisconnect(game, player, lobby),
    };
  }

  for (const p of game.players) {
    p.playerState.hand = dealHand(game);
  }

  return mergeActions(startAction, runPickPrompt(game));
};

const dealHand = (game: Game) => {
  const n = 12 - game.players.length;
  console.log(n);
  const hand = game.deck.splice(0, n);
  console.log(hand);
  return hand;
};

const gameCommands = (player: Player, game: Game): ClientState => [
  {
    action: "PICK",
    isJSON: false,
    arguments: [{ name: "handIndex" }, { name: "secondHandIndex", optional: true }],
    handle: args => {
      const index = parseInt(args[0]);

      const errorAction = checkValidIndex(index, player);
      if (errorAction) return errorAction;

      const hand = player.playerState.hand;

      const pickedCards: [Card, Card?] = [hand[index]];

      if (args[1]) {
        const hasChopsticks = player.playerState.cards.some(c => c === "chopsticks");
        if (!hasChopsticks) {
          return retry(player, {
            code: ReturnCode.INVALID_CARD_INDEX,
            data: "You don't have chopsticks to use",
          });
        }

        const secondIndex = parseInt(args[1]);

        const errorAction = checkValidIndex(secondIndex, player);
        if (errorAction) return errorAction;

        pickedCards.push(hand[secondIndex]);
      }

      player.playerState.pickedCards = pickedCards;

      const waitAction = setState(player, [], { code: ReturnCode.GOT_PICK, data: "Card chosen" });
      const nextStepAction = getNextStep(game);

      return mergeActions(waitAction, nextStepAction);
    },
  },
];

const checkValidIndex = (index: number, player: Player) => {
  if (isNaN(index))
    return retry(player, { code: ReturnCode.INVALID_CARD_INDEX, data: "Invalid index" });
  const hand = player.playerState.hand;
  if (index < 0 || index >= hand.length)
    return retry(player, {
      code: ReturnCode.INVALID_CARD_INDEX,
      data: "Index must be >= 0 and <= " + (hand.length - 1),
    });
};

const runPickPrompt = (game: Game): ClientStateAction => {
  const pickAction: ClientStateAction = {};
  for (const p of game.players) {
    p.playerState.pickedCards = null;
    pickAction[p.id] = {
      messages: [
        {
          code: ReturnCode.PICK_CARD,
          data: getGameData(game, p),
        },
      ],
      newState: gameCommands(p, game),
    };
  }
  return pickAction;
};

const getNextStep = (game: Game): ClientStateAction => {
  const allPicked = game.players.every(p => p.playerState.pickedCards);
  if (!allPicked) {
    return {};
  }

  for (const player of game.players) {
    handlePick(player);
  }

  passCards(game);

  // sanity check all players have the same number of cards
  const cardCount = game.players[0].playerState.hand.length;
  const allPlayersHaveCardCount = game.players.every(p => p.playerState.hand.length === cardCount);
  if (!allPlayersHaveCardCount) throw new Error("players had different number of cards");

  if (cardCount <= 1) return endRound(game);

  return runPickPrompt(game);
};

const handlePick = (player: Player) => {
  const { pickedCards } = player.playerState;
  if (!pickedCards) throw new Error("didn't have picked cards");

  const [pickedCard, secondCard] = pickedCards;
  handToCards(pickedCard, player);

  if (secondCard) {
    handToCards(secondCard, player);
    const removedChopsticks = remove<Card>("chopsticks", player.playerState.cards);
    if (!removedChopsticks) throw new Error("couldn't swap in chopsticks");
    player.playerState.hand.push("chopsticks");
  }
};

const handToCards = (card: Card, player: Player) => {
  remove(card, player.playerState.hand);
  player.playerState.cards.push(card);
};

const passCards = (game: Game) => {
  const lastHand = game.players[game.players.length - 1].playerState.hand;

  for (let i = game.players.length - 2; i >= 0; i--) {
    const passingPlayer = game.players[i];
    const nextPlayer = game.players[i + 1];
    nextPlayer.playerState.hand = passingPlayer.playerState.hand;
  }

  game.players[0].playerState.hand = lastHand;
};

const endRound = (game: Game): ClientStateAction => {
  // TODO
  return {};
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

const handlePlayerDisconnect = (
  game: Game,
  player: Player,
  lobby: GameLobby,
): ClientStateAction => {
  remove(player, game.players);
  let disconnectAction: ClientStateAction = {};
  game.players.forEach(p => {
    disconnectAction = {
      ...disconnectAction,
      ...enterLobby(lobby, p, {
        code: ReturnCode.GAME_ENDED,
        data: "Other player disconnected",
      }),
    };
  });
  return disconnectAction;
};
