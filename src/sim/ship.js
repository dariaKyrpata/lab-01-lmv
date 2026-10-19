import { Entity } from "./entity.js";
import { Vector2 } from "./vector.js";

const ROTATION_SPEED = 3.5;
const THRUST_POWER = 240;
const DRAG = 0.99;
const MAX_SPEED = 350;
const MAX_HP = 100;

export class Ship extends Entity {
  #hp = MAX_HP;

  constructor(x, y) {
    super({
      pos: new Vector2(x, y),
      vel: new Vector2(),
      angle: -Math.PI / 2,
      radius: 28,
      kind: "ship",
    });

    this.thrust = false;
    this.input = null;
    this.fireCooldown = 0;
    this.score = 0;
    this.shieldTime = 0;
    this.invulnerableTime = 0;
    this.world = null;
  }

  get hp() {
    return this.#hp;
  }

  update(dt) {
    if (!this.alive) return;

    const input = this.input;

    if (input) {
      if (input.isDown("ArrowLeft")) {
        this.angle -= ROTATION_SPEED * dt;
      }

      if (input.isDown("ArrowRight")) {
        this.angle += ROTATION_SPEED * dt;
      }

      this.thrust = input.isDown("ArrowUp");

      if (this.thrust) {
        const acceleration = Vector2.fromAngle(this.angle).scale(
          THRUST_POWER * dt,
        );

        this.vel = this.vel.add(acceleration);
      }
    }

    this.vel = this.vel.scale(Math.pow(DRAG, dt * 60));

    if (this.vel.length() > MAX_SPEED) {
      this.vel = this.vel.normalize().scale(MAX_SPEED);
    }

    super.update(dt);

    this.fireCooldown = Math.max(0, this.fireCooldown - dt);

    this.shieldTime = Math.max(0, this.shieldTime - dt);

    this.invulnerableTime = Math.max(0, this.invulnerableTime - dt);
  }

  fire() {
    if (!this.alive || this.fireCooldown > 0 || !this.world) {
      return null;
    }

    const direction = Vector2.fromAngle(this.angle);

    const bulletPosition = this.pos.add(direction.scale(this.radius + 8));

    const bulletVelocity = this.vel.add(direction.scale(500));

    const bullet = this.world.createBullet({
      pos: bulletPosition,
      vel: bulletVelocity,
      ownerId: this.id,
    });

    this.fireCooldown = 0.2;

    return bullet;
  }

  takeDamage(amount) {
    if (!this.alive || this.invulnerableTime > 0 || this.shieldTime > 0) {
      return false;
    }

    this.#hp = Math.max(0, this.#hp - amount);

    this.invulnerableTime = 0.5;

    if (this.#hp === 0) {
      this.destroy();
    }

    return true;
  }

  heal(amount) {
    this.#hp = Math.min(MAX_HP, this.#hp + amount);
  }

  activateShield(duration = 5) {
    this.shieldTime = Math.max(this.shieldTime, duration);
  }

  respawn(x, y) {
    this.pos = new Vector2(x, y);
    this.vel = new Vector2();
    this.angle = -Math.PI / 2;

    this.#hp = MAX_HP;
    this.alive = true;
    this.thrust = false;
    this.fireCooldown = 0;
    this.shieldTime = 0;
    this.invulnerableTime = 0;
  }
}
