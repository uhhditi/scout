/**
 * Sliding-window limiter: at most `maxPerSecond` calls per rolling 1-second window.
 * Used for Recreation.gov + RIDB calls from the campground search route.
 */
export class RequestsPerSecondLimiter {
  private readonly timestamps: number[] = [];

  constructor(private readonly maxPerSecond: number) {}

  async acquire(): Promise<void> {
    const now = Date.now();
    const windowStart = now - 1000;
    while (this.timestamps.length > 0 && this.timestamps[0]! <= windowStart) {
      this.timestamps.shift();
    }
    if (this.timestamps.length < this.maxPerSecond) {
      this.timestamps.push(now);
      return;
    }
    const waitMs = 1000 - (now - this.timestamps[0]!) + 2;
    await new Promise((r) => setTimeout(r, Math.max(5, waitMs)));
    return this.acquire();
  }
}

let campgroundSearchLimiter: RequestsPerSecondLimiter | null = null;

/** Shared limiter for campground search outbound HTTP (45 req/s max). */
export function getCampgroundSearchOutboundLimiter(): RequestsPerSecondLimiter {
  if (!campgroundSearchLimiter) {
    campgroundSearchLimiter = new RequestsPerSecondLimiter(45);
  }
  return campgroundSearchLimiter;
}
