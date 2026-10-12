/**
 * Sliding-window limiter. HighLevel documents a burst limit of 100 requests
 * per 10 seconds; the default here leaves headroom below that.
 */
export class RateLimiter {
  private stamps: number[] = [];

  constructor(
    private readonly max = 90,
    private readonly windowMs = 10_000,
    private readonly now: () => number = Date.now,
    private readonly sleep: (ms: number) => Promise<void> = (ms) =>
      new Promise((r) => setTimeout(r, ms)),
  ) {}

  async acquire(): Promise<void> {
    for (;;) {
      const t = this.now();
      this.stamps = this.stamps.filter((s) => t - s < this.windowMs);
      if (this.stamps.length < this.max) {
        this.stamps.push(t);
        return;
      }
      await this.sleep(this.stamps[0] + this.windowMs - t + 1);
    }
  }
}
