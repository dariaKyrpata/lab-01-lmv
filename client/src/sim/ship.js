import { Entity } from "./entity.js";
import { Vector2 } from "./vector.js";
import { emitGameEvent } from "../events.js";

const ROTATION_SPEED = 3.5;
const THRUST_POWER = 240;
const DRAG = 0.99;
const MAX_SPEED = 350;
const MAX_HP = 100;

export class Ship extends Entity {
  #hp = MAX_HP;

  constructor(x, y) { // створення корабля
    super({
      pos: new Vector2(x, y),
      vel: new Vector2(),
      angle: -Math.PI / 2,
      radius: 28,
      kind: "ship",
    });

    this.thrust = false; //двигун вимкнений
    this.input = null; //керування
    this.fireCooldown = 0; //затримка між пострілами
    this.score = 0; //лічильник очок
    this.shieldTime = 0;//час дії щита
    this.invulnerableTime = 0;//тимчасова невразливість
    this.world = null;
  }

  get hp() {
    return this.#hp;
  }

  update(dt) {
    if (!this.alive) return;

    const input = this.input;

    if (input) {
      if (input.isDown("ArrowLeft")) { //поворот вліво
        this.angle -= ROTATION_SPEED * dt;
      }

      if (input.isDown("ArrowRight")) { //поворот вправо
        this.angle += ROTATION_SPEED * dt;
      }

      this.thrust = input.isDown("ArrowUp"); //рух вперед

      if (this.thrust) { //прискорення
        const acceleration = Vector2.fromAngle(this.angle).scale(
          THRUST_POWER * dt,
        );

        this.vel = this.vel.add(acceleration); //збільшення швидкості
      }
    }

    this.vel = this.vel.scale(Math.pow(DRAG, dt * 60)); //зменшення швидкості через опір

    if (this.vel.length() > MAX_SPEED) { //обмеження максимальної швидкості
      this.vel = this.vel.normalize().scale(MAX_SPEED);
    }

    super.update(dt);

    this.fireCooldown = Math.max(0, this.fireCooldown - dt);

    this.shieldTime = Math.max(0, this.shieldTime - dt);

    this.invulnerableTime = Math.max(0, this.invulnerableTime - dt);
  }

  fire() {
    if (!this.alive || this.fireCooldown > 0 || !this.world) { //перевіряє, чи можна стріляти
      return null;
    }

    const direction = Vector2.fromAngle(this.angle); //напрямок кулі

    const bulletPosition = this.pos.add(direction.scale(this.radius + 8)); //позиція кулі

    const bulletVelocity = this.vel.add(direction.scale(500)); //швидкість кулі

    const bullet = this.world.createBullet({ //створення кулі
      pos: bulletPosition,
      vel: bulletVelocity,
      ownerId: this.id, //ід літака
    });

    this.fireCooldown = 0.2;

    emitGameEvent("fired", { shipId: this.id }); // надсилання події після пострілу

    return bullet;
  }

  takeDamage(amount) {
    if (!this.alive || this.invulnerableTime > 0 || this.shieldTime > 0) { //захищений або знищений не отримує шкоди  
      return false;
    }

    this.#hp = Math.max(0, this.#hp - amount); //зменшує здоров'я

    this.invulnerableTime = 0.5; //тимчасова невразливість після отримання шкоди

    if (this.#hp === 0) { // корабель знищений
      this.destroy();
    }

    return true;
  }

  heal(amount) { //відновлення здоров'я корабля
    this.#hp = Math.min(MAX_HP, this.#hp + amount);
  }

  activateShield(duration = 5) { //активація щита на певний час
    this.shieldTime = Math.max(this.shieldTime, duration);
  }

  respawn(x, y) { //відродження корабля після знищення
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
