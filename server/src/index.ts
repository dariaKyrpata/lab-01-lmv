import { logger } from "./logger.ts";
import { collectMetrics } from "./metrics.ts";
import { performance } from "node:perf_hooks";
import http from "node:http";
import path from "node:path";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { pipeline } from "node:stream/promises";

import { config } from "./config.ts";
import { RoomManager } from "./rooms.ts";
import { attachWebSocketServer } from "./ws.ts";
import { MatchLogger } from "./matchLogger.ts";
import { ReplayManager } from "./replay.ts";

import type { IncomingMessage, ServerResponse } from "node:http";
import type { Room } from "./rooms.ts";
import { z } from "zod";

const RoomNameSchema = z.object({ name: z.string().trim().min(1).max(50) });

class HttpError extends Error {
  declare readonly statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}

const __dirname = path.dirname(
  fileURLToPath(import.meta.url)
);

const CLIENT_DIST = path.resolve(
  __dirname,
  "../../client/dist"
);

const MAX_BODY_BYTES = 4096;

const roomManager = new RoomManager({ maxPlayers: config.roomCapacity, maxRooms: config.maxRooms });
const matchLogger = new MatchLogger(config.logDir);
const replayManager = new ReplayManager(config.logDir);

let shuttingDown = false;
let ready = false;
const pendingLogs = new Set<Promise<void>>();

function sendJson(res: ServerResponse, statusCode: number, data: unknown) {
  if (res.headersSent || res.destroyed) {
    return;
  }

  const body = JSON.stringify(data);

  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
  });

  res.end(body);
}

function attachRoomLogging(room: Room) {
  if (room.loggingAttached) {
    return room;
  }

  room.loggingAttached = true;

  let task = Promise.resolve();
  let logStarted = false;

  function queueOperation(operation: () => Promise<void>) {
    task = task
      .then(operation)
      .catch((error) => {
        logger.error({ err: error, roomId: room.id }, "room log failed");
      });
    const current = task;
    pendingLogs.add(current);
    void current.then(() => { pendingLogs.delete(current); });
  }

  room.on("event", (event) => {
    queueOperation(async () => {
      if (!logStarted) {
        await matchLogger.start(room.id);
        logStarted = true;
      }

      matchLogger.log(room.id, event);
    });
  });

  room.once("empty", () => {
    queueOperation(async () => {
      if (logStarted) {
        await matchLogger.stop(room.id);
        logStarted = false;
      }
    });
  });

  return room;
}

function createRoom(name: string, persistent = false) {
  const room = roomManager.create(name);

  attachRoomLogging(room);

  if (persistent) {
    room.once("empty", () => {
      if (!shuttingDown) createRoom(name, true);
    });
  }

  return room;
}

for (const name of ["Pink Galaxy", "Asteroid Field", "Deep Space"].slice(0, config.maxRooms)) createRoom(name, true);

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;

  for await (const raw of req) {
    const chunk: unknown = raw;
    if (!Buffer.isBuffer(chunk)) throw new HttpError(400, "Invalid request body");
    size += chunk.length;

    if (size > MAX_BODY_BYTES) {
      throw new HttpError(413, "Request body is too large");
    }

    chunks.push(chunk);
  }

  const body = Buffer.concat(chunks).toString("utf8");

  try {
    return JSON.parse(body);
  } catch {
    throw new HttpError(400, "Invalid JSON");
  }
}

const contentTypes: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
};

