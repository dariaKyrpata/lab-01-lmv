import test from "node:test";
import assert from "node:assert/strict";

const BASE_URL = process.env.TEST_SERVER_URL
  ?? "http://127.0.0.1:3000";

async function request(path, options = {}) {
  return fetch(`${BASE_URL}${path}`, {
    signal: AbortSignal.timeout(5000),
    ...options
  });
}

test("Health endpoint returns OK", async () => {
  const response = await request("/health");

  assert.equal(response.status, 200);

  const data = await response.json();

  assert.equal(data.status, "ok");
  assert.equal(data.service, "dogfight-server");
});

test("Rooms endpoint returns an array", async () => {
  const response = await request("/api/rooms");

  assert.equal(response.status, 200);

  const rooms = await response.json();

  assert.ok(Array.isArray(rooms));
});

test("Create a room through HTTP API", async () => {
  const response = await request("/api/rooms", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      name: "Test Room"
    })
  });

  assert.equal(response.status, 201);

  const room = await response.json();

  assert.equal(room.name, "Test Room");
  assert.equal(room.players, 0);
  assert.ok(room.id);
});

test("Reject invalid room name", async () => {
  const response = await request("/api/rooms", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      name: ""
    })
  });

  assert.equal(response.status, 400);
});

test("Reject invalid JSON", async () => {
  const response = await request("/api/rooms", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: "{invalid"
  });

  assert.equal(response.status, 400);
});

test("Replay list returns an array", async () => {
  const response = await request("/api/replays");

  assert.equal(response.status, 200);

  const replays = await response.json();

  assert.ok(Array.isArray(replays));
});

test("Reject invalid replay filename", async () => {
  const response = await request(
    "/api/replays/invalid.txt"
  );

  assert.equal(response.status, 400);
});

test("Unknown API endpoint returns 404", async () => {
  const response = await request(
    "/api/unknown-endpoint"
  );

  assert.equal(response.status, 404);
});
