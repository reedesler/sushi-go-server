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
import { getTopTwo, remove, shuffle, sum } from "../util";
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
  lobby: GameLobby;
}

interface Player extends SushiGoClient {
  game: Game;
  playerState: PlayerState;
}

const ROUNDS = 3;

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

const newGame = (gameInfo: GameQueue, lobby: GameLobby): Game => {
  return {
    name: gameInfo.name,
    players: [],
    deck: newDeck(),
    round: 0,
    lobby,
  };
};

export const startGame = (gameInfo: GameQueue, lobby: GameLobby): ClientStateAction => {
  const game = newGame(gameInfo, lobby);
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

  return mergeActions(startAction, nextRound(game));
};

const nextRound = (game: Game) => {
  game.round += 1;
  for (const p of game.players) {
    p.playerState.hand = dealHand(game);
  }

  return runPickPrompt(game);
};

const dealHand = (game: Game) => {
  const n = 12 - game.players.length;
  const hand = game.deck.splice(0, n);
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

  // sanity check all players have the same number of cards in hand
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
  if (game.players[0].playerState.hand.length === 1) {
    for (const p of game.players) {
      handToCards(p.playerState.hand[0], p);
    }
  }

  // sanity check all players have the same number of cards
  const cardCount = game.players[0].playerState.cards.length;
  const allPlayersHaveCardCount = game.players.every(p => p.playerState.cards.length === cardCount);
  if (!allPlayersHaveCardCount) throw new Error("players had different number of cards");

  const groupScores = calculateGroupScores(game.players);

  const roundEndMessage: ClientStateAction = {};

  for (const player of game.players) {
    const score = calculateIndividualScore(player.playerState.cards);
    const totalScore = score + groupScores[player.id];
    player.playerState.scores[game.round - 1] = totalScore;
    player.playerState.puddings += puddingCount(player.playerState.cards);
  }

  game.players.forEach(p => {
    roundEndMessage[p.id] = {
      messages: [{ code: ReturnCode.ROUND_END, data: getGameData(game, p) }],
    };
  });

  game.players.forEach(p => (p.playerState.cards = []));

  if (game.round === ROUNDS) return mergeActions(roundEndMessage, endGame(game));

  return mergeActions(roundEndMessage, nextRound(game));
};

export const calculateGroupScores = (players: { id: string; playerState: { cards: Card[] } }[]) => {
  const groupScores = players.reduce(
    (scores: { [id: string]: number }, p) => ({ ...scores, [p.id]: 0 }),
    {},
  );
  const makiScores = players.map(p => ({ id: p.id, score: getMakiScore(p.playerState.cards) }));
  const { first: firstScore, second: secondScore } = getTopTwo(makiScores.map(s => s.score));
  const firstScoreCount = makiScores.filter(s => s.score === firstScore).length;
  const secondScoreCount = makiScores.filter(s => s.score === secondScore).length;

  if (firstScore > 0) {
    const firstScoreShare = Math.floor(6 / firstScoreCount);
    for (const s of makiScores) {
      if (s.score === firstScore) {
        groupScores[s.id] = firstScoreShare;
      }
    }

    if (firstScoreCount === 1 && secondScore > 0) {
      const secondScoreShare = Math.floor(3 / secondScoreCount);
      for (const s of makiScores) {
        if (s.score === secondScore) {
          groupScores[s.id] = secondScoreShare;
        }
      }
    }
  }

  return groupScores;
};

export const getMakiScore = (cards: Card[]) =>
  sum(
    cards.map(c => {
      switch (c) {
        case "maki1":
          return 1;
        case "maki2":
          return 2;
        case "maki3":
          return 3;
        default:
          return 0;
      }
    }),
  );

export const calculateIndividualScore = (cards: Card[]) =>
  tempuraScore(cards) + sashimiScore(cards) + dumplingScore(cards) + nigiriScore(cards);

export const tempuraScore = (cards: Card[]) =>
  Math.floor(cards.filter(c => c === "tempura").length / 2) * 5;

export const sashimiScore = (cards: Card[]) =>
  Math.floor(cards.filter(c => c === "sashimi").length / 3) * 10;

export const dumplingScore = (cards: Card[]) => {
  const dumplings = cards.filter(c => c === "dumpling").length;
  const n = Math.min(dumplings, 5);
  return (n * (n + 1)) / 2;
};

export const nigiriScore = (cards: Card[]) => {
  let score = 0;
  let wasabis = 0;
  for (const card of cards) {
    let nigiri = 0;
    if (card === "wasabi") {
      wasabis += 1;
    } else if (card === "nigiri1") {
      nigiri = 1;
    } else if (card === "nigiri2") {
      nigiri = 2;
    } else if (card === "nigiri3") {
      nigiri = 3;
    }

    if (nigiri > 0 && wasabis > 0) {
      nigiri *= 3;
      wasabis -= 1;
    }

    score += nigiri;
  }

  return score;
};

const puddingCount = (cards: Card[]) => cards.filter(c => c === "pudding").length;

const endGame = (game: Game): ClientStateAction => {
  // sanity check each player has 3 scores
  const allScored = game.players.every(p => p.playerState.scores.length === ROUNDS);
  if (!allScored) throw new Error("player without 3 scores");

  const finalScores = [];

  const puddingScores = calculateFinalPuddingScores(game.players);

  for (const player of game.players) {
    const score = sum(player.playerState.scores) + puddingScores[player.id];
    finalScores.push({ player: { id: player.id, name: player.name }, score });
  }

  const winner = finalScores.sort((a, b) => b.score - a.score)[0].player;

  const gameEndMessage = { winner: { id: winner.id, name: winner.name }, scores: finalScores };

  let gameEndAction: ClientStateAction = {};
  game.players.forEach(p => {
    gameEndAction = {
      ...gameEndAction,
      ...enterLobby(game.lobby, p, { code: ReturnCode.GAME_END, data: gameEndMessage }),
    };
  });

  return gameEndAction;
};

export const calculateFinalPuddingScores = (
  players: { id: string; playerState: { puddings: number } }[],
) => {
  const puddingScores = players.reduce(
    (scores: { [id: string]: number }, p) => ({ ...scores, [p.id]: 0 }),
    {},
  );

  const puddings = players.map(p => p.playerState.puddings);

  const allEqual = puddings.every(p => p === puddings[0]);
  if (allEqual) return puddingScores;

  puddings.sort((a, b) => a - b);

  const leastPudding = puddings[0];
  const mostPudding = puddings[puddings.length - 1];

  const leastPuddingCount = puddings.filter(p => p === leastPudding).length;
  const mostPuddingCount = puddings.filter(p => p === mostPudding).length;

  const mostPuddingShare = Math.floor(6 / mostPuddingCount);
  const leastPuddingShare = Math.ceil(-6 / leastPuddingCount);

  for (const player of players) {
    if (player.playerState.puddings === mostPudding) {
      puddingScores[player.id] = mostPuddingShare;
    } else if (player.playerState.puddings === leastPudding && players.length > 2) {
      puddingScores[player.id] = leastPuddingShare;
    }
  }

  return puddingScores;
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
