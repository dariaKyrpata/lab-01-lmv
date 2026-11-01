import { randomUUID } from "node:crypto";
import { WebSocket, WebSocketServer } from "ws";

import {
  PROTOCOL_VERSION,
  MAX_MESSAGE_BYTES,
  CLOSE_CODES,
  validateMessage
} from "./protocol.js";

const JOIN_TIMEOUT = 5000;
const HEARTBEAT_INTERVAL = 15000;
const MAX_MISSED_PONGS = 2;
const MAX_MESSAGES_PER_SECOND = 20;
const MAX_BUFFERED_BYTES = 1024 * 1024;

export function attachWebSocketServer(server, roomManager) {
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: MAX_MESSAGE_BYTES
  });

  function send(socket, message, critical = false) {
    if (socket.readyState !== WebSocket.OPEN) {
      return false;
    }

    const data = JSON.stringify({
      version: PROTOCOL_VERSION,
      ...message
    });

    if (socket.bufferedAmount > MAX_BUFFERED_BYTES) {
      if (!critical) return false;

      socket.close(1013, "Client too slow");
      return false;
    }

    socket.send(data, (error) => {
      if (error) {
        console.error("WebSocket send failed:", error);
        socket.terminate();
      }
    });

    return true;
  }

  function broadcast(room, message, critical = false) {
    for (const player of room.players.values()) {
      if (player.socket) {
        send(player.socket, message, critical);
      }
    }
  }

  function broadcastRoster(room) {
    broadcast(room, {
      type: "roster",
      room: room.id,
      players: room.roster
    }, true);
  }

  function leaveRoom(socket) {
    const room = socket.room;
    const player = socket.player;

    socket.room = null;
    socket.player = null;

    if (room && player) {
      room.leave(player.id);

      if (room.players.size > 0) {
        broadcastRoster(room);
      }
    }
  }

  wss.on("connection", (socket) => {
    socket.player = null;
    socket.room = null;
    socket.missedPongs = 0;

    let tokens = MAX_MESSAGES_PER_SECOND;
    let lastRefill = Date.now();

    const joinTimer = setTimeout(() => {
      if (!socket.room) {
        socket.close(
          CLOSE_CODES.JOIN_TIMEOUT,
          "Join timeout"
        );
      }
    }, JOIN_TIMEOUT);

    socket.on("pong", () => {
      socket.missedPongs = 0;
    });

    socket.on("message", (data, isBinary) => {
      const now = Date.now();
      const elapsed = (now - lastRefill) / 1000;

      tokens = Math.min(
        MAX_MESSAGES_PER_SECOND,
        tokens + elapsed * MAX_MESSAGES_PER_SECOND
      );
      lastRefill = now;

      if (tokens < 1) {
        socket.close(
          CLOSE_CODES.RATE_LIMIT,
          "Rate limit exceeded"
        );
        return;
      }

      tokens -= 1;

      if (isBinary) {
        socket.close(
          CLOSE_CODES.INVALID_MESSAGE,
          "Expected JSON text"
        );
        return;
      }

      const result = validateMessage(data);

      if (!result.ok) {
        socket.close(
          result.closeCode,
          result.error.slice(0, 100)
        );
        return;
      }

      const message = result.message;

      try {
        if (message.type === "join") {
          if (socket.room) {
            socket.close(
              CLOSE_CODES.INVALID_MESSAGE,
              "Already joined"
            );
            return;
          }

          const room = roomManager.get(message.room);

          if (!room) {
            socket.close(
              CLOSE_CODES.INVALID_MESSAGE,
              "Room not found"
            );
            return;
          }

          if (room.isFull) {
            socket.close(
              CLOSE_CODES.INVALID_MESSAGE,
              "Room is full"
            );
            return;
          }

          const player = {
            id: randomUUID(),
            name: message.name,
            socket
          };

          socket.player = player;
          socket.room = room;

          room.join(player);
          clearTimeout(joinTimer);

          send(socket, {
            type: "joined",
            playerId: player.id,
            room: room.id
          }, true);

          broadcastRoster(room);
          return;
        }

        if (!socket.room || !socket.player) {
          socket.close(
            CLOSE_CODES.INVALID_MESSAGE,
            "Join required"
          );
          return;
        }

        if (message.type === "chat") {
          const chatMessage = socket.room.chat(
            socket.player.id,
            message.text
          );

          broadcast(socket.room, {
            type: "chat",
            playerId: chatMessage.playerId,
            name: chatMessage.name,
            text: chatMessage.text,
            t: chatMessage.t
          });

          return;
        }

        if (message.type === "leave") {
          leaveRoom(socket);
          socket.close(1000, "Left room");
        }
      } catch (error) {
        console.error("WebSocket message error:", error);

        socket.close(
          CLOSE_CODES.INVALID_MESSAGE,
          "Cannot process message"
        );
      }
    });

    socket.on("close", () => {
      clearTimeout(joinTimer);

      try {
        leaveRoom(socket);
      } catch (error) {
        console.error("Room leave error:", error);
      }
    });

    socket.on("error", (error) => {
      console.error("WebSocket error:", error);
    });
  });

  wss.on("error", (error) => {
    console.error("WebSocket server error:", error);
  });

  server.on("upgrade", (request, socket, head) => {
    let pathname;

    try {
      pathname = new URL(
        request.url,
        "http://localhost"
      ).pathname;
    } catch {
      socket.destroy();
      return;
    }

    if (pathname !== "/ws") {
      socket.destroy();
      return;
    }

    wss.handleUpgrade(
      request,
      socket,
      head,
      (websocket) => {
        wss.emit("connection", websocket, request);
      }
    );
  });

  const heartbeat = setInterval(() => {
    for (const socket of wss.clients) {
      if (socket.readyState !== WebSocket.OPEN) {
        continue;
      }

      if (socket.missedPongs >= MAX_MISSED_PONGS) {
        socket.terminate();
        continue;
      }

      socket.missedPongs += 1;

      try {
        socket.ping();
      } catch (error) {
        console.error("Ping failed:", error);
        socket.terminate();
      }
    }
  }, HEARTBEAT_INTERVAL);

  async function close() {
    clearInterval(heartbeat);

    for (const socket of wss.clients) {
      if (socket.readyState === WebSocket.OPEN) {
        socket.close(
          CLOSE_CODES.SERVER_SHUTDOWN,
          "Server shutting down"
        );
      }
    }

    await new Promise((resolve) => {
      const timeout = setTimeout(() => {
        for (const socket of wss.clients) {
          socket.terminate();
        }
      }, 2000);

      wss.close(() => {
        clearTimeout(timeout);
        resolve();
      });
    });
  }

  return {
    wss,
    close
  };
}
