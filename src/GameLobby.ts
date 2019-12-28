import Game from "./Game";
import { destroy, waitForResponse, ReturnCode, send, SushiGoClient } from "./SushiGoClient";

export interface GameLobby {
  games: Game[];
}

export const createLobby = (): GameLobby => ({
  games: [],
});

export const join = (lobby: GameLobby, client: SushiGoClient) => {
  send(client, ReturnCode.OK, lobby.games);
  const commands: Command[] = [{ action: "JOIN", arguments: ["gameId"], handle: () => {} }];
  waitForCommand(client, commands);
};

interface Command {
  action: string;
  arguments: string[];
  handle: () => void;
}

const waitForCommand = (client: SushiGoClient, commands: Command[], retries = 5) => {
  if (retries === 0) {
    return destroy(client, ReturnCode.TOO_MANY_RETRIES, "Too many retries");
  }
  waitForResponse(client, data => {
    const action = data.split(" ")[0];
    const command = commands.find(c => c.action === action);
    if (!command) {
      send(
        client,
        ReturnCode.INVALID_COMMAND,
        commands.map(
          c =>
            c.action +
            (c.arguments.length > 0 ? " " + c.arguments.map(a => "<" + a + ">").join(" ") : ""),
        ),
      );
      waitForCommand(client, commands, retries - 1);
    }
  });
};

const waitForLobbyCommand = (client: SushiGoClient) => {
  waitForResponse(client, data => {
    console.log(data);
    const command = data.split(" ")[0];
    switch (command) {
      case "JOIN":
        break;
      case "NEW":
        break;
      default:
        send(client, ReturnCode.INVALID_COMMAND, "Use 'JOIN <game id>' or 'NEW'");
        waitForLobbyCommand(client);
    }
  });
};
