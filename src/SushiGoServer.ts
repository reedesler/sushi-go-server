import * as net from "net";
import { createLobby, GameLobby, enterLobby } from "./GameLobby";
import { createClient } from "./SushiGoClient";

interface SushiGoServer {
  socket: net.Server;
  lobby: GameLobby;
}

export const createServer = (): SushiGoServer => {
  const lobby = createLobby();
  const server = net.createServer(socket => {
    const client = createClient(socket);
    enterLobby(lobby, client);
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
