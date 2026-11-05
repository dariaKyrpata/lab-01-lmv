import { Entity } from "./entity.ts";

import { UNSPAWNED_ID } from "../protocol/ids.ts";
import type { PickupSnapshot } from "../protocol/snapshots.ts";
import type { Ship } from "./ship.ts";

export class Pickup extends Entity<"pickup"> {
  declare type: "shield";
  declare duration: number;
  declare ttl: number;
  declare pulse: number;

  constructor({
    id = UNSPAWNED_ID,
    pos,
    angle = 0,
    radius = 12,
    alive = true,
    type = "shield",
    duration = 5,
    ttl = 15,
    pulse = 0,
  }: Partial<PickupSnapshot> = {}) {
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

  update(dt: number) {
    if (!this.alive) {
      return;
    }

    this.ttl -= dt;
    this.pulse += dt * 4;

    if (this.ttl <= 0) {
      this.destroy();
    }
  }

  applyTo(ship: Ship) {
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

  toSnapshot(): PickupSnapshot {
    return {
      ...super.toSnapshot(),
      type: this.type,
      duration: this.duration,
      ttl: this.ttl,
      pulse: this.pulse,
    };
  }

  static fromSnapshot(snapshot: PickupSnapshot) {
    return new Pickup(snapshot);
  }
}