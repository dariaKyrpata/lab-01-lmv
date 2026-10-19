import { Entity } from "./entity.js";

export class Bullet extends Entity {
  constructor({
    pos,
    vel,
    ownerId = null,
    damage = 25,
    ttl = 2,
    homing = null,
  }) {
    super({
      pos,
      vel,
      radius: 4,
      kind: "bullet",
    });

    this.ownerId = ownerId;
    this.damage = damage;
    this.ttl = ttl;
    this.homing = homing;
  }

  update(dt, world) {
    if (!this.alive) return;

    if (this.homing) {
      this.homing.update(this, world, dt);
    }

    super.update(dt);

    if (this.vel.length() > 0) {
      this.angle = Math.atan2(this.vel.y, this.vel.x);
    }

    this.ttl -= dt;

    if (this.ttl <= 0) {
      this.destroy();
    }
  }
}
