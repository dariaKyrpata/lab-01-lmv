import { loadImage } from "./assets/loader.js";

export async function runAbortTest() {
  const controller = new AbortController();

  console.log("Abort test: loading started");

  controller.abort();

  try {
    await loadImage("/assets/sprites/ship.png", {
      signal: controller.signal
    });

    console.log("Abort test: unexpected success");
  } catch (error) {
    if (controller.signal.aborted) {
      console.log("Abort test: loading cancelled successfully");
    } else {
      console.error("Abort test failed:", error);
    }
  }
}
