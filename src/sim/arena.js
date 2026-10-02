export function wrapArena(ship, width, height) {
    // Якщо вилетів за лівий край — з'являється справа
    if (ship.x < 0) ship.x = width;
    // Якщо вилетів за правий край — з'являється зліва
    if (ship.x > width) ship.x = 0;
    // Так само для верху і низу
    if (ship.y < 0) ship.y = height;
    if (ship.y > height) ship.y = 0;
}