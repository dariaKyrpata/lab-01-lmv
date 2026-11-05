import { Entity } from "./entity.ts";
import { Vector2 } from "./vector.ts";
import { integrate } from "../movement.ts";
import { NEUTRAL_INPUT } from "../protocol/messages.ts";

export const MAX_HP = 100;

import { UNSPAWNED_ID } from "../protocol/ids.ts";
import type { ShipSnapshot } from "../protocol/snapshots.ts";
import type { ColorId } from "../colors.ts";
import type { Seq } from "../protocol/ids.ts";
import { ZERO_SEQ } from "../protocol/ids.ts";
import type { World, ShotOptions, ShipInput } from "./world.ts";

export class Ship extends Entity<"ship"> {
  declare playerId: string | null;
  declare colorId: ColorId;
  declare score: number;
  declare thrust: boolean;
  declare fireCooldown: number;
  declare shieldTime: number;
  declare invulnerableTime: number;
  declare respawnTime: number;
  declare homingEnabled: boolean;

  #hp: number;

  constructor({
    id = UNSPAWNED_ID,
    playerId = null,
    colorId = "pink",
    pos,
    vel,
    angle = -Math.PI / 2,
    radius = 18,
    alive = true,
    hp = MAX_HP,
    score = 0,
    thrust = false,
    fireCooldown = 0,
    shieldTime = 0,
    invulnerableTime = 0,
    respawnTime = 0,
    homingEnabled = false,
  }: Partial<ShipSnapshot> = {}) {
    super({
      id,
      pos,
      vel,
      angle,
      radius,
      alive,
      kind: "ship",
    });

    this.#hp = Math.max(0, Math.min(MAX_HP, hp));
    this.playerId = playerId;
    this.colorId = colorId;
    this.score = score;
    this.thrust = thrust;
    this.fireCooldown = fireCooldown;
    this.shieldTime = shieldTime;
    this.invulnerableTime = invulnerableTime;
    this.respawnTime = respawnTime;
    this.homingEnabled = homingEnabled;
  }

  get hp() {
    return this.#hp;
  }

  update(dt: number, world?: Pick<World, "width" | "height">, input: ShipInput = NEUTRAL_INPUT) {
    if (!this.alive || !world) {
      return;
    }

    const next = integrate(
      this,
      input,
      world.width,
      world.height,
      dt
    );

    this.pos = new Vector2(next.pos.x, next.pos.y);
    this.vel = new Vector2(next.vel.x, next.vel.y);
    this.angle = next.angle;
    this.thrust = next.thrust;

    this.fireCooldown = Math.max(
      0,
      this.fireCooldown - dt
    );

    this.shieldTime = Math.max(
      0,
      this.shieldTime - dt
    );

    this.invulnerableTime = Math.max(
      0,
      this.invulnerableTime - dt
    );
  }

  fire<T>(world: { createBullet(options: ShotOptions): T } | undefined, inputSeq: Seq = ZERO_SEQ): T | null {
    if (!this.alive || this.fireCooldown > 0 || !world) {
      return null;
    }

    const direction = Vector2.fromAngle(this.angle);

    const bullet = world.createBullet({
      pos: this.pos.add(
        direction.scale(this.radius + 8)
      ),
      vel: this.vel.add(direction.scale(500)),
      ownerId: this.id,
      inputSeq,
    });

    this.fireCooldown = 0.2;

    return bullet;
  }

  takeDamage(amount: number) {
    if (
      !this.alive ||
      this.invulnerableTime > 0 ||
      this.shieldTime > 0 ||
      !Number.isFinite(amount) ||
      amount <= 0
    ) {
      return false;
    }

    this.#hp = Math.max(0, this.#hp - amount);
    this.invulnerableTime = 0.5;

    if (this.#hp === 0) {
      this.destroy();
    }

    return true;
  }

  heal(amount: number) {
    if (!Number.isFinite(amount) || amount <= 0) {
      return;
    }

    this.#hp = Math.min(MAX_HP, this.#hp + amount);
  }

  activateShield(duration = 5) {
    this.shieldTime = Math.max(
      this.shieldTime,
      duration
    );
  }

  respawn(x: number, y: number) {
    this.pos = new Vector2(x, y);
    this.vel = new Vector2();
    this.angle = -Math.PI / 2;
    this.#hp = MAX_HP;
    this.alive = true;
    this.thrust = false;
    this.fireCooldown = 0;
    this.shieldTime = 0;
    this.invulnerableTime = 0;
    this.respawnTime = 0;
  }

  toSnapshot(): ShipSnapshot {
    return {
      ...super.toSnapshot(),
      playerId: this.playerId,
      colorId: this.colorId,
      hp: this.#hp,
      score: this.score,
      thrust: this.thrust,
      fireCooldown: this.fireCooldown,
      shieldTime: this.shieldTime,
      invulnerableTime: this.invulnerableTime,
      respawnTime: this.respawnTime,
      homingEnabled: this.homingEnabled,
    };
  }

  static fromSnapshot(snapshot: ShipSnapshot) {
    return new Ship(snapshot);
  }
}