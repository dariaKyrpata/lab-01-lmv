export interface Vec2 {
  readonly x: number;
  readonly y: number;
}

export class Vector2 implements Vec2 {
  readonly x: number;
  readonly y: number;

  constructor(x = 0, y = 0) {
    this.x = x;
    this.y = y;
  }

  add(other: Vec2) {
    return new Vector2(this.x + other.x, this.y + other.y);
  }

  sub(other: Vec2) {
    return new Vector2(this.x - other.x, this.y - other.y);
  }

  scale(value: number) {
    return new Vector2(this.x * value, this.y * value);
  }

  length() {
    return Math.hypot(this.x, this.y);
  }

  normalize() {
    const size = this.length();

    if (size === 0) {
      return new Vector2();
    }

    return this.scale(1 / size);
  }

  rotate(angle: number) {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    return new Vector2(
      this.x * cos - this.y * sin,
      this.x * sin + this.y * cos,
    );
  }

  dot(other: Vec2) {
    return this.x * other.x + this.y * other.y;
  }

  static fromAngle(angle: number) {
    return new Vector2(Math.cos(angle), Math.sin(angle));
  }
}
