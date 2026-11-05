import { serverJsonCodec } from "../../shared/src/codec/codec.ts";
export { PROTOCOL_VERSION, MAX_CHAT_LENGTH, MAX_NAME_LENGTH } from "../../shared/src/protocol/messages.ts";

export const MAX_MESSAGE_BYTES = 4096;

export const CLOSE_CODES = {
  INVALID_MESSAGE: 1008,
  TOO_LARGE: 1009,
  JOIN_TIMEOUT: 1008,
  RATE_LIMIT: 1008,
  SERVER_SHUTDOWN: 1001,
};

function invalid(error: string, closeCode = CLOSE_CODES.INVALID_MESSAGE): { ok: false; error: string; closeCode: number } {
  return { ok: false, error, closeCode };
}

export function validateMessage(data: unknown) {
  const text = Buffer.isBuffer(data) ? data.toString("utf8") : data;
  if (typeof text !== "string") return invalid("Unsupported message format");

  if (Buffer.byteLength(text, "utf8") > MAX_MESSAGE_BYTES) {
    return invalid("Message too large", CLOSE_CODES.TOO_LARGE);
  }

  const result = serverJsonCodec.decode(text);
  return result.ok ? result : invalid(result.error);
}
