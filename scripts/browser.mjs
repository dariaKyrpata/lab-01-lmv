import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

export async function startServer(port, options = {}) {
  const logs = await mkdtemp(path.join(tmpdir(), "dogfight-lab07-"));
  const child = spawn(process.execPath, [...(options.flags ?? []), "server/src/index.ts"], {
    env: { ...process.env, PORT: String(port), LOG_DIR: logs, ROOM_CAPACITY: String(options.capacity ?? 4) },
    stdio: ["ignore", "ignore", "inherit"],
  });
  const base = "http://127.0.0.1:" + port;
  for (let i = 0; i < 100 && child.exitCode === null; i++) {
    const response = await fetch(base + "/health").catch(() => null);
    if (response?.ok) return { base, close: () => new Promise(resolve => {
      if (child.exitCode !== null) resolve();
      else { child.once("close", resolve); child.kill(); }
    }) };
    await delay(100);
  }
  child.kill();
  throw new Error("Test server did not start on port " + port);
}

export async function join(page, base, name, roomName, color) {
  await page.goto(base);
  await page.locator("#player-name").fill(name);
  await page.locator("#room-select").selectOption({ label: roomName });
  await page.locator(".color-options button").nth(color).click();
  await page.locator("#join-button").click();
  await page.locator(".online-panel, .online-title").first().waitFor();
}
