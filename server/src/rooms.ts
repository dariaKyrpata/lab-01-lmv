import { logger } from "./logger.ts";
import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";

import {
  getShipColor,
  DEFAULT_SHIP_COLOR,
  getAvailableColors,
} from "../../shared/src/colors.ts";

import type { PlayerColorId } from "../../shared/src/colors.ts";
import type { RoomSummary } from "../../shared/src/protocol/messages.ts";
import type { GameSocket } from "./ws.ts";

export interface JoiningPlayer {
  id: string;
  name: string;
  colorId?: PlayerColorId;
  socket?: GameSocket;
}

export interface Player extends JoiningPlayer {
  colorId: PlayerColorId;
}

type MembershipEvent = {
  t: number;
  type: "join" | "leave";
  playerId: string;
  name: string;
  colorId: PlayerColorId;
};

type ChatEvent = {
  t: number;
  type: "chat";
  playerId: string;
  name: string;
  text: string;
};

interface RoomEvents {
  join: [Player];
  leave: [Player];
  chat: [ChatEvent];
  event: [MembershipEvent | ChatEvent];
  empty: [];
  error: [unknown];
}

export class Room extends EventEmitter<RoomEvents> {
  declare readonly id: string;
  declare readonly name: string;
  declare readonly maxPlayers: number;
  declare readonly players: Map<string, Player>;
  loggingAttached = false;

  constructor(id: string, name: string, maxPlayers = 4) {
    super();

    this.id = id;
    this.name = name;
    this.maxPlayers = maxPlayers;
    this.players = new Map();

    this.on("error", (error) => {
      logger.error({ err: error, roomId: this.id }, "room error");
    });
  }

  get isFull() {
    return this.players.size >= this.maxPlayers;
  }

  get takenColors() {
    return [...this.players.values()].map(
      (player) => player.colorId
    );
  }

  get availableColors() {
    return getAvailableColors(this.takenColors);
  }

  get roster() {
    return [...this.players.values()].map(
      (player) => ({
        id: player.id,
        name: player.name,
        colorId: player.colorId,
      })
    );
  }

  toJSON(): RoomSummary {
    return {
      id: this.id,
      name: this.name,
      players: this.players.size,
      maxPlayers: this.maxPlayers,
      takenColors: this.takenColors,
    };
  }

  join(player: JoiningPlayer) {
    if (this.isFull) {
      throw new Error("Room is full");
    }

    if (this.players.has(player.id)) {
      throw new Error(
        "Player is already in this room"
      );
    }

    const colorId =
      player.colorId ?? this.availableColors[0]?.id ?? (this.maxPlayers > 4 ? DEFAULT_SHIP_COLOR.id : undefined);

    if (!colorId || !getShipColor(colorId)) {
      throw Object.assign(new Error("Invalid ship color"), { code: "INVALID_COLOR" });
    }

    if (this.takenColors.includes(colorId) && (this.maxPlayers <= 4 || player.colorId !== undefined)) {
      throw Object.assign(new Error("Color is already taken"), { code: "COLOR_TAKEN" });
    }

    const joined = Object.assign(player, { colorId });
    this.players.set(player.id, joined);
    this.emit("join", joined);

    this.emit("event", {
      t: Date.now(),
      type: "join",
      playerId: player.id,
      name: player.name,
      colorId,
    });

    return this.roster;
  }

  leave(playerId: string) {
    const player = this.players.get(playerId);

    if (!player) {
      return false;
    }

    this.players.delete(playerId);
    this.emit("leave", player);

    this.emit("event", {
      t: Date.now(),
      type: "leave",
      playerId,
      name: player.name,
      colorId: player.colorId,
    });

    if (this.players.size === 0) {
      this.emit("empty");
    }

    return true;
  }

  chat(playerId: string, text: string) {
    const player = this.players.get(playerId);

    if (!player) {
      throw new Error(
        "Player is not in this room"
      );
    }

    const message: ChatEvent = {
      t: Date.now(),
      type: "chat",
      playerId,
      name: player.name,
      text,
    };

    this.emit("chat", message);
    this.emit("event", message);

    return message;
  }
}

export class RoomManager {
  declare readonly rooms: Map<string, Room>;
  declare readonly maxRooms: number;
  declare readonly maxPlayers: number;

  constructor({
    maxRooms = 100,
    maxPlayers = 4,
  } = {}) {
    this.rooms = new Map();
    this.maxRooms = maxRooms;
    this.maxPlayers = maxPlayers;
  }

  create(name = "New Room") {
    if (this.rooms.size >= this.maxRooms) {
      throw new Error("Room limit reached");
    }

    if (
      typeof name !== "string" ||
      !name.trim() ||
      name.length > 50
    ) {
      throw new Error("Invalid room name");
    }

    const id = randomUUID();

    const room = new Room(
      id,
      name.trim(),
      this.maxPlayers
    );

    room.once("empty", () => {
      this.rooms.delete(room.id);
    });

    this.rooms.set(id, room);

    return room;
  }

  get(id: string) {
    return this.rooms.get(id) ?? null;
  }

  list() {
    return [...this.rooms.values()].map(
      (room) => room.toJSON()
    );
  }

  remove(id: string) {
    return this.rooms.delete(id);
  }
}