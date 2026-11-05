import { randomUUID } from "node:crypto";
import { WebSocket, WebSocketServer } from "ws";

import { Match } from "./match.js";
import { NetworkSimulator } from "./networkSimulator.js";
import { encodeJson } from "../../shared/src/codec/json.js";
import { decodeInput } from "../../shared/src/codec/binaryInput.js";
import { encodeSnapshot } from "../../shared/src/codec/binarySnapshot.js";

import {
  MAX_MESSAGE_BYTES,
  CLOSE_CODES,
  validateMessage,
} from "./protocol.js";

const JOIN_TIMEOUT = 5000;
const HEARTBEAT_INTERVAL = 15000;
const MAX_MISSED_PONGS = 2;
const MAX_MESSAGES_PER_SECOND = 60;
const MAX_BUFFERED_BYTES = 1024 * 1024;

export function attachWebSocketServer(server, roomManager) {
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: MAX_MESSAGE_BYTES,
  });

  const matches = new Map();
  let closing = false;

  function send(socket, message, critical = false) {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return false;
    }

    if (socket.bufferedAmount > MAX_BUFFERED_BYTES) {
      if (critical) {
        socket.close(1013, "Client too slow");
      }

      return false;
    }

        const data =
      socket.wireFormat === "binary" &&
      message.type === "snapshot"
        ? encodeSnapshot(message)
        : encodeJson(message);

    const deliver = () => {
      if (socket.readyState !== WebSocket.OPEN) {
        return;
      }

      if (socket.bufferedAmount > MAX_BUFFERED_BYTES) {
        if (critical) {
          socket.close(1013, "Client too slow");
        }

        return;
      }

      try {
        socket.send(data, (error) => {
          if (error) {
            console.error("WebSocket send failed:", error);
            socket.terminate();
          }
        });
      } catch (error) {
        console.error("WebSocket send failed:", error);
        socket.terminate();
      }
    };

    if (
      message.type === "snapshot" ||
      message.type === "net_pong"
    ) {
      return socket.network.dispatch(deliver);
    }

    deliver();
    return true;
  }

  function broadcast(room, message, critical = false) {
    for (const player of room.players.values()) {
      send(player.socket, message, critical);
    }
  }

  function broadcastRoster(room) {
    broadcast(
      room,
      {
        type: "roster",
        room: room.id,
        players: room.roster,
      },
      true
    );
  }

  function getOrCreateMatch(room) {
    let match = matches.get(room.id);

    if (!match) {
      match = new Match(room, send);
      matches.set(room.id, match);

      room.once("empty", () => {
        match.stop();
        matches.delete(room.id);
      });
    }

    return match;
  }

  function leaveRoom(socket) {
    const room = socket.room;
    const player = socket.player;

    socket.room = null;
    socket.player = null;

    if (!room || !player) {
      return;
    }

    matches.get(room.id)?.removePlayer(player.id);
    room.leave(player.id);

    if (room.players.size > 0) {
      broadcastRoster(room);
    }
  }

    wss.on("connection", (socket, request) => {
    const url = new URL(request.url, "http://localhost");

    socket.wireFormat =
      url.searchParams.get("format") === "binary"
        ? "binary"
        : "json";
    socket.player = null;
    socket.room = null;
    socket.missedPongs = 0;
    socket.network = new NetworkSimulator();

    let tokens = MAX_MESSAGES_PER_SECOND;
    let lastRefill = performance.now();

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
      const now = performance.now();
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

      let result;

      try {
        if (isBinary && socket.wireFormat !== "binary") {
          throw new Error("Binary format is not enabled");
        }

        result = validateMessage(
          isBinary
            ? encodeJson(decodeInput(data))
            : data
        );
      } catch {
        socket.close(
          CLOSE_CODES.INVALID_MESSAGE,
          "Invalid binary input"
        );

        return;
      }
      
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
            colorId: message.colorId,
            socket,
          };

          try {
            room.join(player);
          } catch (error) {
            if (error.code !== "COLOR_TAKEN") {
              throw error;
            }

            send(socket, {
              type: "join_error",
              code: error.code,
              room: room.id,
              takenColors: room.takenColors,
              message: "Цей колір уже зайнятий. Обери інший.",
            }, true);

            return;
          }

          socket.player = player;
          socket.room = room;
          clearTimeout(joinTimer);

          const match = getOrCreateMatch(room);
          const ship = match.addPlayer(player.id);
          ship.colorId = player.colorId;

          send(
            socket,
            {
              type: "joined",
              playerId: player.id,
              shipId: ship.id,
              colorId: player.colorId,
              room: room.id,
              seed: match.world.seed,
              width: match.world.width,
              height: match.world.height,
              tickRate: 30,
            },
            true
          );

          broadcastRoster(room);
          match.start();

          return;
        }

        if (!socket.room || !socket.player) {
          socket.close(
            CLOSE_CODES.INVALID_MESSAGE,
            "Join required"
          );

          return;
        }

        if (message.type === "net_config") {
          socket.network.settings = {
            latency: message.latency,
            jitter: message.jitter,
            drop: message.drop,
          };

          send(socket, {
            type: "net_config",
            ...socket.network.settings,
          });

          return;
        }

        if (
          message.type === "input" ||
          message.type === "net_ping"
        ) {
          const room = socket.room;
          const player = socket.player;

          socket.network.dispatch(() => {
            if (
              socket.room !== room ||
              socket.player !== player ||
              socket.readyState !== WebSocket.OPEN
            ) {
              return;
            }

            try {
              if (message.type === "input") {
                matches
                  .get(room.id)
                  ?.enqueue(player.id, message);
              } else {
                send(socket, {
                  type: "net_pong",
                  clientTime: message.clientTime,
                  serverTime: performance.now(),
                });
              }
            } catch (error) {
              console.error(
                "Delayed message failed:",
                error
              );

              socket.close(
                1011,
                "Cannot process message"
              );
            }
          });

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
            t: chatMessage.t,
          });

          return;
        }

        if (message.type === "leave") {
          leaveRoom(socket);
          socket.close(1000, "Left room");
        }
      } catch (error) {
        console.error(
          "WebSocket message error:",
          error
        );

        socket.close(
          CLOSE_CODES.INVALID_MESSAGE,
          "Cannot process message"
        );
      }
    });

    socket.on("close", () => {
      clearTimeout(joinTimer);
      socket.network.close();

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
    if (closing) {
      socket.destroy();
      return;
    }

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
    closing = true;
    clearInterval(heartbeat);

    for (const match of matches.values()) {
      match.stop();
    }

    for (const socket of wss.clients) {
      socket.network.close();

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

    matches.clear();
  }

  return {
    wss,
    close,
    getStats() {
      return [...matches.values()].map(
        (match) => match.getStats()
      );
    },
  };
}