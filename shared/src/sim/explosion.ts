import { Entity } from "./entity.ts";
import { Vector2 } from "./vector.ts";

import { UNSPAWNED_ID } from "../protocol/ids.ts";
import type { ExplosionSnapshot } from "../protocol/snapshots.ts";
import type { Vec2 } from "./vector.ts";
interface Particle { pos: Vector2; vel: Vector2; radius: number; life: number }

export class Explosion extends Entity<"explosion"> {
  declare color: string;
  declare duration: number;
  declare ttl: number;
  declare particles: Particle[];

  constructor({
    id = UNSPAWNED_ID,
    pos,
    angle = 0,
    radius = 0,
    alive = true,
    color = "#ff9f43",
    duration = 0.8,
    ttl = duration,
    particles = [],
  }: Partial<ExplosionSnapshot> = {}) {
    super({
      id,
      pos,
      angle,
      radius,
      alive,
      kind: "explosion",
    });

    this.color = color;
    this.duration = duration;
    this.ttl = ttl;

    this.particles = particles.map((particle) => ({
      pos: new Vector2(
        particle.pos.x,
        particle.pos.y
      ),
      vel: new Vector2(
        particle.vel.x,
        particle.vel.y
      ),
      radius: particle.radius,
      life: particle.life,
    }));
  }

  static create({
    pos,
    random,
    color = "#ff9f43",
    particleCount = 20,
    duration = 0.8,
  }: { pos: Vec2; random: () => number; color?: string; particleCount?: number; duration?: number }) {
    if (typeof random !== "function") {
      throw new TypeError("A seeded random function is required");
    }

    const particles = [];

    for (let i = 0; i < particleCount; i++) {
      const angle = random() * Math.PI * 2;
      const speed = 40 + random() * 180;

      particles.push({
        pos: new Vector2(),
        vel: Vector2.fromAngle(angle).scale(speed),
        radius: 1 + random() * 3,
        life: 1,
      });
    }

    return new Explosion({
      pos,
      color,
      duration,
      ttl: duration,
      particles,
    });
  }

  update(dt: number) {
    if (!this.alive) {
      return;
    }

    this.ttl -= dt;

    for (const particle of this.particles) {
      particle.pos = particle.pos.add(
        particle.vel.scale(dt)
      );

      particle.vel = particle.vel.scale(
        Math.pow(0.96, dt * 60)
      );

      particle.life = Math.max(
        0,
        this.ttl / this.duration
      );
    }

    if (this.ttl <= 0) {
      this.destroy();
    }
  }

  toSnapshot(): ExplosionSnapshot {
    return {
      ...super.toSnapshot(),
      color: this.color,
      duration: this.duration,
      ttl: this.ttl,
      particles: this.particles.map((particle) => ({
        pos: {
          x: particle.pos.x,
          y: particle.pos.y,
        },
        vel: {
          x: particle.vel.x,
          y: particle.vel.y,
        },
        radius: particle.radius,
        life: particle.life,
      })),
    };
  }

  static fromSnapshot(snapshot: ExplosionSnapshot) {
    return new Explosion(snapshot);
  }
}