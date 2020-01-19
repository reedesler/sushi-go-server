import * as net from "net";
import { createLobby, enterLobby, GameLobby } from "./lobby/GameLobby";
import {
  Command,
  commandToString,
  createClient,
  send,
  SushiGoClient,
  waitForCommand,
} from "./SushiGoClient";
import { ReturnCode } from "./ApiTypes";

const LOG = process.env.NODE_ENV !== "test";

export interface SushiGoServer {
  socket: net.Server;
  lobby: GameLobby;
}

export const createServer = (): SushiGoServer => {
  const lobby = createLobby();
  const server = net.createServer(socket => {
    const client = createClient(socket);
    welcomeClient(client, lobby).then(
      ({ message }) => LOG && console.error("CLIENT ENDED: " + message),
    );
  });

  return {
    socket: server,
    lobby,
  };
};

export const start = (server: SushiGoServer, port: number, local = false, onStart?: () => void) => {
  return server.socket.listen(port, local ? "localhost" : "0.0.0.0", () => {
    if (LOG) {
      console.log("Server started on port " + port);
    }
    onStart?.();
  });
};

const welcomeCommands: Command<GameLobby>[] = [
  {
    action: "HELO",
    isJSON: false,
    arguments: ["name", "version"],
    handle: (client, args, retry, lobby) => {
      const newClient = { ...client, name: args[0], version: args[1] };
      return enterLobby(lobby, newClient);
    },
  },
];

const welcomeClient = (client: SushiGoClient, lobby: GameLobby) => {
  send(client, {
    code: ReturnCode.GIVE_NAME,
    data:
      "Welcome to the Sushi Go server, enter your bot's name using the command " +
      commandToString(welcomeCommands[0]),
  });
  return waitForCommand(client, welcomeCommands, lobby);
};

export const endServer = (server: SushiGoServer, onEnd?: () => void) => {
  server.socket.close(onEnd);
};
