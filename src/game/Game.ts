import { GameQueue } from "../lobby/GameQueue";
import {
  Command,
  interceptWithCommands,
  send,
  SushiGoClient,
  waitForCommand,
} from "../SushiGoClient";
import { GameLobby, interceptLobby } from "../lobby/GameLobby";
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
  onLeave: () => void;
  playerState: PlayerState;
}

const addCards = (deck: Card[], card: Card, count: number): Card[] =>
  deck.concat(...Array(count).fill(card));

const newDeck = (): Card[] => {
  let deck: Card[] = [];
  deck = addCards(deck, "t", 14);
  deck = addCards(deck, "s", 14);
  deck = addCards(deck, "d", 14);
  deck = addCards(deck, "m2", 12);
  deck = addCards(deck, "m3", 8);
  deck = addCards(deck, "m1", 6);
  deck = addCards(deck, "n2", 10);
  deck = addCards(deck, "n3", 5);
  deck = addCards(deck, "n1", 5);
  deck = addCards(deck, "p", 10);
  deck = addCards(deck, "w", 6);
  deck = addCards(deck, "c", 4);
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

export const startGame = (gameInfo: GameQueue, lobby: GameLobby, client: SushiGoClient) => {
  const game = newGame(gameInfo);
  for (const p of gameInfo.players) {
    const player: Player = {
      ...p,
      game,
      onLeave: () => {},
      playerState: { cards: [], hand: [], puddings: 0, scores: [] },
    };
    const onLeave = () => handlePlayerDisconnect(game, player, lobby);
    player.onLeave = onLeave;
    player.socket.on("close", onLeave);
    game.players.push(player);
  }
  initGame(game);
  return waitForCommand(client, gameCommands, game);
};

const dealHand = (game: Game) => {
  const n = 12 - game.players.length;
  console.log(n);
  const hand = game.deck.splice(0, n);
  console.log(hand);
  return hand;
};

const gameCommands: Command<Game>[] = [
  {
    action: "PICK",
    isJSON: true,
    arguments: ["handIndex"],
    handle: (client, args, retry, game) => {
      return Promise.resolve({ message: "picked" });
    },
  },
];

const initGame = (game: Game) => {
  for (const p of game.players) {
    const hand = dealHand(game);
    p.playerState.hand = hand;
    send(p, { code: ReturnCode.GAME_STARTED, data: "Game started" });
    interceptWithCommands(p, gameCommands, game, {
      code: ReturnCode.PICK_CARD,
      data: getGameData(game, p),
    });
  }
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

const handlePlayerDisconnect = (game: Game, player: Player, lobby: GameLobby) => {
  remove(player, game.players);
  game.players.forEach(p => {
    p.socket.removeListener("close", p.onLeave);
    const client: SushiGoClient = { socket: p.socket, name: p.name, version: p.version, id: p.id };
    interceptLobby(lobby, client, {
      code: ReturnCode.GAME_ENDED,
      data: "Other player disconnected",
    });
  });
};
