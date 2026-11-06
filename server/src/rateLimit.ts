export class TokenBucket {
  private tokens: number;
  private updatedAt: number;
  private readonly rate: number;

  constructor(rate: number, now: number) {
    this.rate = rate;
    this.tokens = rate;
    this.updatedAt = now;
  }

  take(now: number): boolean {
    const elapsed = Math.max(0, now - this.updatedAt) / 1000;
    this.updatedAt = Math.max(now, this.updatedAt);
    this.tokens = Math.min(this.rate, this.tokens + elapsed * this.rate);
    if (this.tokens < 1) return false;
    this.tokens--;
    return true;
  }
}
