import { EventEmitter } from "node:events";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";

class NDJSONTransform extends Transform {
  constructor() {
    super({
      writableObjectMode: true,
      readableObjectMode: false
    });
  }

  _transform(event, encoding, callback) {
    try {
      const line = JSON.stringify(event) + "\n";
      callback(null, line);
    } catch (error) {
      callback(error);
    }
  }
}

export class MatchLogger extends EventEmitter {
  constructor(logDir) {
    super();

    this.logDir = path.resolve(logDir);
    this.sessions = new Map();
    this.closing = false;

    this.on("error", (error) => {
      console.error("Match logger error:", error);
    });
  }

  async start(roomId) {
    if (this.closing) {
      throw new Error("Logger is shutting down");
    }

    if (this.sessions.has(roomId)) {
      return this.sessions.get(roomId);
    }

    await mkdir(this.logDir, {
      recursive: true
    });

    const safeRoomId = String(roomId).replace(
      /[^a-zA-Z0-9_-]/g,
      "_"
    );

    const fileName = `${safeRoomId}-${Date.now()}.ndjson`;

    const filePath = path.join(
      this.logDir,
      fileName
    );

    const transform = new NDJSONTransform();

    const output = createWriteStream(filePath, {
      flags: "wx",
      encoding: "utf8"
    });

    const session = {
      roomId,
      filePath,
      transform,
      output,
      finished: false,
      task: null
    };

    this.sessions.set(roomId, session);

    session.task = pipeline(transform, output)
      .catch((error) => {
        this.emit("error", error);
        throw error;
      })
      .finally(() => {
        session.finished = true;

        if (this.sessions.get(roomId) === session) {
          this.sessions.delete(roomId);
        }
      });

    return session;
  }

  log(roomId, event) {
    const session = this.sessions.get(roomId);

    if (
      !session ||
      session.finished ||
      session.transform.destroyed ||
      session.transform.writableEnded
    ) {
      return false;
    }

    const record = {
      timestamp: new Date().toISOString(),
      roomId,
      ...event
    };

    const accepted = session.transform.write(record);

    if (!accepted) {
      this.emit("backpressure", { roomId });
    }

    return accepted;
  }

  async stop(roomId) {
    const session = this.sessions.get(roomId);

    if (!session) return;

    if (!session.transform.writableEnded) {
      session.transform.end();
    }

    await session.task;
  }

  async close() {
    this.closing = true;

    const roomIds = [...this.sessions.keys()];

    await Promise.allSettled(
      roomIds.map((roomId) => this.stop(roomId))
    );
  }

  getActiveSessions() {
    return [...this.sessions.values()].map(
      (session) => ({
        roomId: session.roomId,
        filePath: session.filePath,
        finished: session.finished
      })
    );
  }
}
