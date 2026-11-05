export class NetworkSimulator {
  constructor({
    latency = 0,
    jitter = 0,
    drop = 0,
  } = {}) {
    this.settings = {
      latency,
      jitter,
      drop,
    };

    this.timers = new Set();
    this.closed = false;
  }

  dispatch(operation) {
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