async function serveStatic(req: IncomingMessage, res: ServerResponse, pathname: string) {
  let decodedPath;

  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    sendJson(res, 400, {
      error: "Invalid URL",
    });

    return;
  }

  if (
    decodedPath.includes("\0") ||
    decodedPath.includes("\\") ||
    decodedPath.split("/").includes("..")
  ) {
    sendJson(res, 403, {
      error: "Forbidden path",
    });

    return;
  }

  const relativePath =
    decodedPath === "/"
      ? "index.html"
      : decodedPath.replace(/^\/+/, "");

  const filePath = path.resolve(
    CLIENT_DIST,
    relativePath
  );

  const relative = path.relative(
    CLIENT_DIST,
    filePath
  );

  if (
    relative.startsWith("..") ||
    path.isAbsolute(relative)
  ) {
    sendJson(res, 403, {
      error: "Forbidden path",
    });

    return;
  }

  let fileInfo;

  try {
    fileInfo = await stat(filePath);
  } catch (error) {
    if (
      error instanceof Error && "code" in error &&
      (error.code === "ENOENT" || error.code === "ENOTDIR")
    ) {
      sendJson(res, 404, {
        error: "File not found",
      });

      return;
    }

    throw error;
  }

  if (!fileInfo.isFile()) {
    sendJson(res, 404, {
      error: "File not found",
    });

    return;
  }

  const extension = path.extname(
    filePath
  ).toLowerCase();

  res.writeHead(200, {
    "Content-Type":
      contentTypes[extension] ??
      "application/octet-stream",
    "Content-Length": fileInfo.size,
    "X-Content-Type-Options": "nosniff",
  });

  if (req.method === "HEAD") {
    res.end();
    return;
  }

  await pipeline(
    createReadStream(filePath),
    res
  );
}

