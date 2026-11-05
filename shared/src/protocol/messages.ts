import { z } from "zod";
import { EntityIdSchema, SeqSchema, TickSchema } from "./ids.ts";
import { ColorIdSchema, WorldSnapshotSchema } from "./snapshots.ts";
import type { ReadonlyData } from "./snapshots.ts";

export const PROTOCOL_VERSION = 1;
export const MAX_CHAT_LENGTH = 500;
export const MAX_NAME_LENGTH = 24;
const version = z.literal(PROTOCOL_VERSION);
const name = z.string().max(MAX_NAME_LENGTH).trim().min(1);
const text = z.string().max(MAX_CHAT_LENGTH).trim().min(1);
const room = z.string().max(100).refine(value => value.trim().length > 0);
const milliseconds = z.number().finite().nonnegative();
const networkSettings = {
  latency: milliseconds.max(500),
  jitter: milliseconds.max(200),
  drop: z.number().min(0).max(0.2),
};

export const NEUTRAL_INPUT = Object.freeze({
  thrust: false,
  turn: 0,
  fire: false,
  homing: false,
});

export const InputSchema = z.strictObject({
  version,
  type: z.literal("input"),
  seq: SeqSchema.refine(value => value > 0),
  tick: TickSchema,
  thrust: z.boolean(),
  turn: z.union([z.literal(-1), z.literal(0), z.literal(1)]),
  fire: z.boolean(),
  homing: z.boolean(),
});

export const ClientMessageSchema = z.discriminatedUnion("type", [
  InputSchema,
  z.strictObject({ version, type: z.literal("join"), room, name, colorId: ColorIdSchema.optional() }),
  z.strictObject({ version, type: z.literal("chat"), text }),
  z.strictObject({ version, type: z.literal("leave") }),
  z.strictObject({ version, type: z.literal("net_ping"), clientTime: milliseconds }),
  z.strictObject({ version, type: z.literal("net_config"), ...networkSettings }),
]);

export const SnapshotSchema = z.strictObject({
  version,
  type: z.literal("snapshot"),
  tick: TickSchema,
  sentAt: milliseconds,
  lastProcessedSeq: SeqSchema,
  state: WorldSnapshotSchema,
}).refine(message => message.tick === message.state.tick, "Snapshot tick mismatch");

const rosterPlayer = z.strictObject({ id: z.string(), name, colorId: ColorIdSchema });
export const RoomSummarySchema = z.strictObject({
  id: z.string(),
  name: z.string(),
  players: z.number().int().nonnegative(),
  maxPlayers: z.number().int().positive(),
  takenColors: z.array(ColorIdSchema),
});

export const ServerMessageSchema = z.discriminatedUnion("type", [
  SnapshotSchema,
  z.strictObject({
    version,
    type: z.literal("joined"),
    playerId: z.string(),
    shipId: EntityIdSchema,
    colorId: ColorIdSchema,
    room,
    seed: z.number().int().min(0).max(0xffffffff),
    width: z.number().positive(),
    height: z.number().positive(),
    tickRate: z.number().int().positive(),
  }),
  z.strictObject({
    version,
    type: z.literal("join_error"),
    code: z.string(),
    message: z.string(),
    room: room.optional(),
    takenColors: z.array(ColorIdSchema).optional(),
  }),
  z.strictObject({ version, type: z.literal("roster"), room, players: z.array(rosterPlayer) }),
  z.strictObject({ version, type: z.literal("chat"), playerId: z.string(), name, text, t: milliseconds }),
  z.strictObject({ version, type: z.literal("net_pong"), clientTime: milliseconds, serverTime: milliseconds }),
  z.strictObject({ version, type: z.literal("net_config"), ...networkSettings }),
]);

export type Input = z.infer<typeof InputSchema>;
export type ClientMessage = z.infer<typeof ClientMessageSchema>;
export type ServerMessage = ReadonlyData<z.infer<typeof ServerMessageSchema>>;
export type Snapshot = ServerMessageOf<"snapshot">;
export type RoomSummary = z.infer<typeof RoomSummarySchema>;
export type ServerMessageOf<K extends ServerMessage["type"]> = Extract<ServerMessage, { type: K }>;
type Payload<T> = T extends { version: number } ? Omit<T, "version"> & { version?: typeof PROTOCOL_VERSION } : never;
export type ClientPayload = Payload<ClientMessage>;
export type ServerPayload = Payload<ServerMessage>;
export type InputPayload = Payload<Input>;
export type SnapshotPayload = Payload<Snapshot>;
export type NetworkSettings = Pick<Extract<ClientMessage, { type: "net_config" }>, "latency" | "jitter" | "drop">;

export function isInput(message: unknown): message is Input {
  return InputSchema.safeParse(message).success;
}

export function parseClientMessage(data: unknown) {
  let value: unknown = data;

  if (typeof data === "string") {
    try {
      value = JSON.parse(data);
    } catch {
      return { ok: false, error: "Invalid JSON" } satisfies { ok: false; error: string };
    }
  }

  const result = ClientMessageSchema.safeParse(value);
  if (!result.success) {
    return { ok: false, error: "Invalid client message" } satisfies { ok: false; error: string };
  }

  return { ok: true, message: result.data } satisfies { ok: true; message: ClientMessage };
}
