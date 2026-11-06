import { expect, test } from "vitest";
import { World } from "../src/sim/world.ts";
import { Vector2 } from "../src/sim/vector.ts";
import { Bullet } from "../src/sim/bullet.ts";
import { Asteroid } from "../src/sim/asteroid.ts";
import { Homing } from "../src/sim/homing.ts";
import { createRandom } from "../src/random.ts";
import { circlesCollide, findCollisions } from "../src/sim/collision.ts";
import { DRAG, FIXED_DT, integrate, MAX_SPEED, ROTATION_SPEED, THRUST_POWER } from "../src/movement.ts";

test("addition preserves the source vector", () => {
  const source = new Vector2(2, 3);
  expect(source.add({ x: 4, y: -1 })).toEqual(new Vector2(6, 2));
  expect(source).toEqual(new Vector2(2, 3));
});
test("subtraction is componentwise", () => expect(new Vector2(4, 2).sub({ x: 2, y: 3 })).toEqual(new Vector2(2, -1)));
test("scaling preserves sign", () => expect(new Vector2(2, -3).scale(-2)).toEqual(new Vector2(-4, 6)));
test("length of a 3-4-5 triangle", () => expect(new Vector2(3, 4).length()).toBe(5));
test("normalizing produces unit length", () => expect(new Vector2(5, 12).normalize().length()).toBeCloseTo(1));
test("normalizing the zero vector is finite", () => expect(new Vector2().normalize()).toEqual(new Vector2()));
test("rotation by a quarter turn", () => {
  const result = new Vector2(2, 0).rotate(Math.PI / 2);
  expect(result.x).toBeCloseTo(0);
  expect(result.y).toBeCloseTo(2);
});
test("perpendicular vectors have zero dot product", () => expect(new Vector2(3, 0).dot({ x: 0, y: 2 })).toBe(0));
test("angle vector has unit length", () => expect(Vector2.fromAngle(0.9).length()).toBeCloseTo(1));

const rest = { pos: { x: 10, y: 20 }, vel: { x: 0, y: 0 }, angle: 0 };
test("neutral command preserves a stationary ship", () => {
  expect(integrate(rest, { thrust: false, turn: 0 }, 100, 100).pos).toEqual(rest.pos);
});
test("thrust accelerates before drag", () => {
  const next = integrate(rest, { thrust: true, turn: 0 }, 100, 100);
  expect(next.vel.x).toBeCloseTo(THRUST_POWER * FIXED_DT * DRAG ** 2);
  expect(next.pos.x).toBeCloseTo(10 + next.vel.x * FIXED_DT);
});
test("rotation follows the fixed time step", () => {
  expect(integrate(rest, { thrust: false, turn: -1 }, 100, 100).angle).toBeCloseTo(-ROTATION_SPEED * FIXED_DT);
});
test("speed is capped after drag", () => {
  const next = integrate({ ...rest, vel: { x: 400, y: 300 } }, { thrust: true, turn: 0 }, 100, 100);
  expect(Math.hypot(next.vel.x, next.vel.y)).toBeCloseTo(MAX_SPEED);
});
test("negative position wraps around the arena", () => {
  const next = integrate({ ...rest, pos: { x: 0, y: 0 }, vel: { x: -30, y: -60 } }, { thrust: false, turn: 0 }, 100, 100);
  expect(next.pos.x).toBeGreaterThan(98);
  expect(next.pos.y).toBeGreaterThan(97);
});

test.each([[7, true], [8, true], [8.01, false]])("radius-four bodies at separation %s", (x, expected) => {
  expect(circlesCollide(new Bullet(), new Bullet({ pos: { x, y: 0 } }))).toBe(expected);
});
test("dead bodies do not collide", () => {
  const bullet = new Bullet({ alive: false });
  expect(circlesCollide(bullet, new Bullet())).toBe(false);
});
test("collision pairs are yielded only once", () => {
  const a = new Bullet();
  const b = new Bullet();
  expect([...findCollisions([a, b])]).toEqual([[a, b]]);
});
test("discrete collisions can miss a bullet crossing a ship in one tick", () => {
  const bullet = new Bullet({ pos: { x: 20, y: 50 }, vel: { x: 1800, y: 0 } });
  const asteroid = new Asteroid({ pos: { x: 50, y: 50 }, radius: 8 });
  expect(circlesCollide(bullet, asteroid)).toBe(false);
  bullet.update(FIXED_DT);
  expect(circlesCollide(bullet, asteroid)).toBe(false);
});

test("asteroid reflects at both arena boundaries", () => {
  const rock = new Asteroid({ radius: 5, pos: { x: 1, y: 99 }, vel: { x: -5, y: 3 } });
  rock.update(FIXED_DT, new World({ width: 100, height: 100 }));
  expect(rock.pos).toEqual(new Vector2(5, 95));
  expect(rock.vel).toEqual(new Vector2(5, -3));
});
test("homing starts motion toward a living target", () => {
  const world = new World();
  const target = world.addPlayer("target");
  target.pos = new Vector2(50, 0);
  const bullet = new Bullet({ homing: new Homing({ targetId: target.id, speed: 100 }) });
  bullet.update(FIXED_DT, world);
  expect(bullet.vel.x).toBeCloseTo(100);
  expect(bullet.vel.y).toBeCloseTo(0);
});
test("a pickup shields a ship and is consumed", () => {
  const world = new World();
  const ship = world.addPlayer("player");
  const pickup = world.createPickup();
  expect(pickup.applyTo(ship)).toBe(true);
  expect(pickup.applyTo(ship)).toBe(false);
  expect(ship.shieldTime).toBeGreaterThan(0);
});
test("a ship respawns after its countdown", () => {
  const world = new World();
  const ship = world.addPlayer("player");
  ship.invulnerableTime = 0;
  world.damageShip(ship, 100);
  expect(ship.alive).toBe(false);
  ship.respawnTime = FIXED_DT;
  world.step();
  expect(ship.alive).toBe(true);
  expect(ship.hp).toBe(100);
});
test("leaving removes a player's bullets", () => {
  const world = new World();
  const ship = world.addPlayer("player");
  ship.fire(world);
  expect([...world.ofKind("bullet")]).toHaveLength(1);
  world.removePlayer("player");
  expect([...world.ofKind("bullet")]).toHaveLength(0);
});
test("seeded random streams agree and invalid seeds are rejected", () => {
  const a = createRandom(88);
  const b = createRandom(88);
  expect(Array.from({ length: 20 }, a)).toEqual(Array.from({ length: 20 }, b));
  expect(() => createRandom(1.5)).toThrow(TypeError);
});
