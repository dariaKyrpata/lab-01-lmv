import { EventEmitter } from "node:events";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";

import type { TransformCallback } from "node:stream";
import type { WriteStream } from "node:fs";

interface LogSession {
  roomId: string;
  filePath: string;
  transform: NDJSONTransform;
  output: WriteStream;
  finished: boolean;
  task: Promise<void> | null;
}

class NDJSONTransform extends Transform {
  constructor() {
    super({
      writableObjectMode: true,
      readableObjectMode: false
    });
  }

  _transform(event: unknown, _encoding: BufferEncoding, callback: TransformCallback) {
    try {
      const line = JSON.stringify(event) + "\n";
      callback(null, line);
    } catch (error) {
      callback(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

export class MatchLogger extends EventEmitter<{ error: [unknown]; backpressure: [{ roomId: string }] }> {
  declare readonly logDir: string;
  declare readonly sessions: Map<string, LogSession>;
  declare closing: boolean;

  constructor(logDir: string) {
    super();

    this.logDir = path.resolve(logDir);
    this.sessions = new Map();
    this.closing = false;

    this.on("error", (error) => {
      console.error("Match logger error:", error);
    });
  }

  async start(roomId: string) {
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

    const session: LogSession = {
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

  log(roomId: string, event: object) {
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

  async stop(roomId: string) {
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
