import { chromium } from "playwright";
import { writeFile } from "node:fs/promises";
import { startServer } from "./browser.mjs";

const server = await startServer(3420);
let browser;
try {
  browser = await chromium.launch({ executablePath: process.env.PROFILE_BROWSER || undefined });
  const page = await browser.newPage();
  await page.goto(server.base + "/?worker-experiment");
  const resultNode = page.locator("html[data-worker-result]");
  await resultNode.waitFor({ state: "attached" });
  const result = JSON.parse(await resultNode.getAttribute("data-worker-result"));
  if (result.error) throw new Error(result.error);
  await writeFile("docs/profile/worker.json", JSON.stringify(result, null, 2) + String.fromCharCode(10));
  console.log(result);
} finally {
  await browser?.close();
  await server.close();
}
