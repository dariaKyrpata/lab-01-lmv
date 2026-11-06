import { startHeartbeat } from "./heartbeat.ts";
import type { SnapshotPayload } from "../../shared/src/protocol/messages.ts";
import { TokenBucket } from "./rateLimit.ts";
import { randomUUID } from "node:crypto";
import { WebSocket, WebSocketServer } from "ws";

import { Match } from "./match.ts";
import { NetworkSimulator } from "./networkSimulator.ts";
import { serverBinaryCodec, serverJsonCodec } from "../../shared/src/codec/codec.ts";

import {
  MAX_MESSAGE_BYTES,
  CLOSE_CODES,
  validateMessage,
} from "./protocol.ts";

import type { Server } from "node:http";
import type { Room, RoomManager, Player } from "./rooms.ts";
import type { ServerPayload, ClientMessage } from "../../shared/src/protocol/messages.ts";

export class GameSocket extends WebSocket {
  player: Player | null = null;
  room: Room | null = null;
  missedPongs = 0;
  network = new NetworkSimulator();
  wireFormat: "json" | "binary" = "json";
}

const JOIN_TIMEOUT = 5000;
const HEARTBEAT_INTERVAL = 15000;
const MAX_MISSED_PONGS = 2;
const MAX_MESSAGES_PER_SECOND = 60;
const MAX_BUFFERED_BYTES = 1024 * 1024;

export function attachWebSocketServer(server: Server, roomManager: RoomManager) {
  const wss = new WebSocketServer({
    noServer: true,
    WebSocket: GameSocket,
    maxPayload: MAX_MESSAGE_BYTES,
  });

  const matches = new Map<string, Match>();
  let closing = false;
  const frames = new WeakMap<SnapshotPayload["state"], Map<string, string | ArrayBuffer>>();

  function encodeFrame(message: SnapshotPayload, format: GameSocket["wireFormat"]) {
    let variants = frames.get(message.state);
    if (!variants) {
      variants = new Map();
      frames.set(message.state, variants);
    }
    const key = format + ":" + message.sentAt + ":" + message.lastProcessedSeq;
    const cached = variants.get(key);
    if (cached !== undefined) return cached;
    const encoded = format === "binary" ? serverBinaryCodec.encode(message) : serverJsonCodec.encode(message);
    variants.set(key, encoded);
    return encoded;
  }

  function send(socket: GameSocket | undefined, message: ServerPayload, critical = false) {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return false;
    }

    if (socket.bufferedAmount > MAX_BUFFERED_BYTES) {
      if (critical) {
        socket.close(1013, "Client too slow");
      }

      return false;
    }

    const data = message.type === "snapshot" ? encodeFrame(message, socket.wireFormat) : serverJsonCodec.encode(message);

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
      } catch (error: unknown) {
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

  function broadcast(room: Room, message: ServerPayload, critical = false) {
    for (const player of room.players.values()) {
      send(player.socket, message, critical);
    }
  }

  function broadcastRoster(room: Room) {
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

  function getOrCreateMatch(room: Room) {
    let match = matches.get(room.id);

    if (!match) {
      const created = new Match(room, send);
      match = created;
      matches.set(room.id, created);

      room.once("empty", () => {
        created.stop();
        matches.delete(room.id);
      });
    }

    return match;
  }

  function leaveRoom(socket: GameSocket) {
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
    const url = new URL(request.url ?? "/ws", "http://localhost");

    socket.wireFormat =
      url.searchParams.get("format") === "binary"
        ? "binary"
        : "json";

    const limiter = new TokenBucket(MAX_MESSAGES_PER_SECOND, performance.now());

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
      if (!limiter.take(performance.now())) {
        socket.close(
          CLOSE_CODES.RATE_LIMIT,
          "Rate limit exceeded"
        );

        return;
      }

      let message: ClientMessage;

      if (isBinary) {
        try {
          if (socket.wireFormat !== "binary") throw new Error("Binary format is not enabled");
          message = serverBinaryCodec.decode(data);
        } catch (error: unknown) {
          console.warn("Rejected binary input:", error instanceof Error ? error.message : String(error));
          socket.close(CLOSE_CODES.INVALID_MESSAGE, "Invalid binary input");
          return;
        }
      } else {
        const result = validateMessage(data);
        if (!result.ok) {
          console.warn("Rejected client message:", result.error);
          socket.close(result.closeCode, result.error.slice(0, 100));
          return;
        }
        message = result.message;
      }

      try {
        if (message.type !== "join" && (!socket.room || !socket.player)) {
          socket.close(CLOSE_CODES.INVALID_MESSAGE, "Join required");
          return;
        }

        switch (message.type) {
        case "join": {
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

          const joining = {
            id: randomUUID(),
            name: message.name,
            colorId: message.colorId,
            socket,
          };

          try {
            room.join(joining);
          } catch (error: unknown) {
            if (!(error instanceof Error) || !("code" in error) || error.code !== "COLOR_TAKEN") {
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

          const player = room.players.get(joining.id);
          if (!player) throw new Error("Joined player is missing");
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


        case "net_config": {
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

        case "input":
        case "net_ping": {
          const room = socket.room;
          const player = socket.player;
          if (!room || !player) return;

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
            } catch (error: unknown) {
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

        case "chat": {
          const room = socket.room;
          const player = socket.player;
          if (!room || !player) return;
          const chatMessage = room.chat(
            player.id,
            message.text
          );

          broadcast(room, {
            type: "chat",
            playerId: chatMessage.playerId,
            name: chatMessage.name,
            text: chatMessage.text,
            t: chatMessage.t,
          });

          return;
        }

        case "leave": {
          leaveRoom(socket);
          socket.close(1000, "Left room");
          return;
        }
        default: {
          const unexpected: never = message;
          throw new Error("Unhandled client message: " + String(unexpected));
        }
        }
      } catch (error: unknown) {
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
      } catch (error: unknown) {
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
        request.url ?? "/",
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

  const heartbeat = startHeartbeat(wss.clients, HEARTBEAT_INTERVAL, MAX_MISSED_PONGS);

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

    await new Promise<void>((resolve) => {
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
    setBots(room: Room, count: number) {
      const match = getOrCreateMatch(room);
      match.setBots(count);
      if (count > 0 || room.players.size > 0) match.start();
    },
    getStats() {
      return [...matches.values()].map(
        (match) => match.getStats()
      );
    },
  };
}