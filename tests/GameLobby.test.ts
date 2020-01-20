import { createServer, endServer, start, SushiGoServer } from "../src/SushiGoServer";
import {
  createGame,
  createTestClient,
  endClient,
  joinGame,
  login,
  runTest,
  send,
  TestClient,
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

const createdGame = (id: number, joined = false, inQueue = false) => ({
  code: ReturnCode.LOBBY_INFO,
  data: {
    gameList: [
      {
        creator: "CreatorClient",
        id,
        maxPlayers: 5,
        name: "New Test Game",
        players: ["CreatorClient", ...(joined ? ["JoinClient"] : [])],
      },
    ],
    queuedForGame: inQueue ? id : null,
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
    .finally(() => Promise.all([endClient(creatorClient), endClient(joinClient)]));
});

test("Can see new game when it is created", () => {
  const creatorClient = createTestClient(PORT, "CreatorClient");
  const joinClient = createTestClient(PORT, "JoinClient");
  return login(joinClient)
    .then(() => createGame(creatorClient))
    .then(id => waitForJson(joinClient, createdGame(id)))
    .finally(() => Promise.all([endClient(creatorClient), endClient(joinClient)]));
});

test("Can join a game and update the lobby", async () => {
  const creatorClient = createTestClient(PORT, "CreatorClient");
  const joinClient = createTestClient(PORT, "JoinClient");
  const observerClient = createTestClient(PORT, "ObserverClient");

  try {
    await login(observerClient);
    const id = await createGame(creatorClient);
    await waitForCode(observerClient, ReturnCode.LOBBY_INFO);
    await login(joinClient);
    send(joinClient, "JOIN " + id);
    await waitForJson(joinClient, createdGame(id, true, true));
    await waitForJson(creatorClient, createdGame(id, true, true));
    await waitForJson(observerClient, createdGame(id, true));
  } finally {
    await Promise.all([endClient(creatorClient), endClient(joinClient), endClient(observerClient)]);
  }
});

test("Shows error when trying to join a game that doesn't exist", async () => {
  const creatorClient = createTestClient(PORT, "CreatorClient");
  const joinClient = createTestClient(PORT, "JoinClient");

  try {
    const id = await createGame(creatorClient);
    await login(joinClient);
    send(joinClient, "JOIN 500");
    await waitFor(joinClient, '400 "No game with that id"');
  } finally {
    await Promise.all([endClient(creatorClient), endClient(joinClient)]);
  }
});

test("Shows error when trying to join a full game", async () => {
  const creatorClient = createTestClient(PORT, "CreatorClient");
  const joinClient = createTestClient(PORT, "JoinClient");
  const clients: TestClient[] = [];
  for (let i = 0; i < 5; i++) {
    clients.push(createTestClient(PORT, "JoinClient" + i));
  }

  try {
    const id = await createGame(creatorClient);
    for (const c of clients) {
      await login(c);
      send(c, "JOIN " + id);
    }
    await login(joinClient);
    send(joinClient, "JOIN " + id);
    await waitFor(joinClient, '400 "Game is full"');
  } finally {
    await Promise.all(
      [endClient(creatorClient), endClient(joinClient)].concat(clients.map(c => endClient(c))),
    );
  }
});

const setupJoinedGame = async (
  creatorClient: TestClient,
  joinClient: TestClient,
  observerClient?: TestClient,
) => {
  if (observerClient) {
    await login(observerClient);
  }
  const id = await createGame(creatorClient);
  if (observerClient) {
    await waitForCode(observerClient, ReturnCode.LOBBY_INFO);
  }
  await joinGame(joinClient, id);
  if (observerClient) {
    await waitForCode(observerClient, ReturnCode.LOBBY_INFO);
  }
  await waitForCode(creatorClient, ReturnCode.LOBBY_INFO);
  return id;
};

test("Shows commands for in a game queue", async () => {
  const creatorClient = createTestClient(PORT, "CreatorClient");
  const joinClient = createTestClient(PORT, "JoinClient");

  try {
    await setupJoinedGame(creatorClient, joinClient);
    send(joinClient, "a");
    await waitFor(joinClient, '404 ["LEAVE"]');
  } finally {
    await Promise.all([endClient(creatorClient), endClient(joinClient)]);
  }
});

test("Can leave a game and update the lobby", async () => {
  const creatorClient = createTestClient(PORT, "CreatorClient");
  const joinClient = createTestClient(PORT, "JoinClient");
  const observerClient = createTestClient(PORT, "ObserverClient");

  try {
    const id = await setupJoinedGame(creatorClient, joinClient, observerClient);
    send(joinClient, "LEAVE");
    await waitForJson(joinClient, createdGame(id));
    await waitForJson(creatorClient, createdGame(id, false, true));
    await waitForJson(observerClient, createdGame(id));
  } finally {
    await Promise.all([endClient(creatorClient), endClient(joinClient), endClient(observerClient)]);
  }
});

test("Treats disconnecting as leaving a game", async () => {
  const creatorClient = createTestClient(PORT, "CreatorClient");
  const joinClient = createTestClient(PORT, "JoinClient");
  const observerClient = createTestClient(PORT, "ObserverClient");

  try {
    const id = await setupJoinedGame(creatorClient, joinClient, observerClient);
    await endClient(joinClient);
    await waitForJson(creatorClient, createdGame(id, false, true));
    await waitForJson(observerClient, createdGame(id));
  } finally {
    await Promise.all([endClient(creatorClient), endClient(joinClient), endClient(observerClient)]);
  }
});

const emptyLobby = {
  code: ReturnCode.LOBBY_INFO,
  data: {
    gameList: [],
    queuedForGame: null,
  },
};

test("Can delete a game and update the lobby", async () => {
  const creatorClient = createTestClient(PORT, "CreatorClient");
  const joinClient = createTestClient(PORT, "JoinClient");
  const observerClient = createTestClient(PORT, "ObserverClient");

  try {
    await setupJoinedGame(creatorClient, joinClient, observerClient);
    send(creatorClient, "DELETE");
    await waitFor(joinClient, '500 "The game you were in was deleted"');
    await Promise.all([
      waitForJson(joinClient, emptyLobby),
      waitForJson(observerClient, emptyLobby),
      waitForJson(creatorClient, emptyLobby),
    ]);
  } finally {
    await Promise.all([endClient(creatorClient), endClient(joinClient), endClient(observerClient)]);
  }
});

test("Sends everyone in a deleted game back to the lobby state", async () => {
  const creatorClient = createTestClient(PORT, "CreatorClient");
  const joinClient = createTestClient(PORT, "JoinClient");
  const observerClient = createTestClient(PORT, "ObserverClient");

  try {
    await setupJoinedGame(creatorClient, joinClient, observerClient);
    send(creatorClient, "DELETE");
    await waitForCode(joinClient, ReturnCode.GAME_DELETED);
    await Promise.all([
      waitForCode(joinClient, ReturnCode.LOBBY_INFO),
      waitForCode(observerClient, ReturnCode.LOBBY_INFO),
      waitForCode(creatorClient, ReturnCode.LOBBY_INFO),
    ]);
    send(joinClient, "a");
    await waitFor(joinClient, '404 ["JOIN <gameId>","NEW <gameConfig>"]');
    send(creatorClient, "a");
    await waitFor(creatorClient, '404 ["JOIN <gameId>","NEW <gameConfig>"]');
  } finally {
    await Promise.all([endClient(creatorClient), endClient(joinClient), endClient(observerClient)]);
  }
});
