import * as net from "net";
import { LobbyInfo, ReturnCode } from "../src/ApiTypes";
import { Message } from "../src/SushiGoClient";

export interface TestClient {
  socket: net.Socket;
  name: string;
  response: jest.Mock<void, [string]>;
}

export const runTest = (port: number, test: (client: TestClient) => Promise<unknown>) => {
  const client = createTestClient(port);
  return test(client)
    .catch(e => {
      throw e;
    })
    .finally(() => endTest(client));
};

export const createTestClient = (port: number, name = "TestClient"): TestClient => {
  const client = {
    socket: net.createConnection(port),
    name,
    response: jest.fn(),
  };
  client.socket.on("data", buffer => client.response(buffer + ""));
  return client;
};

export const wait = (client: TestClient) =>
  new Promise<string>(resolve => client.socket.once("data", buffer => resolve(buffer + "")));

const waitForMultiple = (client: TestClient) =>
  wait(client).then(string => string.split("\n").slice(0, -1));

export const waitFor = (client: TestClient, data: string) =>
  wait(client).then(string => expect(string).toBe(data + "\n"));

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

export const waitForMultipleJson = (client: TestClient, data: Message[]) =>
  waitForMultiple(client).then(responses => {
    expect(data).toHaveLength(responses.length);
    responses.forEach((s, index) => {
      checkJson(data[index], s);
    });
  });

const getNextJson = <T extends unknown[]>(client: TestClient, codes: ReturnCode[]) =>
  waitForMultiple(client).then(responses => {
    expect(codes).toHaveLength(responses.length);
    return responses.map((response, index) => {
      checkCode(response, codes[index]);
      return getJson(response);
    }) as T;
  });

export const send = (client: TestClient, data: string) => client.socket.write(data);

export const endTest = (client: TestClient) => new Promise(resolve => client.socket.end(resolve));

export const login = (client: TestClient) => {
  const alreadyJoined = client.response.mock.calls.length === 1;
  const p = alreadyJoined ? Promise.resolve() : waitForCode(client, ReturnCode.GIVE_NAME);
  return p.then(() => {
    send(client, `HELO ${client.name} 0.1`);
    return waitForCode(client, ReturnCode.LOBBY_INFO);
  });
};

export const createGame = (client: TestClient) =>
  login(client).then(() => {
    send(client, 'NEW {"name": "New Test Game"}');
    return getNextJson<[number, LobbyInfo]>(client, [
      ReturnCode.GAME_CREATED,
      ReturnCode.LOBBY_INFO,
    ]).then(data => {
      return data[0];
    });
  });

export const lastResponse = (client: TestClient) => {
  const calls = client.response.mock.calls;
  return calls[calls.length - 1][0];
};
