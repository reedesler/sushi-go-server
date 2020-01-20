import * as net from "net";
import { ReturnCode } from "../src/ApiTypes";
import { Message } from "../src/SushiGoClient";

export interface TestClient {
  socket: net.Socket;
}

export const runTest = (port: number, test: (client: TestClient) => Promise<unknown>) => {
  const client = createTestClient(port);
  return test(client)
    .catch(e => {
      throw e;
    })
    .finally(() => endTest(client));
};

export const createTestClient = (port: number): TestClient => ({
  socket: net.createConnection(port),
});

export const wait = (client: TestClient) =>
  new Promise<string>(resolve => client.socket.once("data", buffer => resolve(buffer + "")));

export const waitFor = (client: TestClient, data: string) =>
  wait(client).then(string => expect(string).toBe(data + "\n"));

export const waitForCode = (client: TestClient, code: ReturnCode) =>
  wait(client).then(string => expect(string.slice(0, 3)).toBe(code));

const checkJson = (message: Message, data: string) => {
  expect(data.slice(0, 3)).toBe(message.code);
  const json = JSON.parse(data.substr(4));
  expect(json).toEqual(message.data);
};

export const waitForJson = (client: TestClient, data: Message) =>
  wait(client).then(string => checkJson(data, string));

export const waitForMultipleJson = (client: TestClient, data: Message[]) =>
  wait(client).then(string => {
    const responses = string.split("\n").slice(0, -1);
    expect(data).toHaveLength(responses.length);
    responses.forEach((s, index) => {
      checkJson(data[index], s);
    });
  });

export const send = (client: TestClient, data: string) => client.socket.write(data);

export const endTest = (client: TestClient) => new Promise(resolve => client.socket.end(resolve));

export const login = (client: TestClient) =>
  waitForCode(client, ReturnCode.GIVE_NAME).then(() => {
    send(client, "HELO TestClient 0.1");
    return waitForCode(client, ReturnCode.LOBBY_INFO);
  });
