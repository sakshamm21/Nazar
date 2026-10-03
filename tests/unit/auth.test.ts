import { afterEach, describe, expect, it, vi } from "vitest";
import { signLink, verifyLink } from "@/lib/auth/links";
import { authSecret } from "@/lib/auth/secret";
import { readCookie, SESSION_COOKIE, sessionCookie, signSession, verifySession } from "@/lib/auth/session";

afterEach(() => vi.unstubAllEnvs());

describe("sessions (JWT in an httpOnly cookie)", () => {
  it("round-trips and rejects tampering", async () => {
    const t = await signSession({ userId: "u1", isDemo: true });
    expect(await verifySession(t)).toEqual({ userId: "u1", isDemo: true });
    const [h, p, s] = t.split(".");
    const forged = Buffer.from(JSON.stringify({ sub: "admin", demo: false })).toString("base64url");
    expect(await verifySession(`${h}.${forged}.${s}`)).toBeNull();
    expect(await verifySession(`${h}.${p}.x${s.slice(1)}`)).toBeNull();
    expect(await verifySession(null)).toBeNull();
  });
  it("is signed with this server's secret only", async () => {
    const t = await signSession({ userId: "u1", isDemo: false });
    vi.stubEnv("AUTH_SECRET", "another-secret-another-secret-another-secret");
    expect(await verifySession(t)).toBeNull();
  });
  it("cookie is httpOnly, SameSite=Lax and readable back", () => {
    const c = sessionCookie("abc");
    expect(c).toMatch(/HttpOnly/);
    expect(c).toMatch(/SameSite=Lax/);
    expect(readCookie(`x=1; ${SESSION_COOKIE}=abc; y=2`, SESSION_COOKIE)).toBe("abc");
  });
});

describe("signed one-click email links", () => {
  it("round-trips, rejects edits and expires", () => {
    const t = signLink({ a: "rate", alert: "a1", user: "u1", r: "up" });
    expect(verifyLink(t)).toMatchObject({ a: "rate", alert: "a1", user: "u1", r: "up" });
    const [body, sig] = t.split(".");
    const edited = Buffer.from(Buffer.from(body, "base64url").toString().replace('"u1"', '"u2"')).toString("base64url");
    expect(verifyLink(`${edited}.${sig}`)).toBeNull();
    expect(verifyLink("garbage")).toBeNull();
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 61 * 86400000);
    expect(verifyLink(t)).toBeNull();
    vi.useRealTimers();
  });
});

describe("the server secret", () => {
  it("production refuses to run without a real secret", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AUTH_SECRET", "");
    vi.stubEnv("NEXTAUTH_SECRET", "");
    expect(() => authSecret()).toThrow(/AUTH_SECRET must be set/);
    vi.stubEnv("AUTH_SECRET", "short");
    expect(() => authSecret()).toThrow();
    vi.stubEnv("AUTH_SECRET", "x".repeat(32));
    expect(authSecret()).toBe("x".repeat(32));
  });
  it("development falls back so `npm run dev` works with no setup", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("AUTH_SECRET", "");
    vi.stubEnv("NEXTAUTH_SECRET", "");
    expect(authSecret().length).toBeGreaterThanOrEqual(32);
  });
});
