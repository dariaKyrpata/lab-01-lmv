import { expect, test, vi } from "vitest";
import { startHeartbeat } from "../src/heartbeat.ts";

test("heartbeat closes only peers that miss successive pongs", () => {
  vi.useFakeTimers();
  const healthy = { readyState: 1, missedPongs: 0, ping: vi.fn(), terminate: vi.fn() };
  const silent = { readyState: 1, missedPongs: 0, ping: vi.fn(), terminate: vi.fn() };
  const timer = startHeartbeat([healthy, silent], 100, 2);
  try {
    for (let i = 0; i < 3; i++) {
      vi.advanceTimersByTime(100);
      healthy.missedPongs = 0;
    }
    expect(healthy.ping).toHaveBeenCalledTimes(3);
    expect(healthy.terminate).not.toHaveBeenCalled();
    expect(silent.ping).toHaveBeenCalledTimes(2);
    expect(silent.terminate).toHaveBeenCalledOnce();
  } finally {
    clearInterval(timer);
    vi.useRealTimers();
  }
});
