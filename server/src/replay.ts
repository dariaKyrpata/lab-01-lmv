import { createReadStream } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

export class ReplayManager {
  declare readonly logDir: string;

  constructor(logDir: string) {
    this.logDir = path.resolve(logDir);
  }

  validFileName(fileName: unknown): fileName is string {
    return (
      typeof fileName === "string" &&
      /^[a-zA-Z0-9_-]+\.ndjson$/.test(fileName)
    );
  }

  getFilePath(fileName: string) {
    if (!this.validFileName(fileName)) {
      throw new Error("Invalid replay filename");
    }

    return path.join(this.logDir, fileName);
  }

  async list() {
    let files;

    try {
      files = await readdir(this.logDir);
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") return [];
      throw error;
    }

    const results = [];

    for (const fileName of files) {
      if (!this.validFileName(fileName)) continue;

      const filePath = this.getFilePath(fileName);
      const info = await stat(filePath);

      if (!info.isFile()) continue;

      results.push({
        fileName,
        size: info.size,
        createdAt: info.birthtime.toISOString()
      });
    }

    return results;
  }

  async *readEvents(fileName: string): AsyncGenerator<unknown> {
    const filePath = this.getFilePath(fileName);

    const input = createReadStream(filePath, {
      encoding: "utf8"
    });

    const lines = createInterface({
      input,
      crlfDelay: Infinity
    });

    try {
      for await (const line of lines) {
        if (!line.trim()) continue;

        try {
          const value: unknown = JSON.parse(line);
          yield value;
        } catch {
          yield {
            type: "invalid",
            error: "Corrupted log entry"
          };
        }
      }
    } finally {
      lines.close();
      input.destroy();
    }
  }

  async stream(fileName: string, writable: import("node:stream").Writable) {
    const source = Readable.from(
      this.readEvents(fileName),
      {
        objectMode: true
      }
    );

    async function* encode(events: AsyncIterable<unknown>) {
      for await (const event of events) {
        yield JSON.stringify(event) + "\n";
      }
    }

    await pipeline(
      source,
      encode,
      writable
    );
  }
}
