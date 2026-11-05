import type { Entity } from "./entity.ts";
import type { EntityKind } from "../protocol/snapshots.ts";

export function circlesCollide(a: Entity<EntityKind>, b: Entity<EntityKind>) {
  if (!a.alive || !b.alive) {
    return false;
  }

  const dx = a.pos.x - b.pos.x;
  const dy = a.pos.y - b.pos.y;
  const radiusSum = a.radius + b.radius;

  return dx * dx + dy * dy <= radiusSum * radiusSum;
}

export function* findCollisions<T extends Entity<EntityKind>>(world: Iterable<T>): Generator<[T, T]> {
  const entities = [...world].filter(
    (entity) => entity.alive && entity.radius > 0
  );

  for (let i = 0; i < entities.length; i++) {
    const a = entities[i];
    if (!a) continue;

    for (let j = i + 1; j < entities.length; j++) {
      const b = entities[j];

      if (b && circlesCollide(a, b)) {
        yield [a, b];
      }
    }
  }
}