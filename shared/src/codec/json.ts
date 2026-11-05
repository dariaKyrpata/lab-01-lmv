import { PROTOCOL_VERSION, ServerMessageSchema } from "../protocol/messages.ts";
import type { ClientPayload, ServerPayload, ServerMessage } from "../protocol/messages.ts";

const encoder = new TextEncoder();

export function encodeJson(message: ClientPayload | ServerPayload): string {
  return JSON.stringify({ ...message, version: PROTOCOL_VERSION });
}

export function decodeJson(text: unknown): ServerMessage {
  if (typeof text !== "string") throw new TypeError("Expected JSON text");
  const value: unknown = JSON.parse(text);
  return ServerMessageSchema.parse(value);
}

export function byteLength(text: string) {
  return encoder.encode(text).byteLength;
}
