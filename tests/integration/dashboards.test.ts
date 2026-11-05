/** Dashboards belong to their owner: the first one is made on first use, and nobody else can change or delete them. */
import { beforeAll, describe, expect, it } from "vitest";
import * as One from "@/app/api/dashboards/[id]/route";
import * as List from "@/app/api/dashboards/route";
import type { DB } from "@/lib/db";
import { makeUser, memoryDb, params, request, type TestUser } from "./harness";

let db: DB;
let user: TestUser;
let other: TestUser;
type D = { id: string; name: string; widgets: { id: string; part: string }[] };

beforeAll(async () => {
  db = await memoryDb();
  user = await makeUser(db, { email: "dash@test.nazar.dev" });
  other = await makeUser(db, { email: "dash-other@test.nazar.dev" });
}, 120_000);

describe("dashboards", () => {
  it("the first is made on first use, with the default comparisons", async () => {
    const j = (await (await List.GET(await request("/api/dashboards", { user }))).json()) as { dashboards: D[] };
    expect(j.dashboards).toHaveLength(1);
    expect(j.dashboards[0].widgets.map((w) => w.part)).toEqual(["whole", "market", "Mutual funds", "Stocks"]);
  });

  it("can be renamed, changed, added and deleted by its owner only", async () => {
    const [first] = ((await (await List.GET(await request("/api/dashboards", { user }))).json()) as { dashboards: D[] }).dashboards;
    const widgets = [{ id: "w1", portfolio: "all", part: "Mutual funds", benchmark: "^NSEI", period: "6M" }];
    expect((await One.PATCH(await request(`/api/dashboards/${first.id}`, { user: other, method: "PATCH", body: { name: "Mine now" } }), params(first.id))).status).toBe(404);
    const res = await One.PATCH(await request(`/api/dashboards/${first.id}`, { user, method: "PATCH", body: { name: "Funds vs Nifty", widgets } }), params(first.id));
    expect(((await res.json()) as { dashboard: D }).dashboard).toMatchObject({ name: "Funds vs Nifty", widgets });
    // An index Nazar does not track is refused.
    expect((await One.PATCH(await request(`/api/dashboards/${first.id}`, { user, method: "PATCH", body: { widgets: [{ ...widgets[0], benchmark: "^GSPC" }] } }), params(first.id))).status).toBe(400);

    const created = ((await (await List.POST(await request("/api/dashboards", { user, method: "POST", body: { name: "Banks" } }))).json()) as { dashboard: D }).dashboard;
    expect((await One.DELETE(await request(`/api/dashboards/${created.id}`, { user: other, method: "DELETE" }), params(created.id))).status).toBe(404);
    expect((await One.DELETE(await request(`/api/dashboards/${created.id}`, { user, method: "DELETE" }), params(created.id))).status).toBe(200);
    // The last one stays.
    expect((await One.DELETE(await request(`/api/dashboards/${first.id}`, { user, method: "DELETE" }), params(first.id))).status).toBe(400);
  });
});
