import { expect, test } from "@playwright/test";

test("two clients share a room, see movement, and receive chat", async ({ browser, request }) => {
  const response = await request.post("/api/rooms", { data: { name: "Playwright Arena" } });
  expect(response.ok()).toBe(true);
  const room: { id: string } = await response.json();
  const first = await browser.newContext();
  const second = await browser.newContext();
  try {
    const pilot = await first.newPage();
    const observer = await second.newPage();
    await observer.addInitScript(() => {
      document.addEventListener("dogfight:draw-ship", event => {
        if (!(event instanceof CustomEvent) || event.detail.color !== "pink") return;
        document.documentElement.dataset.pinkPosition = JSON.stringify([event.detail.x, event.detail.y]);
      }, true);
    });
    await pilot.goto("/?format=json");
    await pilot.locator("#player-name").fill("Pilot");
    await pilot.locator("#room-select").selectOption(room.id);
    await pilot.locator(".color-options button").nth(0).click();
    await pilot.locator("#join-button").click();
    await expect(pilot.locator(".online-players")).toContainText("Pilot");

    await observer.goto("/?observe");
    await observer.locator("#player-name").fill("Observer");
    await observer.locator("#room-select").selectOption(room.id);
    await observer.locator(".color-options button").nth(1).click();
    await observer.locator("#join-button").click();
    await expect(pilot.locator(".online-players")).toContainText("Observer");
    await expect(observer.locator(".online-players")).toContainText("Pilot");
    const renderedPosition = observer.locator("html");
    await expect(renderedPosition).toHaveAttribute("data-pink-position", /^\[/);
    const position = await renderedPosition.getAttribute("data-pink-position");
    await pilot.keyboard.down("ArrowUp");
    try {
      await expect(renderedPosition).not.toHaveAttribute("data-pink-position", position ?? "", { timeout: 500 });
    } finally {
      await pilot.keyboard.up("ArrowUp");
    }

    await pilot.locator(".online-input").fill("Hello from the other cockpit");
    await pilot.locator(".online-input").press("Enter");
    await expect(observer.locator(".online-messages")).toContainText("Hello from the other cockpit");
  } finally {
    await Promise.all([first.close(), second.close()]);
  }
});
