import type { Snapshot, SnapshotPayload } from "../protocol/messages.ts";
import { SnapshotSchema } from "../protocol/messages.ts";
import { PROTOCOL_VERSION } from "../protocol/messages.ts";
import { BinaryWriter, BinaryReader } from "./binaryIO.ts";

export const SNAPSHOT_PACKET_TYPE = 2;

type Scalar = "uint8" | "uint16" | "uint32" | "int16" | "float32" | "float64" | "angle" | "text" | "boolean" | "entity" | "event";
type Schema = Scalar | RecordSchema | { optional: Schema } | { array: Schema } | { tuple: readonly Schema[] };
interface RecordSchema { [key: string]: Schema }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const VECTOR: RecordSchema = {
  x: "float64",
  y: "float64",
};

const HOMING: RecordSchema = {
  targetId: { optional: "uint32" },
  turnSpeed: "float64",
  speed: { optional: "float64" },
};

const PARTICLE: RecordSchema = {
  pos: VECTOR,
  vel: VECTOR,
  radius: "float64",
  life: "float64",
};

const BASE_ENTITY: RecordSchema = {
  id: "uint32",
  pos: VECTOR,
  vel: VECTOR,
  angle: "angle",
  radius: "float64",
  alive: "boolean",
};

const ENTITY_SCHEMAS: Record<string, RecordSchema> = {
  ship: {
    ...BASE_ENTITY,
    playerId: { optional: "text" },
    colorId: "text",
    hp: "float64",
    score: "uint32",
    thrust: "boolean",
    fireCooldown: "float64",
    shieldTime: "float64",
    invulnerableTime: "float64",
    respawnTime: "float64",
    homingEnabled: "boolean",
  },

  bullet: {
    ...BASE_ENTITY,
    ownerId: { optional: "uint32" },
    damage: "float64",
    ttl: "float64",
    inputSeq: "uint32",
    homing: { optional: HOMING },
  },

  asteroid: {
    ...BASE_ENTITY,
    hp: "float64",
    maxHp: "float64",
    rotationSpeed: "float64",
    homing: { optional: HOMING },
  },

  pickup: {
    ...BASE_ENTITY,
    type: "text",
    duration: "float64",
    ttl: "float64",
    pulse: "float64",
  },

  explosion: {
    ...BASE_ENTITY,
    color: "text",
    duration: "float64",
    ttl: "float64",
    particles: { array: PARTICLE },
  },
};

const EVENT_SCHEMAS: Record<string, RecordSchema> = {
  fired: {
    tick: "uint32",
    shipId: "uint32",
    bulletId: "uint32",
  },

  hit: {
    tick: "uint32",
    targetId: "uint32",
  },

  exploded: {
    tick: "uint32",
    x: "float64",
    y: "float64",
  },
};

const UNIONS: Record<"entity" | "event", { field: string; schemas: Record<string, RecordSchema> }> = {
  entity: {
    field: "kind",
    schemas: ENTITY_SCHEMAS,
  },

  event: {
    field: "type",
    schemas: EVENT_SCHEMAS,
  },
};

const SNAPSHOT_SCHEMA: RecordSchema = {
  tick: "uint32",
  sentAt: "float64",
  lastProcessedSeq: "uint32",

  state: {
    seed: "uint32",
    rngState: "uint32",
    width: "float64",
    height: "float64",
    tick: "uint32",
    nextId: "uint32",
    asteroidTimer: "float64",
    pickupTimer: "float64",
    asteroidSpawnInterval: "float64",
    pickupSpawnInterval: "float64",

    players: {
      array: {
        tuple: ["text", "uint32"],
      },
    },

    entities: { array: "entity" },
    events: { array: "event" },
  },
};

function readBoolean(reader: BinaryReader) {
  const value = reader.uint8();

  if (value !== 0 && value !== 1) {
    throw new Error("Invalid binary boolean");
  }

  return value === 1;
}

