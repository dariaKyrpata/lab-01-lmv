import { normalizeAngle } from "../movement.ts";

import type { HomingSnapshot, EntityKind } from "../protocol/snapshots.ts";
import type { EntityId } from "../protocol/ids.ts";
import type { Entity } from "./entity.ts";

type TargetWorld = {
  get(id: EntityId): Pick<Entity<EntityKind>, "pos" | "alive"> | undefined;
};

export class Homing {
  declare targetId: EntityId | null;
  declare turnSpeed: number;
  declare speed: number | null;

  constructor({
    targetId = null,
    turnSpeed = 3,
    speed = null,
  }: Partial<HomingSnapshot> = {}) {
    this.targetId = targetId;
    this.turnSpeed = turnSpeed;
    this.speed = speed;
  }

  update(entity: Entity<EntityKind>, world: TargetWorld | undefined, dt: number) {
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
      const speed = this.speed ?? 100;
      entity.setVelocity(Math.cos(targetAngle) * speed, Math.sin(targetAngle) * speed);

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

    const speed = this.speed ?? currentSpeed;
    entity.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);

    entity.angle = angle;
  }

  toSnapshot(): HomingSnapshot {
    return {
      targetId: this.targetId,
      turnSpeed: this.turnSpeed,
      speed: this.speed,
    };
  }

  static fromSnapshot(snapshot: HomingSnapshot | null) {
    return snapshot === null ? null : new Homing(snapshot);
  }
}