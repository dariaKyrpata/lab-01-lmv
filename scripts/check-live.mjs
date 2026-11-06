import assert from "node:assert/strict";
import { once } from "node:events";
import WebSocket from "ws";

const base = new URL(process.argv[2]);
assert.equal(base.protocol, "https:");
const response = await fetch(new URL("/api/rooms", base), {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ name: "Release health check" }),
  signal: AbortSignal.timeout(10000),
});
assert.ok(response.ok, "Could not open a room for the WSS check");
const room = await response.json();
const url = new URL("/ws", base);
url.protocol = "wss:";
const ws = new WebSocket(url, { origin: base.origin, handshakeTimeout: 10000 });
ws.on("error", () => {});
try {
  await once(ws, "open", { signal: AbortSignal.timeout(10000) });
  const firstMessage = once(ws, "message", { signal: AbortSignal.timeout(5000) });
  ws.send(JSON.stringify({ version: 1, type: "join", room: room.id, name: "Release check" }));
  const [frame] = await firstMessage;
  assert.equal(JSON.parse(frame.toString()).type, "joined");
  await once(ws, "ping", { signal: AbortSignal.timeout(25000) });
  assert.equal(ws.readyState, WebSocket.OPEN);
  console.log("Verified public WSS, room join, and server heartbeat");
} finally {
  ws.close();
}
