import { expect, test } from "vitest";
import { World } from "../src/sim/world.ts";
import { Vector2 } from "../src/sim/vector.ts";

test("recycled bullets get a new id and a complete state reset", () => {
  const world = new World();
  const bullet = world.createBullet({ pos: new Vector2(20, 30), vel: new Vector2(40, 50) });
  const old = bullet.toSnapshot();
  bullet.destroy();
  world.step();
  const next = world.createBullet({ pos: new Vector2(40, 50), vel: new Vector2(10, 20) });
  expect(next).toBe(bullet);
  expect(next.id).not.toBe(old.id);
  expect(next.alive).toBe(true);
  expect(next.ttl).toBe(2);
  expect(old.pos).toEqual({ x: 20, y: 30 });
  expect(next.pos).toEqual(new Vector2(40, 50));
});

test("a reused particle cannot mutate an old snapshot", () => {
  const world = new World();
  const first = world.createExplosion(new Vector2(20, 20));
  const particle = first.particles.at(-1);
  const previous = first.toSnapshot();
  first.destroy();
  world.step();
  const second = world.createExplosion(new Vector2(30, 30));
  expect(second.particles[0]).toBe(particle);
  world.step();
  expect(previous.particles[0]?.life).toBe(1);
  expect(previous.particles[0]?.pos).toEqual({ x: 0, y: 0 });
});
