import {
  integrate,
  normalizeAngle,
  wrap,
} from "../../shared/src/movement.js";

const SMOOTHING_MS = 100;

function copyState(ship) {
  return {
    angle: ship.angle,
    thrust: ship.thrust,
    pos: {
      x: ship.pos.x,
      y: ship.pos.y,
    },
    vel: {
      x: ship.vel.x,
      y: ship.vel.y,
    },
  };
}

function wrappedDifference(a, b, size) {
  const difference = a - b;

  return difference - Math.round(difference / size) * size;
}

export class Prediction {
  constructor() {
    this.reset();
  }

  reset() {
    this.currentState = null;
    this.pending = [];
    this.lastAck = 0;
    this.correction = 0;
    this.width = 1;
    this.height = 1;
    this.offset = { x: 0, y: 0, angle: 0 };
    this.correctedAt = 0;
  }

  get state() {
    if (!this.currentState) {
      return null;
    }

    const elapsed = performance.now() - this.correctedAt;
    const remaining = Math.max(0, 1 - elapsed / SMOOTHING_MS);

    return {
      ...this.currentState,
      pos: {
        x: wrap(
          this.currentState.pos.x + this.offset.x * remaining,
          this.width
        ),
        y: wrap(
          this.currentState.pos.y + this.offset.y * remaining,
          this.height
        ),
      },
      angle: normalizeAngle(
        this.currentState.angle + this.offset.angle * remaining
      ),
    };
  }

  predict(input, ship, width, height) {
    if (input.seq <= this.lastAck) {
      return this.state;
    }

    const lastInput = this.pending.at(-1);

    if (lastInput && input.seq <= lastInput.seq) {
      return this.state;
    }

    this.width = width;
    this.height = height;
    this.pending.push({ ...input });

    if (!ship?.alive) {
      this.currentState = null;
      this.offset = { x: 0, y: 0, angle: 0 };
      return null;
    }

    this.currentState = integrate(
      this.currentState ?? copyState(ship),
      input,
      width,
      height
    );

    return this.state;
  }

  reconcile(ship, lastProcessedSeq, width, height) {
    if (lastProcessedSeq < this.lastAck) {
      return this.state;
    }

    this.lastAck = lastProcessedSeq;
    this.width = width;
    this.height = height;

    this.pending = this.pending.filter(
      (input) => input.seq > lastProcessedSeq
    );

    if (!ship?.alive) {
      this.currentState = null;
      this.correction = 0;
      this.offset = { x: 0, y: 0, angle: 0 };
      return null;
    }

    const previous = this.currentState;
    const visible = this.state;
    let corrected = copyState(ship);

    for (const input of this.pending) {
      corrected = integrate(
        corrected,
        input,
        width,
        height
      );
    }

    const dx = previous
      ? wrappedDifference(previous.pos.x, corrected.pos.x, width)
      : 0;

    const dy = previous
      ? wrappedDifference(previous.pos.y, corrected.pos.y, height)
      : 0;

    this.correction = Math.hypot(dx, dy);
    this.currentState = corrected;

    const angleCorrection = previous
      ? normalizeAngle(previous.angle - corrected.angle)
      : 0;

    if (!visible || this.correction > Math.min(width, height) / 4) {
      this.offset = { x: 0, y: 0, angle: 0 };
    } else if (
      this.correction > 0.001 ||
      Math.abs(angleCorrection) > 0.00001
    ) {
      this.offset = {
        x: wrappedDifference(visible.pos.x, corrected.pos.x, width),
        y: wrappedDifference(visible.pos.y, corrected.pos.y, height),
        angle: normalizeAngle(visible.angle - corrected.angle),
      };

      this.correctedAt = performance.now();
    }

    return this.state;
  }
}