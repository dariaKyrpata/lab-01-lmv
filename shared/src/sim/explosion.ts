import { Entity } from "./entity.ts";
import { MutableVector2 } from "./vector.ts";

import { UNSPAWNED_ID } from "../protocol/ids.ts";
import type { ExplosionSnapshot } from "../protocol/snapshots.ts";
import type { Vec2 } from "./vector.ts";
import { ObjectPool } from "./pool.ts";

interface Particle { pos: MutableVector2; vel: MutableVector2; radius: number; life: number }

export function createParticlePool() {
  return new ObjectPool<Particle>(() => ({
    pos: new MutableVector2(), vel: new MutableVector2(), radius: 0, life: 0,
  }), 2048);
}

export class Explosion extends Entity<"explosion"> {
  declare color: string;
  declare duration: number;
  declare ttl: number;
  declare particles: Particle[];
  private particlePool?: ObjectPool<Particle>;

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
      pos: new MutableVector2(
        particle.pos.x,
        particle.pos.y
      ),
      vel: new MutableVector2(
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
    pool = createParticlePool(),
  }: { pos: Vec2; random: () => number; color?: string; particleCount?: number; duration?: number; pool?: ObjectPool<Particle> }) {
    if (typeof random !== "function") {
      throw new TypeError("A seeded random function is required");
    }

    const particles: Particle[] = [];

    for (let i = 0; i < particleCount; i++) {
      const angle = random() * Math.PI * 2;
      const speed = 40 + random() * 180;

      const particle = pool.acquire();
      particle.pos.set(0, 0);
      particle.vel.set(Math.cos(angle) * speed, Math.sin(angle) * speed);
      particle.radius = 1 + random() * 3;
      particle.life = 1;
      particles.push(particle);
    }

    const explosion = new Explosion({ pos, color, duration, ttl: duration });
    explosion.particles = particles;
    explosion.particlePool = pool;
    return explosion;
  }

  update(dt: number) {
    if (!this.alive) {
      return;
    }

    this.ttl -= dt;

    const drag = Math.pow(0.96, dt * 60);
    for (const particle of this.particles) {
      particle.pos.set(particle.pos.x + particle.vel.x * dt, particle.pos.y + particle.vel.y * dt);
      particle.vel.set(particle.vel.x * drag, particle.vel.y * drag);

      particle.life = Math.max(
        0,
        this.ttl / this.duration
      );
    }

    if (this.ttl <= 0) {
      this.destroy();
    }
  }

  recycleParticles() {
    if (!this.particlePool) return;
    for (const particle of this.particles) this.particlePool.release(particle);
    this.particles.length = 0;
    this.particlePool = undefined;
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