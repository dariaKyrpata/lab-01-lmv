
import { test } from "vitest";
import assert from "node:assert/strict";

import {
  mkdtemp,
  writeFile,
  rm
} from "node:fs/promises";

import { tmpdir } from "node:os";
import path from "node:path";
import { Writable } from "node:stream";

import { ReplayManager } from "./replay.ts";

async function createFixture() {
  const logDir = await mkdtemp(
    path.join(tmpdir(), "dogfight-replay-")
  );

  const fileName = "test-room-123.ndjson";

  const events = [
    {
      type: "join",
      roomId: "test-room",
      playerId: "p1",
      name: "Daria"
    },
    {
      type: "chat",
      roomId: "test-room",
      playerId: "p1",
      name: "Daria",
      text: "Hello!"
    },
    {
      type: "leave",
      roomId: "test-room",
      playerId: "p1",
      name: "Daria"
    }
  ];

  await writeFile(
    path.join(logDir, fileName),
    events.map((event) => JSON.stringify(event)).join("\n") + "\n",
    "utf8"
  );

  return { logDir, fileName, events };
}

test("Replay lists NDJSON files", async () => {
  const fixture = await createFixture();

  try {
    const replay = new ReplayManager(fixture.logDir);
    const files = await replay.list();

    assert.equal(files.length, 1);
    assert.equal(files[0].fileName, fixture.fileName);
    assert.ok(files[0].size > 0);
  } finally {
    await rm(fixture.logDir, {
      recursive: true,
      force: true
    });
  }
});

test("Replay reads events in order", async () => {
  const fixture = await createFixture();

  try {
    const replay = new ReplayManager(fixture.logDir);
    const events = [];

    for await (const event of replay.readEvents(fixture.fileName)) {
      events.push(event);
    }

    assert.deepEqual(events, fixture.events);
  } finally {
    await rm(fixture.logDir, {
      recursive: true,
      force: true
    });
  }
});

test("Replay streams NDJSON", async () => {
  const fixture = await createFixture();

  try {
    const replay = new ReplayManager(fixture.logDir);
    const chunks = [];

    const output = new Writable({
      write(chunk, encoding, callback) {
        chunks.push(Buffer.from(chunk));
        callback();
      }
    });

    await replay.stream(fixture.fileName, output);

    const content = Buffer.concat(chunks).toString("utf8");
    const lines = content.trim().split("\n");
    const events = lines.map((line) => JSON.parse(line));

    assert.deepEqual(events, fixture.events);
  } finally {
    await rm(fixture.logDir, {
      recursive: true,
      force: true
    });
  }
});

test("Replay rejects invalid filenames", () => {
  const replay = new ReplayManager("./logs");

  assert.equal(replay.validFileName("../secret.txt"), false);
  assert.equal(replay.validFileName("test.json"), false);
  assert.equal(replay.validFileName("match.ndjson"), true);

  assert.throws(() => {
    replay.getFilePath("../secret.txt");
  });
});

test("Replay handles corrupted log entries", async () => {
  const fixture = await createFixture();

  try {
    const filePath = path.join(
      fixture.logDir,
      fixture.fileName
    );

    await writeFile(
      filePath,
      '{"type":"join"}\n{invalid json}\n',
      "utf8"
    );

    const replay = new ReplayManager(fixture.logDir);
    const events = [];

    for await (const event of replay.readEvents(fixture.fileName)) {
      events.push(event);
    }

    assert.equal(events.length, 2);
    assert.equal(events[0].type, "join");
    assert.equal(events[1].type, "invalid");
  } finally {
    await rm(fixture.logDir, {
      recursive: true,
      force: true
    });
  }
});
