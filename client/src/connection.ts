import { measure } from "./performance.ts";
import { byteLength } from "../../shared/src/codec/json.ts";
import { clientBinaryCodec, clientJsonCodec } from "../../shared/src/codec/codec.ts";
import {
  getShipColor,
} from "../../shared/src/colors.ts";

import { Bus } from "./bus.ts";
import type { ColorId } from "../../shared/src/colors.ts";
import type { ClientPayload, ServerMessage, ServerMessageOf } from "../../shared/src/protocol/messages.ts";

export type ConnectionEvents = {
  [K in ServerMessage["type"]]: ServerMessageOf<K>;
} & {
  error: { message: string };
  disconnected: { code: number; reason: string };
  reconnecting: { attempt: number; delay: number };
};

const MAX_QUEUE_LENGTH = 100;
const MAX_BUFFERED_BYTES = 64 * 1024;

export class GameConnection extends Bus<ConnectionEvents> {
  declare readonly wireFormat: "json" | "binary";
  declare socket: WebSocket | null;
  declare queue: ClientPayload[];
  declare playerName: string | null;
  declare roomId: string | null;
  declare colorId: ColorId | null;
  declare joined: boolean;
  declare shouldReconnect: boolean;
  declare reconnectAttempts: number;
  declare reconnectTimer: ReturnType<typeof setTimeout> | null;
  declare readonly metrics: { received: number; sent: number };

  constructor() {
    super();

    this.wireFormat =
      new URLSearchParams(window.location.search).get("format") === "json"
        ? "json"
        : "binary";

    this.socket = null;
    this.queue = [];

    this.playerName = null;
    this.roomId = null;
    this.colorId = null;

    this.joined = false;
    this.shouldReconnect = false;

    this.reconnectAttempts = 0;
    this.reconnectTimer = null;

    this.metrics = {
      received: 0,
      sent: 0,
    };
  }

  connect(name: string, roomId: string, colorId: ColorId = "pink") {
    if (!name || !roomId) {
      throw new Error(
        "Player name and room are required"
      );
    }

    if (!getShipColor(colorId)) {
      throw new Error("Invalid ship color");
    }

    this.disconnect();

    this.playerName = name;
    this.roomId = roomId;
    this.colorId = colorId;

    this.shouldReconnect = true;
    this.reconnectAttempts = 0;

    this.openSocket();
  }

  openSocket() {
    if (!this.shouldReconnect) {
      return;
    }

    const protocol =
      window.location.protocol === "https:"
        ? "wss:"
        : "ws:";

    const url =
      `${protocol}//${window.location.host}/ws` +
      `?format=${this.wireFormat}`;

    const socket = new WebSocket(url);
    socket.binaryType = "arraybuffer";

    this.socket = socket;
    this.joined = false;

    socket.addEventListener("open", () => {
      if (this.socket !== socket) {
        return;
      }

      if (!this.roomId || !this.playerName || !this.colorId) return;

      this.sendRaw({
        type: "join",
        room: this.roomId,
        name: this.playerName,
        colorId: this.colorId,
      });
    });

    socket.addEventListener("message", (event) => {
      if (this.socket !== socket) {
        return;
      }

      let message: ServerMessage;
      const data: unknown = event.data;

      try {
        if (typeof data === "string") {
          this.metrics.received += byteLength(data);
          message = measure("dogfight:decode", () => clientJsonCodec.decode(data));
        } else if (data instanceof ArrayBuffer) {
          this.metrics.received += data.byteLength;
          message = measure("dogfight:decode", () => clientBinaryCodec.decode(data));
        } else {
          throw new TypeError("Unsupported message format");
        }
      } catch (error) {
        this.emit("error", {
          message: error instanceof Error ? error.message : String(error),
        });

        return;
      }

      if (message.type === "joined") {
        this.joined = true;
        this.colorId = message.colorId;
        this.reconnectAttempts = 0;

        this.emit("joined", message);
        this.flushQueue();

        return;
      }

      if (message.type === "join_error") {
        this.disconnect();
        this.emit("join_error", message);

        return;
      }

      switch (message.type) {
        case "roster": this.emit("roster", message); break;
        case "snapshot": this.emit("snapshot", message); break;
        case "chat": this.emit("chat", message); break;
        case "net_config": this.emit("net_config", message); break;
        case "net_pong": this.emit("net_pong", message); break;
        default: {
          const unexpected: never = message;
          throw new Error("Unhandled server message: " + String(unexpected));
        }
      }
    });

    socket.addEventListener("close", (event) => {
      if (this.socket !== socket) {
        return;
      }

      this.socket = null;
      this.joined = false;

      this.emit("disconnected", {
        code: event.code,
        reason: event.reason,
      });

      if (
        this.shouldReconnect &&
        event.code !== 1000 &&
        event.code !== 1008 &&
        event.code !== 1009
      ) {
        this.scheduleReconnect();
      } else {
        this.shouldReconnect = false;
      }
    });

    socket.addEventListener("error", () => {
      if (this.socket !== socket) {
        return;
      }

      this.emit("error", {
        message: "WebSocket connection error",
      });
    });
  }

  sendRaw(message: ClientPayload) {
    const socket = this.socket;

    if (
      !socket ||
      socket.readyState !== WebSocket.OPEN ||
      socket.bufferedAmount > MAX_BUFFERED_BYTES
    ) {
      return false;
    }

    const data =
      this.wireFormat === "binary" &&
      message.type === "input"
        ? clientBinaryCodec.encode(message)
        : clientJsonCodec.encode(message);

    socket.send(data);

    this.metrics.sent += typeof data === "string"
      ? byteLength(data)
      : data.byteLength;
    return true;
  }

  send(message: ClientPayload) {
    if (this.joined && this.sendRaw(message)) {
      return true;
    }

    if (
      message.type === "input" ||
      message.type === "net_ping"
    ) {
      return false;
    }

    if (this.queue.length >= MAX_QUEUE_LENGTH) {
      this.queue.shift();
    }

    this.queue.push(message);

    return false;
  }

  sendChat(text: string) {
    if (
      typeof text !== "string" ||
      !text.trim()
    ) {
      return;
    }

    this.send({
      type: "chat",
      text: text.trim().slice(0, 500),
    });
  }

  flushQueue() {
    while (this.joined && this.queue.length > 0) {
      const message = this.queue[0];

      if (!message || !this.sendRaw(message)) {
        break;
      }

      this.queue.shift();
    }
  }

  scheduleReconnect() {
    if (
      !this.shouldReconnect ||
      this.reconnectTimer !== null
    ) {
      return;
    }

    const delay = Math.min(
      30000,
      1000 * 2 ** this.reconnectAttempts
    );

    this.reconnectAttempts++;

    this.emit("reconnecting", {
      attempt: this.reconnectAttempts,
      delay,
    });

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.openSocket();
    }, delay);
  }


  disconnect() {
    const socket = this.socket;
    const wasJoined = this.joined;

    this.shouldReconnect = false;
    this.joined = false;

    if (this.reconnectTimer !== null) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;

    this.queue = [];

    if (!socket) {
      return;
    }

    if (
      wasJoined &&
      socket.readyState === WebSocket.OPEN
    ) {
      this.sendRaw({
        type: "leave",
      });
    }

    this.socket = null;
    socket.close(1000, "Client disconnected");
  }
}