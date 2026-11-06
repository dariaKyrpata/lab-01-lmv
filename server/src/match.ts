import { botInput } from "./bot.ts";
import { randomInt } from "node:crypto";

import { World } from "../../shared/src/sim/world.ts";
import { TICK_RATE } from "../../shared/src/movement.ts";
import { isInput } from "../../shared/src/protocol/messages.ts";

import type { GameSocket } from "./ws.ts";
import type { Room } from "./rooms.ts";
import type { Input, ServerPayload } from "../../shared/src/protocol/messages.ts";
import { ZERO_SEQ } from "../../shared/src/protocol/ids.ts";
import type { Seq } from "../../shared/src/protocol/ids.ts";

type Publish = (socket: GameSocket | undefined, message: ServerPayload) => boolean;

export class Match {
  declare readonly room: Room;
  declare readonly publish: Publish;
  declare readonly world: World;
  declare readonly inputs: Map<string, Input[]>;
  declare readonly lastReceivedSeq: Map<string, Seq>;
  declare readonly lastProcessedSeq: Map<string, Seq>;
  private readonly bots = new Set<string>();
  private readonly tickSamples = new Float64Array(1800);
  private tickSampleCount = 0;
  declare running: boolean;
  declare timer: ReturnType<typeof setTimeout> | null;
  declare nextTick: number;
  declare timing: { tickDurationMs: number; jitterMs: number; maxJitterMs: number; overruns: number };

  constructor(
    room: Room,
    publish: Publish,
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

  addPlayer(playerId: string) {
    if (this.inputs.has(playerId)) {
      return this.world.addPlayer(playerId);
    }

    this.inputs.set(playerId, []);
    this.lastReceivedSeq.set(playerId, ZERO_SEQ);
    this.lastProcessedSeq.set(playerId, ZERO_SEQ);

    return this.world.addPlayer(playerId);
  }

  removePlayer(playerId: string) {
    this.world.removePlayer(playerId);
    this.inputs.delete(playerId);
    this.lastReceivedSeq.delete(playerId);
    this.lastProcessedSeq.delete(playerId);

    if (this.inputs.size === 0) {
      this.stop();
    }
  }

  enqueue(playerId: string, input: unknown) {
    const queue = this.inputs.get(playerId);

    if (!queue || !isInput(input)) {
      return false;
    }

    const lastSeq = this.lastReceivedSeq.get(playerId) ?? ZERO_SEQ;

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

  setBots(count: number) {
    while (this.bots.size > count) {
      const id = [...this.bots].at(-1);
      if (id === undefined) break;
      this.bots.delete(id);
      this.removePlayer(id);
    }
    while (this.bots.size < count) {
      const id = "bot-" + this.bots.size;
      this.addPlayer(id);
      this.bots.add(id);
    }
  }

  step() {
    for (const id of this.bots) {
      const input = botInput(this.world, id);
      if (input) this.enqueue(id, input);
    }
    const commands = new Map<string, Input>();

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
          this.lastProcessedSeq.get(player.id) ?? ZERO_SEQ,
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

      this.tickSamples[this.tickSampleCount % this.tickSamples.length] = this.timing.tickDurationMs;
      this.tickSampleCount++;
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
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }

  getStats() {
    let pendingInputs = 0;

    for (const queue of this.inputs.values()) {
      pendingInputs += queue.length;
    }

    const samples = this.tickSamples.slice(0, Math.min(this.tickSampleCount, this.tickSamples.length)).sort();
    return {
      room: this.room.id,
      bots: this.bots.size,
      tickP99Ms: samples[Math.ceil(samples.length * 0.99) - 1] ?? 0,
      tickMaxMs: samples.at(-1) ?? 0,
      tick: this.world.tick,
      tickRate: TICK_RATE,
      players: this.world.players.size,
      entities: this.world.entities.size,
      pendingInputs,
      ...this.timing,
    };
  }
}