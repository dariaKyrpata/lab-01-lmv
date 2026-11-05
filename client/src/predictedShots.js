import { FIXED_DT } from "../../shared/src/movement.js";
import { Ship } from "../../shared/src/sim/ship.js";

export class PredictedShots {
  constructor() {
    this.reset();
  }

  reset() {
    this.bullets = new Map();
    this.cooldown = null;
  }

  update(world) {
    for (const [seq, bullet] of this.bullets) {
      bullet.update(FIXED_DT, world);

      if (!bullet.alive) {
        this.bullets.delete(seq);
      }
    }
  }

  predict(input, ship, movement, world) {
    if (!ship?.alive || !movement) {
      this.cooldown = 0;
      return null;
    }

    this.cooldown = Math.max(
      0,
      (this.cooldown ?? ship.fireCooldown) - FIXED_DT
    );

    if (!input.fire || this.cooldown > 0) {
      return null;
    }

    const previewShip = Ship.fromSnapshot({
      ...ship.toSnapshot(),
      ...movement,
      fireCooldown: this.cooldown,
      homingEnabled: input.homing,
    });

    const previewWorld = {
      get(id) {
        return id === previewShip.id
          ? previewShip
          : world.get(id);
      },

      spawn(entity) {
        return entity;
      },

      [Symbol.iterator]() {
        return world[Symbol.iterator]();
      },

      createBullet: world.createBullet,
    };

    const bullet = previewShip.fire(
      previewWorld,
      input.seq
    );

    this.cooldown = previewShip.fireCooldown;

    if (!bullet) {
      return null;
    }

    bullet.update(FIXED_DT, world);
    this.bullets.set(input.seq, bullet);

    return bullet;
  }

  reconcile(world, playerId, lastProcessedSeq, pendingInputs) {
    const shipId = world.players.get(playerId);
    const ship = world.get(shipId);

    for (const seq of this.bullets.keys()) {
      if (seq <= lastProcessedSeq) {
        this.bullets.delete(seq);
      }
    }

    if (!ship?.alive) {
      this.bullets.clear();
      this.cooldown = 0;
      return;
    }

    const previewShip = Ship.fromSnapshot(ship.toSnapshot());

    const previewWorld = {
      createBullet() {
        return {};
      },
    };

    for (const input of pendingInputs) {
      previewShip.fireCooldown = Math.max(
        0,
        previewShip.fireCooldown - FIXED_DT
      );

      if (input.fire) {
        previewShip.fire(previewWorld, input.seq);
      }
    }

    this.cooldown = previewShip.fireCooldown;
  }
}