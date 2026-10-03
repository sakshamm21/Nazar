import { describe, expect, it, vi } from "vitest";
import { CircuitBreaker, CircuitOpenError, isRateLimit, isTransient, Limiter, mapSettled, withRetry } from "@/lib/data/resilience";

const transient = () => Object.assign(new Error("fetch failed: ECONNRESET"), {});
const rateLimited = () => new Error("HTTP 429 Too Many Requests");
const permanent = () => new Error("Not Found: symbol XYZ");

describe("error classification", () => {
  it("network errors and 5xx/429 are transient; 404s are not", () => {
    expect(isTransient(transient())).toBe(true);
    expect(isTransient(rateLimited())).toBe(true);
    expect(isTransient(new Error("HTTP 503 Service Unavailable"))).toBe(true);
    expect(isTransient(permanent())).toBe(false);
    expect(isRateLimit(rateLimited())).toBe(true);
  });
});

describe("withRetry", () => {
  it("retries transient errors with exponential backoff and jitter", async () => {
    const waits: number[] = [];
    const fn = vi.fn().mockRejectedValueOnce(transient()).mockRejectedValueOnce(transient()).mockResolvedValue("ok");
    const r = await withRetry(fn, { attempts: 3, baseMs: 1000, sleep: async (ms) => void waits.push(ms), random: () => 0.5 });
    expect(r).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(3);
    expect(waits).toEqual([1000, 2000]); // jitter factor 0.75 + 0.5 × 0.5 = 1
  });
  it("backs off at least 4s on rate limits and honours Retry-After", async () => {
    const waits: number[] = [];
    await withRetry(vi.fn().mockRejectedValueOnce(rateLimited()).mockResolvedValue(1), { sleep: async (ms) => void waits.push(ms), random: () => 0.5 });
    await withRetry(vi.fn().mockRejectedValueOnce(rateLimited()).mockResolvedValue(1), { sleep: async (ms) => void waits.push(ms), random: () => 0.5, retryAfter: () => 2 });
    expect(waits).toEqual([4000, 2000]);
  });
  it("does not retry permanent errors", async () => {
    const fn = vi.fn().mockRejectedValue(permanent());
    await expect(withRetry(fn, { sleep: async () => {} })).rejects.toThrow("Not Found");
    expect(fn).toHaveBeenCalledTimes(1);
  });
  it("gives up after the last attempt with the last error", async () => {
    const fn = vi.fn().mockRejectedValue(transient());
    await expect(withRetry(fn, { attempts: 3, sleep: async () => {} })).rejects.toThrow("ECONNRESET");
    expect(fn).toHaveBeenCalledTimes(3);
  });
  it("caps the wait", async () => {
    const waits: number[] = [];
    await expect(withRetry(vi.fn().mockRejectedValue(transient()), { attempts: 6, baseMs: 1000, maxMs: 3000, sleep: async (ms) => void waits.push(ms), random: () => 0.5 })).rejects.toThrow();
    expect(Math.max(...waits)).toBe(3000);
  });
});

describe("Limiter and mapSettled", () => {
  it("never runs more than n tasks at once and isolates failures", async () => {
    const lim = new Limiter(2);
    let peak = 0;
    const r = await mapSettled([1, 2, 3, 4, 5, 6], lim, async (x) => {
      peak = Math.max(peak, lim.running);
      await new Promise((res) => setTimeout(res, 5));
      if (x === 4) throw permanent();
      return x * 10;
    });
    expect(peak).toBe(2);
    expect(r.filter((x) => x.ok).map((x) => (x.ok ? x.value : null))).toEqual([10, 20, 30, 50, 60]);
    expect(r[3]).toMatchObject({ ok: false, item: 4 });
  });
});

describe("CircuitBreaker", () => {
  it("opens after consecutive transient failures and then fails fast", async () => {
    const cb = new CircuitBreaker(3);
    const fn = vi.fn().mockRejectedValue(transient());
    for (let i = 0; i < 3; i++) await expect(cb.run(fn)).rejects.toThrow("ECONNRESET");
    await expect(cb.run(fn)).rejects.toBeInstanceOf(CircuitOpenError);
    expect(fn).toHaveBeenCalledTimes(3);
  });
  it("a success resets the count; permanent errors don't count", async () => {
    const cb = new CircuitBreaker(2);
    await expect(cb.run(() => Promise.reject(transient()))).rejects.toThrow();
    await cb.run(() => Promise.resolve(1));
    await expect(cb.run(() => Promise.reject(transient()))).rejects.toThrow();
    await expect(cb.run(() => Promise.reject(permanent()))).rejects.toThrow();
    expect(cb.open).toBe(false);
  });
});
