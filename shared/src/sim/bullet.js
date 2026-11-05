import { Entity } from "./entity.js";
import { Homing } from "./homing.js";

export class Bullet extends Entity {
  constructor({
    id = 0,
    pos,
    vel,
    angle = 0,
    radius = 4,
    alive = true,
    ownerId = null,
    damage = 25,
    ttl = 2,
    homing = null,
    inputSeq = 0,
  } = {}) {
    super({
      id,
      pos,
      vel,
      angle,
      radius,
      alive,
      kind: "bullet",
    });

    this.ownerId = ownerId;
    this.damage = damage;
    this.ttl = ttl;
    this.inputSeq = inputSeq;

    this.homing =
      homing instanceof Homing
        ? homing
        : homing === null
          ? null
          : Homing.fromSnapshot(homing);
  }

  update(dt, world) {
    if (!this.alive) {
      return;
    }

    if (this.homing) {
      this.homing.update(this, world, dt);
    }

    super.update(dt);

    if (this.vel.length() > 0) {
      this.angle = Math.atan2(
        this.vel.y,
        this.vel.x
      );
    }

    this.ttl -= dt;

    if (this.ttl <= 0) {
      this.destroy();
    }
  }

  toSnapshot() {
    return {
      ...super.toSnapshot(),
      ownerId: this.ownerId,
      damage: this.damage,
      ttl: this.ttl,
      inputSeq: this.inputSeq,
      homing: this.homing
        ? this.homing.toSnapshot()
        : null,
    };
  }

  static fromSnapshot(snapshot) {
    return new Bullet(snapshot);
  }
}