import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { startServer, join } from "./browser.mjs";

const label = process.argv[2] ?? "after";
const seconds = Number(process.env.PROFILE_SECONDS ?? 30);
const output = "docs/profile";
await mkdir(output, { recursive: true });
const server = await startServer(3417);
const browser = await chromium.launch({
  executablePath: process.env.PROFILE_BROWSER || undefined,
  args: ["--disable-background-timer-throttling", "--disable-renderer-backgrounding"],
}).catch(async error => { await server.close(); throw error; });

const percentile = (samples, q) => {
  const sorted = [...samples].sort((a, b) => a - b);
  return +(sorted[Math.ceil(sorted.length * q) - 1] ?? 0).toFixed(3);
};
const distribution = values => ({ p50: percentile(values, .50), p95: percentile(values, .95), p99: percentile(values, .99) });
function top(entries, limit = 3) {
  return [...entries].sort((a, b) => b[1] - a[1]).slice(0, limit)
    .map(([name, value]) => ({ name, value: +value.toFixed(2) }));
}
function functionName(frame) {
  return frame.functionName || "(anonymous)";
}
try {
  const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
  const rooms = await (await fetch(server.base + "/api/rooms")).json();
  const room = rooms[0];
  await join(page, server.base + "/?profile=1", "Profiler", room.name + " (0/4)", 0);
  const response = await fetch(server.base + "/api/rooms/" + room.id + "/bots", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ count: 8 }),
  });
  if (!response.ok) throw new Error(await response.text());
  await page.keyboard.down("Space");
  await page.keyboard.down("ArrowUp");
  await page.waitForTimeout(2500);
  const cdp = await page.context().newCDPSession(page);
  const events = [];
  cdp.on("Tracing.dataCollected", ({ value }) => events.push(...value));
  await cdp.send("Profiler.enable");
  await cdp.send("Profiler.setSamplingInterval", { interval: 1000 });
  await cdp.send("Profiler.start");
  await cdp.send("HeapProfiler.enable");
  await cdp.send("HeapProfiler.startSampling", { samplingInterval: 32768, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true });
  await cdp.send("Tracing.start", { categories: "devtools.timeline,v8,blink.user_timing,disabled-by-default-v8.gc" });
  const samples = await page.evaluate(duration => new Promise(resolve => {
    const frames = [];
    const render = [];
    const simulate = [];
    const observer = new PerformanceObserver(list => {
      for (const entry of list.getEntries()) {
        if (entry.name === "dogfight:render") render.push(entry.duration);
        if (entry.name === "dogfight:simulate") simulate.push(entry.duration);
      }
    });
    observer.observe({ type: "measure" });
    const start = performance.now();
    let previous;
    function frame(time) {
      if (previous !== undefined) frames.push(time - previous);
      previous = time;
      if (time - start < duration) requestAnimationFrame(frame);
      else {
        observer.disconnect();
        resolve({ frames, render, simulate });
      }
    }
    requestAnimationFrame(frame);
  }), seconds * 1000);
  const traceDone = new Promise(resolve => cdp.once("Tracing.tracingComplete", resolve));
  await cdp.send("Tracing.end");
  await traceDone;
  const { profile: cpu } = await cdp.send("Profiler.stop");
  const { profile: heap } = await cdp.send("HeapProfiler.stopSampling");
  const stats = await (await fetch(server.base + "/api/stats")).json();
  const main = events.find(e => e.name === "thread_name" && e.args?.name === "CrRendererMain" && events.some(x => x.pid === e.pid && x.tid === e.tid && x.name === "FunctionCall"));
  const thread = main ? events.filter(e => e.pid === main.pid && e.tid === main.tid) : events;
  const gc = thread.filter(e => (e.name === "MinorGC" || e.name === "MajorGC") && e.ph === "X" && e.dur !== undefined);
  const allocations = new Map();
  function visit(node) {
    const name = functionName(node.callFrame);
    allocations.set(name, (allocations.get(name) ?? 0) + node.selfSize);
    node.children.forEach(visit);
  }
  visit(heap.head);
  const nodes = new Map(cpu.nodes.map(node => [node.id, node]));
  const self = new Map();
  const parents = new Map();
  for (const node of cpu.nodes) for (const child of node.children ?? []) parents.set(child, node.id);
  const spans = [];
  let elapsed = 0;
  for (const [i, id] of cpu.samples.entries()) {
    const ms = (cpu.timeDeltas[i] ?? 0) / 1000;
    const name = functionName(nodes.get(id)?.callFrame ?? {});
    self.set(name, (self.get(name) ?? 0) + ms);
    if (elapsed < 2000) {
      const stack = [];
      for (let cursor = id; cursor !== undefined; cursor = parents.get(cursor)) stack.unshift(functionName(nodes.get(cursor)?.callFrame ?? {}));
      spans.push({ start: elapsed, ms, stack });
    }
    elapsed += ms;
  }
  const result = {
    browser: browser.version(), seconds, bots: stats.matches[0]?.bots, samples: samples.frames.length,
    frameIntervalMs: distribution(samples.frames), renderMs: distribution(samples.render),
    simulateMs: distribution(samples.simulate), gcCount: gc.length, majorGC: gc.filter(e => e.name === "MajorGC").length,
    gcTotalMs: +(gc.reduce((total, e) => total + e.dur / 1000, 0)).toFixed(3),
    gcMaxMs: +(Math.max(0, ...gc.map(e => e.dur / 1000))).toFixed(3),
    topAllocatorsBytes: top(allocations),
    topSelfMs: top([...self].filter(([name]) => !name.startsWith("("))),
    tickP99Ms: stats.matches[0]?.tickP99Ms,
  };
  await writeFile(output + "/" + label + ".json", JSON.stringify(result, null, 2) + String.fromCharCode(10));
  const chart = await browser.newPage({ viewport: { width: 1200, height: 500 } });
  await chart.setContent('<body style="background:#121c30;color:white;font:18px system-ui"><h1>Dogfight CPU flame chart</h1><canvas width="1170" height="390"></canvas></body>');
  await chart.evaluate(({ spans, label }) => {
    const canvas = document.querySelector("canvas");
    const ctx = canvas.getContext("2d");
    ctx.font = "12px sans-serif";
    ctx.fillStyle = "#fff";
    ctx.fillText(label + " · first 2 s of a V8 sampled browser CPU profile · 8 bots", 10, 17);
    for (const span of spans) {
      span.stack.slice(0, 15).forEach((name, depth) => {
        let hue = 0;
        for (const char of name) hue = (hue * 13 + char.charCodeAt(0)) % 360;
        ctx.fillStyle = "hsl(" + hue + ",72%,65%)";
        ctx.fillRect(10 + span.start * .57, 45 + depth * 19, Math.max(.45, span.ms * .57), 18);
        if (span.ms > 40) {
          ctx.fillStyle = "#101010";
          ctx.fillText(name, 12 + span.start * .57, 58 + depth * 19, span.ms * .57 - 2);
        }
      });
    }
    ctx.fillStyle = "#fff";
    for (let ms = 0; ms <= 2000; ms += 250) ctx.fillText(ms + " ms", Math.min(1110, 10 + ms * .57), 37);
  }, { spans, label });
  await chart.screenshot({ path: output + "/" + label + "-flame.png" });
  console.log(result);
} finally {
  await browser.close();
  await server.close();
}
