import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { once } from "node:events";

import { ReplayManager } from "./replay.js";

function memoryMB() {
  return (process.memoryUsage().rss / 1024 / 1024).toFixed(2);
}

async function createTestLog(filePath, count) {
  const output = createWriteStream(filePath);

  for (let i = 0; i < count; i++) {
    const event = JSON.stringify({
      type: "chat",
      playerId: "test-player",
      text: `Test message ${i}`,
      timestamp: Date.now()
    }) + "\n";

    if (!output.write(event)) {
      await once(output, "drain");
    }
  }

  output.end();
  await once(output, "finish");
}

async function main() {
  const directory = await mkdtemp(
    path.join(tmpdir(), "dogfight-memory-")
  );

  const fileName = "memory-test.ndjson";
  const filePath = path.join(directory, fileName);

  try {
    console.log("Creating test log...");
    await createTestLog(filePath, 100000);

    const replay = new ReplayManager(directory);

    console.log("RSS before:", memoryMB(), "MB");

    let count = 0;
    let peakRSS = 0;

    for await (const event of replay.readEvents(fileName)) {
      count++;

      const rss = process.memoryUsage().rss;
      peakRSS = Math.max(peakRSS, rss);

      if (count % 20000 === 0) {
        console.log(
          `Events: ${count} | RSS: ${memoryMB()} MB`
        );
      }
    }

    console.log("Total events:", count);
    console.log(
      "Peak RSS:",
      (peakRSS / 1024 / 1024).toFixed(2),
      "MB"
    );
  } finally {
    await rm(directory, {
      recursive: true,
      force: true
    });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
