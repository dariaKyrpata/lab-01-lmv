export function circlesCollide(a, b) { //перевіряємо зіткнення двох кругових областей
  if (!a.alive || !b.alive) {
    return false;
  }

  const dx = a.pos.x - b.pos.x; //різниця координат центрів
  const dy = a.pos.y - b.pos.y;

  const radiusSum = a.radius + b.radius;

  return dx * dx + dy * dy <= radiusSum * radiusSum;
}

export function* findCollisions(world) { //генератор пар зіткненнь
  const entities = [...world].filter(
    (entity) => entity.alive && entity.radius > 0,
  );

  for (let i = 0; i < entities.length; i++) { //перший
    const a = entities[i];

    for (let j = i + 1; j < entities.length; j++) {//другий
      const b = entities[j];

      if (circlesCollide(a, b)) { //якщо зіткнення, повертаємо пару
        yield [a, b];
      }
    }
  }
}
