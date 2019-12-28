import * as net from "net";

const server = net.createServer(client => {
  console.log("Client connected: " + client.remoteAddress + ":" + client.remotePort);

  client.on("close", () => {
    console.log("Client " + client.remoteAddress + ":" + client.remotePort + " disconnected");
  });
});

const PORT = 8000;

server.listen(PORT, "0.0.0.0", () => {
  console.log("Server started on port " + PORT);
});
