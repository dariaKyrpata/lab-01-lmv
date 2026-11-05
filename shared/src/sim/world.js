import { Vector2 } from "./vector.js";
import { Ship } from "./ship.js";
import { Bullet } from "./bullet.js";
import { Asteroid } from "./asteroid.js";
import { Pickup } from "./pickup.js";
import { Explosion } from "./explosion.js";
import { Homing } from "./homing.js";
import { findCollisions } from "./collision.js";
import { nextRandom } from "../random.js";
import {
  FIXED_DT,
  ARENA_WIDTH,
  ARENA_HEIGHT,
} from "../movement.js";
import { NEUTRAL_INPUT } from "../protocol/messages.js";

const ENTITY_TYPES = new Map([
  ["ship", Ship],
  ["bullet", Bullet],
  ["asteroid", Asteroid],
  ["pickup", Pickup],
  ["explosion", Explosion],
]);

export class World {
  constructor({
    seed = 1,
    width = ARENA_WIDTH,
    height = ARENA_HEIGHT,
  } = {}) {
    this.seed = seed >>> 0;
    this.rngState = this.seed;
    this.width = width;
    this.height = height;
    this.tick = 0;
    this.nextId = 1;

    this.entities = new Map();
    this.players = new Map();
    this.events = [];

    this.localPlayerId = null;
    this.asteroidTimer = 0;
    this.pickupTimer = 0;
    this.asteroidSpawnInterval = 3;
    this.pickupSpawnInterval = 15;
  }

  get player() {
    const shipId = this.players.get(this.localPlayerId);
    return this.get(shipId) ?? null;
  }

  get score() {
    return this.player?.score ?? 0;
  }

  get homingEnabled() {
    return this.player?.homingEnabled ?? false;
  }

  *[Symbol.iterator]() {
    yield* this.entities.values();
  }

  *ofKind(kind) {
    for (const entity of this) {
      if (entity.kind === kind && entity.alive) {
        yield entity;
      }
    }
  }

  random() {
    return nextRandom(this);
  }

  get(id) {
    return this.entities.get(id);
  }

  spawn(entity) {
    if (entity.id === 0) {
      entity.id = this.nextId++;
    } else {
      const existing = this.entities.get(entity.id);

      if (existing && existing !== entity) {
        throw new Error("Entity ID already exists");
      }

      this.nextId = Math.max(
        this.nextId,
        entity.id + 1
      );
    }

    this.entities.set(entity.id, entity);

    return entity;
  }

  despawn(id) {
    this.get(id)?.destroy();
  }

  emitEvent(type, detail = {}) {
    this.events.push({
      ...detail,
      type,
      tick: this.tick,
    });
  }

  findSafePosition(radius) {
    const margin = radius + 20;

    const minX = Math.min(margin, this.width / 2);
    const minY = Math.min(margin, this.height / 2);

    const maxX = Math.max(minX, this.width - margin);
    const maxY = Math.max(minY, this.height - margin);

    const obstacles = [...this].filter(
      (entity) =>
        entity.alive &&
        ["ship", "asteroid"].includes(entity.kind)
    );

    let bestPosition = new Vector2(
      this.width / 2,
      this.height / 2
    );

    let bestGap = -Infinity;

    for (let attempt = 0; attempt < 100; attempt++) {
      const position = new Vector2(
        minX + this.random() * (maxX - minX),
        minY + this.random() * (maxY - minY)
      );

      let gap = Infinity;

      for (const obstacle of obstacles) {
        const distance = Math.hypot(
          obstacle.pos.x - position.x,
          obstacle.pos.y - position.y
        );

        gap = Math.min(
          gap,
          distance - obstacle.radius - radius
        );
      }

      if (gap > bestGap) {
        bestGap = gap;
        bestPosition = position;
      }

      if (gap >= 110) {
        return position;
      }
    }

    return bestPosition;
  }

