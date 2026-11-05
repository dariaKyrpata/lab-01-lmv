import test from "node:test";
import assert from "node:assert/strict";

import { World } from "../src/sim/world.js";
import { isInput } from "../src/protocol/messages.js";

function createInput(seq) {
  return {
    version: 1,
    type: "input",
    seq,
    tick: seq - 1,
    thrust: seq % 7 !== 0,
    turn: (seq % 3) - 1,
    fire: seq % 2 === 0,
    homing: seq % 100 < 50,
  };
}

test("Same seed and inputs produce the same world", () => {
  const first = new World({ seed: 42 });
  const second = new World({ seed: 42 });
  const unrelated = new World({ seed: 999 });

  first.addPlayer("player-1");
  first.addPlayer("player-2");

  second.addPlayer("player-1");
  second.addPlayer("player-2");

  unrelated.addPlayer("other");

  for (let seq = 1; seq <= 1000; seq++) {
    const inputs = new Map([
      ["player-1", createInput(seq)],
      ["player-2", createInput(seq + 1)],
    ]);

    first.step(inputs);
    unrelated.step();
    second.step(inputs);
  }

  assert.deepEqual(
    first.toSnapshot(),
    second.toSnapshot()
  );
});

test("Restored world continues identically", () => {
  const original = new World({ seed: 123 });

  original.addPlayer("player");

  for (let seq = 1; seq <= 100; seq++) {
    original.step(
      new Map([["player", createInput(seq)]])
    );
  }

  const restored = World.fromSnapshot(
    original.toSnapshot()
  );

  for (let seq = 101; seq <= 300; seq++) {
    const inputs = new Map([
      ["player", createInput(seq)],
    ]);

    original.step(inputs);
    restored.step(inputs);
  }

  assert.deepEqual(
    original.toSnapshot(),
    restored.toSnapshot()
  );
});

test("Changing a snapshot does not change the world", () => {
  const world = new World({ seed: 42 });
  const ship = world.addPlayer("player");

  const originalX = ship.pos.x;
  const snapshot = world.toSnapshot();

  snapshot.entities[0].pos.x = -999;

  assert.equal(ship.pos.x, originalX);
});

test("Input validation rejects invalid commands", () => {
  const input = createInput(1);

  assert.equal(isInput(input), true);

  for (const change of [
    { x: 999 },
    { dt: 10 },
    { seq: 0 },
    { tick: -1 },
    { turn: 1000 },
    { thrust: "yes" },
    { fire: 1 },
  ]) {
    assert.equal(
      isInput({ ...input, ...change }),
      false
    );
  }
});