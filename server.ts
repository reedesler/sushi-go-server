import { createServer, start } from "./src/SushiGoServer";

const PORT = 8000;

const server = createServer();
start(server, PORT);
