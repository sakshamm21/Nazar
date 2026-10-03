import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import path from "node:path";
import { sql } from "drizzle-orm";
import { drizzle as drizzlePg } from "drizzle-orm/postgres-js";
import * as schema from "./schema";

/**
 * PostgreSQL connection.
 * - NAZAR_DATABASE_URL (preferred) or DATABASE_URL → real Postgres. Neon uses its HTTP driver so
 *   nothing hangs on a socket frozen between serverless invocations; anything else uses postgres-js.
 *   Migrations run at build time (`npm run build` → scripts/migrate.ts).
 * - neither set → embedded PGlite (real Postgres compiled to WASM) in ./.data/nazar, migrated, with
 *   the test accounts built from live market data automatically, so `npm run dev` works with zero setup.
 */
export type DB = ReturnType<typeof drizzlePg<typeof schema>>;
export { schema };

export const databaseUrl = process.env.NAZAR_DATABASE_URL || process.env.DATABASE_URL || "";
const MIGRATIONS_DIR = path.join(process.cwd(), "drizzle");

/** Survives hot reloads in development, so there is one connection and one seed per process. */
const state = globalThis as unknown as { __nazarDb?: Promise<DB>; __nazarSeed?: Promise<void>; __nazarSkipSeed?: boolean };
const seeding = new AsyncLocalStorage<boolean>();

/** True when this database belongs to StockAI v1 (never migrate or write to it). */
export async function isLegacyDatabase(db: DB): Promise<boolean> {
  const rows = (await db.execute(
    sql`select 1 as hit from information_schema.columns where table_schema = 'public' and table_name = 'users' and column_name = 'fingerprint_hash' limit 1`,
  )) as unknown as { rows?: unknown[] } | unknown[];
  const list = Array.isArray(rows) ? rows : (rows.rows ?? []);
  return list.length > 0;
}

export async function connect(url = databaseUrl): Promise<DB> {
  if (url && /\.neon\.tech/.test(url)) {
    const { neon } = await import("@neondatabase/serverless");
    const { drizzle: drizzleNeon } = await import("drizzle-orm/neon-http");
    return drizzleNeon(neon(url), { schema }) as unknown as DB;
  }
  if (url) {
    const { default: postgres } = await import("postgres");
    const client = postgres(url, { prepare: false, max: 5, onnotice: () => {}, ssl: /localhost|127\.0\.0\.1/.test(url) ? false : "require" });
    return drizzlePg(client, { schema });
  }
  return createPglite(process.env.VERCEL ? "memory://" : localDir());
}

/** Local PGlite folder (.data/nazar by default; e2e tests use their own via NAZAR_PGLITE_DIR). */
export const localDir = () => path.resolve(process.cwd(), process.env.NAZAR_PGLITE_DIR || path.join(".data", "nazar"));

/** PGlite database, migrated. `dir` may be "memory://" (tests). */
export async function createPglite(dir: string): Promise<DB> {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle: drizzlePglite } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  if (!dir.startsWith("memory://")) {
    const { mkdirSync } = await import("node:fs");
    mkdirSync(dir, { recursive: true });
  }
  const db = drizzlePglite(new PGlite(dir), { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
  return db as unknown as DB;
}

/** Closes a PGlite database (scripts do this before exiting; PGlite allows one process at a time). */
export async function closeDb(db: DB) {
  await (db as unknown as { $client: { close?: () => Promise<void> } }).$client.close?.();
}

export async function getDb(): Promise<DB> {
  state.__nazarDb ??= connect().catch((e) => {
    state.__nazarDb = undefined;
    throw e;
  });
  const db = await state.__nazarDb;
  // Local zero-setup: the first request builds the test accounts (PGlite only).
  // Code running inside the seed itself calls getDb() too, so it must not wait on the seed.
  if (!databaseUrl && !state.__nazarSkipSeed && !seeding.getStore()) {
    state.__nazarSeed ??= seeding
      .run(true, async () => {
        const { ensureTestAccounts } = await import("@/lib/demo/seed");
        // Needs the internet (live prices). Offline, the app still starts; the accounts fill in later.
        await ensureTestAccounts(db).catch(() => undefined);
      })
      .catch((e) => {
        state.__nazarSeed = undefined;
        throw e;
      });
    await state.__nazarSeed;
  }
  return db;
}

/** Scripts: use an already-open database as the app's database (seeding still runs once). */
export function installDb(db: DB) {
  state.__nazarDb = Promise.resolve(db);
}

/** Tests: inject an in-memory database (and seed explicitly when a test needs the demo). */
export function setDbForTests(db: DB) {
  state.__nazarDb = Promise.resolve(db);
  state.__nazarSkipSeed = true;
}