  addPlayer(playerId) {
    if (this.players.has(playerId)) {
      return this.get(this.players.get(playerId));
    }

    const ship = this.spawn(
      new Ship({
        playerId,
        pos: this.findSafePosition(18),
        invulnerableTime: 1,
      })
    );

    this.players.set(playerId, ship.id);

    return ship;
  }

  removePlayer(playerId) {
    const shipId = this.players.get(playerId);

    if (shipId === undefined) {
      return;
    }

    this.entities.delete(shipId);
    this.players.delete(playerId);

    for (const entity of this) {
      if (entity.ownerId === shipId) {
        this.entities.delete(entity.id);
      }
    }
  }

  createBullet({
    pos,
    vel,
    ownerId = null,
    inputSeq = 0,
    homing = null,
  }) {
    let behavior = homing;
    const owner = this.get(ownerId);

    if (owner?.homingEnabled && !behavior) {
      let closest = null;
      let closestDistance = Infinity;

      for (const target of this) {
        if (
          !target.alive ||
          target.id === ownerId ||
          !["ship", "asteroid"].includes(target.kind)
        ) {
          continue;
        }

        const distance = Math.hypot(
          target.pos.x - pos.x,
          target.pos.y - pos.y
        );

        if (distance < closestDistance) {
          closestDistance = distance;
          closest = target;
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

    return this.spawn(
      new Bullet({
        pos,
        vel,
        angle: Math.atan2(vel.y, vel.x),
        ownerId,
        inputSeq,
        homing: behavior,
      })
    );
  }

    createAsteroid() {
    const sizeRoll = this.random();
    const radius = 12 + sizeRoll * 4;
    const pos = this.findSafePosition(radius);
    const angle = this.random() * Math.PI * 2;
    const speed = 6 + this.random() * 8;

    const asteroid = new Asteroid({
      pos,
      vel: Vector2.fromAngle(angle).scale(speed),
      radius,
      hp: Math.ceil((18 + sizeRoll * 20) * 1.5),
      rotationSpeed: (this.random() - 0.5) * 0.3,
    });

    const ships = [...this.ofKind("ship")];

    if (ships.length > 0 && this.random() < 0.15) {
      const index = Math.floor(
        this.random() * ships.length
      );

      asteroid.homing = new Homing({
        targetId: ships[index].id,
        turnSpeed: 0.6,
        speed,
      });
    }

    return this.spawn(asteroid);
  }

  createPickup() {
    return this.spawn(
      new Pickup({
        pos: this.findSafePosition(12),
      })
    );
  }

  createExplosion(pos, color = "#ff9f43") {
    const explosion = Explosion.create({
      pos,
      color,
      random: () => this.random(),
    });

    this.emitEvent("exploded", {
      x: pos.x,
      y: pos.y,
    });

    return this.spawn(explosion);
  }

  damageShip(ship, amount) {
    const damaged = ship.takeDamage(amount);

    if (damaged) {
      this.emitEvent("hit", {
        targetId: ship.id,
      });

      if (!ship.alive) {
        ship.respawnTime = 2;
        this.createExplosion(
          ship.pos,
          "#ff477e"
        );
      }
    }

    return damaged;
  }

  handleCollision(a, b) {
    if (!a.alive || !b.alive) {
      return;
    }

    const bullet =
      a.kind === "bullet"
        ? a
        : b.kind === "bullet"
          ? b
          : null;

    if (bullet) {
      const target = bullet === a ? b : a;

      if (
        target.id === bullet.ownerId ||
        !["ship", "asteroid"].includes(target.kind)
      ) {
        return;
      }

      bullet.destroy();

      if (target.kind === "ship") {
        this.damageShip(target, bullet.damage);

        if (!target.alive) {
          const owner = this.get(bullet.ownerId);

          if (owner) {
            owner.score += 5;
          }
        }
      } else {
        const destroyed = target.takeDamage(
          bullet.damage
        );

        this.emitEvent("hit", {
          targetId: target.id,
        });

        if (destroyed) {
          this.createExplosion(target.pos);

          const owner = this.get(bullet.ownerId);

          if (owner) {
            owner.score += 1;
          }
        }
      }

      return;
    }

    const ship =
      a.kind === "ship"
        ? a
        : b.kind === "ship"
          ? b
          : null;

    if (!ship) {
      return;
    }

    const other = ship === a ? b : a;

    if (other.kind === "asteroid") {
      this.damageShip(ship, 10);
    }

       if (other.kind === "pickup") {
      other.applyTo(ship);
    }
  }

  step(inputs = new Map()) {
    this.tick++;
    this.events = [];

    for (const [playerId, shipId] of this.players) {
      const ship = this.get(shipId);

      if (!ship.alive) {
        ship.respawnTime -= FIXED_DT;

        if (ship.respawnTime <= 0) {
          const position = this.findSafePosition(
            ship.radius
          );

          ship.respawn(position.x, position.y);
        }

        continue;
      }

      const input = inputs.get(playerId) ?? {
        ...NEUTRAL_INPUT,
        homing: ship.homingEnabled,
      };

      ship.homingEnabled = input.homing;
      ship.update(FIXED_DT, this, input);

      if (input.fire) {
        const bullet = ship.fire(
          this,
          input.seq ?? 0
        );

        if (bullet) {
          this.emitEvent("fired", {
            shipId: ship.id,
            bulletId: bullet.id,
          });
        }
      }
    }

    for (const entity of [...this]) {
      if (entity.alive && entity.kind !== "ship") {
        entity.update(FIXED_DT, this);
      }
    }

    for (const [a, b] of findCollisions(this)) {
      this.handleCollision(a, b);
    }

    this.asteroidTimer -= FIXED_DT;

    if (this.asteroidTimer <= 0) {
      if ([...this.ofKind("asteroid")].length < 10) {
        this.createAsteroid();
      }

      this.asteroidTimer = this.asteroidSpawnInterval;
    }

    this.pickupTimer -= FIXED_DT;

    if (this.pickupTimer <= 0) {
      if ([...this.ofKind("pickup")].length < 2) {
        this.createPickup();
      }

      this.pickupTimer = this.pickupSpawnInterval;
    }

    for (const entity of this) {
      if (!entity.alive && entity.kind !== "ship") {
        this.entities.delete(entity.id);
      }
    }
  }

  toSnapshot() {
    return {
      seed: this.seed,
      rngState: this.rngState,
      width: this.width,
      height: this.height,
      tick: this.tick,
      nextId: this.nextId,
      asteroidTimer: this.asteroidTimer,
      pickupTimer: this.pickupTimer,
      asteroidSpawnInterval: this.asteroidSpawnInterval,
      pickupSpawnInterval: this.pickupSpawnInterval,
      players: [...this.players],
      entities: [...this].map(
        (entity) => entity.toSnapshot()
      ),
      events: structuredClone(this.events),
    };
  }

  static fromSnapshot(snapshot) {
    const world = new World({
      seed: snapshot.seed,
      width: snapshot.width,
      height: snapshot.height,
    });

    world.rngState = snapshot.rngState >>> 0;
    world.tick = snapshot.tick;
    world.nextId = snapshot.nextId;
    world.asteroidTimer = snapshot.asteroidTimer;
    world.pickupTimer = snapshot.pickupTimer;

    world.asteroidSpawnInterval =
      snapshot.asteroidSpawnInterval;

    world.pickupSpawnInterval =
      snapshot.pickupSpawnInterval;

    world.players = new Map(snapshot.players);
    world.events = structuredClone(snapshot.events);

    for (const data of snapshot.entities) {
      const EntityType = ENTITY_TYPES.get(data.kind);

      if (!EntityType) {
        throw new Error("Unknown entity kind");
      }

      const entity = EntityType.fromSnapshot(data);

      world.entities.set(entity.id, entity);
    }

    return world;
  }
}
