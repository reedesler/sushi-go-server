import * as net from "net";

const client = new net.Socket();
client.connect(8000, "localhost", () => {
  console.log("Client connected");
});

client.on("data", data => {
  console.log("Server said: " + data);
  client.write("wowzers");
});

client.on("error", error => {
  console.log("Error: " + error);
});
