import { Entity } from "./entity.js";

export class Pickup extends Entity {
  constructor({
    id = 0,
    pos,
    angle = 0,
    radius = 12,
    alive = true,
    type = "shield",
    duration = 5,
    ttl = 15,
    pulse = 0,
  } = {}) {
    super({
      id,
      pos,
      angle,
      radius,
      alive,
      kind: "pickup",
    });

    this.type = type;
    this.duration = duration;
    this.ttl = ttl;
    this.pulse = pulse;
  }

  update(dt) {
    if (!this.alive) {
      return;
    }

    this.ttl -= dt;
    this.pulse += dt * 4;

    if (this.ttl <= 0) {
      this.destroy();
    }
  }

  applyTo(ship) {
    if (
      !this.alive ||
      !ship.alive ||
      this.type !== "shield"
    ) {
      return false;
    }

    ship.activateShield(this.duration);
    this.destroy();

    return true;
  }

  toSnapshot() {
    return {
      ...super.toSnapshot(),
      type: this.type,
      duration: this.duration,
      ttl: this.ttl,
      pulse: this.pulse,
    };
  }

  static fromSnapshot(snapshot) {
    return new Pickup(snapshot);
  }
}