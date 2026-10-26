import { Entity } from "./entity.js";
import { Vector2 } from "./vector.js";

export class Pickup extends Entity {
  constructor({
    pos = new Vector2(),
    type = "shield",
    duration = 5, //тривалість 
    ttl = 15, //час існування на полі
  } = {}) {
    super({
      pos,
      vel: new Vector2(), ///він нерухомий
      radius: 12,
      kind: "pickup",
    });

    this.type = type;
    this.duration = duration;
    this.ttl = ttl;
    this.pulse = 0; //анімація
  }

  update(dt) {
    if (!this.alive) return;

    this.ttl -= dt;
    this.pulse += dt * 4;

    if (this.ttl <= 0) {
      this.destroy();
    }
  }

  applyTo(ship) { //застосування бонусу до корабля
    if (!this.alive || !ship.alive) {
      return false;
    }

    if (this.type === "shield") {
      ship.activateShield(this.duration);
    } else {
      return false;
    }

    this.destroy(); //прибираємо бонус після застосування

    return true;
  }
}
