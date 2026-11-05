import test from "node:test";
import assert from "node:assert/strict";

import {
  validateMessage,
  PROTOCOL_VERSION,
  MAX_MESSAGE_BYTES
} from "./protocol.ts";

function validate(message) {
  return validateMessage(
    Buffer.from(JSON.stringify(message))
  );
}

test("Valid join message", () => {
  const result = validate({
    version: PROTOCOL_VERSION,
    type: "join",
    room: "room-123",
    name: "Daria"
  });

  assert.equal(result.ok, true);
  assert.equal(result.message.type, "join");
  assert.equal(result.message.name, "Daria");
});

test("Valid chat message", () => {
  const result = validate({
    version: PROTOCOL_VERSION,
    type: "chat",
    text: "Hello!"
  });

  assert.equal(result.ok, true);
  assert.equal(result.message.text, "Hello!");
});

test("Valid leave message", () => {
  const result = validate({
    version: PROTOCOL_VERSION,
    type: "leave"
  });

  assert.equal(result.ok, true);
});

test("Reject invalid JSON", () => {
  const result = validateMessage(
    Buffer.from("{invalid json")
  );

  assert.equal(result.ok, false);
});

test("Reject unsupported protocol version", () => {
  const result = validate({
    version: 999,
    type: "leave"
  });

  assert.equal(result.ok, false);
});

test("Reject unknown message type", () => {
  const result = validate({
    version: PROTOCOL_VERSION,
    type: "unknown"
  });

  assert.equal(result.ok, false);
});

test("Reject empty player name", () => {
  const result = validate({
    version: PROTOCOL_VERSION,
    type: "join",
    room: "room-123",
    name: ""
  });

  assert.equal(result.ok, false);
});

test("Reject chat longer than 500 characters", () => {
  const result = validate({
    version: PROTOCOL_VERSION,
    type: "chat",
    text: "a".repeat(501)
  });

  assert.equal(result.ok, false);
});

test("Reject oversized message", () => {
  const result = validateMessage(
    Buffer.alloc(MAX_MESSAGE_BYTES + 1, 65)
  );

  assert.equal(result.ok, false);
});

test("Reject unexpected fields", () => {
  const result = validate({
    version: PROTOCOL_VERSION,
    type: "chat",
    text: "Hello",
    admin: true
  });

  assert.equal(result.ok, false);
});
