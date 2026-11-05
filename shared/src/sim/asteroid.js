import { Entity } from "./entity.js";
import { Homing } from "./homing.js";
import { normalizeAngle } from "../movement.js";

export class Asteroid extends Entity {
  constructor({
    id = 0,
    pos,
    vel,
    angle = 0,
    radius = 25,
    alive = true,
    hp = 50,
    maxHp = hp,
    rotationSpeed = 0,
    homing = null,
  } = {}) {
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

  update(dt, world) {
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

    for (const [axis, limit] of [
      ["x", world.width],
      ["y", world.height],
    ]) {
      if (this.pos[axis] < this.radius) {
        this.pos[axis] = this.radius;
        this.vel[axis] = Math.abs(this.vel[axis]);
      } else if (this.pos[axis] > limit - this.radius) {
        this.pos[axis] = limit - this.radius;
        this.vel[axis] = -Math.abs(this.vel[axis]);
      }
    }
  }

  takeDamage(amount) {
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

  toSnapshot() {
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

  static fromSnapshot(snapshot) {
    return new Asteroid(snapshot);
  }
}
