import { performance } from "node:perf_hooks";

const traffic = { messagesIn: 0, messagesOut: 0, bytesIn: 0, bytesOut: 0 };
const rejected = new Map<string, number>();
let previous = { ...traffic };
let lastAt = performance.now();
let lastLoop = performance.eventLoopUtilization();
let rates = { ...traffic };
let eventLoop = 0;

const timer = setInterval(() => {
  const now = performance.now();
  const seconds = Math.max(0.001, (now - lastAt) / 1000);
  rates = {
    messagesIn: (traffic.messagesIn - previous.messagesIn) / seconds,
    messagesOut: (traffic.messagesOut - previous.messagesOut) / seconds,
    bytesIn: (traffic.bytesIn - previous.bytesIn) / seconds,
    bytesOut: (traffic.bytesOut - previous.bytesOut) / seconds,
  };
  const currentLoop = performance.eventLoopUtilization();
  eventLoop = performance.eventLoopUtilization(currentLoop, lastLoop).utilization;
  previous = { ...traffic };
  lastAt = now;
  lastLoop = currentLoop;
}, 1000);
timer.unref();

export function recordFrame(direction: "in" | "out", bytes: number) {
  if (direction === "in") {
    traffic.messagesIn++;
    traffic.bytesIn += bytes;
  } else {
    traffic.messagesOut++;
    traffic.bytesOut += bytes;
  }
}

export function recordRejection(reason: string) {
  rejected.set(reason, (rejected.get(reason) ?? 0) + 1);
}

export function collectMetrics(rooms: number, players: number, matches: readonly { tickP99Ms: number; bots: number }[]) {
  const memory = process.memoryUsage();
  return {
    rooms, players,
    bots: matches.reduce((total, match) => total + match.bots, 0),
    messagesPerSecond: { in: rates.messagesIn, out: rates.messagesOut },
    bytesPerSecond: { in: rates.bytesIn, out: rates.bytesOut },
    totals: { ...traffic },
    tickP99Ms: Math.max(0, ...matches.map(match => match.tickP99Ms)),
    eventLoopUtilization: eventLoop,
    memory: { rss: memory.rss, heapUsed: memory.heapUsed, heapTotal: memory.heapTotal },
    rejections: Object.fromEntries(rejected),
  };
}
