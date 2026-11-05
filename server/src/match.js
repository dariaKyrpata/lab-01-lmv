import { randomInt } from "node:crypto";

import { World } from "../../shared/src/sim/world.js";
import { TICK_RATE } from "../../shared/src/movement.js";
import { isInput } from "../../shared/src/protocol/messages.js";

export class Match {
  constructor(
    room,
    publish,
    {
      seed = randomInt(0x100000000),
      autoStart = false,
    } = {}
  ) {
    this.room = room;
    this.publish = publish;
    this.world = new World({ seed });

    this.inputs = new Map();
    this.lastReceivedSeq = new Map();
    this.lastProcessedSeq = new Map();

    this.running = false;
    this.timer = null;
    this.nextTick = 0;

    this.timing = {
      tickDurationMs: 0,
      jitterMs: 0,
      maxJitterMs: 0,
      overruns: 0,
    };

    if (autoStart) {
      this.start();
    }
  }

  addPlayer(playerId) {
    if (this.inputs.has(playerId)) {
      return this.world.addPlayer(playerId);
    }

    this.inputs.set(playerId, []);
    this.lastReceivedSeq.set(playerId, 0);
    this.lastProcessedSeq.set(playerId, 0);

    return this.world.addPlayer(playerId);
  }

  removePlayer(playerId) {
    this.world.removePlayer(playerId);
    this.inputs.delete(playerId);
    this.lastReceivedSeq.delete(playerId);
    this.lastProcessedSeq.delete(playerId);

    if (this.inputs.size === 0) {
      this.stop();
    }
  }

  enqueue(playerId, input) {
    const queue = this.inputs.get(playerId);

    if (!queue || !isInput(input)) {
      return false;
    }

    const lastSeq = this.lastReceivedSeq.get(playerId);

    if (input.seq <= lastSeq) {
      return false;
    }

    this.lastReceivedSeq.set(playerId, input.seq);

    if (queue.length >= 6) {
      queue.shift();
    }

    queue.push({ ...input });

    return true;
  }

  step() {
    const commands = new Map();

    for (const [playerId, queue] of this.inputs) {
      const input = queue.shift();

      if (!input) {
        continue;
      }

      commands.set(playerId, input);

      this.lastProcessedSeq.set(
        playerId,
        input.seq
      );
    }

    this.world.step(commands);

    const state = this.world.toSnapshot();
    const sentAt = performance.now();

    for (const player of this.room.players.values()) {
      this.publish(player.socket, {
        type: "snapshot",
        tick: state.tick,
        sentAt,
        lastProcessedSeq:
          this.lastProcessedSeq.get(player.id) ?? 0,
        state,
      });
    }
  }

  start() {
    if (this.running) {
      return;
    }

    this.running = true;

    const interval = 1000 / TICK_RATE;

    this.nextTick = performance.now() + interval;

    const tick = () => {
      if (!this.running) {
        return;
      }

      const startedAt = performance.now();

      if (startedAt < this.nextTick) {
        this.timer = setTimeout(
          tick,
          this.nextTick - startedAt
        );

        return;
      }

      const jitter = startedAt - this.nextTick;

      this.timing.jitterMs = jitter;
      this.timing.maxJitterMs = Math.max(
        this.timing.maxJitterMs,
        jitter
      );

      this.step();

      const finishedAt = performance.now();

      this.timing.tickDurationMs =
        finishedAt - startedAt;

      this.nextTick += interval;

      if (finishedAt - this.nextTick > interval * 5) {
        this.timing.overruns++;
        this.nextTick = finishedAt + interval;
      }

      this.timer = setTimeout(
        tick,
        Math.max(0, this.nextTick - performance.now())
      );
    };

    this.timer = setTimeout(tick, interval);
  }

  stop() {
    this.running = false;
    clearTimeout(this.timer);
    this.timer = null;
  }

  getStats() {
    let pendingInputs = 0;

    for (const queue of this.inputs.values()) {
      pendingInputs += queue.length;
    }

    return {
      room: this.room.id,
      tick: this.world.tick,
      tickRate: TICK_RATE,
      players: this.world.players.size,
      entities: this.world.entities.size,
      pendingInputs,
      ...this.timing,
    };
  }
}