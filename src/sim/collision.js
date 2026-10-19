export function circlesCollide(a, b) {
  if (!a.alive || !b.alive) {
    return false;
  }

  const dx = a.pos.x - b.pos.x;
  const dy = a.pos.y - b.pos.y;

  const radiusSum = a.radius + b.radius;

  return dx * dx + dy * dy <= radiusSum * radiusSum;
}

export function* findCollisions(world) {
  const entities = [...world].filter(
    (entity) => entity.alive && entity.radius > 0,
  );

  for (let i = 0; i < entities.length; i++) {
    const a = entities[i];

    for (let j = i + 1; j < entities.length; j++) {
      const b = entities[j];

      if (circlesCollide(a, b)) {
        yield [a, b];
      }
    }
  }
}
