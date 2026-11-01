
import WebSocket from "ws";

const BASE_URL = "http://127.0.0.1:3000";
const WS_URL = "ws://127.0.0.1:3000/ws";

const MESSAGE_COUNT = 200;
const MESSAGE_SIZE = 450;

async function createRoom() {
  const response = await fetch(`${BASE_URL}/api/rooms`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      name: "Slow Client Test"
    }),
    signal: AbortSignal.timeout(5000)
  });

  if (!response.ok) {
    throw new Error(`Cannot create room: ${response.status}`);
  }

  return response.json();
}

function connect() {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(WS_URL);

    socket.once("open", () => resolve(socket));
    socket.once("error", reject);
  });
}

function send(socket, type, fields = {}) {
  if (socket.readyState !== WebSocket.OPEN) {
    return false;
  }

  socket.send(JSON.stringify({
    version: 1,
    type,
    ...fields
  }));

  return true;
}

function waitForJoined(socket) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("Join timeout"));
    }, 5000);

    function onMessage(data) {
      let message;

      try {
        message = JSON.parse(data.toString());
      } catch {
        return;
      }

      if (message.type === "joined") {
        cleanup();
        resolve(message);
      }
    }

    function onClose(code) {
      cleanup();
      reject(new Error(`Socket closed: ${code}`));
    }

    function cleanup() {
      clearTimeout(timer);
      socket.off("message", onMessage);
      socket.off("close", onClose);
    }

    socket.on("message", onMessage);
    socket.on("close", onClose);
  });
}

async function joinRoom(socket, roomId, name) {
  const joined = waitForJoined(socket);

  send(socket, "join", {
    room: roomId,
    name
  });

  await joined;
}

async function main() {
  console.log("Creating test room...");

  const room = await createRoom();

  const slowClient = await connect();
  const sender = await connect();

  let received = 0;
  let senderClosed = false;

  try {
    await joinRoom(slowClient, room.id, "SlowClient");
    await joinRoom(sender, room.id, "Sender");

    slowClient.on("message", (data) => {
      try {
        const message = JSON.parse(data.toString());

        if (message.type === "chat") {
          received++;
        }
      } catch {
        // Ignore invalid test responses
      }
    });

    sender.on("close", (code) => {
      senderClosed = true;
      console.log("Sender closed with code:", code);
    });

    // Pause incoming TCP data to simulate a slow receiver.
    slowClient._socket.pause();

    console.log("Sending messages...");

    for (let i = 0; i < MESSAGE_COUNT; i++) {
      if (sender.readyState !== WebSocket.OPEN) {
        break;
      }

      send(sender, "chat", {
        text: `Message ${i}: ${"x".repeat(MESSAGE_SIZE)}`
      });

      // Respect the server's 20-message-per-second rate limit.
      await new Promise((resolve) =>
        setTimeout(resolve, 65)
      );
    }

    console.log("Messages attempted:", MESSAGE_COUNT);
    console.log("Sender disconnected:", senderClosed);

    // Resume the receiver to inspect the messages still delivered.
    slowClient._socket.resume();

    await new Promise((resolve) =>
      setTimeout(resolve, 1500)
    );

    console.log("Messages received:", received);
    console.log(
      "Slow client bufferedAmount:",
      slowClient.bufferedAmount
    );

    console.log("Test completed.");
  } finally {
    slowClient.terminate();
    sender.terminate();
  }
}

main().catch((error) => {
  console.error("Slow client test failed:", error);
  process.exitCode = 1;
});
