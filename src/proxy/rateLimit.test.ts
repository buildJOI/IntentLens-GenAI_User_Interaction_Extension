import { describe, expect, it } from "vitest";
import { RateLimiter } from "./rateLimit.js";

describe("proxy rate limiter", () => {
  it("blocks after the configured number of hits", () => {
    const limiter = new RateLimiter(2);
    expect(limiter.allow("a", 1000)).toBe(true);
    expect(limiter.allow("a", 1001)).toBe(true);
    expect(limiter.allow("a", 1002)).toBe(false);
  });

  it("resets after the window", () => {
    const limiter = new RateLimiter(1);
    expect(limiter.allow("a", 1000)).toBe(true);
    expect(limiter.allow("a", 70_000)).toBe(true);
  });
});
