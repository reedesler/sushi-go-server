import * as net from "net";
import { ReturnCode } from "../src/ApiTypes";

export interface TestClient {
  socket: net.Socket;
}

export const runTest = (port: number, test: (client: TestClient) => Promise<unknown>) => {
  const client = createTestClient(port);
  return test(client).finally(() => endTest(client));
};

export const createTestClient = (port: number): TestClient => ({
  socket: net.createConnection(port),
});

export const waitFor = (client: TestClient, data: string) =>
  new Promise<string>((resolve, reject) => {
    client.socket.once("data", buffer => {
      const bufferString = buffer + "";
      try {
        expect(bufferString).toBe(data + "\n");
        resolve(bufferString);
      } catch (e) {
        reject(e);
      }
    });
  });

export const waitForCode = (client: TestClient, code: ReturnCode) =>
  new Promise<string>((resolve, reject) => {
    client.socket.once("data", buffer => {
      const bufferString = buffer + "";
      try {
        expect(bufferString.slice(0, 3)).toBe(code);
        resolve(bufferString);
      } catch (e) {
        reject(e);
      }
    });
  });

export const send = (client: TestClient, data: string) => client.socket.write(data);

export const endTest = (client: TestClient) => new Promise(resolve => client.socket.end(resolve));

export const login = (client: TestClient) =>
  waitForCode(client, ReturnCode.GIVE_NAME).then(() => {
    send(client, "HELO TestClient 0.1");
    return waitForCode(client, ReturnCode.LOBBY_INFO);
  });
