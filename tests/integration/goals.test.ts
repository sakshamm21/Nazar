/**
 * Savings goals through the real route handlers with signed session cookies: what each user can see,
 * the validation the API enforces on top of the form's own, and the fact that one user's goals are
 * invisible to everyone else — including on edit, progress and delete.
 */
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import * as Goal from "@/app/api/goals/[id]/route";
import * as Progress from "@/app/api/goals/[id]/progress/route";
import * as Goals from "@/app/api/goals/route";
import { schema, type DB } from "@/lib/db";
import { MAX_GOALS } from "@/lib/goals/schema";
import { createGoal, deleteGoal, listGoals, recordProgress, updateGoal, type Goal as GoalRow } from "@/lib/repo/goals";
import { makeUser, memoryDb, params, request, type TestUser } from "./harness";

let db: DB;
let alice: TestUser, bob: TestUser;
let goalId: string;

beforeAll(async () => {
  db = await memoryDb();
  alice = await makeUser(db, { email: "goals-alice@test.nazar.dev" });
  bob = await makeUser(db, { email: "goals-bob@test.nazar.dev" });
  goalId = (await createGoal(alice.id, { name: "House deposit", target: 2500000, byDate: "2030-06-30", saved: 150000, savedAsOf: "2025-01-01", monthly: 20000, ratePct: 7 })).id;
}, 120_000);

type Res = { goals?: GoalRow[]; goal?: GoalRow; error?: string };
const body = (r: Response) => r.json() as Promise<Res>;
const goalsOf = async (u: TestUser) => (await body(await Goals.GET(await request("/api/goals", { user: u })))).goals!;

describe("goals through the API", () => {
  it("needs a session", async () => {
    expect((await Goals.GET(await request("/api/goals"))).status).toBe(401);
    expect((await Goals.POST(await request("/api/goals", { method: "POST", body: { name: "x", target: 1, byDate: "2030-01-01" } }))).status).toBe(401);
  });

  it("lists only the signed-in user's goals", async () => {
    const mine = await goalsOf(alice);
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ name: "House deposit", target: 2500000, saved: 150000, monthly: 20000, ratePct: 7 });
    expect(await goalsOf(bob)).toEqual([]);
  });

  it("creates a goal, trimming the name and filling in what was left out", async () => {
    const res = await Goals.POST(await request("/api/goals", { user: alice, method: "POST", body: { name: "  Car  ", target: 800000, byDate: "2029-03-31" } }));
    expect(res.status).toBe(201);
    const { goal } = await body(res);
    expect(goal).toMatchObject({ name: "Car", target: 800000, byDate: "2029-03-31", saved: 0, monthly: null, ratePct: null });
    await deleteGoal(alice.id, goal!.id);
    expect(await goalsOf(alice)).toHaveLength(1);
  });

  it("refuses input the form would never send, with a message the user can read", async () => {
    const bad: [Record<string, unknown>, RegExp][] = [
      [{ name: "", target: 100, byDate: "2030-01-01" }, /name/i],
      [{ name: "x", target: 0, byDate: "2030-01-01" }, /more than zero/i],
      [{ name: "x", target: 100, byDate: "30-01-2030" }, /date/i],
      [{ name: "x", target: 100, byDate: "2030-01-01", saved: -5 }, /below zero/i],
      [{ name: "x", target: 100, byDate: "2030-01-01", ratePct: 90 }, /rate/i],
      [{ name: "x".repeat(200), target: 100, byDate: "2030-01-01" }, /60 characters/i],
    ];
    for (const [payload, message] of bad) {
      const res = await Goals.POST(await request("/api/goals", { user: alice, method: "POST", body: payload }));
      expect(res.status).toBe(400);
      expect((await body(res)).error).toMatch(message);
    }
    // Nothing partial was written by any of them.
    expect(await goalsOf(alice)).toHaveLength(1);
  });

  it("stops at the cap rather than growing without limit", async () => {
    for (let i = 0; i < MAX_GOALS - 1; i++) await createGoal(alice.id, { name: `Goal ${i}`, target: 1000, byDate: "2030-01-01", saved: 0 });
    expect(await goalsOf(alice)).toHaveLength(MAX_GOALS);
    await expect(createGoal(alice.id, { name: "One too many", target: 1000, byDate: "2030-01-01", saved: 0 })).rejects.toThrow(/up to 8 goals/i);
  });
});