async function handleReplayApi(req: IncomingMessage, res: ServerResponse, pathname: string) {
  if (req.method !== "GET") {
    sendJson(res, 405, {
      error: "Method not allowed",
    });

    return;
  }

  if (pathname === "/api/replays") {
    const replays = await replayManager.list();

    sendJson(res, 200, replays);
    return;
  }

  const prefix = "/api/replays/";

  if (!pathname.startsWith(prefix)) {
    sendJson(res, 404, {
      error: "Replay endpoint not found",
    });

    return;
  }

  const encodedFileName = pathname.slice(
    prefix.length
  );

  let fileName;

  try {
    fileName = decodeURIComponent(encodedFileName);
  } catch {
    sendJson(res, 400, {
      error: "Invalid replay filename",
    });

    return;
  }

  if (!replayManager.validFileName(fileName)) {
    sendJson(res, 400, {
      error: "Invalid replay filename",
    });

    return;
  }

  const filePath = replayManager.getFilePath(fileName);

  let fileInfo;

  try {
    fileInfo = await stat(filePath);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      sendJson(res, 404, {
        error: "Replay not found",
      });

      return;
    }

    throw error;
  }

  if (!fileInfo.isFile()) {
    sendJson(res, 404, {
      error: "Replay not found",
    });

    return;
  }

  res.writeHead(200, {
    "Content-Type":
      "application/x-ndjson; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });

  await replayManager.stream(fileName, res);
}

async function handleApi(req: IncomingMessage, res: ServerResponse, pathname: string) {
  if (pathname === "/api/stats") {
    if (req.method !== "GET") {
      sendJson(res, 405, {
        error: "Method not allowed",
      });

      return;
    }

    sendJson(res, 200, {
      matches: websocket.getStats(),
      memory: process.memoryUsage(),
      eventLoop: performance.eventLoopUtilization(),
    });

    return;
  }

  if (pathname === "/ready" || pathname === "/metrics") {
    if (req.method !== "GET") {
      sendJson(res, 405, { error: "Method not allowed" });
      return;
    }
    if (pathname === "/ready") {
      sendJson(res, ready ? 200 : 503, { ready });
    } else {
      let players = 0;
      for (const room of roomManager.rooms.values()) players += room.players.size;
      sendJson(res, 200, collectMetrics(roomManager.rooms.size, players, websocket.getStats()));
    }
    return;
  }

  if (pathname === "/health") {
    if (req.method !== "GET") {
      sendJson(res, 405, {
        error: "Method not allowed",
      });

      return;
    }

    sendJson(res, 200, {
      status: "ok",
      service: "dogfight-server",
      gitSha: config.buildSha,
    });

    return;
  }

  if (
    pathname === "/api/replays" ||
    pathname.startsWith("/api/replays/")
  ) {
    await handleReplayApi(req, res, pathname);
    return;
  }

  const botRoute = /^\/api\/rooms\/([a-zA-Z0-9_-]+)\/bots$/.exec(pathname);
  if (botRoute?.[1]) {
    if (req.method !== "POST") {
      sendJson(res, 405, { error: "Method not allowed" });
      return;
    }
    const room = roomManager.get(botRoute[1]);
    if (!room) {
      sendJson(res, 404, { error: "Room not found" });
      return;
    }
    const parsed = z.strictObject({ count: z.number().int().min(0).max(8) }).safeParse(await readJsonBody(req));
    if (!parsed.success) {
      sendJson(res, 400, { error: "Bot count must be an integer from 0 to 8" });
      return;
    }
    websocket.setBots(room, parsed.data.count);
    sendJson(res, 200, { count: parsed.data.count });
    return;
  }

  if (pathname === "/api/rooms") {
    if (req.method === "GET") {
      sendJson(res, 200, roomManager.list());
      return;
    }

    if (req.method === "POST") {
      const parsed = RoomNameSchema.safeParse(await readJsonBody(req));

      if (!parsed.success) {
        sendJson(res, 400, {
          error: "Room name must contain 1–50 characters",
        });

        return;
      }

      if (roomManager.rooms.size >= config.maxRooms) {
        sendJson(res, 429, { error: "Room limit reached" });
        return;
      }
      const room = createRoom(parsed.data.name);

      sendJson(res, 201, room.toJSON());
      return;
    }

    sendJson(res, 405, {
      error: "Method not allowed",
    });

    return;
  }

  sendJson(res, 404, {
    error: "API endpoint not found",
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", "http://localhost");
    const pathname = url.pathname;
    if (shuttingDown && pathname !== "/health" && pathname !== "/ready" && pathname !== "/metrics") {
      sendJson(res, 503, {
        error: "Server is shutting down",
      });

      return;
    }


    if (
      pathname === "/health" || pathname === "/ready" || pathname === "/metrics" ||
      pathname === "/api" ||
      pathname.startsWith("/api/")
    ) {
      await handleApi(req, res, pathname);
      return;
    }

    if (
      req.method !== "GET" &&
      req.method !== "HEAD"
    ) {
      sendJson(res, 405, {
        error: "Method not allowed",
      });

      return;
    }

    await serveStatic(req, res, pathname);
  } catch (error) {
    if (!(error instanceof HttpError)) logger.error({ err: error }, "HTTP handler failed");

    if (res.headersSent) {
      res.destroy();
      return;
    }

    const statusCode = error instanceof HttpError ? error.statusCode : 500;

    sendJson(res, statusCode, {
      error:
        statusCode >= 500
          ? "Internal server error"
          : error instanceof Error ? error.message : "Request failed",
    });
  }
});

function fatal(error: unknown, source: string): never {
  logger.fatal({ err: error instanceof Error ? error : new Error("Non-Error failure"), source }, "server terminated");
  process.exit(1);
}

server.on("error", error => fatal(error, "http_server"));
process.on("uncaughtException", error => fatal(error, "uncaughtException"));
process.on("unhandledRejection", error => fatal(error, "unhandledRejection"));

const websocket = attachWebSocketServer(server, roomManager);

export async function shutdown(signal: NodeJS.Signals) {
  if (shuttingDown) return;
  shuttingDown = true;
  ready = false;
  const startedAt = performance.now();
  logger.info({ signal }, "draining server");

  const deadline = setTimeout(() => fatal(new Error("Shutdown exceeded 8 seconds"), "shutdown_timeout"), 8000);
  const httpClosed = new Promise<void>((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
  });
  const drainHttp = setTimeout(() => server.closeAllConnections(), 4500);
  try {
    await Promise.all([httpClosed, websocket.close()]);
    await Promise.all(pendingLogs);
    await matchLogger.close();
    logger.info({ elapsedMs: performance.now() - startedAt }, "server stopped");
    process.exitCode = 0;
  } catch (error) {
    fatal(error, "shutdown");
  } finally {
    clearTimeout(deadline);
    clearTimeout(drainHttp);
  }
}

process.once("SIGINT", () => { void shutdown("SIGINT"); });
process.once("SIGTERM", () => { void shutdown("SIGTERM"); });

server.listen(config.port, config.host, () => {
  ready = true;
  logger.info({ host: config.host, port: config.port }, "server listening");
});
