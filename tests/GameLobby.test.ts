import { createServer, endServer, start, SushiGoServer } from "../src/SushiGoServer";
import {
  createGame,
  createTestClient,
  endTest,
  login,
  runTest,
  send,
  waitFor,
  waitForCode,
  waitForJson,
} from "./TestClient";
import { ReturnCode } from "../src/ApiTypes";

let server: SushiGoServer;

const PORT = 9001;

beforeAll(done => {
  server = createServer();
  start(server, PORT, true, done);
});

afterAll(done => endServer(server, done));

test("Returns initial game lobby info", () =>
  runTest(PORT, client =>
    waitForCode(client, ReturnCode.GIVE_NAME).then(() => {
      send(client, "HELO TestClient 0.1");
      return waitForJson(client, {
        code: ReturnCode.LOBBY_INFO,
        data: { gameList: [], queuedForGame: null },
      });
    }),
  ));

test("Displays game lobby commands", () =>
  runTest(PORT, client =>
    login(client).then(() => {
      send(client, "a");
      return waitFor(client, '404 ["JOIN <gameId>","NEW <gameConfig>"]');
    }),
  ));

describe("Creating a new game", () => {
  test("Can create a new game", () =>
    runTest(PORT, client =>
      login(client).then(() => {
        send(client, 'NEW {"name": "New Test Game"}');
        return waitForJson(client, { code: ReturnCode.GAME_CREATED, data: 1 }).then(() =>
          waitForJson(client, {
            code: ReturnCode.LOBBY_INFO,
            data: {
              gameList: [
                {
                  creator: "TestClient",
                  id: 1,
                  maxPlayers: 5,
                  name: "New Test Game",
                  players: ["TestClient"],
                },
              ],
              queuedForGame: 1,
            },
          }),
        );
      }),
    ));

  test("Returns an error if JSON is invalid", () =>
    runTest(PORT, client =>
      login(client).then(() => {
        send(client, 'NEW {"name": "New');
        return waitFor(client, '401 "Invalid JSON: {\\"name\\": \\"New"');
      }),
    ));

  test("Returns an error if game is not an object", () =>
    runTest(PORT, client =>
      login(client).then(() => {
        send(client, "NEW 3");
        return waitForCode(client, ReturnCode.INVALID_COMMAND);
      }),
    ));

  test("Returns an error if game is missing name", () =>
    runTest(PORT, client =>
      login(client).then(() => {
        send(client, "NEW {}");
        return waitForCode(client, ReturnCode.INVALID_COMMAND);
      }),
    ));

  test("Returns an error if game name is too short", () =>
    runTest(PORT, client =>
      login(client).then(() => {
        send(client, 'NEW {"name": ""}');
        return waitForCode(client, ReturnCode.INVALID_COMMAND);
      }),
    ));

  test("Returns an error if game name is too long", () =>
    runTest(PORT, client =>
      login(client).then(() => {
        send(client, 'NEW {"name": "aaaaaaaaaaaaaaaaaaaaa"}');
        return waitForCode(client, ReturnCode.INVALID_COMMAND);
      }),
    ));
});

test("Shows game creator commands after creating a game", () =>
  runTest(PORT, client =>
    createGame(client).then(() => {
      send(client, "a");
      return waitFor(client, '404 ["DELETE","START"]');
    }),
  ));

test("Can delete game after creating one", () =>
  runTest(PORT, client =>
    createGame(client).then(() => {
      send(client, "DELETE");
      return waitForJson(client, {
        code: ReturnCode.LOBBY_INFO,
        data: { gameList: [], queuedForGame: null },
      });
    }),
  ));

const createdGame = (id: number) => ({
  code: ReturnCode.LOBBY_INFO,
  data: {
    gameList: [
      {
        creator: "CreatorClient",
        id,
        maxPlayers: 5,
        name: "New Test Game",
        players: ["CreatorClient"],
      },
    ],
    queuedForGame: null,
  },
});

test("Can see existing games when logged in", () => {
  const creatorClient = createTestClient(PORT, "CreatorClient");
  const joinClient = createTestClient(PORT, "JoinClient");
  return createGame(creatorClient)
    .then(id =>
      waitForCode(joinClient, ReturnCode.GIVE_NAME).then(() => {
        send(joinClient, `HELO ${joinClient.name} 0.1`);
        return waitForJson(joinClient, createdGame(id));
      }),
    )
    .finally(() => Promise.all([endTest(creatorClient), endTest(joinClient)]));
});

test("Can see new game when it is created", () => {
  const creatorClient = createTestClient(PORT, "CreatorClient");
  const joinClient = createTestClient(PORT, "JoinClient");
  return login(joinClient)
    .then(() => createGame(creatorClient))
    .then(id => waitForJson(joinClient, createdGame(id)))
    .finally(() => Promise.all([endTest(creatorClient), endTest(joinClient)]));
});
