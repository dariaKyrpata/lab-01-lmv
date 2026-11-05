import { Vector2 } from "./vector.js";

export class Entity {
  constructor({
    id = 0,
    pos = { x: 0, y: 0 },
    vel = { x: 0, y: 0 },
    angle = 0,
    radius = 10,
    kind = "entity",
    alive = true,
  } = {}) {
    this.id = id;
    this.pos = new Vector2(pos.x, pos.y);
    this.vel = new Vector2(vel.x, vel.y);
    this.angle = angle;
    this.radius = radius;
    this.kind = kind;
    this.alive = alive;
  }

  update(dt) {
    if (!this.alive) {
      return;
    }

    this.pos = this.pos.add(this.vel.scale(dt));
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

  static fromSnapshot(snapshot) {
    return new Entity(snapshot);
  }
}