describe("editing, progress and removal", () => {
  it("changes only what was sent, and never touches the savings that were left out", async () => {
    const res = await Goal.PATCH(await request(`/api/goals/${goalId}`, { user: alice, method: "PATCH", body: { monthly: 25000 } }), params(goalId));
      expect((await body(res)).goal).toMatchObject({ monthly: 25000, name: "House deposit", target: 2500000, saved: 150000, savedAsOf: "2025-01-01" });
      // Regression: an optional field with a default would reset `saved` to 0 on every partial update.
      await Goal.PATCH(await request(`/api/goals/${goalId}`, { user: alice, method: "PATCH", body: { name: "Flat deposit" } }), params(goalId));
      const kept = (await listGoals(alice.id)).find((g) => g.id === goalId)!;
      expect(kept).toMatchObject({ name: "Flat deposit", saved: 150000, savedAsOf: "2025-01-01", monthly: 25000 });
      await updateGoal(alice.id, goalId, { name: "House deposit" });
    });

  it("records progress on the amount and the day, leaving the plan alone", async () => {
    const res = await Progress.POST(await request(`/api/goals/${goalId}/progress`, { user: alice, method: "POST", body: { saved: 320000, savedAsOf: "2025-09-30" } }), params(goalId));
    expect(res.status).toBe(200);
    expect((await body(res)).goal).toMatchObject({ saved: 320000, savedAsOf: "2025-09-30", monthly: 25000, target: 2500000 });
  });

  it("progress needs the day the amount was measured, so nothing is credited to the wrong month", async () => {
    const res = await Progress.POST(await request(`/api/goals/${goalId}/progress`, { user: alice, method: "POST", body: { saved: 400000 } }), params(goalId));
    expect(res.status).toBe(400);
    expect((await body(res)).error).toMatch(/date/i);
    expect((await listGoals(alice.id)).find((g) => g.id === goalId)!.saved).toBe(320000);
  });

  it("deleting removes it, and only once", async () => {
    const doomed = await createGoal(bob.id, { name: "Temporary", target: 500, byDate: "2030-01-01", saved: 0 });
    expect((await Goal.DELETE(await request(`/api/goals/${doomed.id}`, { user: bob, method: "DELETE" }), params(doomed.id))).status).toBe(200);
    expect(await goalsOf(bob)).toHaveLength(0);
    expect((await Goal.DELETE(await request(`/api/goals/${doomed.id}`, { user: bob, method: "DELETE" }), params(doomed.id))).status).toBe(404);
  });
});

describe("another user's goals are invisible and unchanged", () => {
  it("not found on edit, progress and delete", async () => {
    expect((await Goal.PATCH(await request(`/api/goals/${goalId}`, { user: bob, method: "PATCH", body: { name: "pwned" } }), params(goalId))).status).toBe(404);
    expect((await Progress.POST(await request(`/api/goals/${goalId}/progress`, { user: bob, method: "POST", body: { saved: 9_000_000, savedAsOf: "2025-01-01" } }), params(goalId))).status).toBe(404);
    expect((await Goal.DELETE(await request(`/api/goals/${goalId}`, { user: bob, method: "DELETE" }), params(goalId))).status).toBe(404);
    const [row] = await db.select().from(schema.goals).where(eq(schema.goals.id, goalId));
    expect(row).toMatchObject({ name: "House deposit", saved: 320000, userId: alice.id });
  });

  it("the repository refuses the same thing, so the route is not the only guard", async () => {
    await expect(updateGoal(bob.id, goalId, { name: "pwned" })).rejects.toThrow(/not found/i);
    await expect(recordProgress(bob.id, goalId, 1, "2025-01-01")).rejects.toThrow(/not found/i);
    await expect(deleteGoal(bob.id, goalId)).rejects.toThrow(/not found/i);
  });

  it("deleting an account takes its goals with it", async () => {
    const temp = await makeUser(db, { email: "goals-temp@test.nazar.dev" });
    const g = await createGoal(temp.id, { name: "Vanishing", target: 100, byDate: "2030-01-01", saved: 0 });
    await db.delete(schema.users).where(eq(schema.users.id, temp.id));
    expect(await db.select().from(schema.goals).where(eq(schema.goals.id, g.id))).toHaveLength(0);
  });
});