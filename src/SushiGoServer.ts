import * as net from "net";
import { createLobby, enterLobby, GameLobby } from "./lobby/GameLobby";
import { ReturnCode } from "./ApiTypes";
import {
  ClientState,
  ClientStateAction,
  commandToString,
  createClient,
  destroy,
  handleInput,
  send,
  SushiGoClient,
} from "./NewSushiGoClient";

const LOG = process.env.NODE_ENV !== "test";

export interface SushiGoServer {
  socket: net.Server;
  lobby: GameLobby;
  clients: Map<string, SushiGoClient>;
}

export const createServer = (): SushiGoServer => {
  const lobby = createLobby();
  const server = {
    lobby,
    clients: new Map<string, SushiGoClient>(),
  };

  const socket = net.createServer(socket => {
    const client = createClient(socket);

    server.clients.set(client.id, client);

    client.socket.on("close", () => {
      server.clients.delete(client.id);
      const actions = client.onClose();
      runActions(server, actions);
    });

    client.readline.on("line", line => {
      const actions = handleInput(client, line);
      runActions(server, actions);
    });

    initClient(server, client);
  });

  return { ...server, socket };
};

export const start = (server: SushiGoServer, port: number, local = false, onStart?: () => void) => {
  return server.socket.listen(port, local ? "localhost" : "0.0.0.0", () => {
    if (LOG) {
      console.log("Server started on port " + port);
    }
    onStart?.();
  });
};

const initClient = (server: Pick<SushiGoServer, "lobby">, client: SushiGoClient) => {
  const commands = welcomeCommands(client, server.lobby);
  send(client, {
    code: ReturnCode.GIVE_NAME,
    data:
      "Welcome to the Sushi Go server, enter your bot's name using the command " +
      commandToString(commands[0]),
  });
  client.state = commands;
};

const MAX_RETRIES = 10;

const runActions = (server: Pick<SushiGoServer, "clients">, actions: ClientStateAction) => {
  for (const [clientId, action] of Object.entries(actions)) {
    const actionClient = server.clients.get(clientId);
    if (!actionClient) {
      if (LOG) {
        console.log("Action client doesn't exist: " + clientId);
      }
      continue;
    }

    if (action.messages) {
      for (const message of action.messages) {
        send(actionClient, message);
      }
    }

    actionClient.retries = action.retry ? actionClient.retries + 1 : 0;
    if (actionClient.retries >= MAX_RETRIES) {
      return destroy(actionClient, { code: ReturnCode.TOO_MANY_RETRIES, data: "Too many retries" });
    }

    if (action.newState) {
      actionClient.state = action.newState;
    }
  }
};

const welcomeCommands = (client: SushiGoClient, lobby: GameLobby): ClientState => [
  {
    action: "HELO",
    isJSON: false,
    arguments: ["name", "version"],
    handle: args => {
      const newClient = { ...client, name: args[0], version: args[1] };
      return enterLobby(lobby, newClient);
    },
  },
];

export const endServer = (server: SushiGoServer, onEnd?: () => void) => {
  server.socket.close(onEnd);
};
