import type { NetworkSettings } from "../../shared/src/protocol/messages.ts";

export class NetworkSimulator {
  declare settings: NetworkSettings;
  declare readonly timers: Set<ReturnType<typeof setTimeout>>;
  declare closed: boolean;

  constructor({
    latency = 0,
    jitter = 0,
    drop = 0,
  }: Partial<NetworkSettings> = {}) {
    this.settings = {
      latency,
      jitter,
      drop,
    };

    this.timers = new Set();
    this.closed = false;
  }

  dispatch(operation: () => void) {
    if (this.closed) {
      return false;
    }

    const { latency, jitter, drop } = this.settings;

    if (Math.random() < drop) {
      return false;
    }

    const variation = (Math.random() * 2 - 1) * jitter;
    const delay = Math.max(0, latency + variation);

    if (delay === 0) {
      operation();
      return true;
    }

    const timer = setTimeout(() => {
      this.timers.delete(timer);

      if (!this.closed) {
        operation();
      }
    }, delay);

    this.timers.add(timer);

    return true;
  }

  close() {
    this.closed = true;

    for (const timer of this.timers) {
      clearTimeout(timer);
    }

    this.timers.clear();
  }
}