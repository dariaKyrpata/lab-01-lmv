import assert from "node:assert/strict";
import test from "node:test";
import { encodeInput, decodeInput } from "../src/codec/binaryInput.ts";
import { encodeSnapshot, decodeSnapshot } from "../src/codec/binarySnapshot.ts";
import { normalizeAngle } from "../src/movement.ts";
import { World } from "../src/sim/world.ts";

import { SeqSchema, TickSchema } from "../src/protocol/ids.ts";
import type { Input, Snapshot } from "../src/protocol/messages.ts";

test("Binary input preserves the command", () => {
  const input: Input = {
    version: 1,
    type: "input",
    seq: SeqSchema.parse(257),
    tick: TickSchema.parse(100),
    thrust: true,
    turn: -1,
    fire: true,
    homing: false,
  };

  const packet = encodeInput(input);

  assert.equal(packet.byteLength, 12);
  assert.deepEqual(decodeInput(packet), input);
  assert.throws(() => decodeInput(packet.slice(0, -1)));
});

test("Binary snapshot preserves entities and colors within angle precision", () => {
  const world = new World({ seed: 123 });
  const first = world.addPlayer("first");
  const second = world.addPlayer("second");
  first.colorId = "pink";
  second.colorId = "blue";

  world.createAsteroid();
  world.createPickup();
  world.createExplosion(first.pos);

  world.step(new Map([
    ["first", {
      seq: SeqSchema.parse(1),
      thrust: true,
      turn: -1,
      fire: true,
      homing: false,
    }],
  ]));

  const message: Snapshot = {
    version: 1,
    type: "snapshot",
    tick: world.tick,
    sentAt: 100.5,
    lastProcessedSeq: SeqSchema.parse(1),
    state: world.toSnapshot(),
  };

  const packet = encodeSnapshot(message);
  const decoded = decodeSnapshot(packet);

  assert.equal(decoded.state.entities.length, message.state.entities.length);

  const entities = decoded.state.entities.map((entity, index) => {
    const expected = message.state.entities[index];
    assert.ok(expected);
    const error = Math.abs(normalizeAngle(entity.angle - expected.angle));
    assert.ok(error <= Math.PI / (2 * 32767) + 1e-12);
    return { ...entity, angle: expected.angle };
  });

  assert.deepEqual({ ...decoded, state: { ...decoded.state, entities } }, message);
  assert.throws(() => decodeSnapshot(packet.slice(0, -1)));
});