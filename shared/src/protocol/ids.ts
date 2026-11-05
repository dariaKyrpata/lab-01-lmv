import { z } from "zod";

export const UInt32Schema = z.number().int().min(0).max(0xffffffff);
export const EntityIdSchema = UInt32Schema.brand<"EntityId">();
export const TickSchema = UInt32Schema.brand<"Tick">();
export const SeqSchema = UInt32Schema.brand<"Seq">();

export type EntityId = z.infer<typeof EntityIdSchema>;
export type Tick = z.infer<typeof TickSchema>;
export type Seq = z.infer<typeof SeqSchema>;

export const UNSPAWNED_ID = EntityIdSchema.parse(0);
export const ZERO_TICK = TickSchema.parse(0);
export const ZERO_SEQ = SeqSchema.parse(0);
