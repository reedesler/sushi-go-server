import * as net from "net";
import { createLobby, enterLobby, GameLobby } from "./GameLobby";
import {
  Command,
  commandToString,
  createClient,
  ReturnCode,
  send,
  SushiGoClient,
  waitForCommand,
} from "./SushiGoClient";

interface SushiGoServer {
  socket: net.Server;
  lobby: GameLobby;
}

export const createServer = (): SushiGoServer => {
  const lobby = createLobby();
  const server = net.createServer(socket => {
    const client = createClient(socket);
    welcomeClient(client, lobby);
  });

  return {
    socket: server,
    lobby,
  };
};

export const start = (server: SushiGoServer, port: number) => {
  return server.socket.listen(port, "0.0.0.0", () => {
    console.log("Server started on port " + port);
  });
};

const welcomeCommands: Command<GameLobby>[] = [
  {
    action: "HELO",
    isJSON: false,
    arguments: ["name", "version"],
    handle: (client, args, retry, lobby) => {
      const newClient = { ...client, name: args[0], version: args[1] };
      enterLobby(lobby, newClient);
    },
  },
];

const welcomeClient = (client: SushiGoClient, lobby: GameLobby) => {
  send(
    client,
    ReturnCode.GIVE_NAME,
    "Welcome to the Sushi Go server, enter your bot's name using the command " +
      commandToString(welcomeCommands[0]),
  );
  waitForCommand(client, welcomeCommands, lobby);
};
