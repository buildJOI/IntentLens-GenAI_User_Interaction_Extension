export class RateLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(private readonly perMinute: number) {}

  allow(key: string, now = Date.now()): boolean {
    const windowStart = now - 60_000;
    const next = (this.hits.get(key) ?? []).filter((t) => t > windowStart);
    if (next.length >= this.perMinute) {
      this.hits.set(key, next);
      return false;
    }
    next.push(now);
    this.hits.set(key, next);
    return true;
  }
}
