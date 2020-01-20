import * as net from "net";
import { ReturnCode } from "../src/ApiTypes";
import { Message } from "../src/SushiGoClient";
import * as rl from "readline";

export interface TestClient {
  name: string;
  response: jest.Mock<void, [string]>;
  clientSocket: net.Socket;
  iterator: AsyncIterableIterator<string>;
}

export const runTest = (port: number, test: (client: TestClient) => Promise<unknown>) => {
  const client = createTestClient(port);
  return test(client)
    .catch(e => {
      throw e;
    })
    .finally(() => endClient(client));
};

export const createTestClient = (port: number, name = "TestClient"): TestClient => {
  const socket = net.createConnection(port);
  const readline = rl.createInterface(socket, socket);
  const client: TestClient = {
    clientSocket: socket,
    name,
    response: jest.fn(),
    iterator: readline[Symbol.asyncIterator](),
  };
  readline.on("line", buffer => client.response(buffer));
  return client;
};

export const wait = (client: TestClient) =>
  client.iterator.next().then(it => (it.done ? "ITERATOR DONE" : it.value));

export const waitFor = (client: TestClient, data: string) =>
  wait(client).then(string => expect(string).toBe(data));

const checkCode = (response: string, code: ReturnCode) => expect(response.slice(0, 3)).toBe(code);

export const waitForCode = (client: TestClient, code: ReturnCode) =>
  wait(client).then(string => checkCode(string, code));

const getJson = (response: string) => JSON.parse(response.substr(4));

export const checkJson = (message: Message, data: string) => {
  expect(data.slice(0, 3)).toBe(message.code);
  const json = getJson(data);
  expect(json).toEqual(message.data);
};

export const waitForJson = (client: TestClient, data: Message) =>
  wait(client).then(string => checkJson(data, string));

const getNextJson = <T>(client: TestClient, code: ReturnCode) =>
  wait(client).then(response => {
    checkCode(response, code);
    return getJson(response) as T;
  });

export const send = (client: TestClient, data: string) => client.clientSocket.write(data);

export const endClient = (client: TestClient) =>
  client.clientSocket.destroyed
    ? Promise.resolve()
    : new Promise(resolve => client.clientSocket.end(resolve));

export const login = (client: TestClient) =>
  waitForCode(client, ReturnCode.GIVE_NAME).then(() => {
    send(client, `HELO ${client.name} 0.1`);
    return waitForCode(client, ReturnCode.LOBBY_INFO);
  });

export const createGame = (client: TestClient) =>
  login(client).then(() => {
    send(client, 'NEW {"name": "New Test Game"}');
    return getNextJson<number>(client, ReturnCode.GAME_CREATED).then(id => {
      return waitForCode(client, ReturnCode.LOBBY_INFO).then(() => id);
    });
  });

export const joinGame = (client: TestClient, id: number) =>
  login(client).then(() => {
    send(client, "JOIN " + id);
    return waitForCode(client, ReturnCode.LOBBY_INFO);
  });
