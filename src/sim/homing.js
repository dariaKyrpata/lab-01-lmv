import { Vector2 } from "./vector.js";

export class Homing {
  constructor({ targetId = null, turnSpeed = 3, speed = null } = {}) {
    this.targetId = targetId;
    this.turnSpeed = turnSpeed;
    this.speed = speed;
  }

  update(entity, world, dt) {
    if (!world || this.targetId === null) { //якщо немає світу або цілі, нічого не робимо
      return;
    }

    const target = world.get(this.targetId); //шукаємо ціль за ід

    if (!target || !target.alive) { //якщо ціль не знайдена її знищено
      return;
    }

    const direction = target.pos.sub(entity.pos);//напрямок від об'єкта до цілі

    if (direction.length() === 0) {
      return;
    }

    const desiredDirection = direction.normalize(); //одиничний вектор напрямку до цілі

    const currentSpeed = entity.vel.length();//поточна швидкість об'єкта

    if (currentSpeed === 0) { 
      entity.vel = desiredDirection.scale(this.speed ?? 100);
      return;
    }

    const currentAngle = Math.atan2(entity.vel.y, entity.vel.x);//поточний кут напрямку об'єкта

    const targetAngle = Math.atan2(desiredDirection.y, desiredDirection.x);//потрібний кут напрямку до цілі

    let angleDifference = targetAngle - currentAngle;//різниця між потрібним і поточним кутом

    angleDifference = Math.atan2( //обираємо найкоротший поворот
      Math.sin(angleDifference),
      Math.cos(angleDifference),
    );

    const maxTurn = this.turnSpeed * dt; //макс кут повороту за цей кадр

    const turn = Math.max(-maxTurn, Math.min(maxTurn, angleDifference));//обмежуємо поворот 

    const newAngle = currentAngle + turn; //новий кут напрямку після повороту

    const newDirection = Vector2.fromAngle(newAngle); //вектор нового напрямку після повороту

    entity.vel = newDirection.scale(this.speed ?? currentSpeed); //швидкість об'єкта після повороту
  }
}
