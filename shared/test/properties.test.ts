import { expect, test } from "vitest";
import fc from "fast-check";
import { SeqSchema, TickSchema } from "../src/protocol/ids.ts";
import { InputSchema, parseClientMessage } from "../src/protocol/messages.ts";
import { decodeInput, encodeInput } from "../src/codec/binaryInput.ts";
import { decodeSnapshot, encodeSnapshot } from "../src/codec/binarySnapshot.ts";
import { normalizeAngle, integrate } from "../src/movement.ts";
import { World } from "../src/sim/world.ts";

const inputFields = fc.record({
  seq: fc.integer({ min: 1, max: 0xffffffff }),
  tick: fc.integer({ min: 0, max: 0xffffffff }),
  thrust: fc.boolean(),
  turn: fc.constantFrom(-1, 0, 1),
  fire: fc.boolean(),
  homing: fc.boolean(),
});
const commands = inputFields.map(fields => InputSchema.parse({ ...fields, type: "input", version: 1 }));

test("valid inputs survive binary round trips", () => {
  fc.assert(fc.property(commands, input => { expect(decodeInput(encodeInput(input))).toEqual(input); }));
});
test("input wire size agrees with the protocol layout", () => {
  fc.assert(fc.property(commands, input => { expect(encodeInput(input).byteLength).toBe(12); }));
});
test("snapshot angles survive quantization within half a step", () => {
  fc.assert(fc.property(fc.double({ min: -Math.PI, max: Math.PI, noNaN: true }), angle => {
    const world = new World();
    world.addPlayer("player").angle = angle;
    const decoded = decodeSnapshot(encodeSnapshot({ type: "snapshot", tick: TickSchema.parse(0), sentAt: 0, lastProcessedSeq: SeqSchema.parse(0), state: world.toSnapshot() }));
    const ship = decoded.state.entities[0];
    expect(ship?.kind).toBe("ship");
    expect(Math.abs(normalizeAngle((ship?.angle ?? 0) - angle))).toBeLessThanOrEqual(Math.PI / 65534 + 1e-12);
  }));
});
test("malformed binary frames fail with a controlled error", () => {
  fc.assert(fc.property(fc.uint8Array({ maxLength: 256 }), bytes => {
    const invalid = Uint8Array.of(0xff, ...bytes);
    const truncatedInput = Uint8Array.of(1, 1, ...bytes.subarray(0, 9));
    const truncatedSnapshot = Uint8Array.of(1, 2, ...bytes.subarray(0, 15));
    expect(() => decodeInput(truncatedInput)).toThrow(Error);
    expect(() => decodeSnapshot(truncatedSnapshot)).toThrow(Error);
    expect(() => decodeInput(invalid)).toThrow(Error);
    expect(() => decodeSnapshot(invalid)).toThrow(Error);
  }));
});
test("1000 generated input steps keep a ship in the arena", () => {
  fc.assert(fc.property(fc.array(fc.record({ thrust: fc.boolean(), turn: fc.constantFrom(-1, 0, 1) }), { minLength: 1000, maxLength: 1000 }), inputs => {
    let state = { pos: { x: 0, y: 0 }, vel: { x: 0, y: 0 }, angle: 0, thrust: false };
    for (const input of inputs) {
      state = integrate(state, input, 960, 600);
      if (state.pos.x < 0 || state.pos.x >= 960 || state.pos.y < 0 || state.pos.y >= 600) return false;
    }
    return true;
  }), { numRuns: 30 });
});
test("parser accepts generated messages and rejects corrupted fields", () => {
  fc.assert(fc.property(commands, fc.constantFrom({ turn: 2 }, { fire: "yes" }, { seq: 0 }, { version: 99 }, { x: 12 }), (input, change) => {
    expect(parseClientMessage(JSON.stringify(input))).toEqual({ ok: true, message: input });
    expect(parseClientMessage(JSON.stringify({ ...input, ...change })).ok).toBe(false);
  }));
});

test("empty snapshots use 88 bytes for headers, world scalars and array lengths", () => {
  fc.assert(fc.property(fc.integer({ min: 0, max: 0xffffffff }), seed => {
    const world = new World({ seed });
    const snapshot = { type: "snapshot", tick: world.tick, sentAt: 0, lastProcessedSeq: SeqSchema.parse(0), state: world.toSnapshot() };
    expect(encodeSnapshot({ ...snapshot, type: "snapshot" }).byteLength).toBe(2 + 4 + 8 + 4 + 4 * 4 + 6 * 8 + 3 * 2);
  }));
});
