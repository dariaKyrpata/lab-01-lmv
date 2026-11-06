import { isIP } from "node:net";
import type { IncomingMessage } from "node:http";
import type { ServerConfig } from "./config.ts";

export function originAllowed(origin: string | undefined, config: Pick<ServerConfig, "allowedOrigins" | "allowMissingOrigin">) {
  return origin === undefined ? config.allowMissingOrigin : config.allowedOrigins.has(origin);
}

export function clientIp(request: IncomingMessage, trustProxy: boolean) {
  const forwarded = request.headers["x-forwarded-for"];
  if (trustProxy && typeof forwarded === "string") {
    const address = forwarded.split(",").at(-1)?.trim();
    if (address && isIP(address)) return address;
  }
  return request.socket.remoteAddress ?? "unknown";
}
