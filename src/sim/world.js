import { Vector2 } from "./vector.js";
import { Ship } from "./ship.js";
import { Bullet } from "./bullet.js";
import { Asteroid } from "./asteroid.js";
import { Pickup } from "./pickup.js";
import { Explosion } from "./explosion.js";
import { Homing } from "./homing.js";
import { findCollisions } from "./collision.js";

export class World {
  #entities = new Map();
  #pendingSpawns = [];

  constructor(width, height) {
    this.width = width;
    this.height = height;

    this.score = 0;
    this.player = null;

    this.respawnTimer = null;
    this.asteroidTimer = 0;
    this.pickupTimer = 0;
    this.homingEnabled = false;
  }

  spawn(entity) {
    if (entity.alive) {
      this.#pendingSpawns.push(entity);
    }

    return entity;
  }

  despawn(id) {
    const entity = this.get(id);

    if (entity) {
      entity.destroy();
    }
  }

  get(id) {
    return this.#entities.get(id);
  }

  *[Symbol.iterator]() {
    yield* this.#entities.values();
  }

  *ofKind(kind) {
    for (const entity of this) {
      if (entity.kind === kind && entity.alive) {
        yield entity;
      }
    }
  }

  #flushSpawns() {
    for (const entity of this.#pendingSpawns) {
      if (entity.alive) {
        this.#entities.set(entity.id, entity);
      }
    }

