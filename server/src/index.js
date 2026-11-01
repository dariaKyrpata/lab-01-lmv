import http from "node:http";
import path from "node:path";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { pipeline } from "node:stream/promises";

import { config } from "./config.js";
import { RoomManager } from "./rooms.js";
import { attachWebSocketServer } from "./ws.js";
import { MatchLogger } from "./matchLogger.js";
import { ReplayManager } from "./replay.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const CLIENT_DIST = path.resolve(
  __dirname,
  "../../client/dist"
);

const MAX_BODY_BYTES = 4096;

const roomManager = new RoomManager();
const matchLogger = new MatchLogger(config.logDir);
const replayManager = new ReplayManager(config.logDir);

let shuttingDown = false;

function sendJson(res, statusCode, data) {
  if (res.headersSent || res.destroyed) return;

  const body = JSON.stringify(data);

  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store"
  });

  res.end(body);
}

function logError(error) {
  console.error("Server error:", error);
}

function attachRoomLogging(room) {
  if (room.loggingAttached) return room;

  room.loggingAttached = true;

  let task = Promise.resolve();
  let logStarted = false;

  function queueOperation(operation) {
    task = task
      .then(operation)
      .catch((error) => {
        console.error(
          `Logging error for room ${room.id}:`,
          error
        );
      });
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

function createRoom(name) {
  const room = roomManager.create(name);
  return attachRoomLogging(room);
}

createRoom("Pink Galaxy");
createRoom("Asteroid Field");
createRoom("Deep Space");

async function readJsonBody(req) {
  const chunks = [];
  let size = 0;

  for await (const chunk of req) {
    size += chunk.length;

    if (size > MAX_BODY_BYTES) {
      const error = new Error("Request body is too large");
      error.statusCode = 413;
      throw error;
    }

    chunks.push(chunk);
  }

  const body = Buffer.concat(chunks).toString("utf8");

  try {
    return JSON.parse(body);
  } catch {
    const error = new Error("Invalid JSON");
    error.statusCode = 400;
    throw error;
  }
}

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
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
  ".ogg": "audio/ogg"
};

async function serveStatic(req, res, pathname) {
  let decodedPath;

  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    sendJson(res, 400, {
      error: "Invalid URL"
    });
    return;
  }

  if (
    decodedPath.includes("\0") ||
    decodedPath.includes("\\") ||
    decodedPath.split("/").includes("..")
  ) {
    sendJson(res, 403, {
      error: "Forbidden path"
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
      error: "Forbidden path"
    });
    return;
  }

  let fileInfo;

  try {
    fileInfo = await stat(filePath);
  } catch (error) {
    if (
      error.code === "ENOENT" ||
      error.code === "ENOTDIR"
    ) {
      sendJson(res, 404, {
        error: "File not found"
      });
      return;
    }

    throw error;
  }

  if (!fileInfo.isFile()) {
    sendJson(res, 404, {
      error: "File not found"
    });
    return;
  }

  const extension = path.extname(filePath).toLowerCase();

  res.writeHead(200, {
    "Content-Type":
      contentTypes[extension] ??
      "application/octet-stream",
    "Content-Length": fileInfo.size,
    "X-Content-Type-Options": "nosniff"
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

async function handleReplayApi(req, res, pathname) {
  if (req.method !== "GET") {
    sendJson(res, 405, {
      error: "Method not allowed"
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
      error: "Replay endpoint not found"
    });
    return;
  }

  const encodedFileName = pathname.slice(prefix.length);

  let fileName;

  try {
    fileName = decodeURIComponent(encodedFileName);
  } catch {
    sendJson(res, 400, {
      error: "Invalid replay filename"
    });
    return;
  }

  if (!replayManager.validFileName(fileName)) {
    sendJson(res, 400, {
      error: "Invalid replay filename"
    });
    return;
  }

  const filePath = replayManager.getFilePath(fileName);

  let fileInfo;

  try {
    fileInfo = await stat(filePath);
  } catch (error) {
    if (error.code === "ENOENT") {
      sendJson(res, 404, {
        error: "Replay not found"
      });
      return;
    }

    throw error;
  }

  if (!fileInfo.isFile()) {
    sendJson(res, 404, {
      error: "Replay not found"
    });
    return;
  }

  res.writeHead(200, {
    "Content-Type": "application/x-ndjson; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  });

  await replayManager.stream(fileName, res);
}

async function handleApi(req, res, pathname) {
  if (pathname === "/health") {
    if (req.method !== "GET") {
      sendJson(res, 405, {
        error: "Method not allowed"
      });
      return;
    }

    sendJson(res, 200, {
      status: "ok",
      service: "dogfight-server"
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

  if (pathname === "/api/rooms") {
    if (req.method === "GET") {
      sendJson(res, 200, roomManager.list());
      return;
    }

    if (req.method === "POST") {
      const body = await readJsonBody(req);

      if (
        !body ||
        typeof body !== "object" ||
        Array.isArray(body) ||
        typeof body.name !== "string" ||
        body.name.trim().length === 0 ||
        body.name.trim().length > 50
      ) {
        sendJson(res, 400, {
          error: "Room name must contain 1–50 characters"
        });
        return;
      }

      const room = createRoom(body.name.trim());

      sendJson(res, 201, room.toJSON());
      return;
    }

    sendJson(res, 405, {
      error: "Method not allowed"
    });
    return;
  }

  sendJson(res, 404, {
    error: "API endpoint not found"
  });
}

const server = http.createServer(async (req, res) => {
  try {
    if (shuttingDown) {
      sendJson(res, 503, {
        error: "Server is shutting down"
      });
      return;
    }

    const url = new URL(
      req.url,
      `http://${req.headers.host ?? "localhost"}`
    );

    const pathname = url.pathname;

    if (
      pathname === "/health" ||
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
        error: "Method not allowed"
      });
      return;
    }

    await serveStatic(req, res, pathname);
  } catch (error) {
    console.error("Request error:", error);

    if (res.headersSent) {
      res.destroy();
      return;
    }

    const statusCode = error.statusCode ?? 500;

    sendJson(res, statusCode, {
      error:
        statusCode >= 500
          ? "Internal server error"
          : error.message
    });
  }
});

server.on("error", logError);

const websocket = attachWebSocketServer(
  server,
  roomManager
);

async function shutdown(signal) {
  if (shuttingDown) return;

  shuttingDown = true;

  console.log(`\nReceived ${signal}. Shutting down...`);

  try {
    await websocket.close();
    await matchLogger.close();

    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });

      server.closeIdleConnections?.();
    });

    console.log("Server stopped successfully.");
    process.exitCode = 0;
  } catch (error) {
    console.error("Shutdown failed:", error);
    process.exitCode = 1;
  }
}

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});

server.listen(config.port, config.host, () => {
  console.log(
    `Space Dogfight server: http://${config.host}:${config.port}`
  );

  console.log(
    `WebSocket: ws://${config.host}:${config.port}/ws`
  );

  console.log(
    `Match logs directory: ${config.logDir}`
  );
});
