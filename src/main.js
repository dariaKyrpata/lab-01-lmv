import { createLoop } from './loop.js';
import { createInput } from './input.js';
import { createShip, integrate } from './sim/ship.js';
import { wrapArena } from './sim/arena.js';

document.body.style.margin = "0";
document.body.style.overflow = "hidden";
document.body.style.backgroundColor = "black";

const canvas = document.createElement('canvas');
document.body.appendChild(canvas);
const ctx = canvas.getContext('2d');

const dpr = window.devicePixelRatio || 1;
canvas.width = window.innerWidth * dpr;
canvas.height = window.innerHeight * dpr;
canvas.style.width = `${window.innerWidth}px`;
canvas.style.height = `${window.innerHeight}px`;
ctx.scale(dpr, dpr);

const input = createInput(window);
const ship = createShip();

ship.x = window.innerWidth / 2;
ship.y = window.innerHeight / 2;
ship.prev.x = ship.x;
ship.prev.y = ship.y;

function lerp(start, end, alpha) {
    return start + (end - start) * alpha;
}

function lerpAngle(start, end, alpha) {
    let diff = end - start;
    while (diff < -Math.PI) diff += Math.PI * 2;
    while (diff > Math.PI) diff -= Math.PI * 2;
    return start + diff * alpha;
}

function simulate(step) {
    integrate(ship, input, step);
    const oldX = ship.x, oldY = ship.y;
    wrapArena(ship, window.innerWidth, window.innerHeight);
    if (ship.x !== oldX) ship.prev.x = ship.x;
    if (ship.y !== oldY) ship.prev.y = ship.y;
}

function render(alpha) {
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    
    // фон
    ctx.strokeStyle = "#222";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x < window.innerWidth; x += 50) {
        ctx.moveTo(x, 0); ctx.lineTo(x, window.innerHeight);
    }
    for (let y = 0; y < window.innerHeight; y += 50) {
        ctx.moveTo(0, y); ctx.lineTo(window.innerWidth, y);
    }
    ctx.stroke();

    ctx.save(); 
    const renderX = lerp(ship.prev.x, ship.x, alpha);
    const renderY = lerp(ship.prev.y, ship.y, alpha);
    const renderAngle = lerpAngle(ship.prev.angle, ship.angle, alpha);
    
    ctx.translate(renderX, renderY);
    ctx.rotate(renderAngle);
    
    // корпус
    ctx.beginPath();
    ctx.moveTo(18, 0);      
    ctx.lineTo(-12, 10);    
    ctx.lineTo(-8, 4);      
    ctx.lineTo(-8, -4);     
    ctx.lineTo(-12, -10);   
    ctx.closePath();
    
    ctx.strokeStyle = "#ff69b4";
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // кабіна
    ctx.beginPath();
    ctx.moveTo(6, 0);
    ctx.lineTo(-2, 3);
    ctx.lineTo(-6, 0);
    ctx.lineTo(-2, -3);
    ctx.closePath();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1;
    ctx.stroke();

    // двигун
    if (ship.thrust) {
        ctx.beginPath();
        ctx.moveTo(-8, 6);
        ctx.lineTo(-22, 0);     
        ctx.lineTo(-8, -6);
        ctx.closePath();
        ctx.fillStyle = "orange";
        ctx.fill();
        ctx.strokeStyle = "yellow";
        ctx.stroke();
    }
    
    ctx.restore(); 
    
    // HUD
    const stats = gameLoop.getStats();
    ctx.fillStyle = "white";
    ctx.font = "16px monospace";
    ctx.fillText(`UPS: ${stats.stepsPerSecond} | FPS: ${stats.fps}`, 10, 30);
}

const gameLoop = createLoop({
    step: 1 / 60,
    simulate: simulate,
    render: render
});

gameLoop.start();