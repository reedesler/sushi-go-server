import * as net from "net";
import { ReturnCode } from "./ApiTypes";

export interface SushiGoClient {
  socket: net.Socket;
  name: string;
  version: string;
}

interface End {
  message: string;
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
    name: "",
    version: "",
  };
};

const getSocketName = (socket: net.Socket) => socket.remoteAddress + ":" + socket.remotePort;
export const getName = (client: SushiGoClient) => getSocketName(client.socket);

const getMessage = (code: ReturnCode, data?: any) =>
  code + (data ? " " + JSON.stringify(data) : "") + "\n";

export const send = <T = any>(client: SushiGoClient, code: ReturnCode, data?: T) => {
  const message = getMessage(code, data);
  console.log("->" + getName(client) + " - " + message);
  client.socket.write(message);
};

export const waitForResponse = (client: SushiGoClient) =>
  new Promise<string>(resolve => client.socket.once("data", data => resolve("" + data))); // TODO: clear existing handler if new one added

export const destroy = (client: SushiGoClient, code: ReturnCode, data?: any): Promise<End> => {
  const message = getMessage(code, data);
  client.socket.write(message);
  client.socket.destroy();
  return Promise.resolve({ message: "Destroying " + getName(client) + " - " + message });
};

export type Command<Context> = StringCommand<Context> | JsonCommand<Context>;

interface StringCommand<Context> {
  action: string;
  arguments: string[];
  isJSON: false;
  handle: (
    client: SushiGoClient,
    args: string[],
    retry: (message: any, code?: ReturnCode) => Promise<End>,
    context: Context,
  ) => Promise<End>;
}

interface JsonCommand<Context> {
  action: string;
  arguments: [string];
  isJSON: true;
  handle: (
    client: SushiGoClient,
    data: unknown,
    retry: (message: any, code?: ReturnCode) => Promise<End>,
    context: Context,
  ) => Promise<End>;
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
  return waitForCommand(client, commands, context, retries - 1);
};

export const waitForCommand = <Context>(
  client: SushiGoClient,
  commands: Command<Context>[],
  context: Context,
  retries = 5,
): Promise<End> => {
  if (retries === 0) {
    return destroy(client, ReturnCode.TOO_MANY_RETRIES, "Too many retries");
  }
  return waitForResponse(client).then(data => {
    const args = data.replace(/\n$/, "").split(" ");
    const command = commands.find(c => c.action === args[0].toUpperCase());
    if (!command) {
      return retryCommand(
        client,
        commands,
        context,
        retries,
        commands.map(c => commandToString(c)),
        ReturnCode.COMMAND_NOT_FOUND,
      );
    } else {
      const retry = (retryMessage: any, code?: ReturnCode) =>
        retryCommand(client, commands, context, retries, retryMessage, code);
      if (command.isJSON) {
        const jsonString = data.replace(new RegExp("^" + command.action + " ", "i"), "");
        try {
          const jsonData = JSON.parse(jsonString);
          return command.handle(client, jsonData, retry, context);
        } catch (e) {
          return retryCommand(
            client,
            commands,
            context,
            retries,
            "Invalid JSON: " + jsonString,
            ReturnCode.INVALID_JSON,
          );
        }
      } else {
        if (args.length !== command.arguments.length + 1) {
          return retryCommand(
            client,
            commands,
            context,
            retries,
            "Invalid arguments, use " + commandToString(command),
            ReturnCode.INVALID_COMMAND,
          );
        } else {
          return command.handle(client, args.slice(1), retry, context);
        }
      }
    }
  });
};

export const commandToString = (c: Command<any>) =>
  c.action + (c.arguments.length > 0 ? " " + c.arguments.map(a => "<" + a + ">").join(" ") : "");
