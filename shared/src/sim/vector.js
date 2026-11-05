export class Vector2 {
  constructor(x = 0, y = 0) { //вектор с координатами x и y
    this.x = x;
    this.y = y;
  }

  add(other) {
    return new Vector2(this.x + other.x, this.y + other.y);//додавання двох векторів
  }

  sub(other) {
    return new Vector2(this.x - other.x, this.y - other.y);//віднімання двох векторів
  }

  scale(value) {
    return new Vector2(this.x * value, this.y * value);//множення вектора на число
  }

  length() {
    return Math.hypot(this.x, this.y);//обчислення довжини вектора
  }

  normalize() {
    const size = this.length();//довжина вектора рівна 1

    if (size === 0) {
      return new Vector2();
    }

    return this.scale(1 / size);
  }

  rotate(angle) { // повертає вектор на заданий кут
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    return new Vector2(
      this.x * cos - this.y * sin,
      this.x * sin + this.y * cos,
    );
  }

  dot(other) { //скалярний добуток
    return this.x * other.x + this.y * other.y;
  }

  static fromAngle(angle) { // створює вектор з заданим кутом
    return new Vector2(Math.cos(angle), Math.sin(angle));
  }
}
