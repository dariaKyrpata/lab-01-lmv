import assert from "node:assert/strict";
import test from "node:test";
import { encodeInput, decodeInput } from "../src/codec/binaryInput.js";
import { encodeSnapshot, decodeSnapshot } from "../src/codec/binarySnapshot.js";
import { normalizeAngle } from "../src/movement.js";
import { World } from "../src/sim/world.js";

test("Binary input preserves the command", () => {
  const input = {
    version: 1,
    type: "input",
    seq: 257,
    tick: 100,
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
      seq: 1,
      thrust: true,
      turn: -1,
      fire: true,
      homing: false,
    }],
  ]));

  const message = {
    version: 1,
    type: "snapshot",
    tick: world.tick,
    sentAt: 100.5,
    lastProcessedSeq: 1,
    state: world.toSnapshot(),
  };

  const packet = encodeSnapshot(message);
  const decoded = decodeSnapshot(packet);

  assert.equal(decoded.state.entities.length, message.state.entities.length);

  for (const [index, entity] of decoded.state.entities.entries()) {
    const expectedAngle = message.state.entities[index].angle;
    const error = Math.abs(normalizeAngle(entity.angle - expectedAngle));

    assert.ok(error <= Math.PI / (2 * 32767) + 1e-12);
    entity.angle = expectedAngle;
  }

  assert.deepEqual(decoded, message);
  assert.throws(() => decodeSnapshot(packet.slice(0, -1)));
});