export interface RateLimitResult {
  allowed: boolean;
  /** true apenas na primeira mensagem bloqueada da janela — evita responder "calma" a cada spam. */
  shouldWarn: boolean;
  retryAfterSeconds: number;
}

/** Janela deslizante por chave (contato). `now` injetável para testes. */
export class SlidingWindowRateLimiter {
  private readonly hits = new Map<string, number[]>();
  private readonly warned = new Set<string>();

  constructor(
    private readonly maxMessages: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  check(key: string): RateLimitResult {
    const t = this.now();
    const recent = (this.hits.get(key) ?? []).filter((ts) => t - ts < this.windowMs);

    if (recent.length >= this.maxMessages) {
      this.hits.set(key, recent);
      const oldest = recent[0] ?? t;
      const shouldWarn = !this.warned.has(key);
      this.warned.add(key);
      return {
        allowed: false,
        shouldWarn,
        retryAfterSeconds: Math.max(1, Math.ceil((oldest + this.windowMs - t) / 1000)),
      };
    }

    recent.push(t);
    this.hits.set(key, recent);
    this.warned.delete(key);
    return { allowed: true, shouldWarn: false, retryAfterSeconds: 0 };
  }

  /** Remove chaves inativas (chamar periodicamente). */
  sweep(): void {
    const t = this.now();
    for (const [key, list] of this.hits) {
      if (list.every((ts) => t - ts >= this.windowMs)) {
        this.hits.delete(key);
        this.warned.delete(key);
      }
    }
  }
}
