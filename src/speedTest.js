import { fetchJson } from "./assets/loader.js";

export async function runSpeedTest() {
  const files = [
    "/assets/arena.json",
    "/api/rooms.json",
    "/assets/manifest.json"
  ];

  console.log("Speed test started");

  const sequentialStart = performance.now();

  for (const url of files) {
    await fetchJson(url);
  }

  const sequentialTime = performance.now() - sequentialStart;

  const parallelStart = performance.now();

  await Promise.all(files.map((url) => fetchJson(url)));

  const parallelTime = performance.now() - parallelStart;

  console.log(`Sequential: ${sequentialTime.toFixed(2)} ms`);
  console.log(`Parallel: ${parallelTime.toFixed(2)} ms`);
}