    this.#pendingSpawns.length = 0;
  }

  #sweep() {
    for (const [id, entity] of this.#entities) {
      if (!entity.alive) {
        this.#entities.delete(id);
      }
    }
  }

  createPlayer(input) {
    const ship = new Ship(this.width / 2, this.height / 2);

    ship.input = input;
    ship.world = this;

    this.player = ship;
    this.spawn(ship);
    this.#flushSpawns();

    return ship;
  }

  createBullet({ pos, vel, ownerId = null, homing = null }) {
    let behavior = homing;

    if (this.homingEnabled && ownerId === this.player?.id && !behavior) {
      let closest = null;
      let closestDistance = Infinity;

      for (const asteroid of this.ofKind("asteroid")) {
        const distance = asteroid.pos.sub(pos).length();

        if (distance < closestDistance) {
          closestDistance = distance;
          closest = asteroid;
        }
      }

      if (closest) {
        behavior = new Homing({
          targetId: closest.id,
          turnSpeed: 5,
          speed: 500,
        });
      }
    }

    const bullet = new Bullet({
      pos,
      vel,
      ownerId,
      homing: behavior,
    });

    return this.spawn(bullet);
  }

  createAsteroid() {
    const radius = 18 + Math.random() * 20;

    const x = radius + Math.random() * Math.max(0, this.width - radius * 2);

    const y = radius + Math.random() * Math.max(0, this.height - radius * 2);

    const pos = new Vector2(x, y);

    const angle = Math.random() * Math.PI * 2;
    const speed = 20 + Math.random() * 30;

    const asteroid = new Asteroid({
      pos,
      vel: Vector2.fromAngle(angle).scale(speed),
      radius,
      hp: Math.ceil(radius * 1.5),
    });

    if (this.player?.alive && Math.random() < 0.15) {
      asteroid.homing = new Homing({
        targetId: this.player.id,
        turnSpeed: 0.6,
        speed,
      });
    }

    return this.spawn(asteroid);
  }

  createPickup() {
    const pickup = new Pickup({
      pos: new Vector2(
        30 + Math.random() * Math.max(0, this.width - 60),
        30 + Math.random() * Math.max(0, this.height - 60),
      ),
    });

    return this.spawn(pickup);
  }

  createExplosion(pos, color = "#ff9f43") {
    const explosion = new Explosion({
      pos: new Vector2(pos.x, pos.y),
      color,
    });

    return this.spawn(explosion);
  }

  #handleCollision(a, b) {
    if (!a.alive || !b.alive) {
      return;
    }

    const bullet = a.kind === "bullet" ? a : b.kind === "bullet" ? b : null;

    if (bullet) {
      const target = bullet === a ? b : a;

      if (target.id === bullet.ownerId) {
        return;
      }

      if (target.kind === "asteroid") {
        const destroyed = target.takeDamage(bullet.damage);

        bullet.destroy();

        if (destroyed) {
          this.score += 100;
          this.createExplosion(target.pos);
        }

        return;
      }

      if (target.kind === "ship") {
        const damaged = target.takeDamage(bullet.damage);

        bullet.destroy();

        if (damaged && !target.alive) {
          this.createExplosion(target.pos, "#ff477e");
        }

        return;
      }

      return;
    }

    const ship = a.kind === "ship" ? a : b.kind === "ship" ? b : null;

    if (!ship) {
      return;
    }

    const other = ship === a ? b : a;

    if (other.kind === "pickup") {
      if (other.applyTo(ship)) {
        this.score += 25;
      }

      return;
    }

    if (other.kind === "asteroid") {
      const damaged = ship.takeDamage(10);

      if (damaged && !ship.alive) {
        this.createExplosion(ship.pos, "#ff477e");
      }
    }
  }

  #findSafeRespawnPosition() {
    const shipRadius = this.player?.radius ?? 28;
    const padding = 20;
    const safeGap = 110;

    const margin = shipRadius + padding;

    const minX = Math.min(margin, this.width / 2);

    const maxX = Math.max(minX, this.width - margin);

    const minY = Math.min(margin, this.height / 2);

    const maxY = Math.max(minY, this.height - margin);

    const asteroids = [...this.ofKind("asteroid")];

    let bestPosition = new Vector2(this.width / 2, this.height / 2);

    let bestClearance = -Infinity;

    for (let attempt = 0; attempt < 200; attempt++) {
      const position = new Vector2(
        minX + Math.random() * (maxX - minX),
        minY + Math.random() * (maxY - minY),
      );

      let clearance = Infinity;

      for (const asteroid of asteroids) {
        const distance = asteroid.pos.sub(position).length();

        const availableSpace = distance - asteroid.radius - shipRadius;

        clearance = Math.min(clearance, availableSpace);
      }

      if (clearance > bestClearance) {
        bestClearance = clearance;
        bestPosition = position;
      }

      if (clearance >= safeGap) {
        return position;
      }
    }

    return bestPosition;
  }

  #updateRespawn(dt) {
    if (!this.player || this.player.alive) {
      this.respawnTimer = null;
      return;
    }

    if (this.respawnTimer === null) {
      this.respawnTimer = 2;
    }

    this.respawnTimer -= dt;

    if (this.respawnTimer <= 0) {
      const position = this.#findSafeRespawnPosition();

      this.player.respawn(position.x, position.y);

      this.spawn(this.player);
      this.respawnTimer = null;
    }
  }

  #wrapShip(ship) {
    const { width, height } = this;

    if (width > 0) {
      ship.pos.x = ((ship.pos.x % width) + width) % width;
    }

    if (height > 0) {
      ship.pos.y = ((ship.pos.y % height) + height) % height;
    }
  }

  step(dt, input = null) {
    this.#flushSpawns();

    if (this.player?.alive && input) {
      this.player.input = input;

      if (input.isDown("Space")) {
        this.player.fire();
      }

      if (input.justPressed("KeyF")) {
        this.player.fire();
      }

      if (input.justPressed("KeyH")) {
        this.homingEnabled = !this.homingEnabled;
      }
    }

    for (const entity of this) {
      if (!entity.alive) {
        continue;
      }

      entity.update(dt, this);

      if (entity.kind === "ship") {
        this.#wrapShip(entity);
      }
    }

    for (const [a, b] of findCollisions(this)) {
      this.#handleCollision(a, b);
    }

    this.#updateRespawn(dt);

    // Asteroid spawning
    this.asteroidTimer -= dt;

    if (this.asteroidTimer <= 0) {
      const asteroidCount = [...this.ofKind("asteroid")].length;

      if (asteroidCount < 4) {
        this.createAsteroid();
      }

      this.asteroidTimer = 4;
    }

    // Shield pickup spawning
    this.pickupTimer -= dt;

    if (this.pickupTimer <= 0) {
      const pickupCount = [...this.ofKind("pickup")].length;

      if (pickupCount < 2) {
        this.createPickup();
      }

      this.pickupTimer = 10;
    }

    this.#sweep();
    this.#flushSpawns();
  }
}
