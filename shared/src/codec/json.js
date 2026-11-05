import { PROTOCOL_VERSION } from "../protocol/messages.js";

const encoder = new TextEncoder();

export function encodeJson(message) {
  return JSON.stringify({
    ...message,
    version: PROTOCOL_VERSION,
  });
}

export function decodeJson(text) {
  if (typeof text !== "string") {
    throw new TypeError("Expected JSON text");
  }

  const message = JSON.parse(text);

  if (
    message === null ||
    typeof message !== "object" ||
    Array.isArray(message)
  ) {
    throw new TypeError("Message must be an object");
  }

  if (message.version !== PROTOCOL_VERSION) {
    throw new Error("Unsupported protocol version");
  }

  if (typeof message.type !== "string") {
    throw new TypeError("Message type must be a string");
  }

  return message;
}

export function byteLength(text) {
  return encoder.encode(text).byteLength;
}