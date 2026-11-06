export class ObjectPool<T> {
  private readonly available: T[] = [];

  constructor(privateFactory: () => T, capacity: number) {
    this.create = privateFactory;
    this.capacity = capacity;
  }

  private readonly create: () => T;
  private readonly capacity: number;

  acquire(): T {
    return this.available.pop() ?? this.create();
  }

  release(value: T): void {
    if (this.available.length < this.capacity) this.available.push(value);
  }
}
