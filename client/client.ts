import * as net from "net";

const client = new net.Socket();
client.connect(8000, "127.0.0.1", () => {
  console.log("Client connected");
});
