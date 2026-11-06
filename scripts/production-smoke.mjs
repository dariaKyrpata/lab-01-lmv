import assert from "node:assert/strict";
import { spawn, execFile } from "node:child_process";
import { once } from "node:events";
import { promisify } from "node:util";
import { mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import WebSocket from "ws";

const exec = promisify(execFile);
const container = process.env.CONTAINER_NAME;
const base = process.env.TEST_SERVER_URL ?? "http://127.0.0.1:3451";
const origin = new URL(base).origin;
const expectSha = process.env.EXPECTED_SHA ?? "dev";
const sockets = [];
const logs = await mkdtemp(path.join(tmpdir(), "dogfight-lab08-"));
const useIpc = process.platform === "win32";
let child;
let exited;
let runtimeLogs = "";
const roomName = "isolated healthy match";

function waitMessage(ws, predicate) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => finish(new Error("Timed out waiting for a frame")), 5000);
    function onMessage(buffer, binary) {
      if (binary) return;
      const value = JSON.parse(buffer.toString());
      if (predicate(value)) finish(null, value);
    }
    function finish(error, value) {
      clearTimeout(timer);
      ws.off("message", onMessage);
      if (error) reject(error);
      else resolve(value);
    }
    ws.on("message", onMessage);
  });
}

async function connect(originValue = origin) {
  const ws = new WebSocket(base.replace(/^http/, "ws") + "/ws", { origin: originValue });
  sockets.push(ws);
  ws.on("error", () => {});
  await once(ws, "open", { signal: AbortSignal.timeout(5000) });
  return ws;
}

async function rejectUpgrade(originValue, status) {
  const ws = new WebSocket(base.replace(/^http/, "ws") + "/ws", originValue === undefined ? {} : { origin: originValue });
  ws.on("error", () => {});
  const [, response] = await once(ws, "unexpected-response", { signal: AbortSignal.timeout(5000) });
  assert.equal(response.statusCode, status);
  response.resume();
  ws.terminate();
}

async function join(room, name, colorId) {
  const ws = await connect();
  const joined = waitMessage(ws, message => message.type === "joined");
  ws.send(JSON.stringify({ version: 1, type: "join", room, name, colorId }));
  return { ws, joined: await joined };
}

async function json(route, options) {
  const response = await fetch(base + route, { signal: AbortSignal.timeout(5000), ...options });
  assert.ok(response.ok, route + " returned " + response.status);
  return response.json();
}

async function createRoom(name) {
  return json("/api/rooms", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name }) });
}

async function p99(roomId) {
  const stats = await json("/api/stats");
  const match = stats.matches.find(match => match.room === roomId);
  assert.ok(match);
  return match.tickP99Ms;
}

