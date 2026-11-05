import { fetchJson } from "./assets/loader.ts";

export async function runAbortTest() {
  const controller = new AbortController();
  const originalFetch = window.fetch;

  window.fetch = (url, options = {}) => {
    if (String(url) !== "/assets/arena.json") {
      return originalFetch(url, options);
    }

    return new Promise((resolve, reject) => {
      const signal = options.signal;

      const timer = setTimeout(() => {
        resolve(new Response('{"width":960}', {
          status: 200,
          headers: { "Content-Type": "application/json" }
        }));
      }, 2000);

      signal?.addEventListener("abort", () => {
        clearTimeout(timer);
        reject(new DOMException("Request aborted", "AbortError"));
      }, { once: true });
    });
  };

  try {
    console.log("Abort test: request started");

    const request = fetchJson("/assets/arena.json", {
      signal: controller.signal
    });

    setTimeout(() => {
      console.log("Abort test: cancelling request");
      controller.abort();
    }, 200);

    await request;

    console.log("Abort test: unexpected success");
  } catch (error) {
    if (controller.signal.aborted) {
      console.log("Abort test: cancelled during loading");
    } else {
      console.error("Abort test failed:", error);
    }
  } finally {
    window.fetch = originalFetch;
  }
}
