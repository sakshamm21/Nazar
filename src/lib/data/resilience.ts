/**
 * Reliability primitives for the unofficial Yahoo API (and any other provider):
 * - withRetry: exponential backoff with jitter, honours Retry-After on 429s
 * - Limiter: caps concurrent calls
 * - CircuitBreaker: after N consecutive transient failures, stop calling for the rest of a run
 * Pure TypeScript, no dependencies, unit-tested with a fake clock.
 */

export const isTransient = (e: unknown) =>
  /<!DOCTYPE|<html|\b429\b|Too Many Requests|\b5\d\d\b|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|fetch failed|socket hang up|Invalid Crumb|aborted|timeout/i.test(String((e as { message?: string })?.message ?? e));

export const isRateLimit = (e: unknown) => /\b429\b|Too Many Requests/i.test(String((e as { message?: string })?.message ?? e));

export type Sleep = (ms: number) => Promise<void>;
const realSleep: Sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export interface RetryOptions {
  attempts?: number;
  baseMs?: number;
  maxMs?: number;
  sleep?: Sleep;
  random?: () => number;
  /** Seconds from a Retry-After header, if the error carries one. */
  retryAfter?: (e: unknown) => number | null;
}

export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const attempts = opts.attempts ?? 3;
  const base = opts.baseMs ?? 1000;
  const max = opts.maxMs ?? 8000;
  const sleep = opts.sleep ?? realSleep;
  const rand = opts.random ?? Math.random;
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      if (!isTransient(e) || i === attempts - 1) throw e;
      const ra = opts.retryAfter?.(e);
      const backoff = Math.min(max, base * 2 ** i);
      const wait = ra != null ? Math.min(max * 2, ra * 1000) : isRateLimit(e) ? Math.max(backoff, 4000) : backoff;
      await sleep(wait * (0.75 + rand() * 0.5));
    }
  }
  throw last;
}

/** Runs at most `n` tasks at once. */
export class Limiter {
  private active = 0;
  private queue: (() => void)[] = [];
  constructor(private readonly n: number) {}
  get pending() {
    return this.queue.length;
  }
  get running() {
    return this.active;
  }
  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.active >= this.n) await new Promise<void>((r) => this.queue.push(r));
    this.active++;
    try {
      return await fn();
    } finally {
      this.active--;
      this.queue.shift()?.();
    }
  }
}

export class CircuitOpenError extends Error {
  constructor() {
    super("Circuit open: data provider is failing, skipping further calls this run");
  }
}

/** Opens after `threshold` consecutive transient failures; a success resets the count. */
export class CircuitBreaker {
  private failures = 0;
  open = false;
  constructor(private readonly threshold = 5) {}
  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.open) throw new CircuitOpenError();
    try {
      const r = await fn();
      this.failures = 0;
      return r;
    } catch (e) {
      if (isTransient(e)) {
        this.failures++;
        if (this.failures >= this.threshold) this.open = true;
      }
      throw e;
    }
  }
}

/** Maps items with a concurrency cap, collecting per-item results without failing the batch. */
export async function mapSettled<T, R>(items: T[], limiter: Limiter, fn: (item: T, i: number) => Promise<R>) {
  return Promise.all(
    items.map((item, i) =>
      limiter.run(async () => {
        try {
          return { ok: true as const, item, value: await fn(item, i) };
        } catch (error) {
          return { ok: false as const, item, error };
        }
      }),
    ),
  );
}
