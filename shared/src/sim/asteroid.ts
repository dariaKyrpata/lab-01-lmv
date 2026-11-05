import { Vector2 } from "./vector.ts";
import { Entity } from "./entity.ts";
import { Homing } from "./homing.ts";
import { normalizeAngle } from "../movement.ts";

import { UNSPAWNED_ID } from "../protocol/ids.ts";
import type { AsteroidSnapshot, HomingSnapshot } from "../protocol/snapshots.ts";
import type { Vec2 } from "./vector.ts";
import type { World } from "./world.ts";

export class Asteroid extends Entity<"asteroid"> {
  declare hp: number;
  declare maxHp: number;
  declare rotationSpeed: number;
  declare homing: Homing | null;

  constructor({
    id = UNSPAWNED_ID,
    pos,
    vel,
    angle = 0,
    radius = 25,
    alive = true,
    hp = 50,
    maxHp = hp,
    rotationSpeed = 0,
    homing = null,
  }: Partial<Omit<AsteroidSnapshot, "homing">> & { homing?: Homing | HomingSnapshot | null } = {}) {
    super({
      id,
      pos,
      vel,
      angle,
      radius,
      alive,
      kind: "asteroid",
    });

    this.hp = hp;
    this.maxHp = maxHp;
    this.rotationSpeed = rotationSpeed;

    this.homing =
      homing instanceof Homing
        ? homing
        : homing === null
          ? null
          : Homing.fromSnapshot(homing);
  }

  update(dt: number, world?: Pick<World, "get" | "width" | "height">) {
    if (!this.alive) {
      return;
    }

    if (this.homing) {
      this.homing.update(this, world, dt);
    }

    super.update(dt);

    this.angle = normalizeAngle(
      this.angle + this.rotationSpeed * dt
    );

    if (!world) {
      return;
    }

    const bounds: [keyof Vec2, number][] = [
      ["x", world.width],
      ["y", world.height],
    ];

    for (const [axis, limit] of bounds) {
      if (this.pos[axis] < this.radius) {
        this.pos = withAxis(this.pos, axis, this.radius);
        this.vel = withAxis(this.vel, axis, Math.abs(this.vel[axis]));
      } else if (this.pos[axis] > limit - this.radius) {
        this.pos = withAxis(this.pos, axis, limit - this.radius);
        this.vel = withAxis(this.vel, axis, -Math.abs(this.vel[axis]));
      }
    }
  }

  takeDamage(amount: number) {
    if (!this.alive) {
      return false;
    }

    this.hp = Math.max(0, this.hp - amount);

    if (this.hp === 0) {
      this.destroy();
      return true;
    }

    return false;
  }

  toSnapshot(): AsteroidSnapshot {
    return {
      ...super.toSnapshot(),
      hp: this.hp,
      maxHp: this.maxHp,
      rotationSpeed: this.rotationSpeed,
      homing: this.homing
        ? this.homing.toSnapshot()
        : null,
    };
  }

  static fromSnapshot(snapshot: AsteroidSnapshot) {
    return new Asteroid(snapshot);
  }
}

function withAxis(vector: Vec2, axis: keyof Vec2, value: number) {
  return new Vector2(
    axis === "x" ? value : vector.x,
    axis === "y" ? value : vector.y,
  );
}
