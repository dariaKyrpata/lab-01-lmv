import { createLoop } from "./loop.js";
import { createInput } from "./input.js";
import { World } from "../../shared/src/sim/world.js";
import { FIXED_DT } from "../../shared/src/movement.js";
import { Prediction } from "./prediction.js";
import { Interpolation } from "./interpolation.js";
import { PredictedShots } from "./predictedShots.js";

import {
  SHIP_COLORS,
  getShipColor,
} from "../../shared/src/colors.js";

import { fetchJson, loadAll } from "./assets/loader.js";
import { createLoadingScreen } from "./loadingScreen.js";
import { createAudio } from "./audio.js";

import {
  gameEvents,
  emitGameEvent,
} from "./events.js";

import { Lobby } from "./lobby.js";
import { Online } from "./online.js";
import { Netgraph } from "./netgraph.js";

document.body.style.margin = "0";
document.body.style.overflow = "hidden";
document.body.style.backgroundColor = "#050814";

const canvas = document.createElement("canvas");
canvas.style.display = "block";
document.body.appendChild(canvas);

const ctx = canvas.getContext("2d");
const GAME_VIEW_WIDTH = 1600;
const GAME_VIEW_HEIGHT = 1000;

const gameView = {
  scale: 1,
  x: 0,
  y: 0,
};

let gameUi = null;
const input = createInput(window);
const audioContext = new AudioContext();

let world = new World();
let localPlayerId = null;
let seq = 0;
let homingEnabled = false;
let gameStarted = false;
let gameAssets = null;
let gameAudio = null;
let lobby = null;
let stars = [];
let scoreboardPlayers = [];

const prediction = new Prediction();
const interpolation = new Interpolation(100);
const predictedShots = new PredictedShots();
let interpolatedEntities = new Map();

function getTheme() {
  return (
    getShipColor(
      world.player?.colorId ??
      online.connection.colorId
    ) ?? SHIP_COLORS[0]
  );
}

function createStars(width, height) {
  const count = Math.max(
    80,
    Math.floor((width * height) / 9000)
  );

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

function resizeCanvas() {
  const width = Math.max(1, window.innerWidth);
  const height = Math.max(1, window.innerHeight);
  const dpr = window.devicePixelRatio || 1;

  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);

  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  gameView.scale = Math.min(
    1,
    width / 900,
    height / 650
  );

  gameView.x = 0;
  gameView.y = 0;

  if (gameUi) {
    gameUi.style.width = `${width / gameView.scale}px`;
    gameUi.style.height = `${height / gameView.scale}px`;
    gameUi.style.transform = `scale(${gameView.scale})`;
  }

  stars = createStars(world.width, world.height);
}

function isTyping() {
  return Boolean(
    document.activeElement?.closest(
      "input, textarea, select, [contenteditable='true']"
    )
  );
}

window.addEventListener("resize", resizeCanvas);
resizeCanvas();

window.addEventListener("keydown", (event) => {
  if (isTyping()) {
    return;
  }

  if (
    [
      "ArrowUp",
      "ArrowDown",
      "ArrowLeft",
      "ArrowRight",
      "Space",
    ].includes(event.code)
  ) {
    event.preventDefault();
  }
});

document.addEventListener("focusin", () => {
  if (isTyping()) {
    input.reset?.();
    input.clearPressed();
  }
});

function simulate() {
  if (!online.connection.joined) {
    return;
  }

  predictedShots.update(world);
  const typing = isTyping();

  if (!typing && input.justPressed("KeyH")) {
    homingEnabled = !homingEnabled;
  }

  const singleShot =
    !typing && input.justPressed("KeyF");

  const message = {
    type: "input",
    seq: seq + 1,
    tick: world.tick,
    thrust: !typing && input.isDown("ArrowUp"),
    turn: typing
      ? 0
      : Number(input.isDown("ArrowRight")) -
        Number(input.isDown("ArrowLeft")),
    fire:
      !typing &&
      (input.isDown("Space") || singleShot),
    homing: homingEnabled,
  };

   if (online.connection.sendRaw(message)) {
    seq = message.seq;
    netgraph.trackInput(seq);

    prediction.predict(
      message,
      world.player,
      world.width,
      world.height
    );
        const bullet = predictedShots.predict(
      message,
      world.player,
      prediction.currentState,
      world
    );

    if (bullet) {
      gameAudio?.play("shoot");
    }
  }

  input.clearPressed();
}

