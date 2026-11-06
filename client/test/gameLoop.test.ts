import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { createLoop } from "../src/loop.ts";

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => setTimeout(() => callback(performance.now()), 16));
  vi.stubGlobal("cancelAnimationFrame", (id: ReturnType<typeof setTimeout>) => clearTimeout(id));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
test("accumulates render frames into fixed simulation steps", () => {
  const simulate = vi.fn();
  const render = vi.fn();
  const loop = createLoop({ step: 0.032, simulate, render });
  loop.start();
  vi.advanceTimersByTime(16);
  expect(simulate).not.toHaveBeenCalled();
  vi.advanceTimersByTime(48);
  expect(simulate).toHaveBeenCalledTimes(2);
  expect(render).toHaveBeenCalledTimes(4);
  loop.stop();
});
test("stopping cancels the pending frame", () => {
  const render = vi.fn();
  const loop = createLoop({ simulate: vi.fn(), render });
  loop.start();
  loop.stop();
  vi.advanceTimersByTime(200);
  expect(render).not.toHaveBeenCalled();
});
