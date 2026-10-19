import { Entity } from "./entity.js";
import { Vector2 } from "./vector.js";

export class Asteroid extends Entity {
  constructor({
    pos = new Vector2(),
    vel = new Vector2(),
    radius = 25,
    hp = 50,
    homing = null,
  } = {}) {
    super({
      pos,
      vel,
      radius,
      kind: "asteroid",
    });

    this.hp = hp;
    this.maxHp = hp;
    this.homing = homing;
    this.rotationSpeed = (Math.random() - 0.5) * 2;
    this.shape = this.createShape();
  }

  createShape() {
    const points = [];
    const count = 9;

    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const distance = 0.75 + Math.random() * 0.25;

      points.push({
        angle,
        distance,
      });
    }

    return points;
  }

  update(dt, world) {
    if (!this.alive) return;

    if (this.homing) {
      this.homing.update(this, world, dt);
    }

    super.update(dt);

    this.angle += this.rotationSpeed * dt;

    if (world) {
      const width = world.width;
      const height = world.height;

      if (this.pos.x - this.radius < 0) {
        this.pos.x = this.radius;
        this.vel.x = Math.abs(this.vel.x);
      }

      if (this.pos.x + this.radius > width) {
        this.pos.x = width - this.radius;
        this.vel.x = -Math.abs(this.vel.x);
      }

      if (this.pos.y - this.radius < 0) {
        this.pos.y = this.radius;
        this.vel.y = Math.abs(this.vel.y);
      }

      if (this.pos.y + this.radius > height) {
        this.pos.y = height - this.radius;
        this.vel.y = -Math.abs(this.vel.y);
      }
    }
  }

  takeDamage(amount) {
    if (!this.alive) return false;

    this.hp = Math.max(0, this.hp - amount);

    if (this.hp === 0) {
      this.destroy();
      return true;
    }

    return false;
  }
}
