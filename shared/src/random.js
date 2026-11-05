export function nextRandom(state) {
  state.rngState = (state.rngState + 0x6d2b79f5) >>> 0;

  let value = state.rngState;

  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);

  return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
}

export function createRandom(seed) {
  if (!Number.isInteger(seed)) {
    throw new TypeError("Seed must be an integer");
  }

  const state = {
    rngState: seed >>> 0,
  };

  return function random() {
    return nextRandom(state);
  };
}