import {
  PROTOCOL_VERSION,
  isInput,
} from "../protocol/messages.js";

export const INPUT_PACKET_TYPE = 1;
export const INPUT_PACKET_BYTES = 12;

function createView(data) {
  if (data instanceof ArrayBuffer) {
    return new DataView(data);
  }

  if (ArrayBuffer.isView(data)) {
    return new DataView(
      data.buffer,
      data.byteOffset,
      data.byteLength
    );
  }

  throw new TypeError("Expected binary data");
}

export function encodeInput(message) {
  const input = {
    ...message,
    version: message.version === undefined
      ? PROTOCOL_VERSION
      : message.version,
  };

  if (!isInput(input)) {
    throw new TypeError("Invalid input");
  }

  const buffer = new ArrayBuffer(INPUT_PACKET_BYTES);
  const view = new DataView(buffer);

  let flags = 0;

  if (input.thrust) {
    flags |= 1;
  }

  if (input.fire) {
    flags |= 2;
  }

  if (input.homing) {
    flags |= 4;
  }

  view.setUint8(0, PROTOCOL_VERSION);
  view.setUint8(1, INPUT_PACKET_TYPE);
  view.setUint32(2, input.seq, true);
  view.setUint32(6, input.tick, true);
  view.setInt8(10, input.turn);
  view.setUint8(11, flags);

  return buffer;
}

export function decodeInput(data) {
  const view = createView(data);

  if (view.byteLength !== INPUT_PACKET_BYTES) {
    throw new RangeError("Invalid input packet size");
  }

  if (view.getUint8(0) !== PROTOCOL_VERSION) {
    throw new Error("Unsupported protocol version");
  }

  if (view.getUint8(1) !== INPUT_PACKET_TYPE) {
    throw new Error("Unexpected packet type");
  }

  const flags = view.getUint8(11);

  if ((flags & ~7) !== 0) {
    throw new Error("Unknown input flags");
  }

  const input = {
    version: PROTOCOL_VERSION,
    type: "input",
    seq: view.getUint32(2, true),
    tick: view.getUint32(6, true),
    turn: view.getInt8(10),
    thrust: (flags & 1) !== 0,
    fire: (flags & 2) !== 0,
    homing: (flags & 4) !== 0,
  };

  if (!isInput(input)) {
    throw new TypeError("Invalid binary input");
  }

  return input;
}