import * as net from "net";

export enum ReturnCode {
  OK = "200",
  WAITING = "201",
  INVALID_COMMAND = "400",
  TOO_MANY_RETRIES = "499",
}

export interface SushiGoClient {
  socket: net.Socket;
}

export const createClient = (socket: net.Socket): SushiGoClient => {
  const socketName = getSocketName(socket);
  socket.setEncoding("utf8");

  console.log("Client connected: " + socketName);

  socket.on("close", () => {
    console.log("Client " + socketName + " disconnected");
  });

  socket.on("data", data => console.log(socketName + " - " + data));

  socket.on("error", error => console.log("Client " + socketName + " " + error));

  return {
    socket,
  };
};

const getSocketName = (socket: net.Socket) => socket.remoteAddress + ":" + socket.remotePort;
export const getName = (client: SushiGoClient) => getSocketName(client.socket);

const getMessage = (code: ReturnCode, data?: any) =>
  code + (data ? " " + JSON.stringify(data) : "") + "\n";

export const send = (client: SushiGoClient, code: ReturnCode, data?: any) => {
  const message = getMessage(code, data);
  console.log("->" + getName(client) + " - " + message);
  client.socket.write(message);
};

export const waitForResponse = (client: SushiGoClient, handle: (data: string) => void) =>
  client.socket.once("data", handle);

export const destroy = (client: SushiGoClient, code: ReturnCode, data?: any) => {
  const message = getMessage(code, data);
  console.log("Destroying client " + getName(client) + " - " + message);
  client.socket.write(message);
  client.socket.destroy();
};
