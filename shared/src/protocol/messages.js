export const PROTOCOL_VERSION = 1;

export const NEUTRAL_INPUT = Object.freeze({
  thrust: false,
  turn: 0,
  fire: false,
  homing: false,
});

const INPUT_FIELDS = new Set([
  "version",
  "type",
  "seq",
  "tick",
  "thrust",
  "turn",
  "fire",
  "homing",
]);

export function isInput(message) {
  if (
    message === null ||
    typeof message !== "object" ||
    Array.isArray(message)
  ) {
    return false;
  }

  return (
    message.version === PROTOCOL_VERSION &&
    message.type === "input" &&
    Number.isSafeInteger(message.seq) &&
    message.seq > 0 &&
    message.seq <= 0xffffffff &&
    Number.isSafeInteger(message.tick) &&
    message.tick >= 0 &&
    message.tick <= 0xffffffff &&
    typeof message.thrust === "boolean" &&
    [-1, 0, 1].includes(message.turn) &&
    typeof message.fire === "boolean" &&
    typeof message.homing === "boolean" &&
    Object.keys(message).every((key) => INPUT_FIELDS.has(key))
  );
}