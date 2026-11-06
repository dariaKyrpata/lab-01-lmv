import path from "node:path";
import { z } from "zod";

const EnvironmentSchema = z.object({
  ROOM_CAPACITY: z.coerce.number().int().min(1).max(128).default(4),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  HOST: z.string().default("127.0.0.1").transform(value => value || "127.0.0.1"),
  LOG_DIR: z.string().refine(value => value.trim().length > 0).default("./logs"),
});

export interface ServerConfig {
  readonly roomCapacity: number;
  readonly port: number;
  readonly host: string;
  readonly logDir: string;
}

const env = EnvironmentSchema.parse(process.env);

export const config: ServerConfig = {
  port: env.PORT,
  roomCapacity: env.ROOM_CAPACITY,
  host: env.HOST,
  logDir: path.resolve(env.LOG_DIR),
};
