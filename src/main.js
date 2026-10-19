import { createLoop } from "./loop.js";
import { createInput } from "./input.js";
import { World } from "./sim/world.js";

document.body.style.margin = "0";
document.body.style.overflow = "hidden";
document.body.style.backgroundColor = "#050814";

const canvas = document.createElement("canvas");
document.body.appendChild(canvas);

const ctx = canvas.getContext("2d");
const input = createInput(window);

const world = new World(window.innerWidth, window.innerHeight);

world.createPlayer(input);

const previousStates = new Map();
let stars = [];

// Starfield
function createStars(width, height) {
  const count = Math.max(80, Math.floor((width * height) / 9000));

  const items = [];

  for (let i = 0; i < count; i++) {
    items.push({
      x: Math.random() * width,
      y: Math.random() * height,
      radius: 0.5 + Math.random() * 1.8,
      alpha: 0.2 + Math.random() * 0.8,
      twinkleSpeed: 0.5 + Math.random() * 2,
      phase: Math.random() * Math.PI * 2,
    });
  }

  return items;
}

// Canvas setup
function resizeCanvas() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  const dpr = window.devicePixelRatio || 1;

  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);

  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  world.width = width;
  world.height = height;

  stars = createStars(width, height);
}

window.addEventListener("resize", resizeCanvas);
resizeCanvas();

window.addEventListener("keydown", (event) => {
  if (
    ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(
      event.code,
    )
  ) {
    event.preventDefault();
  }
});

// Interpolation
function lerp(start, end, alpha) {
  return start + (end - start) * alpha;
}

function lerpAngle(start, end, alpha) {
  const difference = Math.atan2(Math.sin(end - start), Math.cos(end - start));

  return start + difference * alpha;
}

// Simulation
function simulate(dt) {
  previousStates.clear();

  for (const entity of world) {
    previousStates.set(entity.id, {
      x: entity.pos.x,
      y: entity.pos.y,
      angle: entity.angle,
    });
  }

  world.step(dt, input);
}

