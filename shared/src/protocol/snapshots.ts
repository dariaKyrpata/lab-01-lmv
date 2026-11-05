import { z } from "zod";
import { EntityIdSchema, SeqSchema, TickSchema, UInt32Schema } from "./ids.ts";

const number = z.number().finite();
const vector = z.strictObject({ x: number, y: number });
export const ColorIdSchema = z.enum(["pink", "blue", "green", "orange"]);

const entity = {
  id: EntityIdSchema,
  pos: vector,
  vel: vector,
  angle: number,
  radius: number.nonnegative(),
  alive: z.boolean(),
};

export const HomingSchema = z.strictObject({
  targetId: EntityIdSchema.nullable(),
  turnSpeed: number.nonnegative(),
  speed: number.nonnegative().nullable(),
});

export const ShipSchema = z.strictObject({
  ...entity,
  kind: z.literal("ship"),
  playerId: z.string().nullable(),
  colorId: ColorIdSchema,
  hp: number.min(0).max(100),
  score: UInt32Schema,
  thrust: z.boolean(),
  fireCooldown: number,
  shieldTime: number,
  invulnerableTime: number,
  respawnTime: number,
  homingEnabled: z.boolean(),
});

export const BulletSchema = z.strictObject({
  ...entity,
  kind: z.literal("bullet"),
  ownerId: EntityIdSchema.nullable(),
  damage: number,
  ttl: number,
  inputSeq: SeqSchema,
  homing: HomingSchema.nullable(),
});

export const AsteroidSchema = z.strictObject({
  ...entity,
  kind: z.literal("asteroid"),
  hp: number,
  maxHp: number,
  rotationSpeed: number,
  homing: HomingSchema.nullable(),
});

export const PickupSchema = z.strictObject({
  ...entity,
  kind: z.literal("pickup"),
  type: z.literal("shield"),
  duration: number,
  ttl: number,
  pulse: number,
});

export const ParticleSchema = z.strictObject({
  pos: vector,
  vel: vector,
  radius: number,
  life: number,
});

export const ExplosionSchema = z.strictObject({
  ...entity,
  kind: z.literal("explosion"),
  color: z.string(),
  duration: number,
  ttl: number,
  particles: z.array(ParticleSchema),
});

export const EntitySnapshotSchema = z.discriminatedUnion("kind", [
  ShipSchema, BulletSchema, AsteroidSchema, PickupSchema, ExplosionSchema,
]);

export const GameEventSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("fired"), tick: TickSchema, shipId: EntityIdSchema, bulletId: EntityIdSchema }),
  z.strictObject({ type: z.literal("hit"), tick: TickSchema, targetId: EntityIdSchema }),
  z.strictObject({ type: z.literal("exploded"), tick: TickSchema, x: number, y: number }),
]);

export const WorldSnapshotSchema = z.strictObject({
  seed: UInt32Schema,
  rngState: UInt32Schema,
  width: number.positive(),
  height: number.positive(),
  tick: TickSchema,
  nextId: UInt32Schema,
  asteroidTimer: number,
  pickupTimer: number,
  asteroidSpawnInterval: number.positive(),
  pickupSpawnInterval: number.positive(),
  players: z.array(z.tuple([z.string(), EntityIdSchema])),
  entities: z.array(EntitySnapshotSchema),
  events: z.array(GameEventSchema),
});

export type ReadonlyData<T> = T extends string | number | boolean | null | undefined
  ? T
  : { readonly [K in keyof T]: ReadonlyData<T[K]> };

export type HomingSnapshot = ReadonlyData<z.infer<typeof HomingSchema>>;
export type ShipSnapshot = ReadonlyData<z.infer<typeof ShipSchema>>;
export type BulletSnapshot = ReadonlyData<z.infer<typeof BulletSchema>>;
export type AsteroidSnapshot = ReadonlyData<z.infer<typeof AsteroidSchema>>;
export type PickupSnapshot = ReadonlyData<z.infer<typeof PickupSchema>>;
export type ParticleSnapshot = ReadonlyData<z.infer<typeof ParticleSchema>>;
export type ExplosionSnapshot = ReadonlyData<z.infer<typeof ExplosionSchema>>;
export type EntitySnapshot = ShipSnapshot | BulletSnapshot | AsteroidSnapshot | PickupSnapshot | ExplosionSnapshot;
export type EntityKind = EntitySnapshot["kind"];
export type GameEvent = ReadonlyData<z.infer<typeof GameEventSchema>>;
export type WorldSnapshot = ReadonlyData<z.infer<typeof WorldSnapshotSchema>>;
