import { MutableVector2, Vector2 } from "./vector.ts";

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
  private readonly position = new MutableVector2();
  private readonly velocity = new MutableVector2();

  get pos(): Vector2 { return this.position; }
  set pos(value: Vec2) { this.setPosition(value.x, value.y); }
  get vel(): Vector2 { return this.velocity; }
  set vel(value: Vec2) { this.setVelocity(value.x, value.y); }

  setPosition(x: number, y: number) { this.position.set(x, y); }
  setVelocity(x: number, y: number) { this.velocity.set(x, y); }
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
    this.setPosition(pos.x, pos.y);
    this.setVelocity(vel.x, vel.y);
    this.angle = angle;
    this.radius = radius;
    this.kind = kind;
    this.alive = alive;
  }

  update(dt: number) {
    if (!this.alive) {
      return;
    }

    this.setPosition(this.pos.x + this.vel.x * dt, this.pos.y + this.vel.y * dt);
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
