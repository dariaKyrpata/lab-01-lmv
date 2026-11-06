import WebSocket from "ws";
import { once } from "node:events";
import { dirname } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { mkdir, writeFile } from "node:fs/promises";
import { encodeInput } from "../shared/src/codec/binaryInput.ts";
import { startServer } from "./browser.mjs";

const seconds = Number(process.env.LOAD_SECONDS ?? 8);
const results = [];
const staging = process.env.LOAD_BASE_URL;
const report = process.env.LOAD_REPORT ?? "docs/profile/load.json";

for (const clients of [8, 32, 64, 128]) {
  const server = staging ? { base: staging, close: () => {} } : await startServer(3419, { capacity: 128 });
  const sockets = [];
  let timer;
  let bytes = 0;
  try {
    const response = await fetch(server.base + "/api/rooms", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Load test " + clients }),
    });
    if (!response.ok) throw new Error("Room creation failed: " + response.status);
    const room = await response.json();
    await Promise.all(Array.from({ length: clients }, async (_, index) => {
      const socket = new WebSocket(server.base.replace(/^http/, "ws") + "/ws?format=binary", { origin: new URL(server.base).origin });
      sockets.push(socket);
      socket.on("message", data => { bytes += data.length; });
      socket.on("error", () => {});
      await once(socket, "open", { signal: AbortSignal.timeout(10000) });
      const joined = new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("Join timed out for " + index)), 10000);
        function onMessage(data, binary) {
          if (binary || JSON.parse(data.toString()).type !== "joined") return;
          clearTimeout(timeout);
          socket.off("message", onMessage);
          resolve();
        }
        socket.on("message", onMessage);
      });
      socket.send(JSON.stringify({ version: 1, type: "join", room: room.id, name: "Load-" + index }));
      await joined;
    }));
    let seq = 0;
    timer = setInterval(() => {
      seq++;
      for (const [index, socket] of sockets.entries()) {
        if (socket.readyState === WebSocket.OPEN && socket.bufferedAmount < 65536) {
          socket.send(encodeInput({
            version: 1, type: "input", seq, tick: seq, thrust: true,
            turn: [0, 1, -1][(Math.floor(seq / 30) + index) % 3], fire: true, homing: false,
          }));
        }
      }
    }, 1000 / 30);
    await delay(2500);
    const start = await (await fetch(server.base + "/api/stats")).json();
    const bytesAtStart = bytes;
    const startedAt = performance.now();
    await delay(seconds * 1000);
    const end = await (await fetch(server.base + "/api/stats")).json();
    const match = end.matches.find(m => m.room === room.id);
    const active = end.eventLoop.active - start.eventLoop.active;
    const idle = end.eventLoop.idle - start.eventLoop.idle;
    if (!match || match.players !== clients) throw new Error("Client count changed during the test");
    const result = {
      clients, tickP99Ms: +match.tickP99Ms.toFixed(3), tickMaxMs: +match.tickMaxMs.toFixed(3),
      eluPercent: +(100 * active / (active + idle)).toFixed(1),
      rssMiB: +(end.memory.rss / 1048576).toFixed(1),
      downBytesPerSecond: Math.round((bytes - bytesAtStart) / ((performance.now() - startedAt) / 1000)),
    };
    results.push(result);
    console.log(result);
  } finally {
    clearInterval(timer);
    for (const socket of sockets) socket.terminate();
    await server.close();
  }
}

await mkdir(dirname(report), { recursive: true });
await writeFile(report, JSON.stringify({ seconds, results }, null, 2) + String.fromCharCode(10));
