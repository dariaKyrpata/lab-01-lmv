export function createShip() {
    return {
        x: 400,          
        y: 300,          
        vx: 0,           
        vy: 0,           
        angle: 0,        
        thrust: false,
        // ДОДАЄМО: пам'ять про попередній кадр
        prev: { x: 400, y: 300, angle: 0 } 
    };
}

export function integrate(ship, input, dt) {
    // ДОДАЄМО: перед тим як рухатися, зберігаємо поточні координати в 'prev'
    ship.prev.x = ship.x;
    ship.prev.y = ship.y;
    ship.prev.angle = ship.angle;

    const turnSpeed = 3;       
    const thrustPower = 300;   
    const friction = 0.98;     

    if (input.isDown('ArrowLeft')) ship.angle -= turnSpeed * dt;
    if (input.isDown('ArrowRight')) ship.angle += turnSpeed * dt;

    ship.thrust = input.isDown('ArrowUp');
    
    if (ship.thrust) {
        ship.vx += Math.cos(ship.angle) * thrustPower * dt;
        ship.vy += Math.sin(ship.angle) * thrustPower * dt;
    }

    ship.vx *= friction;
    ship.vy *= friction;
    ship.x += ship.vx * dt;
    ship.y += ship.vy * dt;
}