
import test from "node:test";
import assert from "node:assert/strict";
import WebSocket from "ws";

const BASE_URL =
  process.env.TEST_SERVER_URL ?? "http://127.0.0.1:3000";

const WS_URL = BASE_URL.replace(/^http/, "ws") + "/ws";

async function createRoom() {
  const response = await fetch(`${BASE_URL}/api/rooms`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      name: "WebSocket Test Room"
    })
  });

  assert.equal(response.status, 201);

  return response.json();
}

function connect() {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(WS_URL);

    socket.once("open", () => resolve(socket));
    socket.once("error", reject);
  });
}

function waitForMessage(socket, expectedType) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error(
        `Timeout waiting for ${expectedType}`
      ));
    }, 5000);

    function onMessage(data) {
      let message;

      try {
        message = JSON.parse(data.toString());
      } catch {
        return;
      }

      if (message.type === expectedType) {
        cleanup();
        resolve(message);
      }
    }

    function onClose() {
      cleanup();
      reject(new Error("Connection closed"));
    }

    function cleanup() {
      clearTimeout(timeout);
      socket.off("message", onMessage);
      socket.off("close", onClose);
    }

    socket.on("message", onMessage);
    socket.on("close", onClose);
  });
}

function send(socket, type, data = {}) {
  socket.send(JSON.stringify({
    version: 1,
    type,
    ...data
  }));
}

test("WebSocket join, roster and chat", async () => {
  const room = await createRoom();
  const socket = await connect();

  try {
    const joinedPromise = waitForMessage(
      socket,
      "joined"
    );

    send(socket, "join", {
      room: room.id,
      name: "Daria"
    });

    const joined = await joinedPromise;

    assert.equal(joined.type, "joined");
    assert.ok(joined.playerId);

    const chatPromise = waitForMessage(
      socket,
      "chat"
    );

    send(socket, "chat", {
      text: "Hello from test!"
    });

    const chat = await chatPromise;

    assert.equal(chat.type, "chat");
    assert.equal(chat.name, "Daria");
    assert.equal(chat.text, "Hello from test!");
  } finally {
    socket.close();
  }
});

test("WebSocket rejects invalid protocol", async () => {
  const socket = await connect();

  try {
    const closePromise = new Promise((resolve) => {
      socket.once("close", (code) => {
        resolve(code);
      });
    });

    socket.send(JSON.stringify({
      version: 999,
      type: "join",
      room: "invalid",
      name: "Test"
    }));

    const closeCode = await closePromise;

    assert.equal(closeCode, 1008);
  } finally {
    socket.terminate();
  }
});
