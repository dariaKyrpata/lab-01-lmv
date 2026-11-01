import { Entity } from "./entity.js";
import { Vector2 } from "./vector.js";

export class Explosion extends Entity {
  constructor({
    pos = new Vector2(),
    color = "#ff9f43",
    particleCount = 20,
    duration = 0.8,
  } = {}) {
    super({
      pos,
      vel: new Vector2(),
      radius: 0,
      kind: "explosion",
    });

    this.color = color;
    this.duration = duration;
    this.ttl = duration;
    this.particles = [];

    for (let i = 0; i < particleCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 40 + Math.random() * 180;

      const velocity = Vector2.fromAngle(angle).scale(speed);

      this.particles.push({
        pos: new Vector2(),
        vel: velocity,
        radius: 1 + Math.random() * 3,
        life: 1,
      });
    }
  }

  update(dt) {
    if (!this.alive) return;

    this.ttl -= dt;

    for (const particle of this.particles) {
      particle.pos = particle.pos.add(particle.vel.scale(dt));

      particle.vel = particle.vel.scale(Math.pow(0.96, dt * 60));

      particle.life = Math.max(0, this.ttl / this.duration);
    }

    if (this.ttl <= 0) {
      this.destroy();
    }
  }
}
