import { describe, expect, it } from "vitest";
import { SlidingWindowRateLimiter } from "../src/rateLimiter.js";

describe("SlidingWindowRateLimiter", () => {
  it("bloqueia após o limite e avisa só uma vez", () => {
    const t = 0;
    const rl = new SlidingWindowRateLimiter(3, 10_000, () => t);
    expect(rl.check("a").allowed).toBe(true);
    expect(rl.check("a").allowed).toBe(true);
    expect(rl.check("a").allowed).toBe(true);

    const blocked = rl.check("a");
    expect(blocked).toMatchObject({ allowed: false, shouldWarn: true });
    expect(blocked.retryAfterSeconds).toBe(10);
    expect(rl.check("a")).toMatchObject({ allowed: false, shouldWarn: false });
  });

  it("libera de novo quando a janela passa", () => {
    let t = 0;
    const rl = new SlidingWindowRateLimiter(1, 1000, () => t);
    expect(rl.check("a").allowed).toBe(true);
    expect(rl.check("a").allowed).toBe(false);
    t = 1001;
    expect(rl.check("a").allowed).toBe(true);
  });

  it("isola contatos diferentes", () => {
    const rl = new SlidingWindowRateLimiter(1, 1000, () => 0);
    expect(rl.check("a").allowed).toBe(true);
    expect(rl.check("b").allowed).toBe(true);
    expect(rl.check("a").allowed).toBe(false);
  });
});
