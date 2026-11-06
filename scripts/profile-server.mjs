import { Session } from "node:inspector/promises";
import { PerformanceObserver, constants } from "node:perf_hooks";
import { setTimeout as delay } from "node:timers/promises";
import { mkdir, writeFile } from "node:fs/promises";
import { Match } from "../server/src/match.ts";
import { Room } from "../server/src/rooms.ts";
import { encodeSnapshot } from "../shared/src/codec/binarySnapshot.ts";

const label = process.argv[2] ?? "after";
const seconds = Number(process.env.SERVER_PROFILE_SECONDS ?? 60);
const room = new Room("profile", "Profile");
room.join({ id: "human", name: "Human" });
const match = new Match(room, (_socket, message) => {
  if (message.type === "snapshot") encodeSnapshot(message);
  return true;
}, { seed: 427 });
match.addPlayer("human");
match.setBots(8);
match.start();
const input = setInterval(() => {
  match.enqueue("human", {
    type: "input", version: 1, seq: match.world.tick + 1, tick: match.world.tick,
    turn: 0, thrust: true, fire: true, homing: false,
  });
}, 1000 / 30);
const gc = [];
const observer = new PerformanceObserver(list => gc.push(...list.getEntries()));
const session = new Session();
session.connect();
try {
  await delay(2500);
  observer.observe({ entryTypes: ["gc"] });
  await session.post("Profiler.enable");
  await session.post("Profiler.start");
  await delay(seconds * 1000);
  const { profile } = await session.post("Profiler.stop");
  const self = new Map();
  const nodes = new Map(profile.nodes.map(node => [node.id, node.callFrame.functionName]));
  for (const [index, id] of profile.samples.entries()) {
    const name = nodes.get(id) || "(anonymous)";
    self.set(name, (self.get(name) ?? 0) + (profile.timeDeltas[index] ?? 0) / 1000);
  }
  const stats = match.getStats();
  const report = {
    seconds, bots: stats.bots, tickP99Ms: stats.tickP99Ms, tickMaxMs: stats.tickMaxMs,
    gcCount: gc.length, majorGC: gc.filter(e => e.detail.kind === constants.NODE_PERFORMANCE_GC_MAJOR).length,
    gcTotalMs: gc.reduce((sum, e) => sum + e.duration, 0),
    gcMaxMs: Math.max(0, ...gc.map(e => e.duration)),
    topSelfMs: [...self].filter(([name]) => !["(idle)", "(program)"].includes(name)).sort((a,b) => b[1] - a[1]).slice(0, 5),
  };
  await mkdir("docs/profile", { recursive: true });
  await writeFile("docs/profile/server-" + label + ".json", JSON.stringify(report, null, 2) + String.fromCharCode(10));
  await writeFile("docs/profile/server-" + label + ".cpuprofile", JSON.stringify(profile));
  console.log(report);
} finally {
  clearInterval(input);
  match.stop();
  observer.disconnect();
  session.disconnect();
}
