import { decodeInput, encodeInput } from "./binaryInput.ts";
import { decodeSnapshot, encodeSnapshot } from "./binarySnapshot.ts";
import { decodeJson, encodeJson } from "./json.ts";
import { parseClientMessage } from "../protocol/messages.ts";
import type { ClientPayload, Input, InputPayload, ServerMessage, ServerPayload, Snapshot, SnapshotPayload } from "../protocol/messages.ts";

export interface Codec<Outgoing, Incoming, Wire extends string | ArrayBuffer> {
  encode(message: Outgoing): Wire;
  decode(data: unknown): Incoming;
}

export const clientJsonCodec: Codec<ClientPayload, ServerMessage, string> = {
  encode: encodeJson,
  decode: decodeJson,
};

export const serverJsonCodec: Codec<ServerPayload, ReturnType<typeof parseClientMessage>, string> = {
  encode: encodeJson,
  decode: parseClientMessage,
};

export const clientBinaryCodec: Codec<InputPayload, Snapshot, ArrayBuffer> = {
  encode: encodeInput,
  decode: decodeSnapshot,
};

export const serverBinaryCodec: Codec<SnapshotPayload, Input, ArrayBuffer> = {
  encode: encodeSnapshot,
  decode: decodeInput,
};
