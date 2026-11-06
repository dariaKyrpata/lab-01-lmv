import { expect, test } from "vitest";
import { Prediction } from "../src/prediction.ts";
import { Ship } from "../../shared/src/sim/ship.ts";
import { SeqSchema, ZERO_TICK } from "../../shared/src/protocol/ids.ts";
import { integrate } from "../../shared/src/movement.ts";
import type { InputPayload } from "../../shared/src/protocol/messages.ts";

function input(seq: number): InputPayload {
  return { type: "input", seq: SeqSchema.parse(seq), tick: ZERO_TICK, thrust: true, turn: 0, fire: false, homing: false };
}

test("replays only unacknowledged input from the server state", () => {
  const ship = new Ship({ pos: { x: 50, y: 40 } });
  const prediction = new Prediction();
  prediction.predict(input(1), ship, 100, 100);
  prediction.predict(input(2), ship, 100, 100);
  const authoritative = new Ship({ pos: { x: 51, y: 40 }, angle: ship.angle });
  prediction.reconcile(authoritative, SeqSchema.parse(1), 100, 100);
  expect(prediction.pending).toEqual([input(2)]);
  expect(prediction.currentState?.pos).toEqual(integrate(authoritative, input(2), 100, 100).pos);
});
test("ignores older acknowledgments", () => {
  const ship = new Ship();
  const prediction = new Prediction();
  prediction.reconcile(ship, SeqSchema.parse(2), 100, 100);
  prediction.reconcile(ship, SeqSchema.parse(1), 100, 100);
  expect(prediction.lastAck).toBe(2);
});
test("stops predicting when the server marks the ship dead", () => {
  const ship = new Ship();
  const prediction = new Prediction();
  prediction.predict(input(1), ship, 100, 100);
  ship.destroy();
  expect(prediction.reconcile(ship, SeqSchema.parse(1), 100, 100)).toBeNull();
  expect(prediction.pending).toHaveLength(0);
});
