import { SeqSchema } from "../../shared/src/protocol/ids.ts";
import { normalizeAngle } from "../../shared/src/movement.ts";
import type { Input } from "../../shared/src/protocol/messages.ts";
import type { World } from "../../shared/src/sim/world.ts";

export function botInput(world: World, playerId: string): Input | null {
  const ship = world.getPlayer(playerId);
  if (!ship?.alive) return null;
  let heading = ship.angle;
  let nearest = Infinity;

  for (const target of world.ofKind("ship")) {
    if (target.id === ship.id) continue;
    const dx = target.pos.x - ship.pos.x;
    const dy = target.pos.y - ship.pos.y;
    const distance = dx * dx + dy * dy;
    if (distance >= nearest) continue;
    nearest = distance;
    heading = Math.atan2(dy, dx);
  }

  const aim = normalizeAngle(heading - ship.angle);
  const dodge = nearest < 80 ** 2;
  const steering = dodge ? normalizeAngle(aim + Math.PI / 2) : aim;
  return {
    version: 1,
    type: "input",
    seq: SeqSchema.parse(world.tick + 1),
    tick: world.tick,
    turn: steering > 0.08 ? 1 : steering < -0.08 ? -1 : 0,
    thrust: true,
    fire: Math.abs(aim) < 0.6,
    homing: false,
  };
}
