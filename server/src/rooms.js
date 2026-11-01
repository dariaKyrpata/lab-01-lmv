import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";

export class Room extends EventEmitter {
  constructor(id, name, maxPlayers = 4) {
    super();

    this.id = id;
    this.name = name;
    this.maxPlayers = maxPlayers;
    this.players = new Map();

    this.on("error", (error) => {
      console.error(`Room ${this.id}:`, error);
    });
  }

  get isFull() {
    return this.players.size >= this.maxPlayers;
  }

  get roster() {
    return [...this.players.values()].map((player) => ({
      id: player.id,
      name: player.name
    }));
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      players: this.players.size,
      maxPlayers: this.maxPlayers
    };
  }

  join(player) {
    if (this.isFull) {
      throw new Error("Room is full");
    }

    if (this.players.has(player.id)) {
      throw new Error("Player is already in this room");
    }

    this.players.set(player.id, player);
    this.emit("join", player);
    this.emit("event", {
      t: Date.now(),
      type: "join",
      playerId: player.id,
      name: player.name
    });

    return this.roster;
  }

  leave(playerId) {
    const player = this.players.get(playerId);

    if (!player) return false;

    this.players.delete(playerId);
    this.emit("leave", player);
    this.emit("event", {
      t: Date.now(),
      type: "leave",
      playerId,
      name: player.name
    });

    if (this.players.size === 0) {
      this.emit("empty");
    }

    return true;
  }

  chat(playerId, text) {
    const player = this.players.get(playerId);

    if (!player) {
      throw new Error("Player is not in this room");
    }

    const message = {
      t: Date.now(),
      type: "chat",
      playerId,
      name: player.name,
      text
    };

    this.emit("chat", message);
    this.emit("event", message);

    return message;
  }
}

export class RoomManager {
  constructor({ maxRooms = 100, maxPlayers = 4 } = {}) {
    this.rooms = new Map();
    this.maxRooms = maxRooms;
    this.maxPlayers = maxPlayers;
  }

  create(name = "New Room") {
    if (this.rooms.size >= this.maxRooms) {
      throw new Error("Room limit reached");
    }

    if (typeof name !== "string" ||
        !name.trim() ||
        name.length > 50) {
      throw new Error("Invalid room name");
    }

    const id = randomUUID();
    const room = new Room(id, name.trim(), this.maxPlayers);

    room.once("empty", () => {
      this.rooms.delete(room.id);
    });

    this.rooms.set(id, room);

    return room;
  }

  get(id) {
    return this.rooms.get(id) ?? null;
  }

  list() {
    return [...this.rooms.values()].map((room) => room.toJSON());
  }

  remove(id) {
    return this.rooms.delete(id);
  }
}
