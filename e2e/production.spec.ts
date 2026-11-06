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
    let latestInput = { turn: 0, thrust: false, fire: false };
    page.on("websocket", socket => {
      socket.on("framesent", ({ payload }) => {
        if (typeof payload !== "string") return;
        const message = JSON.parse(payload);
        if (message.type === "input") latestInput = message;
      });
    });
    await join(page, baseURL + "/?format=json", "Touch pilot", "Deep Space (0/4)", 0);
    const joystick = page.getByRole("group", { name: "Джойстик руху" });
    const fire = page.getByRole("button", { name: "Вогонь" });
    await expect(joystick).toBeVisible();
    await expect(fire).toBeVisible();
    const stickBounds = await joystick.boundingBox();
    const fireBounds = await fire.boundingBox();
    if (!stickBounds || !fireBounds) throw new Error("Expected both controls");
    expect(fireBounds.x).toBeLessThan(stickBounds.x);

    const cdp = await context.newCDPSession(page);
    const center = { x: stickBounds.x + stickBounds.width / 2, y: stickBounds.y + stickBounds.height / 2, id: 1 };
    const right = { ...center, x: center.x + stickBounds.width / 3 };
    const shot = { x: fireBounds.x + fireBounds.width / 2, y: fireBounds.y + fireBounds.height / 2, id: 2 };
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [center] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [right] });
    await expect.poll(() => latestInput.turn).toBe(1);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [right, shot] });
    await expect.poll(() => latestInput).toMatchObject({ thrust: true, fire: true });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await expect.poll(() => latestInput).toMatchObject({ turn: 0, thrust: false, fire: false });
    await expect(page.locator("link[rel=manifest]")).toHaveAttribute("href", "/manifest.webmanifest");
    await page.evaluate(async () => { await navigator.serviceWorker.ready; });
    await context.setOffline(true);
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page).toHaveTitle("Dogfight offline");
  } finally {
    await context.close();
  }
});