// Space background
function drawBackground() {
  const width = world.width;
  const height = world.height;
  const time = performance.now() * 0.001;

  const gradient = ctx.createLinearGradient(0, 0, 0, height);

  gradient.addColorStop(0, "#050814");
  gradient.addColorStop(0.5, "#080d1f");
  gradient.addColorStop(1, "#0b1026");

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  // Twinkling stars
  for (const star of stars) {
    const twinkle =
      0.65 + 0.35 * Math.sin(time * star.twinkleSpeed + star.phase);

    ctx.globalAlpha = star.alpha * twinkle;

    ctx.beginPath();
    ctx.arc(star.x, star.y, star.radius, 0, Math.PI * 2);

    ctx.fillStyle = "#ffffff";
    ctx.fill();

    if (star.radius > 1.4) {
      ctx.beginPath();

      ctx.moveTo(star.x - star.radius * 2, star.y);
      ctx.lineTo(star.x + star.radius * 2, star.y);

      ctx.moveTo(star.x, star.y - star.radius * 2);
      ctx.lineTo(star.x, star.y + star.radius * 2);

      ctx.strokeStyle = "rgba(255, 255, 255, 0.35)";

      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  ctx.globalAlpha = 1;

  // Subtle space grid
  ctx.strokeStyle = "rgba(70, 86, 130, 0.16)";
  ctx.lineWidth = 1;
  ctx.beginPath();

  for (let x = 0; x < width; x += 50) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
  }

  for (let y = 0; y < height; y += 50) {
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
  }

  ctx.stroke();
}

// Pink and white spaceship
function drawShip(ship) {
  if (!ship.alive) return;

  ctx.save();

  if (
    ship.invulnerableTime > 0 &&
    Math.floor(ship.invulnerableTime * 10) % 2 === 0
  ) {
    ctx.globalAlpha = 0.5;
  }

  // Active protective shield
  if (ship.shieldTime > 0) {
    ctx.beginPath();
    ctx.arc(0, 0, 37, 0, Math.PI * 2);

    ctx.strokeStyle = "#4deeea";
    ctx.lineWidth = 2;

    ctx.shadowColor = "#4deeea";
    ctx.shadowBlur = 18;

    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  // Engine flames
  if (ship.thrust) {
    const flameLength = 12 + Math.random() * 8;

    ctx.shadowColor = "#ff4fd8";
    ctx.shadowBlur = 15;

    for (const y of [-15, 15]) {
      const flame = ctx.createLinearGradient(-14, y, -30 - flameLength, y);

      flame.addColorStop(0, "#ffffff");
      flame.addColorStop(0.3, "#ffb3ef");
      flame.addColorStop(0.7, "#ff4fd8");
      flame.addColorStop(1, "rgba(255, 40, 175, 0)");

      ctx.beginPath();
      ctx.moveTo(-14, y - 4);
      ctx.lineTo(-30 - flameLength, y);
      ctx.lineTo(-14, y + 4);
      ctx.closePath();

      ctx.fillStyle = flame;
      ctx.fill();
    }

    ctx.shadowBlur = 0;
  }

  // Rear wings
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.scale(1, side);

    ctx.beginPath();
    ctx.moveTo(-13, 7);
    ctx.lineTo(-30, 24);
    ctx.lineTo(-24, 27);
    ctx.lineTo(-8, 12);
    ctx.closePath();

    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "#ff4fa3";
    ctx.lineWidth = 1.5;
    ctx.fill();
    ctx.stroke();

    ctx.restore();
  }

  // Main wings
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.scale(1, side);

    ctx.beginPath();
    ctx.moveTo(8, 6);
    ctx.lineTo(-5, 12);
    ctx.lineTo(-25, 32);
    ctx.lineTo(-31, 33);
    ctx.lineTo(-18, 10);
    ctx.closePath();

    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "#ff4fa3";
    ctx.lineWidth = 2;
    ctx.fill();
    ctx.stroke();

    // Pink wing tips
    ctx.beginPath();
    ctx.moveTo(-25, 27);
    ctx.lineTo(-31, 33);
    ctx.lineTo(-18, 31);
    ctx.lineTo(-16, 24);
    ctx.closePath();

    ctx.fillStyle = "#ff4fa3";
    ctx.fill();

    // Wing details
    ctx.beginPath();
    ctx.moveTo(0, 11);
    ctx.lineTo(-15, 23);
    ctx.lineTo(-20, 28);
    ctx.lineTo(-13, 13);
    ctx.closePath();

    ctx.fillStyle = "#ff92cb";
    ctx.fill();

    ctx.restore();
  }

  // Main body
  ctx.beginPath();
  ctx.moveTo(30, 0);
  ctx.lineTo(13, -9);
  ctx.lineTo(-9, -11);
  ctx.lineTo(-21, -7);
  ctx.lineTo(-25, 0);
  ctx.lineTo(-21, 7);
  ctx.lineTo(-9, 11);
  ctx.lineTo(13, 9);
  ctx.closePath();

  ctx.fillStyle = "#f9f9ff";
  ctx.strokeStyle = "#ff4fa3";
  ctx.lineWidth = 2;
  ctx.fill();
  ctx.stroke();

  // Pink nose
  ctx.beginPath();
  ctx.moveTo(30, 0);
  ctx.lineTo(18, -5);
  ctx.lineTo(18, 5);
  ctx.closePath();

  ctx.fillStyle = "#ff4fa3";
  ctx.fill();

  // Central pink stripe
  ctx.beginPath();
  ctx.moveTo(18, 0);
  ctx.lineTo(9, -3);
  ctx.lineTo(-17, -3);
  ctx.lineTo(-21, 0);
  ctx.lineTo(-17, 3);
  ctx.lineTo(9, 3);
  ctx.closePath();

  ctx.fillStyle = "#ff63b1";
  ctx.fill();

  // Side engines
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.scale(1, side);

    ctx.beginPath();
    ctx.moveTo(3, 9);
    ctx.lineTo(-4, 8);
    ctx.lineTo(-15, 10);
    ctx.lineTo(-17, 19);
    ctx.lineTo(-5, 20);
    ctx.lineTo(3, 15);
    ctx.closePath();

    ctx.fillStyle = "#f5f5fc";
    ctx.strokeStyle = "#34394e";
    ctx.lineWidth = 1.5;
    ctx.fill();
    ctx.stroke();

    // Pink engine covers
    ctx.beginPath();
    ctx.moveTo(2, 10);
    ctx.lineTo(-5, 10);
    ctx.lineTo(-11, 12);
    ctx.lineTo(-10, 17);
    ctx.lineTo(-3, 16);
    ctx.closePath();

    ctx.fillStyle = "#ff4fa3";
    ctx.fill();

    // Engine exhaust
    ctx.beginPath();
    ctx.rect(-18, 11, 5, 8);

    ctx.fillStyle = "#353a51";
    ctx.fill();

    ctx.restore();
  }

  // Cockpit frame
  ctx.beginPath();
  ctx.moveTo(13, 0);
  ctx.lineTo(4, -7);
  ctx.lineTo(-7, -6);
  ctx.lineTo(-13, 0);
  ctx.lineTo(-7, 6);
  ctx.lineTo(4, 7);
  ctx.closePath();

  ctx.fillStyle = "#242b40";
  ctx.strokeStyle = "#121824";
  ctx.lineWidth = 2;
  ctx.fill();
  ctx.stroke();

  // Blue cockpit glass
  ctx.beginPath();
  ctx.moveTo(10, 0);
  ctx.lineTo(3, -5);
  ctx.lineTo(-6, -4);
  ctx.lineTo(-10, 0);
  ctx.lineTo(-6, 4);
  ctx.lineTo(3, 5);
  ctx.closePath();

  const glass = ctx.createLinearGradient(10, -5, -10, 5);

  glass.addColorStop(0, "#9af0ff");
  glass.addColorStop(0.35, "#29bbff");
  glass.addColorStop(0.7, "#0875e7");
  glass.addColorStop(1, "#0737a6");

  ctx.fillStyle = glass;
  ctx.fill();

  // Cockpit reflection
  ctx.beginPath();
  ctx.moveTo(7, -2);
  ctx.lineTo(2, -4);
  ctx.lineTo(-5, -3);
  ctx.lineTo(-1, -1);
  ctx.closePath();

  ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
  ctx.fill();

  ctx.restore();
}

