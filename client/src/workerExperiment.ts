import { decodeSnapshot, encodeSnapshot } from "../../shared/src/codec/binarySnapshot.ts";
import { ZERO_SEQ } from "../../shared/src/protocol/ids.ts";
import { World } from "../../shared/src/sim/world.ts";

export async function compareWorker() {
  const world = new World({ seed: 127 });
  const players = Array.from({ length: 9 }, (_, i) => "worker-pilot-" + i);
  for (const id of players) world.addPlayer(id);
  for (let i = 0; i < 90; i++) {
    world.step(new Map(players.map(id => [id, { turn: 1, thrust: true, fire: true, homing: false }])));
  }
  const packet = encodeSnapshot({
    type: "snapshot", tick: world.tick, sentAt: 0, lastProcessedSeq: ZERO_SEQ, state: world.toSnapshot(),
  });
  const worker = new Worker(new URL("./snapshot.worker.ts", import.meta.url), { type: "module" });
  let postMs = 0;
  function send(bytes: ArrayBuffer): Promise<void> {
    return new Promise((resolve, reject) => {
      worker.onmessage = (event: MessageEvent<{ error?: string }>) => {
        if (event.data.error) reject(new Error(event.data.error));
        else resolve();
      };
      worker.onerror = event => reject(new Error(event.message));
      const start = performance.now();
      worker.postMessage(bytes, [bytes]);
      postMs += performance.now() - start;
    });
  }

  try {
    for (let i = 0; i < 30; i++) {
      decodeSnapshot(packet);
      await send(packet.slice(0));
    }
    postMs = 0;
    const count = 240;
    let inlineMs = 0;
    let workerMs = 0;
    for (let i = 0; i < count; i++) {
      const inlineStart = performance.now();
      decodeSnapshot(packet);
      inlineMs += performance.now() - inlineStart;
      const bytes = packet.slice(0);
      const workerStart = performance.now();
      await send(bytes);
      workerMs += performance.now() - workerStart;
    }
    return { count, packetBytes: packet.byteLength, inlineMs, workerMs, postMs };
  } finally {
    worker.terminate();
  }
}
