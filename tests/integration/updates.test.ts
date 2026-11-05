/**
 * Updates Nazar sends only when asked: the weekly email goes out on Saturdays to those who switched
 * it on, once a week, and one click turns it off; a device's push subscription belongs to its owner.
 */
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import * as Push from "@/app/api/push/route";
import * as Unsub from "@/app/api/email/unsubscribe/route";
import { signLink } from "@/lib/auth/links";
import { schema, type DB } from "@/lib/db";
import { sendWeeklySummaries } from "@/lib/weekly";
import { makeUser, memoryDb, request, type TestUser } from "./harness";

let db: DB;
let user: TestUser;

beforeAll(async () => {
  db = await memoryDb();
  user = await makeUser(db, { email: "weekly@test.nazar.dev", emailVerifiedAt: new Date(), prefs: { weeklyEmail: true } });
}, 120_000);

describe("the weekly email", () => {
  it("goes out only on Saturdays in India", async () => {
    expect(await sendWeeklySummaries(db, new Date("2026-11-06T04:00:00Z"))).toMatchObject({ sent: 0, reason: "not Saturday" });
  });
  it("sends nothing for an account with nothing to report", async () => {
    // A Saturday morning in India: the account has no holdings, so there is no summary to send.
    expect(await sendWeeklySummaries(db, new Date("2026-11-07T03:00:00Z"))).toMatchObject({ sent: 0 });
  });
  it("one click on the link in it turns it off", async () => {
    const token = signLink({ a: "unsub-owner", user: user.id });
    const res = await Unsub.GET(new Request(`http://localhost/api/email/unsubscribe?token=${encodeURIComponent(token)}`));
    expect(res.status).toBe(200);
    const [u] = await db.select().from(schema.users).where(eq(schema.users.id, user.id));
    expect(u.prefs.weeklyEmail).toBe(false);
    expect((await Unsub.GET(new Request("http://localhost/api/email/unsubscribe?token=nonsense"))).status).toBe(400);
  });
});

describe("push subscriptions", () => {
  it("are saved for the signed-in person and removed only by them", async () => {
    const sub = { endpoint: "https://push.example/abc", keys: { p256dh: "key", auth: "auth" } };
    expect((await Push.POST(await request("/api/push", { user, method: "POST", body: sub }))).status).toBe(200);
    const other = await makeUser(db, { email: "push-other@test.nazar.dev" });
    await Push.DELETE(await request("/api/push", { user: other, method: "DELETE", body: { endpoint: sub.endpoint } }));
    expect(await db.select().from(schema.pushSubscriptions)).toHaveLength(1);
    await Push.DELETE(await request("/api/push", { user, method: "DELETE", body: { endpoint: sub.endpoint } }));
    expect(await db.select().from(schema.pushSubscriptions)).toHaveLength(0);
  });
});
