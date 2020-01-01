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

export type Data = string | object | number;

interface Message<T extends Data = Data> {
  code: ReturnCode;
  data: T;
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

const getMessageString = (m: Message) => m.code + " " + JSON.stringify(m.data) + "\n";

export const send = <T extends Data>(client: SushiGoClient, message: Message<T>) => {
  const messageString = getMessageString(message);
  console.log("->" + getName(client) + " - " + messageString);
  client.socket.write(messageString);
};

const interceptors = new Map<SushiGoClient, (commands: Command[], context: any) => void>();

export const waitForResponse = (client: SushiGoClient) => {
  let dataHandler: (data: Buffer) => void;
  const p = new Promise<string>(resolve => {
    dataHandler = (data: Buffer) => resolve("" + data);
    client.socket.once("data", dataHandler);
  });
  const interceptorPromise = new Promise<{ commands: Command[]; context: any }>(resolve => {
    const interceptor = (commands: Command[], context: any) => {
      client.socket.removeListener("data", dataHandler);
      interceptors.delete(client);
      resolve({ commands, context });
    };
    interceptors.set(client, interceptor);
  });
  return Promise.race([p, interceptorPromise]);
};

export const interceptWithCommands = <Context>(
  client: SushiGoClient,
  commands: Command<Context>[],
  context: Context,
) => {
  const interceptor = interceptors.get(client);
  if (interceptor) {
    interceptor(commands, context);
  }
};

export const destroy = (client: SushiGoClient, message: Message): Promise<End> => {
  const messageString = getMessageString(message);
  client.socket.write(messageString);
  client.socket.destroy();
  return Promise.resolve({ message: "Destroying " + getName(client) + " - " + messageString });
};

export type Command<Context = any> = StringCommand<Context> | JsonCommand<Context>;

interface StringCommand<Context> {
  action: string;
  arguments: string[];
  isJSON: false;
  handle: (
    client: SushiGoClient,
    args: string[],
    retry: (message: { data: Data; code?: ReturnCode }) => Promise<End>,
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
    retry: (message: { data: Data; code?: ReturnCode }) => Promise<End>,
    context: Context,
  ) => Promise<End>;
}

const retryCommand = <Context>(
  client: SushiGoClient,
  commands: Command<Context>[],
  context: Context,
  retries: number,
  message: { data: Data; code?: ReturnCode },
) => {
  send(client, { code: ReturnCode.INVALID_COMMAND, ...message });
  return waitForCommand(client, commands, context, retries - 1);
};

const MAX_RETRIES = 10;

export const waitForCommand = <Context>(
  client: SushiGoClient,
  commands: Command<Context>[],
  context: Context,
  retries = MAX_RETRIES,
): Promise<End> => {
  if (retries === 0) {
    return destroy(client, { code: ReturnCode.TOO_MANY_RETRIES, data: "Too many retries" });
  }
  return waitForResponse(client).then(data => {
    if (typeof data === "object")
      return waitForCommand(client, data.commands, data.context, MAX_RETRIES);
    const args = data.replace(/\n$/, "").split(" ");
    const command = commands.find(c => c.action === args[0].toUpperCase());
    if (!command) {
      return retryCommand(client, commands, context, retries, {
        code: ReturnCode.COMMAND_NOT_FOUND,
        data: commands.map(c => commandToString(c)),
      });
    } else {
      const retry = (message: { data: Data; code?: ReturnCode }) =>
        retryCommand(client, commands, context, retries, message);
      if (command.isJSON) {
        const jsonString = data.replace(new RegExp("^" + command.action + " ", "i"), "");
        try {
          const jsonData = JSON.parse(jsonString);
          return command.handle(client, jsonData, retry, context);
        } catch (e) {
          return retryCommand(client, commands, context, retries, {
            code: ReturnCode.INVALID_JSON,
            data: "Invalid JSON: " + jsonString,
          });
        }
      } else {
        if (args.length !== command.arguments.length + 1) {
          return retryCommand(client, commands, context, retries, {
            data: "Invalid arguments, use " + commandToString(command),
          });
        } else {
          return command.handle(client, args.slice(1), retry, context);
        }
      }
    }
  });
};

export const commandToString = (c: Command<any>) =>
  c.action + (c.arguments.length > 0 ? " " + c.arguments.map(a => "<" + a + ">").join(" ") : "");
