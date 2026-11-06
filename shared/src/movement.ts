import type { Vec2 } from "./sim/vector.ts";

export interface MovementState {
  readonly pos: Vec2;
  readonly vel: Vec2;
  readonly angle: number;
}

export interface MovementInput {
  readonly thrust: boolean;
  readonly turn: number;
}

export const TICK_RATE = 30;
export const FIXED_DT = 1 / TICK_RATE;

export const ARENA_WIDTH = 960;
export const ARENA_HEIGHT = 600;

export const ROTATION_SPEED = 3.5;
export const THRUST_POWER = 190;
export const MAX_SPEED = 280;
export const DRAG = 0.99;

export function normalizeAngle(angle: number) {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

export function wrap(value: number, size: number) {
  return ((value % size) + size) % size;
}

export interface MutableMovement {
  pos: { x: number; y: number };
  vel: { x: number; y: number };
  angle: number;
  thrust: boolean;
}

export function integrate(
  state: MovementState,
  input: MovementInput,
  width: number,
  height: number,
  dt = FIXED_DT
) {
  const next = { ...state, pos: { x: 0, y: 0 }, vel: { x: 0, y: 0 }, thrust: input.thrust };
  integrateInto(state, input, width, height, next, dt);
  return next;
}

export function integrateInto(
  state: MovementState,
  input: MovementInput,
  width: number,
  height: number,
  out: MutableMovement,
  dt = FIXED_DT
) {
  const angle = normalizeAngle(
    state.angle + input.turn * ROTATION_SPEED * dt
  );

  let vx = state.vel.x;
  let vy = state.vel.y;

  if (input.thrust) {
    vx += Math.cos(angle) * THRUST_POWER * dt;
    vy += Math.sin(angle) * THRUST_POWER * dt;
  }

  const drag = Math.pow(DRAG, dt * 60);

  vx *= drag;
  vy *= drag;

  const speed = Math.hypot(vx, vy);

  if (speed > MAX_SPEED) {
    vx *= MAX_SPEED / speed;
    vy *= MAX_SPEED / speed;
  }

  out.pos.x = wrap(state.pos.x + vx * dt, width);
  out.pos.y = wrap(state.pos.y + vy * dt, height);
  out.vel.x = vx;
  out.vel.y = vy;
  out.angle = angle;
  out.thrust = input.thrust;
}