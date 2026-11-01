import { fetchJson } from "./assets/loader.js";

export async function runRetryTest() {
  const originalFetch = window.fetch;
  let attempts = 0;

  window.fetch = async (...args) => {
    const url = String(args[0]);

    if (url === "/assets/arena.json") {
      attempts++;
      console.log(`Retry test: attempt ${attempts}`);

      if (attempts < 3) {
        return new Response("Temporary server error", {
          status: 503
        });
      }
    }

    return originalFetch(...args);
  };

  try {
    const result = await fetchJson("/assets/arena.json");
    console.log("Retry test: success", result);
  } catch (error) {
    console.error("Retry test failed:", error);
  } finally {
    window.fetch = originalFetch;
  }
}
