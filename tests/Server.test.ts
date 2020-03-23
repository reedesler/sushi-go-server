import { createServer, endServer, start, SushiGoServer } from "../src/SushiGoServer";
import { login, runTest, send, waitFor, waitForCode, waitForJson } from "./TestClient";
import { ReturnCode } from "../src/ApiTypes";

let server: SushiGoServer;

const PORT = 9000;

beforeAll(done => {
  server = createServer();
  start(server, PORT, true, done);
});

afterAll(done => endServer(server, done));

test("Server sends welcome message", () =>
  runTest(PORT, client =>
    waitFor(
      client,
      '100 "Welcome to the Sushi Go server, enter your bot\'s name using the command HELO <name> <version>"',
    ),
  ));

test("Commands are case insensitive", () =>
  runTest(PORT, client =>
    waitForCode(client, ReturnCode.GIVE_NAME).then(() => {
      send(client, "hElO TestClient 4.7");
      return waitForCode(client, ReturnCode.JOINED_SERVER);
    }),
  ));

test("Shows error with too few arguments", () =>
  runTest(PORT, client =>
    waitForCode(client, ReturnCode.GIVE_NAME).then(() => {
      send(client, "HELO TestClient");
      return waitFor(client, '400 "Invalid arguments, use HELO <name> <version>"');
    }),
  ));

test("Shows error with too many arguments", () =>
  runTest(PORT, client =>
    waitForCode(client, ReturnCode.GIVE_NAME).then(() => {
      send(client, "HELO TestClient 3.5 extra");
      return waitFor(client, '400 "Invalid arguments, use HELO <name> <version>"');
    }),
  ));

test("Disconnects client after too many retries", () =>
  runTest(PORT, client => {
    let p = waitForCode(client, ReturnCode.GIVE_NAME);
    for (let i = 0; i < 9; i++) {
      p = p.then(() => {
        send(client, "a");
        return waitForCode(client, ReturnCode.COMMAND_NOT_FOUND);
      });
    }
    return p
      .then(() => {
        send(client, "a");
        return waitForJson(client, {
          code: ReturnCode.COMMAND_NOT_FOUND,
          data: ["HELO <name> <version>"],
        });
      })
      .then(() =>
        waitForJson(client, { code: ReturnCode.TOO_MANY_RETRIES, data: "Too many retries" }),
      );
  }));

test("Displays welcome commands", () =>
  runTest(PORT, client =>
    waitForCode(client, ReturnCode.GIVE_NAME).then(() => {
      send(client, "a");
      return waitFor(client, '404 ["HELO <name> <version>"]');
    }),
  ));

test("Can log in", () => runTest(PORT, client => login(client)));
