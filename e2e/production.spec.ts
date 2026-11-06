import { expect, test } from "@playwright/test";
import { join, startServer } from "../scripts/browser.mjs";

test("a disconnected player returns to the lobby and can join after a restart", async ({ page }) => {
  const server = await startServer(3426);
  try {
    await join(page, server.base, "Crash test pilot", "Pink Galaxy (0/4)", 0);
  } finally {
    await server.close("SIGKILL");
  }
  await expect(page.locator("#join-button")).toBeVisible();
  const restarted = await startServer(3426);
  try {
    await join(page, restarted.base, "Returning pilot", "Pink Galaxy (0/4)", 0);
    await expect(page.locator(".online-players")).toContainText("Returning pilot");
  } finally {
    await restarted.close();
  }
});

test("the mobile game has a manifest, offline page, and touch controls", async ({ browser, baseURL }) => {
  if (!baseURL) throw new Error("Expected a test server URL");
  const context = await browser.newContext({ hasTouch: true, isMobile: true, viewport: { width: 430, height: 780 } });
  try {
    const page = await context.newPage();
    await join(page, baseURL, "Touch pilot", "Deep Space (0/4)", 0);
    await expect(page.getByRole("button", { name: "Газ" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Вогонь" })).toBeVisible();
    await expect(page.locator("link[rel=manifest]")).toHaveAttribute("href", "/manifest.webmanifest");
    await page.evaluate(async () => { await navigator.serviceWorker.ready; });
    await context.setOffline(true);
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page).toHaveTitle("Dogfight offline");
  } finally {
    await context.close();
  }
});
