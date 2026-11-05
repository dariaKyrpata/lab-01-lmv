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

    this.hp = hp; //поточне хп
    this.maxHp = hp; //максимальне хп
    this.homing = homing;
    this.rotationSpeed = (Math.random() - 0.5) * 2; //випадкова швидкість обертання
    this.shape = this.createShape(); // форма астероїда
  }

  createShape() { //створює випадкову форму астероїда
    const points = [];
    const count = 9; //кількість точок, що формують форму

    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2; //кут для кожної точки
      const distance = 0.75 + Math.random() * 0.25; //випадкова відстань від центру до точки, щоб створити нерівну форму

      points.push({
        angle,
        distance,
      });
    }

    return points;
  }

  update(dt, world) {
    if (!this.alive) return;

        if (this.homing && world) {
      let nearestShip = null;
      let nearestDistance = Infinity;

      for (const ship of world.ofKind("ship")) {
        const distance = Math.hypot(
          ship.pos.x - this.pos.x,
          ship.pos.y - this.pos.y
        );

        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearestShip = ship;
        }
      }

      this.homing.targetId = nearestShip?.id ?? null;
      this.homing.update(this, world, dt);
    }

    super.update(dt);

    this.angle += this.rotationSpeed * dt; //обертання астероїда

    if (world) { //розміри світу
      const width = world.width;
      const height = world.height;

      if (this.pos.x - this.radius < 0) { //відбиття від лівого краю
        this.pos.x = this.radius;
        this.vel.x = Math.abs(this.vel.x);
      }

      if (this.pos.x + this.radius > width) { //відбиття від правого краю
        this.pos.x = width - this.radius;
        this.vel.x = -Math.abs(this.vel.x);
      }

      if (this.pos.y - this.radius < 0) {//відбиття від верхнього краю
        this.pos.y = this.radius;
        this.vel.y = Math.abs(this.vel.y);
      }

      if (this.pos.y + this.radius > height) {//відбиття від нижнього краю
        this.pos.y = height - this.radius;
        this.vel.y = -Math.abs(this.vel.y);
      }
    }
  }

  takeDamage(amount) { //отримання шкоди астероїдом
    if (!this.alive) return false;

    this.hp = Math.max(0, this.hp - amount); //зменшує поточне хп, не дозволяючи йому бути менше 0

    if (this.hp === 0) { //якщо хп досягло 0, знищуємо астероїд
      this.destroy();
      return true;
    }

    return false;
  }
}
