import { decodeSnapshot } from "../../shared/src/codec/binarySnapshot.ts";

self.addEventListener("message", (event: MessageEvent<ArrayBuffer>) => {
  try {
    self.postMessage({ state: decodeSnapshot(event.data) });
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : String(error) });
  }
});
