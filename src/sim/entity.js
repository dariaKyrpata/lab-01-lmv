import { Vector2 } from "./vector.js";

export class Entity {//базовий клас
  static #nextId = 1; //приватний лічильник унікалтних ід

  constructor({ // початкові значення для об'єкта
    pos = new Vector2(), 
    vel = new Vector2(), 
    angle = 0,
    radius = 10,
    kind = "entity", 
  } = {}) {
    this.id = Entity.#nextId++; // унікальний ід
    this.pos = pos;
    this.vel = vel;
    this.angle = angle;
    this.radius = radius;
    this.kind = kind;
    this.alive = true;
  }

  update(dt) { // оновлення позиції за швидкістю та часом
    this.pos = this.pos.add(this.vel.scale(dt)); 
  }

  destroy() { // позначає об'єкт як знищений
    this.alive = false;
  }
}
