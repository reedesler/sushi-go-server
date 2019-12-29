import * as net from "net";

export enum ReturnCode {
  GAME_LIST = "200",
  GAME_CREATED = "201",
  INVALID_COMMAND = "400",
  INVALID_JSON = "401",
  COMMAND_NOT_FOUND = "404",
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

export const waitForResponse = (client: SushiGoClient) =>
  new Promise<string>(resolve => client.socket.once("data", data => resolve("" + data)));

export const destroy = (client: SushiGoClient, code: ReturnCode, data?: any) => {
  const message = getMessage(code, data);
  console.log("Destroying client " + getName(client) + " - " + message);
  client.socket.write(message);
  client.socket.destroy();
};

export type Command<Context> = StringCommand<Context> | JsonCommand<Context>;

interface StringCommand<Context> {
  action: string;
  arguments: string[];
  isJSON: false;
  handle: (
    client: SushiGoClient,
    args: string[],
    retry: (message: any, code?: ReturnCode) => void,
    context: Context,
  ) => void;
}

interface JsonCommand<Context> {
  action: string;
  arguments: [string];
  isJSON: true;
  handle: (
    client: SushiGoClient,
    data: unknown,
    retry: (message: any, code?: ReturnCode) => void,
    context: Context,
  ) => void;
}

const retryCommand = <Context>(
  client: SushiGoClient,
  commands: Command<Context>[],
  context: Context,
  retries: number,
  data: any,
  code = ReturnCode.INVALID_COMMAND,
) => {
  send(client, code, data);
  waitForCommand(client, commands, context, retries - 1);
};

export const waitForCommand = <Context>(
  client: SushiGoClient,
  commands: Command<Context>[],
  context: Context,
  retries = 5,
) => {
  if (retries === 0) {
    return destroy(client, ReturnCode.TOO_MANY_RETRIES, "Too many retries");
  }
  waitForResponse(client).then(data => {
    const args = data.replace(/\n$/, "").split(" ");
    const command = commands.find(c => c.action === args[0].toUpperCase());
    if (!command) {
      retryCommand(
        client,
        commands,
        context,
        retries,
        commands.map(
          c =>
            c.action +
            (c.arguments.length > 0 ? " " + c.arguments.map(a => "<" + a + ">").join(" ") : ""),
        ),
        ReturnCode.COMMAND_NOT_FOUND,
      );
    } else {
      if (command.isJSON) {
        const jsonString = data.replace(new RegExp("^" + command.action + " ", "i"), "");
        try {
          const jsonData = JSON.parse(jsonString);
          const retry = (retryMessage: any, code?: ReturnCode) =>
            retryCommand(client, commands, context, retries, retryMessage, code);
          command.handle(client, jsonData, retry, context);
        } catch (e) {
          retryCommand(
            client,
            commands,
            context,
            retries,
            "Invalid JSON: " + jsonString,
            ReturnCode.INVALID_JSON,
          );
        }
      } else {
        // TODO
      }
    }
  });
};
