import { PROTOCOL_VERSION } from "../protocol/messages.js";
import { BinaryWriter, BinaryReader } from "./binaryIO.js";

export const SNAPSHOT_PACKET_TYPE = 2;

const VECTOR = {
  x: "float64",
  y: "float64",
};

const HOMING = {
  targetId: { optional: "uint32" },
  turnSpeed: "float64",
  speed: { optional: "float64" },
};

const PARTICLE = {
  pos: VECTOR,
  vel: VECTOR,
  radius: "float64",
  life: "float64",
};

const BASE_ENTITY = {
  id: "uint32",
  pos: VECTOR,
  vel: VECTOR,
  angle: "angle",
  radius: "float64",
  alive: "boolean",
};

const ENTITY_SCHEMAS = {
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

const EVENT_SCHEMAS = {
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

const UNIONS = {
  entity: {
    field: "kind",
    schemas: ENTITY_SCHEMAS,
  },

  event: {
    field: "type",
    schemas: EVENT_SCHEMAS,
  },
};

const SNAPSHOT_SCHEMA = {
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

function readBoolean(reader) {
  const value = reader.uint8();

  if (value !== 0 && value !== 1) {
    throw new Error("Invalid binary boolean");
  }

  return value === 1;
}

function writeValue(writer, schema, value) {
  if (typeof schema === "string") {
    if (schema === "boolean") {
      if (typeof value !== "boolean") {
        throw new TypeError("Expected a boolean");
      }

      writer.uint8(value ? 1 : 0);
      return;
    }

    const union = UNIONS[schema];

    if (union) {
      const names = Object.keys(union.schemas);
      const name = value[union.field];
      const index = names.indexOf(name);

      if (index < 0) {
        throw new Error("Unknown binary object type");
      }

      writer.uint8(index);
      writeValue(writer, union.schemas[name], value);
      return;
    }

    writer[schema](value);
    return;
  }

  if (schema.optional) {
    const present = value !== null && value !== undefined;

    writer.uint8(present ? 1 : 0);

    if (present) {
      writeValue(writer, schema.optional, value);
    }

    return;
  }

  if (schema.array) {
    if (!Array.isArray(value) || value.length > 65535) {
      throw new RangeError("Invalid binary array");
    }

    writer.uint16(value.length);

    for (const item of value) {
      writeValue(writer, schema.array, item);
    }

    return;
  }

  if (schema.tuple) {
    if (!Array.isArray(value) || value.length !== schema.tuple.length) {
      throw new TypeError("Invalid binary tuple");
    }

    schema.tuple.forEach((type, index) => {
      writeValue(writer, type, value[index]);
    });

    return;
  }

  for (const [key, type] of Object.entries(schema)) {
    writeValue(writer, type, value[key]);
  }
}

function readValue(reader, schema) {
  if (typeof schema === "string") {
    if (schema === "boolean") {
      return readBoolean(reader);
    }

    const union = UNIONS[schema];

    if (union) {
      const names = Object.keys(union.schemas);
      const name = names[reader.uint8()];

      if (name === undefined) {
        throw new Error("Unknown binary object type");
      }

      return {
        [union.field]: name,
        ...readValue(reader, union.schemas[name]),
      };
    }

    return reader[schema]();
  }

  if (schema.optional) {
    return readBoolean(reader)
      ? readValue(reader, schema.optional)
      : null;
  }

  if (schema.array) {
    const count = reader.uint16();
    const result = [];

    for (let index = 0; index < count; index++) {
      result.push(readValue(reader, schema.array));
    }

    return result;
  }

  if (schema.tuple) {
    return schema.tuple.map((type) => readValue(reader, type));
  }

  const result = {};

  for (const [key, type] of Object.entries(schema)) {
    result[key] = readValue(reader, type);
  }

  return result;
}

export function encodeSnapshot(message) {
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

export function decodeSnapshot(data) {
  const reader = new BinaryReader(data);

  if (reader.uint8() !== PROTOCOL_VERSION) {
    throw new Error("Unsupported protocol version");
  }

  if (reader.uint8() !== SNAPSHOT_PACKET_TYPE) {
    throw new Error("Unexpected packet type");
  }

  const message = readValue(reader, SNAPSHOT_SCHEMA);

  reader.finish();

  if (message.tick !== message.state.tick) {
    throw new Error("Snapshot tick mismatch");
  }

  return {
    version: PROTOCOL_VERSION,
    type: "snapshot",
    ...message,
  };
}