function drawBackground(
  width = world.width,
  height = world.height
) {
  const time = performance.now() * 0.001;

  ctx.save();
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, width, height);

  for (const star of stars) {
    const x = star.x / world.width * width;
    const y = star.y / world.height * height;

    const twinkle =
      0.65 +
      0.35 * Math.sin(
        time * star.twinkleSpeed + star.phase
      );

    ctx.globalAlpha = star.alpha * twinkle;
    ctx.fillStyle = "#ffffff";

    ctx.beginPath();
    ctx.arc(x, y, star.radius, 0, Math.PI * 2);
    ctx.fill();

    if (star.radius > 1.4) {
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 0.6;
      ctx.globalAlpha *= 0.4;

      ctx.beginPath();
      ctx.moveTo(x - star.radius * 2, y);
      ctx.lineTo(x + star.radius * 2, y);
      ctx.moveTo(x, y - star.radius * 2);
      ctx.lineTo(x, y + star.radius * 2);
      ctx.stroke();
    }
  }

  ctx.restore();
}

function drawShip(ship) {
  const image = gameAssets?.sprites.ship;

  if (!ship.alive || !image) {
    return;
  }

  const color =
    getShipColor(ship.colorId) ?? SHIP_COLORS[0];


  if (!drawShip.cache) {
    drawShip.cache = new WeakMap();
  }

  let variants = drawShip.cache.get(image);

  if (!variants) {
    variants = new Map();
    drawShip.cache.set(image, variants);
  }

  let sprite = variants.get(color.id);

  if (!sprite) {
    sprite = document.createElement("canvas");

    sprite.width =
      image.naturalWidth || image.width;

    sprite.height =
      image.naturalHeight || image.height;

    const paint = sprite.getContext("2d");

    paint.drawImage(
      image,
      0,
      0,
      sprite.width,
      sprite.height
    );

    paint.globalCompositeOperation = "source-in";
    paint.fillStyle = color.color;

    paint.fillRect(
      0,
      0,
      sprite.width,
      sprite.height
    );

    paint.globalCompositeOperation = "luminosity";

    paint.drawImage(
      image,
      0,
      0,
      sprite.width,
      sprite.height
    );

    paint.globalCompositeOperation = "destination-in";

    paint.drawImage(
      image,
      0,
      0,
      sprite.width,
      sprite.height
    );

    paint.globalCompositeOperation = "source-over";

    variants.set(color.id, sprite);
  }

  ctx.save();
  ctx.filter = "none";

  if (
    ship.invulnerableTime > 0 &&
    Math.floor(ship.invulnerableTime * 10) % 2 === 0
  ) {
    ctx.globalAlpha = 0.5;
  }

  if (ship.shieldTime > 0) {
    ctx.beginPath();
    ctx.arc(0, 0, ship.radius + 7, 0, Math.PI * 2);
    ctx.strokeStyle = "#4deeea";
    ctx.lineWidth = 2;
    ctx.shadowColor = "#4deeea";
    ctx.shadowBlur = 18;
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  ctx.rotate(Math.PI / 2);
    const size = ship.radius * 2.4;

  ctx.drawImage(
    sprite,
    -size / 2,
    -size / 2,
    size,
    size
  );

  ctx.restore();
}

function drawBullet(bullet) {
  const image = gameAssets?.sprites.bullet;

  if (!image) {
    return;
  }

  ctx.save();
  ctx.rotate(Math.PI / 2);

  const width = bullet.homing ? 16 : 12;
  const height = bullet.homing ? 32 : 24;

  ctx.shadowColor = bullet.homing
    ? "#4deeea"
    : "#ff69b4";

  ctx.shadowBlur = 10;

  ctx.drawImage(
    image,
    -width / 2,
    -height / 2,
    width,
    height
  );

  ctx.restore();
}

function drawAsteroid(asteroid) {
  const image = gameAssets?.sprites.asteroid;

  if (!image) {
    return;
  }

  const radius = asteroid.radius;
  const size = radius * 2;

  ctx.save();

  ctx.drawImage(
    image,
    -radius,
    -radius,
    size,
    size
  );

  if (asteroid.homing) {
    ctx.beginPath();
    ctx.arc(
      0,
      0,
      radius + 4,
      0,
      Math.PI * 2
    );

    ctx.strokeStyle = "#ff5f9c";
    ctx.lineWidth = 2;
    ctx.shadowColor = "#ff477e";
    ctx.shadowBlur = 14;
    ctx.stroke();
  }

  ctx.restore();

  const ratio = Math.max(
    0,
    asteroid.hp / asteroid.maxHp
  );

  ctx.fillStyle = "#3e3140";
  ctx.fillRect(-radius, -radius - 14, size, 4);

  ctx.fillStyle = asteroid.homing
    ? "#ff5f9c"
    : "#c1a6ff";

  ctx.fillRect(
    -radius,
    -radius - 14,
    size * ratio,
    4
  );
}

function drawPickup(pickup) {
  const pulse = Math.sin(pickup.pulse) * 2;
  const glowSize = pickup.radius + 6 + pulse;

  ctx.save();
  ctx.scale(0.6, 0.6);

  ctx.beginPath();
  ctx.arc(0, 0, glowSize, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(77, 238, 234, 0.35)";
  ctx.lineWidth = 2;
  ctx.shadowColor = "#4deeea";
  ctx.shadowBlur = 18;
  ctx.stroke();

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

function drawExplosion(explosion) {
  ctx.save();

  for (const particle of explosion.particles) {
    ctx.globalAlpha = particle.life;

    ctx.beginPath();
    ctx.arc(
      particle.pos.x,
      particle.pos.y,
      particle.radius,
      0,
      Math.PI * 2
    );

    ctx.fillStyle = explosion.color;
    ctx.fill();
  }

  ctx.restore();
}

function getEntityView(entity) {
  if (entity.kind === "ship" && entity.playerId === localPlayerId) {
    return prediction.state ?? entity;
  }

  return entity;
}

function drawEntity(entity) {
  const view = getEntityView(entity);
  const position = view.pos;
  const angle = view.angle;
  ctx.save();

  ctx.translate(position.x, position.y);
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
  }

  ctx.restore();
}

function drawHudBar(
  x,
  y,
  width,
  value,
  maxValue,
  color,
  height = 5
) {
  const ratio = Math.max(
    0,
    Math.min(1, value / maxValue)
  );

  ctx.save();

  ctx.fillStyle = "rgba(255, 255, 255, 0.12)";
  ctx.beginPath();

  ctx.roundRect(
    x,
    y,
    width,
    height,
    height / 2
  );

  ctx.fill();

  if (ratio > 0) {
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 6;

    ctx.beginPath();

    ctx.roundRect(
      x,
      y,
      width * ratio,
      height,
      height / 2
    );

    ctx.fill();
  }

  ctx.restore();
}

function drawOpponentHp(ship, scale) {
  if (
    !ship.alive ||
    ship.playerId === localPlayerId
  ) {
    return;
  }

  const color =
    getShipColor(ship.colorId) ?? SHIP_COLORS[0];

  const above =
    ship.pos.y > ship.radius + 30 / scale;

  const barY = above
    ? -ship.radius * scale - 12
    : ship.radius * scale + 24;

  ctx.save();
  ctx.translate(ship.pos.x, ship.pos.y);
  ctx.scale(1 / scale, 1 / scale);

  ctx.fillStyle = "rgba(5, 8, 20, 0.9)";
  ctx.beginPath();
  ctx.roundRect(-32, barY - 18, 64, 26, 5);
  ctx.fill();

  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  ctx.font = "bold 10px monospace";

  ctx.fillStyle = ship.hp <= 30
    ? "#ff477e"
    : color.color;

  ctx.fillText(
    `${ship.hp}/100`,
    0,
    barY - 3
  );

  drawHudBar(
    -26,
    barY,
    52,
    ship.hp,
    100,
    ship.hp <= 30 ? "#ff477e" : color.color,
    4
  );

  ctx.restore();
}

function drawHudIcon(type, x, y, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(0.65, 0.65);

  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

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

  if (type === "shield") {
    ctx.beginPath();
    ctx.moveTo(0, -11);
    ctx.lineTo(9, -7);
    ctx.lineTo(9, 0);
    ctx.quadraticCurveTo(9, 8, 0, 12);
    ctx.quadraticCurveTo(-9, 8, -9, 0);
    ctx.lineTo(-9, -7);
    ctx.closePath();

    ctx.fillStyle = `${color}22`;
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(-4, 0);
    ctx.lineTo(-1, 3);
    ctx.lineTo(5, -4);
    ctx.stroke();
  }

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

  if (type === "star") {
    ctx.beginPath();

    for (let i = 0; i < 10; i++) {
      const angle =
        -Math.PI / 2 + (i * Math.PI) / 5;

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

function drawHud() {
  const theme = getTheme();
  const stats = gameLoop.getStats();
  const player = world.player;

  const hp = player?.hp ?? 0;
  const shieldTime = player?.shieldTime ?? 0;
  const homing = world.homingEnabled;

  ctx.save();

  ctx.beginPath();
  ctx.roundRect(12, 12, 220, 174, 12);
  ctx.fillStyle = "rgba(8, 12, 30, 0.92)";
  ctx.fill();

  ctx.strokeStyle = `${theme.color}99`;
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.fillStyle = theme.color;
  ctx.font = "bold 11px monospace";
  ctx.fillText("SPACE CONTROL", 24, 29);

  ctx.textAlign = "right";
  ctx.font = "10px monospace";

  ctx.fillText(
    theme.name.toUpperCase(),
    218,
    29
  );

  ctx.strokeStyle = `${theme.color}33`;
  ctx.beginPath();
  ctx.moveTo(24, 40);
  ctx.lineTo(220, 40);
  ctx.stroke();

  drawHudIcon("star", 29, 57, theme.color);

  ctx.textAlign = "left";
  ctx.font = "11px monospace";
  ctx.fillStyle = "#d6daec";
  ctx.fillText("SCORE", 45, 57);

  ctx.textAlign = "right";
  ctx.fillStyle = theme.color;
  ctx.font = "bold 12px monospace";
  ctx.fillText(`${world.score}`, 218, 57);

  const hpColor = hp <= 30
    ? "#ff477e"
    : theme.color;

  drawHudIcon("heart", 29, 80, hpColor);

  ctx.textAlign = "left";
  ctx.font = "11px monospace";
  ctx.fillStyle = "#ffffff";
  ctx.fillText("HP", 45, 80);

  ctx.textAlign = "right";
  ctx.fillStyle = hpColor;
  ctx.fillText(`${hp}/100`, 218, 80);

  drawHudBar(
    45,
    90,
    173,
    hp,
    100,
    hpColor
  );

  drawHudIcon(
    "shield",
    29,
    111,
    shieldTime > 0 ? theme.color : "#768198"
  );

  ctx.textAlign = "left";
  ctx.fillStyle = "#ffffff";
  ctx.fillText("SHIELD", 45, 111);

  ctx.textAlign = "right";

  ctx.fillStyle = shieldTime > 0
    ? theme.color
    : "#8892a8";

  ctx.fillText(
    shieldTime > 0
      ? `${shieldTime.toFixed(1)}s`
      : "OFF",
    218,
    111
  );

  if (shieldTime > 0) {
    drawHudBar(
      45,
      121,
      173,
      shieldTime,
      5,
      theme.color,
      4
    );
  }

  drawHudIcon(
    "target",
    29,
    140,
    homing ? theme.color : "#768198"
  );

  ctx.textAlign = "left";
  ctx.fillStyle = "#ffffff";
  ctx.fillText("HOMING", 45, 140);

  ctx.textAlign = "right";

  ctx.fillStyle = homing
    ? theme.color
    : "#8892a8";

  ctx.fillText(
    homing ? "ON" : "OFF",
    218,
    140
  );

  ctx.strokeStyle = `${theme.color}33`;
  ctx.beginPath();
  ctx.moveTo(24, 153);
  ctx.lineTo(220, 153);
  ctx.stroke();

  ctx.textAlign = "left";
  ctx.font = "10px monospace";
  ctx.fillStyle = "#9aa5c0";

  ctx.fillText(
    `FPS ${stats.fps} · UPS ${stats.stepsPerSecond}`,
    24,
    171
  );

  ctx.textAlign = "right";

  ctx.fillText(
    `${stats.frameTime.toFixed(1)} ms`,
    218,
    171
  );

  ctx.restore();
}
function drawScoreboard() {
  if (!world.player || scoreboardPlayers.length === 0) {
    return;
  }

  const x = 12;
  const y = 200;
  const width = 220;
  const rowHeight = 34;
  const height = 34 + scoreboardPlayers.length * rowHeight;
  const theme = getTheme();

  ctx.save();

  ctx.fillStyle = "rgba(8, 12, 24, 0.88)";
  ctx.strokeStyle = theme.color;
  ctx.lineWidth = 1;

  ctx.beginPath();
  ctx.roundRect(x, y, width, height, 12);
  ctx.fill();
  ctx.stroke();

  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.font = "bold 11px monospace";
  ctx.fillStyle = theme.color;
  ctx.fillText("РАХУНОК", x + 12, y + 18);

  scoreboardPlayers.forEach((player, index) => {
    const shipId = world.players.get(player.id);
    const ship = world.get(shipId);
    const colorId = ship?.colorId ?? player.colorId;
    const color = getShipColor(colorId)?.color ?? "#ffffff";
    const rowY = y + 44 + index * rowHeight;

    ctx.save();
    ctx.translate(x + 25, rowY);
    ctx.rotate(-Math.PI / 2);

    drawShip({
      alive: true,
      colorId,
      radius: 10,
      invulnerableTime: 0,
      shieldTime: 0,
    });

    ctx.restore();

    ctx.save();
    ctx.beginPath();
    ctx.rect(x + 45, rowY - 13, width - 100, 26);
    ctx.clip();

    ctx.font = "12px monospace";
    ctx.textAlign = "left";
    ctx.fillStyle = color;
    ctx.fillText(player.name, x + 45, rowY);

    ctx.restore();

    ctx.font = "bold 12px monospace";
    ctx.textAlign = "right";
    ctx.fillStyle = color;
    ctx.fillText(`: ${ship?.score ?? 0}`, x + width - 12, rowY);
  });

  ctx.restore();
}

function drawGameStatus() {
  const player = world.player;
   const width = window.innerWidth / gameView.scale;
  const height = window.innerHeight / gameView.scale;

  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  if (!player) {
    ctx.fillStyle = "#ffffff";
    ctx.font = "18px monospace";

    ctx.fillText(
      "Waiting for server...",
      width / 2,
      height / 2
    );
  } else if (!player.alive) {
    ctx.fillStyle = getTheme().color;
    ctx.font = "bold 24px monospace";

    ctx.fillText(
      "SHIP DESTROYED",
      width / 2,
      height / 2 - 20
    );

    ctx.fillStyle = "#ffffff";
    ctx.font = "14px monospace";

    ctx.fillText(
      "Respawning...",
      width / 2,
      height / 2 + 12
    );
  }

  ctx.fillStyle = "#a2aabb";
  ctx.font = "11px monospace";

  ctx.fillText(
    "ARROWS: Move | SPACE: Fire | F: Single shot | H: Homing",
    width / 2,
    height - 14
  );

  ctx.restore();
}

function render() {
  const width = Math.max(1, window.innerWidth);
  const height = Math.max(1, window.innerHeight);
  
  interpolatedEntities = interpolation.sample();

  ctx.clearRect(0, 0, width, height);
  drawBackground(width, height);

  const worldScale = Math.min(
    width / world.width,
    height / world.height
  );

  const worldX = (width - world.width * worldScale) / 2;
  const worldY = (height - world.height * worldScale) / 2;

  ctx.save();
  ctx.translate(worldX, worldY);
  ctx.scale(worldScale, worldScale);

  ctx.beginPath();
  ctx.rect(0, 0, world.width, world.height);
  ctx.clip();

    const ownShipId = world.player?.id;

  function isLocalEntity(entity) {
    if (entity.kind === "ship") {
      return entity.playerId === localPlayerId;
    }

    return entity.kind === "bullet" && entity.ownerId === ownShipId;
  }

  for (const entity of interpolatedEntities.values()) {
    if (entity.alive && !isLocalEntity(entity)) {
      drawEntity(entity);
    }
  }

  for (const entity of world) {
    if (entity.alive && isLocalEntity(entity)) {
      drawEntity(entity);
    }
  }

  for (const bullet of predictedShots.bullets.values()) {
    if (bullet.alive) {
      drawEntity(bullet);
    }
  }

  ctx.restore();

  for (const ship of interpolatedEntities.values()) {
    if (ship.kind !== "ship" || !ship.alive || isLocalEntity(ship)) {
      continue;
    }

    const marker = {
      alive: ship.alive,
      playerId: ship.playerId,
      colorId: ship.colorId,
      hp: ship.hp,
      pos: {
        x: worldX + ship.pos.x * worldScale,
        y: worldY + ship.pos.y * worldScale,
      },
      radius: ship.radius * worldScale,
    };

    drawOpponentHp(marker, 1);
  }

  ctx.save();
  ctx.scale(gameView.scale, gameView.scale);

  drawHud();
  drawScoreboard();
  drawGameStatus();

  ctx.restore();

  netgraph.render();
}

const gameLoop = createLoop({
  step: FIXED_DT,
  simulate,
  render,
});

const online = new Online();
const netgraph = new Netgraph(
  online.connection,
  prediction,
  interpolation
);

gameUi = document.createElement("div");

gameUi.style.cssText = `
  position: fixed;
  top: 0;
  left: 0;
  width: ${GAME_VIEW_WIDTH}px;
  height: ${GAME_VIEW_HEIGHT}px;
  transform-origin: top left;
  pointer-events: none;
  overflow: hidden;
  z-index: 20;
`;

for (const panel of [online.panel, netgraph.panel]) {
  panel.style.position = "absolute";
  panel.style.pointerEvents = "auto";
  panel.style.maxWidth = "100%";
  gameUi.appendChild(panel);
}

online.panel.style.maxHeight = `${GAME_VIEW_HEIGHT * 0.55}px`;

document.body.appendChild(gameUi);
resizeCanvas();
online.connection.addEventListener("joined", () => {
  scoreboardPlayers = [];
});

online.connection.addEventListener("roster", (event) => {
  scoreboardPlayers = event.detail.players ?? [];
});

online.connection.addEventListener("disconnected", () => {
  scoreboardPlayers = [];
});

gameEvents.addEventListener("fired", (event) => {
  const ownShipId = world.players.get(localPlayerId);

  if (event.detail.shipId !== ownShipId) {
    gameAudio?.play("shoot");
  }
});

gameEvents.addEventListener("hit", () => {
  gameAudio?.play("hit");
});

gameEvents.addEventListener("exploded", () => {
  gameAudio?.play("explosion");
});

function unlockAudio() {
  gameAudio?.unlock();
}

window.addEventListener("pointerdown", unlockAudio);
window.addEventListener("keydown", unlockAudio);

online.addEventListener("joined", (event) => {
  const message = event.detail;

  localPlayerId = message.playerId;
  seq = 0;
  homingEnabled = false;
  prediction.reset();
  predictedShots.reset();
  interpolation.reset();
  interpolatedEntities = new Map();

  world = new World({
    seed: message.seed,
    width: message.width,
    height: message.height,
  });

  world.localPlayerId = localPlayerId;

  stars = createStars(
    world.width,
    world.height
  );

  input.reset?.();
  input.clearPressed();

  lobby?.hide();

  if (!gameStarted) {
    gameStarted = true;
    gameLoop.start();
  }
});

online.addEventListener("join_error", (event) => {
  lobby?.rejectJoin(event.detail);
});

online.addEventListener("error", (event) => {
  if (!online.connection.joined) {
    lobby?.rejectJoin({
      message:
        event.detail.message ??
        "Помилка підключення до сервера.",
    });
  }
});

online.connection.addEventListener(
  "snapshot",
  (event) => {
    const message = event.detail;

    if (
      !online.connection.joined ||
      message.tick <= world.tick
    ) {
      return;
    }

    world = World.fromSnapshot(message.state);
    world.localPlayerId = localPlayerId;

    prediction.reconcile(
      world.player,
      message.lastProcessedSeq,
      world.width,
      world.height
    );

      predictedShots.reconcile(
      world,
      localPlayerId,
      message.lastProcessedSeq,
      prediction.pending
    );
    interpolation.push(message.state);
    netgraph.onSnapshot(message);

    for (const gameEvent of world.events) {
      emitGameEvent(
        gameEvent.type,
        gameEvent
      );
    }
  }
);

online.connection.addEventListener(
  "disconnected",
  (event) => {
    gameLoop.stop();
    gameStarted = false;
    prediction.reset();
    predictedShots.reset();
   
    interpolation.reset();
    interpolatedEntities = new Map();

    input.reset?.();
    input.clearPressed();

    lobby?.rejectJoin({
      message:
        event.detail.reason ||
        "З’єднання втрачено. Можна спробувати знову.",
    });
  }
);

async function startGame() {
  const showLoading = createLoadingScreen(canvas);

  try {
    showLoading(0, 1);

    const manifest = await fetchJson(
      "/assets/manifest.json"
    );

    const total =
      Object.keys(manifest.sprites).length +
      Object.keys(manifest.audio).length +
      1;

    showLoading(0, total);

    gameAssets = await loadAll(
      manifest,
      audioContext,
      {
        onProgress(completed, count) {
          showLoading(completed, count);
        },
      }
    );

    gameAudio = createAudio(
      audioContext,
      gameAssets.audio
    );

    lobby = new Lobby();

    lobby.addEventListener("join", (event) => {
      const { name, roomId, colorId } = event.detail;

      try {
        online.connect(name, roomId, colorId);
      } catch (error) {
        lobby.rejectJoin({
          message: error.message,
        });
      }
    });

    lobby.show();
  } catch (error) {
    console.error(
      "Game loading failed:",
      error
    );

    ctx.fillStyle = "#ffffff";
    ctx.font = "20px Arial";
    ctx.textAlign = "center";

    ctx.fillText(
      "Loading failed. Check the console.",
      window.innerWidth / 2,
      window.innerHeight / 2
    );
  }
}

startGame();