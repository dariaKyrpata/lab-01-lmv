import {
  FIXED_DT,
  normalizeAngle,
  wrap,
} from "../../shared/src/movement.ts";

import type { EntityId } from "../../shared/src/protocol/ids.ts";
import type { EntitySnapshot, WorldSnapshot } from "../../shared/src/protocol/snapshots.ts";

export interface RenderSample {
  entity: EntitySnapshot;
  x: number;
  y: number;
  angle: number;
}

interface Frame {
  time: number;
  receivedAt: number;
  width: number;
  height: number;
  entities: Map<EntityId, EntitySnapshot>;
}

function shortestDifference(from: number, to: number, size: number) {
  const difference = to - from;

  return difference - Math.round(difference / size) * size;
}

export class Interpolation {
  private readonly views = new Map<EntityId, RenderSample>();
  private readonly current = new Map<EntityId, RenderSample>();
  declare delay: number;
  declare snapshots: Frame[];
  declare renderTime: number | null;

  constructor(delay = 100) {
    this.delay = delay;
    this.reset();
  }

  reset() {
    this.views.clear();
    this.current.clear();
    this.snapshots = [];
    this.renderTime = null;
  }

  push(state: WorldSnapshot, receivedAt = performance.now()) {
    const time = state.tick * FIXED_DT * 1000;
    const previous = this.snapshots.at(-1);

    if (previous && time <= previous.time) {
      return;
    }

    const entities = new Map<EntityId, EntitySnapshot>();

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

  sample(now = performance.now()): ReadonlyMap<EntityId, RenderSample> {
    const result = this.current;
    result.clear();
    const latest = this.snapshots.at(-1);

    if (!latest) {
      return result;
    }

    const target =
      latest.time + (now - latest.receivedAt) - this.delay;

    const first = this.snapshots[0] ?? latest;

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


    for (const [id, previous] of before.entities) {
      let view = this.views.get(id);
      if (!view) {
        view = { entity: previous, x: previous.pos.x, y: previous.pos.y, angle: previous.angle };
        this.views.set(id, view);
      }
      view.entity = previous;
      view.x = previous.pos.x;
      view.y = previous.pos.y;
      view.angle = previous.angle;
      result.set(id, view);
      const next = after.entities.get(id);
      if (!next || previous.alive !== next.alive) continue;

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
        continue;
      }

      const x = previous.pos.x + dx * amount;
      const y = previous.pos.y + dy * amount;

      view.x = wraps ? wrap(x, latest.width) : x;
      view.y = wraps ? wrap(y, latest.height) : y;
      view.angle = normalizeAngle(previous.angle + normalizeAngle(next.angle - previous.angle) * amount);
    }

    for (const id of this.views.keys()) if (!result.has(id)) this.views.delete(id);
    return result;
  }
}