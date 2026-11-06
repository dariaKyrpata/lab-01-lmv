import path from "node:path";
import { z } from "zod";

const port = z.coerce.number().int().min(1).max(65535);
const players = z.coerce.number().int().min(1).max(128);
const Origin = z.url({ protocol: /^https?$/ }).refine(value => {
  const url = new URL(value);
  return !url.username && !url.password && url.pathname === "/" && !url.search && !url.hash;
}, "Expected an HTTP(S) origin without a path").transform(value => new URL(value).origin);

const EnvironmentSchema = z.object({
  PORT: port.default(3000),
  HOST: z.string().trim().min(1).default("127.0.0.1"),
  LOG_DIR: z.string().trim().min(1).default("./logs"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  MAX_ROOMS: z.coerce.number().int().min(1).max(1000).default(100),
  MAX_PLAYERS_PER_ROOM: players.optional(),
  ROOM_CAPACITY: players.optional(),
  MAX_CONNECTIONS_PER_IP: z.coerce.number().int().min(1).max(256).default(16),
  ALLOWED_ORIGINS: z.string().default("").transform(value => value.split(",").map(item => item.trim()).filter(Boolean)).pipe(z.array(Origin)),
  RENDER_EXTERNAL_URL: Origin.optional(),
  TRUST_PROXY: z.enum(["0", "1"]).default("0").transform(value => value === "1"),
  BUILD_SHA: z.union([z.literal("dev"), z.string().regex(/^[0-9a-f]{7,64}$/)]).default("dev"),
});

export function parseConfig(environment: NodeJS.ProcessEnv) {
  const env = EnvironmentSchema.parse(environment);
  const origins = new Set(env.ALLOWED_ORIGINS);

  if (env.RENDER_EXTERNAL_URL) origins.add(env.RENDER_EXTERNAL_URL);
  if (env.NODE_ENV !== "production") {
    for (const host of ["localhost", "127.0.0.1"]) {
      for (const port of [env.PORT, 5173, 4173]) origins.add("http://" + host + ":" + port);
    }
  }

  return {
    host: env.HOST,
    port: env.PORT,
    logDir: path.resolve(env.LOG_DIR),
    logLevel: env.LOG_LEVEL,
    roomCapacity: env.MAX_PLAYERS_PER_ROOM ?? env.ROOM_CAPACITY ?? 4,
    maxRooms: env.MAX_ROOMS,
    maxConnectionsPerIp: env.MAX_CONNECTIONS_PER_IP,
    allowedOrigins: origins,
    allowMissingOrigin: env.NODE_ENV !== "production",
    trustProxy: env.TRUST_PROXY,
    buildSha: env.BUILD_SHA,
  };
}

export type ServerConfig = ReturnType<typeof parseConfig>;
export const config = parseConfig(process.env);
