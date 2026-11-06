
import { test } from "vitest";
import assert from "node:assert/strict";

import { RoomManager } from "./rooms.ts";

function createPlayer(id, name) {
  return { id, name };
}

test("Create a room", () => {
  const manager = new RoomManager();
  const room = manager.create("Pink Galaxy");

  assert.equal(room.name, "Pink Galaxy");
  assert.equal(room.players.size, 0);
  assert.equal(manager.get(room.id), room);
});

test("List available rooms", () => {
  const manager = new RoomManager();

  manager.create("Pink Galaxy");
  manager.create("Deep Space");

  const rooms = manager.list();

  assert.equal(rooms.length, 2);
  assert.equal(rooms[0].name, "Pink Galaxy");
  assert.equal(rooms[1].name, "Deep Space");
});

test("Player joins a room", () => {
  const manager = new RoomManager();
  const room = manager.create("Asteroid Field");

  const player = createPlayer("p1", "Daria");

  room.join(player);

  assert.equal(room.players.size, 1);
  assert.equal(room.roster[0].name, "Daria");
});

test("Two players join the same room", () => {
  const manager = new RoomManager();
  const room = manager.create("Deep Space");

  room.join(createPlayer("p1", "Daria"));
  room.join(createPlayer("p2", "Player2"));

  assert.equal(room.players.size, 2);
  assert.equal(room.roster.length, 2);
});

test("Reject duplicate player", () => {
  const manager = new RoomManager();
  const room = manager.create("Pink Galaxy");

  room.join(createPlayer("p1", "Daria"));

  assert.throws(() => {
    room.join(createPlayer("p1", "Daria"));
  });
});

test("Room becomes full", () => {
  const manager = new RoomManager();
  const room = manager.create("Pink Galaxy");

  for (let i = 1; i <= room.maxPlayers; i++) {
    room.join(createPlayer(`p${i}`, `Player${i}`));
  }

  assert.equal(room.isFull, true);

  assert.throws(() => {
    room.join(createPlayer("extra", "Extra"));
  });
});

test("Player leaves a room", () => {
  const manager = new RoomManager();
  const room = manager.create("Asteroid Field");

  room.join(createPlayer("p1", "Daria"));
  room.join(createPlayer("p2", "Player2"));

  room.leave("p1");

  assert.equal(room.players.size, 1);
  assert.equal(room.roster[0].name, "Player2");
});

test("Empty room is removed", () => {
  const manager = new RoomManager();
  const room = manager.create("Deep Space");

  room.join(createPlayer("p1", "Daria"));
  room.leave("p1");

  assert.equal(manager.get(room.id), null);
});

test("Chat event contains message data", () => {
  const manager = new RoomManager();
  const room = manager.create("Pink Galaxy");

  room.join(createPlayer("p1", "Daria"));

  const message = room.chat("p1", "Hello!");

  assert.equal(message.type, "chat");
  assert.equal(message.playerId, "p1");
  assert.equal(message.name, "Daria");
  assert.equal(message.text, "Hello!");
});

test("Room JSON contains correct player count", () => {
  const manager = new RoomManager();
  const room = manager.create("Asteroid Field");

  room.join(createPlayer("p1", "Daria"));

  const data = room.toJSON();

  assert.equal(data.name, "Asteroid Field");
  assert.equal(data.players, 1);
  assert.equal(data.maxPlayers, room.maxPlayers);
});
