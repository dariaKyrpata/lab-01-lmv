
import test from "node:test";
import assert from "node:assert/strict";

import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { MatchLogger } from "./matchLogger.ts";

test("MatchLogger writes NDJSON events", async () => {
  const logDir = await mkdtemp(
    path.join(tmpdir(), "dogfight-logs-")
  );

  const logger = new MatchLogger(logDir);

  try {
    const roomId = "test-room";

    const session = await logger.start(roomId);

    assert.ok(session.filePath.endsWith(".ndjson"));

    logger.log(roomId, {
      type: "join",
      playerId: "player-1",
      name: "Daria"
    });

    logger.log(roomId, {
      type: "chat",
      playerId: "player-1",
      name: "Daria",
      text: "Hello!"
    });

    logger.log(roomId, {
      type: "leave",
      playerId: "player-1",
      name: "Daria"
    });

    await logger.stop(roomId);

    const content = await readFile(
      session.filePath,
      "utf8"
    );

    const events = content
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));

    assert.equal(events.length, 3);

    assert.equal(events[0].type, "join");
    assert.equal(events[1].type, "chat");
    assert.equal(events[2].type, "leave");

    assert.equal(events[1].text, "Hello!");

    for (const event of events) {
      assert.equal(event.roomId, roomId);
      assert.ok(event.timestamp);
    }
  } finally {
    await logger.close();
    await rm(logDir, {
      recursive: true,
      force: true
    });
  }
});

test("MatchLogger closes all active streams", async () => {
  const logDir = await mkdtemp(
    path.join(tmpdir(), "dogfight-logs-")
  );

  const logger = new MatchLogger(logDir);

  try {
    await logger.start("room-a");
    await logger.start("room-b");

    logger.log("room-a", {
      type: "join",
      playerId: "a"
    });

    logger.log("room-b", {
      type: "join",
      playerId: "b"
    });

    await logger.close();

    assert.equal(
      logger.getActiveSessions().length,
      0
    );

    const files = await readdir(logDir);

    assert.equal(files.length, 2);
  } finally {
    await logger.close();
    await rm(logDir, {
      recursive: true,
      force: true
    });
  }
});