// Bullets
function drawBullet(bullet) {
  ctx.beginPath();
  ctx.arc(0, 0, bullet.radius, 0, Math.PI * 2);

  ctx.fillStyle = bullet.homing ? "#4deeea" : "#ffeb70";

  ctx.shadowColor = ctx.fillStyle;
  ctx.shadowBlur = 12;
  ctx.fill();
  ctx.shadowBlur = 0;
}

// Detailed asteroids
function drawAsteroid(asteroid) {
  const radius = asteroid.radius;

  const points = asteroid.shape.map((point) => ({
    x: Math.cos(point.angle) * radius * point.distance,
    y: Math.sin(point.angle) * radius * point.distance,
  }));

  const gradient = ctx.createRadialGradient(
    -radius * 0.35,
    -radius * 0.35,
    radius * 0.15,
    0,
    0,
    radius * 1.15,
  );

  gradient.addColorStop(0, "#d6d0db");
  gradient.addColorStop(0.45, "#b5adbc");
  gradient.addColorStop(0.75, "#8a8297");
  gradient.addColorStop(1, "#5c566a");

  // Asteroid body
  ctx.beginPath();

  points.forEach((point, index) => {
    if (index === 0) {
      ctx.moveTo(point.x, point.y);
    } else {
      ctx.lineTo(point.x, point.y);
    }
  });

  ctx.closePath();

  ctx.fillStyle = gradient;
  ctx.strokeStyle = asteroid.homing ? "#ff5f9c" : "#8f879b";

  ctx.lineWidth = 2;
  ctx.fill();
  ctx.stroke();

  // Inner surface
  ctx.beginPath();

  points.forEach((point, index) => {
    const x = point.x * 0.82;
    const y = point.y * 0.82;

    if (index === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  });

  ctx.closePath();

  ctx.fillStyle = "rgba(90, 84, 103, 0.16)";
  ctx.fill();

  // Surface highlights
  ctx.beginPath();
  ctx.moveTo(-radius * 0.45, -radius * 0.2);
  ctx.lineTo(-radius * 0.2, -radius * 0.4);
  ctx.lineTo(-radius * 0.1, -radius * 0.3);
  ctx.lineTo(-radius * 0.3, -radius * 0.1);
  ctx.closePath();

  ctx.fillStyle = "rgba(255, 255, 255, 0.22)";
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(radius * 0.15, -radius * 0.55);
  ctx.lineTo(radius * 0.38, -radius * 0.45);
  ctx.lineTo(radius * 0.24, -radius * 0.28);
  ctx.closePath();

  ctx.fillStyle = "rgba(255, 255, 255, 0.18)";
  ctx.fill();

  // Craters
  const seed = asteroid.id * 1.37;

  for (let i = 0; i < 4; i++) {
    const angle = seed + i * 1.65;

    const distance = 0.28 + ((Math.sin(seed + i * 2.3) + 1) / 2) * 0.28;

    const x = Math.cos(angle) * radius * distance;
    const y = Math.sin(angle) * radius * distance;

    const craterRadius =
      radius * (0.12 + ((Math.cos(seed + i * 1.7) + 1) / 2) * 0.1);

    // Crater shadow
    ctx.beginPath();
    ctx.arc(
      x + craterRadius * 0.12,
      y + craterRadius * 0.12,
      craterRadius,
      0,
      Math.PI * 2,
    );

    ctx.fillStyle = "rgba(70, 63, 82, 0.65)";
    ctx.fill();

    // Crater rim
    ctx.beginPath();
    ctx.arc(
      x - craterRadius * 0.12,
      y - craterRadius * 0.12,
      craterRadius * 0.92,
      0,
      Math.PI * 2,
    );

    ctx.strokeStyle = "rgba(230, 224, 234, 0.45)";
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // Crater interior
    ctx.beginPath();
    ctx.arc(
      x + craterRadius * 0.08,
      y + craterRadius * 0.08,
      craterRadius * 0.72,
      0,
      Math.PI * 2,
    );

    ctx.fillStyle = "rgba(82, 75, 97, 0.85)";
    ctx.fill();
  }

  // Small surface marks
  for (let i = 0; i < 5; i++) {
    const angle = seed * 0.7 + i * 1.2;
    const distance = radius * (0.45 + i * 0.06);

    const x = Math.cos(angle) * distance * 0.55;
    const y = Math.sin(angle) * distance * 0.55;

    ctx.beginPath();
    ctx.arc(x, y, radius * 0.055, 0, Math.PI * 2);

    ctx.fillStyle = "rgba(88, 80, 102, 0.75)";
    ctx.fill();
  }

  // Homing asteroid glow
  if (asteroid.homing) {
    ctx.beginPath();
    ctx.arc(0, 0, radius + 4, 0, Math.PI * 2);

    ctx.strokeStyle = "rgba(255, 71, 126, 0.45)";
    ctx.lineWidth = 2;
    ctx.shadowColor = "#ff477e";
    ctx.shadowBlur = 14;
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  // Asteroid health bar
  const barWidth = radius * 2;
  const healthRatio = asteroid.hp / asteroid.maxHp;

  ctx.fillStyle = "#3e3140";
  ctx.fillRect(-radius, -radius - 14, barWidth, 4);

  ctx.fillStyle = asteroid.homing ? "#ff5f9c" : "#c1a6ff";

  ctx.fillRect(-radius, -radius - 14, barWidth * healthRatio, 4);
}

// Shield pickup
function drawPickup(pickup) {
  const pulse = Math.sin(pickup.pulse) * 2;
  const glowSize = pickup.radius + 6 + pulse;

  ctx.save();

  // Glowing ring
  ctx.beginPath();
  ctx.arc(0, 0, glowSize, 0, Math.PI * 2);

  ctx.strokeStyle = "rgba(77, 238, 234, 0.35)";
  ctx.lineWidth = 2;
  ctx.shadowColor = "#4deeea";
  ctx.shadowBlur = 18;
  ctx.stroke();

  // Shield body
  ctx.beginPath();
  ctx.moveTo(0, -14);
  ctx.lineTo(11, -9);
  ctx.lineTo(11, 2);
  ctx.quadraticCurveTo(11, 12, 0, 18);
  ctx.quadraticCurveTo(-11, 12, -11, 2);
  ctx.lineTo(-11, -9);
  ctx.closePath();

  ctx.fillStyle = "rgba(77, 238, 234, 0.18)";
  ctx.strokeStyle = "#4deeea";
  ctx.lineWidth = 2;
  ctx.shadowColor = "#4deeea";
  ctx.shadowBlur = 12;
  ctx.fill();
  ctx.stroke();

  ctx.shadowBlur = 0;

  // Inner shield
  ctx.beginPath();
  ctx.moveTo(0, -9);
  ctx.lineTo(6, -6);
  ctx.lineTo(6, 1);
  ctx.quadraticCurveTo(6, 7, 0, 11);
  ctx.quadraticCurveTo(-6, 7, -6, 1);
  ctx.lineTo(-6, -6);
  ctx.closePath();

  ctx.strokeStyle = "#b8fffd";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Shield symbol
  ctx.beginPath();
  ctx.moveTo(0, -3);
  ctx.lineTo(0, 6);
  ctx.moveTo(-4, 1.5);
  ctx.lineTo(4, 1.5);

  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.restore();
}

// Explosion particles
function drawExplosion(explosion) {
  ctx.save();

  for (const particle of explosion.particles) {
    ctx.globalAlpha = particle.life;

    ctx.beginPath();
    ctx.arc(particle.pos.x, particle.pos.y, particle.radius, 0, Math.PI * 2);

    ctx.fillStyle = explosion.color;
    ctx.fill();
  }

  ctx.restore();
}

// Draw all entities
function drawEntity(entity, alpha) {
  const previous = previousStates.get(entity.id);

  let x = entity.pos.x;
  let y = entity.pos.y;
  let angle = entity.angle;

  if (previous) {
    const wrappedX = Math.abs(x - previous.x) > world.width / 2;

    const wrappedY = Math.abs(y - previous.y) > world.height / 2;

    if (!wrappedX) {
      x = lerp(previous.x, x, alpha);
    }

    if (!wrappedY) {
      y = lerp(previous.y, y, alpha);
    }

    angle = lerpAngle(previous.angle, angle, alpha);
  }

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);

  switch (entity.kind) {
    case "ship":
      drawShip(entity);
      break;

    case "bullet":
      drawBullet(entity);
      break;

    case "asteroid":
      drawAsteroid(entity);
      break;

    case "pickup":
      drawPickup(entity);
      break;

    case "explosion":
      drawExplosion(entity);
      break;

    default:
      break;
  }

  ctx.restore();
}

// HUD icons
function drawHudIcon(type, x, y, color) {
  ctx.save();
  ctx.translate(x, y);

  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // Heart icon
  if (type === "heart") {
    ctx.beginPath();
    ctx.moveTo(0, 7);

    ctx.bezierCurveTo(-3, 4, -10, 0, -10, -5);

    ctx.bezierCurveTo(-10, -12, -2, -13, 0, -7);

    ctx.bezierCurveTo(2, -13, 10, -12, 10, -5);

    ctx.bezierCurveTo(10, 0, 3, 4, 0, 7);

    ctx.closePath();
    ctx.fill();
  }

  // Shield icon
  if (type === "shield") {
    ctx.beginPath();
    ctx.moveTo(0, -11);
    ctx.lineTo(9, -7);
    ctx.lineTo(9, 0);
    ctx.quadraticCurveTo(9, 8, 0, 12);
    ctx.quadraticCurveTo(-9, 8, -9, 0);
    ctx.lineTo(-9, -7);
    ctx.closePath();

    ctx.fillStyle = "rgba(77, 238, 234, 0.15)";
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(-4, 0);
    ctx.lineTo(-1, 3);
    ctx.lineTo(5, -4);
    ctx.stroke();
  }

  // Target icon
  if (type === "target") {
    ctx.beginPath();
    ctx.arc(0, 0, 8, 0, Math.PI * 2);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(0, 0, 2, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(-13, 0);
    ctx.lineTo(-6, 0);

    ctx.moveTo(6, 0);
    ctx.lineTo(13, 0);

    ctx.moveTo(0, -13);
    ctx.lineTo(0, -6);

    ctx.moveTo(0, 6);
    ctx.lineTo(0, 13);

    ctx.stroke();
  }

  // Score star icon
  if (type === "star") {
    ctx.beginPath();

    for (let i = 0; i < 10; i++) {
      const angle = -Math.PI / 2 + (i * Math.PI) / 5;

      const radius = i % 2 === 0 ? 11 : 5;

      const px = Math.cos(angle) * radius;
      const py = Math.sin(angle) * radius;

      if (i === 0) {
        ctx.moveTo(px, py);
      } else {
        ctx.lineTo(px, py);
      }
    }

    ctx.closePath();
    ctx.fill();
  }

  ctx.restore();
}

// HUD progress bars
function drawHudBar(x, y, width, value, maxValue, color) {
  const ratio = Math.max(0, Math.min(1, value / maxValue));

  ctx.fillStyle = "rgba(255, 255, 255, 0.1)";

  ctx.beginPath();
  ctx.roundRect(x, y, width, 7, 3.5);
  ctx.fill();

  if (ratio > 0) {
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 7;

    ctx.beginPath();
    ctx.roundRect(x, y, width * ratio, 7, 3.5);

    ctx.fill();
    ctx.shadowBlur = 0;
  }
}

// Main HUD
function drawHud() {
  const stats = gameLoop.getStats();
  const player = world.player;

  const hp = player?.hp ?? 0;
  const shieldTime = player?.shieldTime ?? 0;
  const homingEnabled = world.homingEnabled;

  const panelX = 15;
  const panelY = 15;
  const panelWidth = 285;
  const panelHeight = 245;

  ctx.save();

  // Dark rounded panel
  ctx.beginPath();
  ctx.roundRect(panelX, panelY, panelWidth, panelHeight, 16);

  ctx.fillStyle = "rgba(8, 12, 30, 0.88)";
  ctx.fill();

  ctx.strokeStyle = "rgba(255, 105, 180, 0.45)";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // HUD title
  ctx.fillStyle = "#ff69b4";
  ctx.font = "bold 13px monospace";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";

  ctx.fillText("SPACE CONTROL", 30, 35);

  ctx.strokeStyle = "rgba(255, 255, 255, 0.12)";

  ctx.beginPath();
  ctx.moveTo(30, 50);
  ctx.lineTo(285, 50);
  ctx.stroke();

  // Score
  drawHudIcon("star", 43, 74, "#ffd166");

  ctx.font = "15px monospace";
  ctx.fillStyle = "#d6daec";
  ctx.fillText("SCORE", 65, 74);

  ctx.textAlign = "right";
  ctx.fillStyle = "#ffd166";
  ctx.font = "bold 17px monospace";

  ctx.fillText(`${world.score}`, 280, 74);

  // Health
  drawHudIcon("heart", 43, 106, "#ff477e");

  ctx.textAlign = "left";
  ctx.fillStyle = "#ffffff";
  ctx.font = "15px monospace";

  ctx.fillText("HP", 65, 106);

  ctx.textAlign = "right";
  ctx.fillStyle = hp <= 30 ? "#ff477e" : "#ffffff";

  ctx.fillText(`${hp}/100`, 280, 106);

  drawHudBar(65, 122, 215, hp, 100, hp <= 30 ? "#ff477e" : "#ff69b4");

  // Shield
  drawHudIcon("shield", 43, 155, shieldTime > 0 ? "#4deeea" : "#768198");

  ctx.textAlign = "left";
  ctx.fillStyle = "#ffffff";
  ctx.fillText("SHIELD", 65, 155);

  ctx.textAlign = "right";

  ctx.fillStyle = shieldTime > 0 ? "#4deeea" : "#8892a8";

  ctx.fillText(shieldTime > 0 ? `${shieldTime.toFixed(1)}s` : "OFF", 280, 155);

  if (shieldTime > 0) {
    drawHudBar(65, 169, 215, shieldTime, 5, "#4deeea");
  }

  // Homing
  drawHudIcon("target", 43, 199, homingEnabled ? "#c6a0ff" : "#768198");

  ctx.textAlign = "left";
  ctx.fillStyle = "#ffffff";
  ctx.fillText("HOMING", 65, 199);

  ctx.textAlign = "right";

  ctx.fillStyle = homingEnabled ? "#c6a0ff" : "#8892a8";

  ctx.fillText(homingEnabled ? "ON" : "OFF", 280, 199);

  // Performance divider
  ctx.strokeStyle = "rgba(255, 255, 255, 0.12)";
  ctx.beginPath();
  ctx.moveTo(30, 218);
  ctx.lineTo(285, 218);
  ctx.stroke();

  // Performance stats
  ctx.textAlign = "left";
  ctx.font = "11px monospace";
  ctx.fillStyle = "#9aa5c0";

  ctx.fillText(`FPS: ${stats.fps}  UPS: ${stats.stepsPerSecond}`, 30, 235);

  ctx.textAlign = "right";

  ctx.fillText(`${stats.frameTime.toFixed(1)} ms`, 282, 235);

  // Destroyed ship notification
  if (!player?.alive) {
    ctx.textAlign = "center";

    ctx.fillStyle = "#ff477e";
    ctx.font = "bold 26px monospace";

    ctx.fillText("SHIP DESTROYED", world.width / 2, world.height / 2 - 25);

    ctx.font = "16px monospace";
    ctx.fillStyle = "#ffffff";

    ctx.fillText("Respawning...", world.width / 2, world.height / 2 + 10);
  }

  // Controls
  ctx.font = "12px monospace";
  ctx.textAlign = "center";
  ctx.fillStyle = "#a2aabb";

  ctx.fillText(
    "ARROWS: Move | SPACE: Fire | F: Single shot | H: Homing",
    world.width / 2,
    world.height - 20,
  );

  ctx.restore();
}

// Main rendering
function render(alpha) {
  ctx.clearRect(0, 0, world.width, world.height);

  drawBackground();

  for (const entity of world) {
    if (entity.alive) {
      drawEntity(entity, alpha);
    }
  }

  drawHud();
}

// Start game loop
const gameLoop = createLoop({
  step: 1 / 60,
  simulate,
  render,
});

gameLoop.start();
