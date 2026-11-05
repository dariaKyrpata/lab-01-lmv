import {
  FIXED_DT,
  normalizeAngle,
  wrap,
} from "../../shared/src/movement.js";

function shortestDifference(from, to, size) {
  const difference = to - from;

  return difference - Math.round(difference / size) * size;
}

export class Interpolation {
  constructor(delay = 100) {
    this.delay = delay;
    this.reset();
  }

  reset() {
    this.snapshots = [];
    this.renderTime = null;
  }

  push(state, receivedAt = performance.now()) {
    const time = state.tick * FIXED_DT * 1000;
    const previous = this.snapshots.at(-1);

    if (previous && time <= previous.time) {
      return;
    }

    const entities = new Map();

    for (const entity of state.entities) {
    
      entities.set(entity.id, entity);
    }

    this.snapshots.push({
      time,
      receivedAt,
      width: state.width,
      height: state.height,
      entities,
    });

    if (this.snapshots.length > 60) {
      this.snapshots.shift();
    }
  }

  sample(now = performance.now()) {
    const latest = this.snapshots.at(-1);

    if (!latest) {
      return new Map();
    }

    const target =
      latest.time + (now - latest.receivedAt) - this.delay;

    const first = this.snapshots[0];

    this.renderTime = Math.min(
      latest.time,
      Math.max(
        first.time,
        this.renderTime ?? first.time,
        target
      )
    );

    let before = first;
    let after = first;

    for (const snapshot of this.snapshots) {
      after = snapshot;

    if (snapshot.time > this.renderTime) {
        break;
      }

      before = snapshot;
    }

    const duration = after.time - before.time;

    const amount = duration > 0
      ? Math.max(
          0,
          Math.min(1, (this.renderTime - before.time) / duration)
        )
      : 0;

    const result = new Map();

    for (const [id, previous] of before.entities) {
      const next = after.entities.get(id);

      if (!next || previous.alive !== next.alive) {
        result.set(id, previous);
        continue;
      }

       const wraps = previous.kind === "ship";
     

      const dx = wraps
        ? shortestDifference(previous.pos.x, next.pos.x, latest.width)
        : next.pos.x - previous.pos.x;

      const dy = wraps
        ? shortestDifference(previous.pos.y, next.pos.y, latest.height)
        : next.pos.y - previous.pos.y;

      const teleport =
        Math.hypot(dx, dy) > Math.min(latest.width, latest.height) / 4;

      if (teleport) {
        result.set(id, previous);
        continue;
      }

      const x = previous.pos.x + dx * amount;
      const y = previous.pos.y + dy * amount;

      result.set(id, {
        ...previous,
        pos: {
          x: wraps ? wrap(x, latest.width) : x,
          y: wraps ? wrap(y, latest.height) : y,
        },
        angle: normalizeAngle(
          previous.angle +
          normalizeAngle(next.angle - previous.angle) * amount
        ),
      });
    }

    return result;
  }
}