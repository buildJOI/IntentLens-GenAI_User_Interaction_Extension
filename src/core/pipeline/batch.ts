export class BatchQueue<T> {
  private buffer: T[] = [];
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly maxSize: number,
    private readonly maxWaitMs: number,
    private readonly flushTo: (items: T[]) => void
  ) {}

  push(item: T): void {
    this.buffer.push(item);
    if (this.buffer.length >= this.maxSize) {
      this.flush();
      return;
    }
    if (!this.timer) {
      this.timer = setTimeout(() => this.flush(), this.maxWaitMs);
    }
  }

  flush(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
    if (this.buffer.length === 0) return;
    const items = this.buffer;
    this.buffer = [];
    this.flushTo(items);
  }

  get pending(): number {
    return this.buffer.length;
  }
}

export function throttle<T extends unknown[]>(
  fn: (...args: T) => void,
  intervalMs: number
): (...args: T) => void {
  let last = 0;
  return (...args: T) => {
    const now = Date.now();
    if (now - last < intervalMs) return;
    last = now;
    fn(...args);
  };
}