try {
  if (!container) {
    const command = useIpc
      ? ["--input-type=module", "-e", 'import { shutdown } from "./server/src/index.ts"; process.once("message", () => { process.disconnect(); void shutdown("SIGTERM"); });']
      : ["server/src/index.ts"];
    child = spawn(process.execPath, command, {
      env: { ...process.env, NODE_ENV: "production", HOST: "127.0.0.1", PORT: new URL(base).port,
        ALLOWED_ORIGINS: origin, LOG_DIR: logs, MAX_CONNECTIONS_PER_IP: "4", BUILD_SHA: expectSha },
      stdio: useIpc ? ["ignore", "pipe", "pipe", "ipc"] : ["ignore", "pipe", "pipe"],
    });
    exited = once(child, "exit");
    child.stdout.on("data", bytes => { runtimeLogs += bytes.toString(); });
    child.stderr.on("data", bytes => { runtimeLogs += bytes.toString(); });
  }

  let health;
  for (let attempt = 0; attempt < 60; attempt++) {
    health = await json("/health").catch(() => null);
    if (health) break;
    await delay(100);
  }
  assert.equal(health?.gitSha, expectSha);
  assert.deepEqual(await json("/ready"), { ready: true });
  await rejectUpgrade("https://other-site.invalid", 403);
  await rejectUpgrade(undefined, 403);

  const tooLarge = await connect();
  const oversized = once(tooLarge, "close", { signal: AbortSignal.timeout(5000) });
  tooLarge.send("x".repeat(4097));
  assert.equal((await oversized)[0], 1009);
  const rateRoom = await createRoom("rate limit test");
  const { ws: tooFast } = await join(rateRoom.id, "Rate pilot", "pink");
  const rateLimited = once(tooFast, "close", { signal: AbortSignal.timeout(5000) });
  for (let i = 0; i < 120; i++) tooFast.send(JSON.stringify({ version: 1, type: "net_ping", clientTime: i }));
  assert.equal((await rateLimited)[0], 1008);
  const neverJoined = await connect();
  const timedOut = once(neverJoined, "close", { signal: AbortSignal.timeout(7000) });
  assert.equal((await timedOut)[0], 1008);

  const healthyRoom = await createRoom(roomName);
  const floodRoom = await createRoom("isolated flood match");
  const { ws: pilot } = await join(healthyRoom.id, "Healthy pilot", "pink");
  const { ws: departing } = await join(healthyRoom.id, "Departing pilot", "blue");
  const departed = waitMessage(pilot, message => message.type === "roster" && message.players.length === 1);
  departing.terminate();
  await departed;

  const { ws: attacker } = await join(floodRoom.id, "Flood pilot", "pink");
  const spareA = await connect();
  const spareB = await connect();
  await rejectUpgrade(origin, 429);
  const spareClosed = Promise.all([once(spareA, "close"), once(spareB, "close")]);
  spareA.terminate();
  spareB.terminate();
  await spareClosed;
  await delay(1250);
  const before = await p99(healthyRoom.id);
  const closedAttack = once(attacker, "close", { signal: AbortSignal.timeout(5000) });
  const attackAt = performance.now();
  for (let i = 0; i < 1000; i++) attacker.send("{invalid-frame");
  const floodQueuedMs = performance.now() - attackAt;
  const [attackCode] = await closedAttack;
  assert.equal(attackCode, 1008);
  const first = await waitMessage(pilot, message => message.type === "snapshot");
  const next = waitMessage(pilot, message => message.type === "snapshot" && message.lastProcessedSeq === 1);
  pilot.send(JSON.stringify({ version: 1, type: "input", tick: first.tick, seq: 1, thrust: true, turn: 0, fire: true, homing: false }));
  await next;
  await delay(1250);
  const after = await p99(healthyRoom.id);
  assert.ok(after < 33, "the healthy room exceeded its tick budget");
  const metrics = await json("/metrics");
  assert.ok(metrics.rejections.origin >= 2);
  assert.ok(metrics.rejections.ip_limit >= 1);
  assert.ok(metrics.rejections.invalid_message >= 1);
  assert.ok(metrics.rejections.rate_limit >= 1);
  assert.ok(metrics.rejections.join_timeout >= 1);
  assert.ok(metrics.totals.messagesIn > 0 && metrics.totals.bytesOut > 0);

  const notice = waitMessage(pilot, message => message.type === "shutdown");
  const closedPilot = once(pilot, "close", { signal: AbortSignal.timeout(9500) });
  const stopping = performance.now();
  let stop;
  if (container) {
    stop = exec("docker", ["stop", "--time", "10", container], { timeout: 12000 });
  } else {
    if (useIpc) child.send("shutdown");
    else child.kill("SIGTERM");
    stop = exited;
  }
  const [[closeCode], , exit] = await Promise.all([closedPilot, notice, stop]);
  const elapsedMs = performance.now() - stopping;
  assert.equal(closeCode, 1001);
  assert.ok(elapsedMs < 10000, "shutdown took 10 seconds or longer");
  if (container) {
    const state = await exec("docker", ["inspect", "--format", "{{.State.ExitCode}}", container]);
    assert.equal(state.stdout.trim(), "0");
    const dockerLogs = await exec("docker", ["logs", container]);
    runtimeLogs = dockerLogs.stdout;
    await exec("docker", ["cp", container + ":/app/logs/.", logs]);
  } else {
    assert.equal(exit[0], 0);
  }
  const jsonLogs = runtimeLogs.trim().split(/\r?\n/).filter(line => line.startsWith("{")).map(line => JSON.parse(line));
  assert.ok(jsonLogs.some(entry => entry.roomId === healthyRoom.id && entry.playerId && entry.msg === "player left"));
  assert.ok(jsonLogs.some(entry => entry.msg === "server stopped"));
  const matchLog = (await readdir(logs)).find(name => name.startsWith(healthyRoom.id));
  assert.ok(matchLog, "expected a flushed replay log");
  assert.ok((await readFile(path.join(logs, matchLog), "utf8")).includes('"type":"leave"'));

  const result = {
    gitSha: health.gitSha, runtime: container ? "Docker SIGTERM" : useIpc ? "Windows drain handler via IPC" : "Node SIGTERM",
    shutdownMs: +elapsedMs.toFixed(2), closeCode, floodQueuedMs: +floodQueuedMs.toFixed(2),
    healthyTickP99BeforeMs: +before.toFixed(3), healthyTickP99AfterMs: +after.toFixed(3),
    rejections: metrics.rejections,
  };
  if (process.env.SMOKE_REPORT) {
    await mkdir(path.dirname(process.env.SMOKE_REPORT), { recursive: true });
    await writeFile(process.env.SMOKE_REPORT, JSON.stringify(result, null, 2) + "\n");
  }
  console.log(result);
} finally {
  for (const socket of sockets) socket.terminate();
  if (child && child.exitCode === null) child.kill();
}
