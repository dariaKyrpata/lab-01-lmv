import { Bus } from "./bus.ts";
import type { GameEvent } from "../../shared/src/protocol/snapshots.ts";

type GameEvents = {
  [K in GameEvent["type"]]: Extract<GameEvent, { type: K }>;
};

export const gameEvents = new Bus<GameEvents>();

export function emitGameEvent(event: GameEvent): void {
  switch (event.type) {
    case "fired": gameEvents.emit("fired", event); return;
    case "hit": gameEvents.emit("hit", event); return;
    case "exploded": gameEvents.emit("exploded", event); return;
    default: {
      const unexpected: never = event;
      throw new Error("Unhandled game event: " + String(unexpected));
    }
  }
}
