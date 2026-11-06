import pino from "pino";
import { config } from "./config.ts";

export const logger = pino({
  level: config.logLevel,
  base: { service: "dogfight-server", buildSha: config.buildSha },
  redact: ["authorization", "cookie", "password", "token", "secret", "req.headers"],
}, pino.destination({ dest: 1, sync: true }));
