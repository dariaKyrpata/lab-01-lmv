const PROTOCOL_VERSION = 1;
const MAX_QUEUE_LENGTH = 100;

export class GameConnection extends EventTarget {
  constructor() {
    super();

    this.socket = null;
    this.queue = [];
    this.playerName = null;
    this.roomId = null;

    this.reconnectAttempts = 0;
    this.reconnectTimer = null;
    this.shouldReconnect = false;
    this.joined = false;
  }

  connect(name, roomId) {
    if (!name || !roomId) {
      throw new Error("Player name and room are required");
    }

    this.disconnect();

    this.playerName = name;
    this.roomId = roomId;
    this.shouldReconnect = true;
    this.reconnectAttempts = 0;

    this.openSocket();
  }

  openSocket() {
    if (!this.shouldReconnect) return;

    const protocol =
      window.location.protocol === "https:" ? "wss:" : "ws:";

    const url = `${protocol}//${window.location.host}/ws`;
    const socket = new WebSocket(url);

    this.socket = socket;
    this.joined = false;

    socket.addEventListener("open", () => {
      if (this.socket !== socket) return;

      this.sendRaw({
        type: "join",
        room: this.roomId,
        name: this.playerName
      });
    });

    socket.addEventListener("message", (event) => {
      if (this.socket !== socket) return;

      let message;

      try {
        message = JSON.parse(event.data);
      } catch {
        this.emit("error", {
          message: "Invalid server response"
        });
        return;
      }

      if (
        message.version !== PROTOCOL_VERSION ||
        typeof message.type !== "string"
      ) {
        this.emit("error", {
          message: "Unsupported server message"
        });
        return;
      }

      if (message.type === "joined") {
        this.joined = true;
        this.reconnectAttempts = 0;

        this.emit("joined", message);
        this.flushQueue();
        return;
      }

      this.emit(message.type, message);
    });

    socket.addEventListener("close", (event) => {
      if (this.socket !== socket) return;

      this.socket = null;
      this.joined = false;

      this.emit("disconnected", {
        code: event.code,
        reason: event.reason
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
      if (this.socket !== socket) return;

      this.emit("error", {
        message: "WebSocket connection error"
      });
    });
  }

  sendRaw(message) {
    if (
      !this.socket ||
      this.socket.readyState !== WebSocket.OPEN
    ) {
      return false;
    }

    this.socket.send(JSON.stringify({
      version: PROTOCOL_VERSION,
      ...message
    }));

    return true;
  }

  send(message) {
    if (this.joined && this.sendRaw(message)) {
      return true;
    }

    if (this.queue.length >= MAX_QUEUE_LENGTH) {
      this.queue.shift();
    }

    this.queue.push(message);
    return false;
  }

  sendChat(text) {
    if (typeof text !== "string" || !text.trim()) return;

    this.send({
      type: "chat",
      text: text.trim().slice(0, 500)
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
    if (!this.shouldReconnect || this.reconnectTimer) return;

    const delay = Math.min(
      30000,
      1000 * 2 ** this.reconnectAttempts
    );

    this.reconnectAttempts += 1;

    this.emit("reconnecting", {
      attempt: this.reconnectAttempts,
      delay
    });

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.openSocket();
    }, delay);
  }

  emit(type, detail = {}) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }

  disconnect() {
    this.shouldReconnect = false;
    this.joined = false;

    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;

    this.queue = [];

    if (this.socket) {
      const socket = this.socket;
      this.socket = null;

      if (socket.readyState === WebSocket.OPEN) {
        this.sendRaw({
          type: "leave"
        });
      }

      socket.close(1000, "Client disconnected");
    }
  }
}
