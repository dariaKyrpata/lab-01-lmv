import { Vector2 } from "./vector.js";
import { normalizeAngle } from "../movement.js";

export class Homing {
  constructor({
    targetId = null,
    turnSpeed = 3,
    speed = null,
  } = {}) {
    this.targetId = targetId;
    this.turnSpeed = turnSpeed;
    this.speed = speed;
  }

  update(entity, world, dt) {
    if (!world || this.targetId === null || !entity.alive) {
      return;
    }

    const target = world.get(this.targetId);

    if (!target || !target.alive) {
      return;
    }

    const dx = target.pos.x - entity.pos.x;
    const dy = target.pos.y - entity.pos.y;

    if (dx === 0 && dy === 0) {
      return;
    }

    const currentSpeed = entity.vel.length();
    const targetAngle = Math.atan2(dy, dx);

    if (currentSpeed === 0) {
      entity.vel = Vector2.fromAngle(targetAngle).scale(
        this.speed ?? 100
      );

      entity.angle = targetAngle;
      return;
    }

    const currentAngle = Math.atan2(
      entity.vel.y,
      entity.vel.x
    );

    const difference = normalizeAngle(
      targetAngle - currentAngle
    );

    const maxTurn = this.turnSpeed * dt;

    const turn = Math.max(
      -maxTurn,
      Math.min(maxTurn, difference)
    );

    const angle = normalizeAngle(currentAngle + turn);

    entity.vel = Vector2.fromAngle(angle).scale(
      this.speed ?? currentSpeed
    );

    entity.angle = angle;
  }

  toSnapshot() {
    return {
      targetId: this.targetId,
      turnSpeed: this.turnSpeed,
      speed: this.speed,
    };
  }

  static fromSnapshot(snapshot) {
    return snapshot === null ? null : new Homing(snapshot);
  }
}