import { FIXED_DT } from "../../shared/src/movement.ts";
import { Ship } from "../../shared/src/sim/ship.ts";

import type { World, SimEntity } from "../../shared/src/sim/world.ts";
import type { Bullet } from "../../shared/src/sim/bullet.ts";
import type { EntityId, Seq } from "../../shared/src/protocol/ids.ts";
import type { InputPayload } from "../../shared/src/protocol/messages.ts";
import type { Prediction } from "./prediction.ts";

export class PredictedShots {
  declare bullets: Map<Seq, Bullet>;
  declare cooldown: number | null;

  constructor() {
    this.reset();
  }

  reset() {
    this.bullets = new Map();
    this.cooldown = null;
  }

  update(world: World) {
    for (const [seq, bullet] of this.bullets) {
      bullet.update(FIXED_DT, world);

      if (!bullet.alive) {
        this.bullets.delete(seq);
      }
    }
  }

  predict(input: InputPayload, ship: Ship | null, movement: Prediction["currentState"], world: World) {
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
      get(id: EntityId) {
        return id === previewShip.id
          ? previewShip
          : world.get(id);
      },

      spawn<T extends SimEntity>(entity: T): T {
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

  reconcile(world: World, playerId: string | null, lastProcessedSeq: Seq, pendingInputs: readonly InputPayload[]) {
    const ship = world.getPlayer(playerId);

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