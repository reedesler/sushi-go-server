import * as net from "net";
import * as rl from "readline";
import * as shortid from "shortid";
import { ReturnCode } from "./ApiTypes";
import { sum } from "./util";

const LOG = process.env.NODE_ENV !== "test";

export interface SushiGoClient {
  socket: net.Socket;
  readline: rl.Interface;
  name: string;
  version: string;
  id: string;
  state: ClientState;
  onClose: () => ClientStateAction;
  retries: number;
}

export type Data = string | object | number;

export interface Message<T extends Data = Data> {
  code: ReturnCode;
  data: T;
}

export interface ClientStateAction {
  [clientId: string]: SingleClientStateAction;
}

export type SingleClientStateAction = {
  messages?: Message[];
  newState?: ClientState;
  onClose?: () => ClientStateAction;
  retry?: boolean;
};

interface Argument {
  name: string;
  optional?: boolean;
}

interface StringCommand {
  action: string;
  arguments: Argument[];
  isJSON: false;
  handle: (args: string[]) => ClientStateAction;
}

interface JsonCommand {
  action: string;
  arguments: [Argument];
  isJSON: true;
  handle: (data: unknown) => ClientStateAction;
}

type Command = StringCommand | JsonCommand;

export type ClientState = Command[];

export const createClient = (socket: net.Socket): SushiGoClient => {
  const socketName = getSocketName(socket);
  socket.setEncoding("utf8");
  const readline = rl.createInterface(socket, socket);

  if (LOG) {
    console.log("Client connected: " + socketName);

    socket.on("close", () => console.log("Client " + socketName + " disconnected"));

    socket.on("data", data => console.log(socketName + " - " + data));

    socket.on("error", error => console.log("Client " + socketName + " " + error));
  }

  return {
    socket,
    name: "",
    version: "",
    id: shortid.generate(),
    readline,
    state: [],
    onClose: () => ({}),
    retries: 0,
  };
};

export const getSocketName = (socket: net.Socket) => socket.remoteAddress + ":" + socket.remotePort;
export const getName = (client: SushiGoClient) => getSocketName(client.socket);

export const retry = (client: SushiGoClient, message: Message): ClientStateAction => ({
  [client.id]: { retry: true, messages: [message] },
});

export const setState = (
  client: SushiGoClient,
  state: ClientState,
  message?: Message,
): ClientStateAction => ({
  [client.id]: { messages: message ? [message] : [], newState: state },
});

export const sendMessage = (client: SushiGoClient, message: Message): ClientStateAction => ({
  [client.id]: { messages: [message] },
});

export const handleInput = (client: SushiGoClient, input: string): ClientStateAction => {
  const args = input.replace(/\n$/, "").split(" ");
  const command = client.state.find(c => c.action === args[0].toUpperCase());
  if (!command) {
    return retry(client, {
      code: ReturnCode.COMMAND_NOT_FOUND,
      data: client.state.map(c => commandToString(c)),
    });
  } else {
    if (command.isJSON) {
      const jsonString = input.replace(new RegExp("^" + command.action + " ", "i"), "");
      try {
        const jsonData = JSON.parse(jsonString);
        return command.handle(jsonData);
      } catch (e) {
        return retry(client, {
          code: ReturnCode.INVALID_JSON,
          data: "Invalid JSON: " + jsonString,
        });
      }
    } else {
      const requiredArgumentCount = command.arguments.filter(c => !c.optional).length;
      const totalArgumentCount = command.arguments.length;
      if (args.length - 1 < requiredArgumentCount || args.length - 1 > totalArgumentCount) {
        return retry(client, {
          code: ReturnCode.INVALID_COMMAND,
          data: "Invalid arguments, use " + commandToString(command),
        });
      } else {
        return command.handle(args.slice(1));
      }
    }
  }
};

export const commandToString = (c: Command) =>
  c.action +
  (c.arguments.length > 0
    ? " " + c.arguments.map(a => "<" + a.name + (a.optional ? "?" : "") + ">").join(" ")
    : "");

export const mergeActions = (
  baseAction: ClientStateAction,
  newAction: ClientStateAction,
): ClientStateAction => {
  const baseClientIds = Object.keys(baseAction);
  const newClientIds = Object.keys(newAction);
  const clientIds = new Set([...baseClientIds, ...newClientIds]);
  const finalAction: ClientStateAction = {};
  for (const id of clientIds) {
    const baseSingleAction = baseAction[id];
    const newSingleAction = newAction[id];

    if (baseSingleAction && !newSingleAction) {
      finalAction[id] = baseSingleAction;
    } else if (!baseSingleAction && newSingleAction) {
      finalAction[id] = newSingleAction;
    } else {
      finalAction[id] = mergeSingleAction(baseSingleAction, newSingleAction);
    }
  }

  return finalAction;
};

const mergeSingleAction = (
  baseSingleAction: SingleClientStateAction,
  newSingleAction: SingleClientStateAction,
): SingleClientStateAction => {
  const finalSingleAction = { ...baseSingleAction, ...newSingleAction };
  const baseMessages = baseSingleAction.messages ?? [];
  const newMessages = newSingleAction.messages ?? [];
  finalSingleAction.messages = [...baseMessages, ...newMessages];
  return finalSingleAction;
};
