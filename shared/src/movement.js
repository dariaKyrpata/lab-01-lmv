export const TICK_RATE = 30;
export const FIXED_DT = 1 / TICK_RATE;

export const ARENA_WIDTH = 960;
export const ARENA_HEIGHT = 600;

export const ROTATION_SPEED = 3.5;
export const THRUST_POWER = 190;
export const MAX_SPEED = 280;
export const DRAG = 0.99;

export function normalizeAngle(angle) {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

export function wrap(value, size) {
  return ((value % size) + size) % size;
}

export function integrate(
  state,
  input,
  width,
  height,
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

  return {
    ...state,
    angle,
    thrust: input.thrust,
    pos: {
      x: wrap(state.pos.x + vx * dt, width),
      y: wrap(state.pos.y + vy * dt, height),
    },
    vel: {
      x: vx,
      y: vy,
    },
  };
}