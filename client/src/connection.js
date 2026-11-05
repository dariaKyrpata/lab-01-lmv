import {
  encodeJson,
  decodeJson,
  byteLength,
} from "../../shared/src/codec/json.js";
import { encodeInput } from "../../shared/src/codec/binaryInput.js";
import { decodeSnapshot } from "../../shared/src/codec/binarySnapshot.js";
import {
  getShipColor,
} from "../../shared/src/colors.js";

const MAX_QUEUE_LENGTH = 100;
const MAX_BUFFERED_BYTES = 64 * 1024;

export class GameConnection extends EventTarget {
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

  connect(name, roomId, colorId = "pink") {
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

      let message;

      try {
        if (typeof event.data === "string") {
          this.metrics.received += byteLength(event.data);
          message = decodeJson(event.data);
        } else if (event.data instanceof ArrayBuffer) {
          this.metrics.received += event.data.byteLength;
          message = decodeSnapshot(event.data);
        } else {
          throw new TypeError("Unsupported message format");
        }
      } catch (error) {
        this.emit("error", {
          message: error.message,
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

      this.emit(message.type, message);
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

  sendRaw(message) {
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
        ? encodeInput(message)
        : encodeJson(message);

    socket.send(data);

    this.metrics.sent += typeof data === "string"
      ? byteLength(data)
      : data.byteLength;
    return true;
  }

  send(message) {
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

  sendChat(text) {
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

      if (!this.sendRaw(message)) {
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

  emit(type, detail = {}) {
    this.dispatchEvent(
      new CustomEvent(type, { detail })
    );
  }

  disconnect() {
    const socket = this.socket;
    const wasJoined = this.joined;

    this.shouldReconnect = false;
    this.joined = false;

    clearTimeout(this.reconnectTimer);
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