function writeValue(writer: BinaryWriter, schema: Schema, value: unknown) {
  if (typeof schema === "string") {
    if (schema === "boolean") {
      if (typeof value !== "boolean") {
        throw new TypeError("Expected a boolean");
      }

      writer.uint8(value ? 1 : 0);
      return;
    }

    if (schema === "entity" || schema === "event") {
      const union = UNIONS[schema];
      const names = Object.keys(union.schemas);
      if (!isRecord(value)) throw new TypeError("Expected an object");
      const name = value[union.field];
      if (typeof name !== "string") throw new TypeError("Expected a discriminator");
      const layout = union.schemas[name];
      const index = names.indexOf(name);

      if (index < 0 || !layout) {
        throw new Error("Unknown binary object type");
      }

      writer.uint8(index);
      writeValue(writer, layout, value);
      return;
    }

    if (schema === "text") {
      if (typeof value !== "string") throw new TypeError("Expected a string");
      writer.text(value);
    } else {
      if (typeof value !== "number") throw new TypeError("Expected a number");
      writer[schema](value);
    }
    return;
  }

  if ("optional" in schema && schema.optional) {
    const present = value !== null && value !== undefined;

    writer.uint8(present ? 1 : 0);

    if (present) {
      writeValue(writer, schema.optional, value);
    }

    return;
  }

  if ("array" in schema && schema.array) {
    if (!Array.isArray(value) || value.length > 65535) {
      throw new RangeError("Invalid binary array");
    }

    writer.uint16(value.length);

    for (const item of value) {
      writeValue(writer, schema.array, item);
    }

    return;
  }

  if ("tuple" in schema && Array.isArray(schema.tuple)) {
    if (!Array.isArray(value) || value.length !== schema.tuple.length) {
      throw new TypeError("Invalid binary tuple");
    }

    schema.tuple.forEach((type: Schema, index: number) => {
      writeValue(writer, type, value[index]);
    });

    return;
  }

  if (!isRecord(value)) throw new TypeError("Expected an object");

  for (const [key, type] of Object.entries(schema)) {
    writeValue(writer, type, value[key]);
  }
}

function readValue(reader: BinaryReader, schema: Schema): unknown {
  if (typeof schema === "string") {
    if (schema === "boolean") {
      return readBoolean(reader);
    }

    if (schema === "entity" || schema === "event") {
      const union = UNIONS[schema];
      const names = Object.keys(union.schemas);
      const name = names[reader.uint8()];

      if (name === undefined) {
        throw new Error("Unknown binary object type");
      }

      const layout = union.schemas[name];
      if (!layout) throw new Error("Unknown binary object layout");
      const fields = readValue(reader, layout);
      if (!isRecord(fields)) throw new Error("Invalid binary object layout");
      return { [union.field]: name, ...fields };
    }

    return reader[schema]();
  }

  if ("optional" in schema && schema.optional) {
    return readBoolean(reader)
      ? readValue(reader, schema.optional)
      : null;
  }

  if ("array" in schema && schema.array) {
    const count = reader.uint16();
    const result: unknown[] = [];

    for (let index = 0; index < count; index++) {
      result.push(readValue(reader, schema.array));
    }

    return result;
  }

  if ("tuple" in schema && Array.isArray(schema.tuple)) {
    return schema.tuple.map((type: Schema) => readValue(reader, type));
  }

  const result: Record<string, unknown> = {};

  for (const [key, type] of Object.entries(schema)) {
    result[key] = readValue(reader, type);
  }

  return result;
}

export function encodeSnapshot(message: SnapshotPayload): ArrayBuffer {
  if (message.type !== "snapshot") {
    throw new TypeError("Expected a snapshot");
  }

  if (
    message.version !== undefined &&
    message.version !== PROTOCOL_VERSION
  ) {
    throw new Error("Unsupported protocol version");
  }

  const writer = new BinaryWriter();

  writer.uint8(PROTOCOL_VERSION);
  writer.uint8(SNAPSHOT_PACKET_TYPE);

  writeValue(writer, SNAPSHOT_SCHEMA, message);

  return writer.finish();
}

export function decodeSnapshot(data: unknown): Snapshot {
  const reader = new BinaryReader(data);

  if (reader.uint8() !== PROTOCOL_VERSION) {
    throw new Error("Unsupported protocol version");
  }

  if (reader.uint8() !== SNAPSHOT_PACKET_TYPE) {
    throw new Error("Unexpected packet type");
  }

  const message = readValue(reader, SNAPSHOT_SCHEMA);

  reader.finish();

  if (!isRecord(message)) throw new Error("Invalid snapshot layout");
  return SnapshotSchema.parse({ ...message, version: PROTOCOL_VERSION, type: "snapshot" });
}
