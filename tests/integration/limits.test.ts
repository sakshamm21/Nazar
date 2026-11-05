/**
 * A shared test account is used by many visitors: one visitor's spend must not use up Ask for the
 * others, while an ordinary account's spend is its own however many networks it uses.
 */
import { randomUUID } from "crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { schema, type DB } from "@/lib/db";
import { LIMITS, checkAndRecord, visitorKey } from "@/lib/limits";
import { makeUser, memoryDb, type TestUser } from "./harness";

let db: DB;
let shared: TestUser;
let own: TestUser;

beforeAll(async () => {
  db = await memoryDb();
  shared = await makeUser(db, { email: "shared@test.nazar.dev", isTestAccount: true });
  own = await makeUser(db, { email: "own@test.nazar.dev" });
}, 120_000);

const spend = (userId: string, visitor: string | null) => db.insert(schema.usage).values({ id: randomUUID(), userId, model: "m", costUsd: LIMITS.userDailyUsd + 1, visitor });

describe("the daily spending cap", () => {
  it("on a shared account, belongs to each visitor", async () => {
    await spend(shared.id, visitorKey(shared.id, "net-a"));
    expect((await checkAndRecord(shared.id, "net-a", true)).ok).toBe(false);
    expect((await checkAndRecord(shared.id, "net-b", true)).ok).toBe(true);
  });
  it("on an ordinary account, is the account's", async () => {
    await spend(own.id, null);
    expect((await checkAndRecord(own.id, "net-c", false)).ok).toBe(false);
  });
});
