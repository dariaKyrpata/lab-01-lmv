import { Vector2 } from "./vector.ts";

import type { Vec2 } from "./vector.ts";
import type { EntityId } from "../protocol/ids.ts";
import { UNSPAWNED_ID } from "../protocol/ids.ts";
import type { EntityKind } from "../protocol/snapshots.ts";

export interface EntityOptions {
  id?: EntityId;
  pos?: Vec2;
  vel?: Vec2;
  angle?: number;
  radius?: number;
  alive?: boolean;
}

export class Entity<K extends EntityKind> {
  declare id: EntityId;
  declare pos: Vector2;
  declare vel: Vector2;
  declare angle: number;
  declare radius: number;
  declare readonly kind: K;
  declare alive: boolean;

  constructor({
    id = UNSPAWNED_ID,
    pos = { x: 0, y: 0 },
    vel = { x: 0, y: 0 },
    angle = 0,
    radius = 10,
    kind,
    alive = true,
  }: EntityOptions & { kind: K }) {
    this.id = id;
    this.pos = new Vector2(pos.x, pos.y);
    this.vel = new Vector2(vel.x, vel.y);
    this.angle = angle;
    this.radius = radius;
    this.kind = kind;
    this.alive = alive;
  }

  update(dt: number) {
    if (!this.alive) {
      return;
    }

    this.pos = this.pos.add(this.vel.scale(dt));
  }

  destroy() {
    this.alive = false;
  }

  toSnapshot() {
    return {
      id: this.id,
      pos: {
        x: this.pos.x,
        y: this.pos.y,
      },
      vel: {
        x: this.vel.x,
        y: this.vel.y,
      },
      angle: this.angle,
      radius: this.radius,
      kind: this.kind,
      alive: this.alive,
    };
  }

}
