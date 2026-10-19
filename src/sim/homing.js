import { Vector2 } from "./vector.js";

export class Homing {
  constructor({ targetId = null, turnSpeed = 3, speed = null } = {}) {
    this.targetId = targetId;
    this.turnSpeed = turnSpeed;
    this.speed = speed;
  }

  update(entity, world, dt) {
    if (!world || this.targetId === null) {
      return;
    }

    const target = world.get(this.targetId);

    if (!target || !target.alive) {
      return;
    }

    const direction = target.pos.sub(entity.pos);

    if (direction.length() === 0) {
      return;
    }

    const desiredDirection = direction.normalize();

    const currentSpeed = entity.vel.length();

    if (currentSpeed === 0) {
      entity.vel = desiredDirection.scale(this.speed ?? 100);
      return;
    }

    const currentAngle = Math.atan2(entity.vel.y, entity.vel.x);

    const targetAngle = Math.atan2(desiredDirection.y, desiredDirection.x);

    let angleDifference = targetAngle - currentAngle;

    angleDifference = Math.atan2(
      Math.sin(angleDifference),
      Math.cos(angleDifference),
    );

    const maxTurn = this.turnSpeed * dt;

    const turn = Math.max(-maxTurn, Math.min(maxTurn, angleDifference));

    const newAngle = currentAngle + turn;

    const newDirection = Vector2.fromAngle(newAngle);

    entity.vel = newDirection.scale(this.speed ?? currentSpeed);
  }
}
