import { Entity } from "./entity.js";

export class Bullet extends Entity {
  constructor({
    pos,
    vel,
    ownerId = null,
    damage = 25,
    ttl = 2, //час існування кулі
    homing = null, //самонаведення
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
    if (!this.alive) return; //якщо знищена, не оновлювати

    if (this.homing) {
      this.homing.update(this, world, dt); //коригуємо рух кулі, якщо є самонаведення
    }

    super.update(dt);

    if (this.vel.length() > 0) { 
      this.angle = Math.atan2(this.vel.y, this.vel.x); //обчислюємо кут напрямку кулі на основі її швидкості
    }

    this.ttl -= dt; //зменшуємо час існування кулі

    if (this.ttl <= 0) { //якщо час існування кулі закінчився, знищуємо її
      this.destroy();
    }
  }
}
