import { Entity } from "./entity.ts";
import { Homing } from "./homing.ts";

import { UNSPAWNED_ID } from "../protocol/ids.ts";
import type { BulletSnapshot, HomingSnapshot } from "../protocol/snapshots.ts";
import type { World } from "./world.ts";
import type { EntityId, Seq } from "../protocol/ids.ts";
import { ZERO_SEQ } from "../protocol/ids.ts";

type BulletOptions = Partial<Omit<BulletSnapshot, "homing">> & { homing?: Homing | HomingSnapshot | null };

export class Bullet extends Entity<"bullet"> {
  declare ownerId: EntityId | null;
  declare damage: number;
  declare ttl: number;
  declare inputSeq: Seq;
  declare homing: Homing | null;

  constructor(options: BulletOptions = {}) {
    super({ kind: "bullet" });
    this.reset(options);
  }

  reset({
    id = UNSPAWNED_ID,
    pos,
    vel,
    angle = 0,
    radius = 4,
    alive = true,
    ownerId = null,
    damage = 25,
    ttl = 2,
    homing = null,
    inputSeq = ZERO_SEQ,
  }: BulletOptions) {
    this.id = id;
    this.setPosition(pos?.x ?? 0, pos?.y ?? 0);
    this.setVelocity(vel?.x ?? 0, vel?.y ?? 0);
    this.angle = angle;
    this.radius = radius;
    this.alive = alive;
    this.ownerId = ownerId;
    this.damage = damage;
    this.ttl = ttl;
    this.inputSeq = inputSeq;

    this.homing =
      homing instanceof Homing
        ? homing
        : homing === null
          ? null
          : Homing.fromSnapshot(homing);
  }

  update(dt: number, world?: Pick<World, "get">) {
    if (!this.alive) {
      return;
    }

    if (this.homing) {
      this.homing.update(this, world, dt);
    }

    super.update(dt);

    if (this.vel.length() > 0) {
      this.angle = Math.atan2(
        this.vel.y,
        this.vel.x
      );
    }

    this.ttl -= dt;

    if (this.ttl <= 0) {
      this.destroy();
    }
  }

  toSnapshot(): BulletSnapshot {
    return {
      ...super.toSnapshot(),
      ownerId: this.ownerId,
      damage: this.damage,
      ttl: this.ttl,
      inputSeq: this.inputSeq,
      homing: this.homing
        ? this.homing.toSnapshot()
        : null,
    };
  }

  static fromSnapshot(snapshot: BulletSnapshot) {
    return new Bullet(snapshot);
  }
}