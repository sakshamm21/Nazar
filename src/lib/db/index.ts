import "server-only";
import { drizzle as drizzlePg } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

/**
 * PostgreSQL connection.
 * - DATABASE_URL / POSTGRES_URL set → real Postgres (Neon, Supabase, Vercel Postgres, local…)
 * - otherwise → embedded PGlite (real Postgres compiled to WASM) stored in ./.data/pglite,
 *   so `npm run dev` works with zero setup.
 */
type DB = ReturnType<typeof drizzlePg<typeof schema>>;

const g = globalThis as unknown as { __stockaiDb?: Promise<DB> };

export const databaseUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL || "";

async function create(): Promise<DB> {
  if (databaseUrl) {
    const client = postgres(databaseUrl, { prepare: false, max: 5, ssl: /localhost|127\.0\.0\.1/.test(databaseUrl) ? false : "require" });
    const db = drizzlePg(client, { schema });
    await client.unsafe(schema.BOOTSTRAP_SQL);
    return db;
  }
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle: drizzlePglite } = await import("drizzle-orm/pglite");
  // Vercel's filesystem is read-only outside /tmp; locally persist to .data/
  let dir = "memory://";
  if (!process.env.VERCEL) {
    const { mkdirSync } = await import("fs");
    const path = `${process.cwd()}/.data/pglite`;
    try {
      mkdirSync(path, { recursive: true });
      dir = path;
    } catch {
      console.warn("[db] could not create .data/pglite, using in-memory database");
    }
  } else {
    console.warn("[db] No DATABASE_URL on Vercel — using in-memory PGlite (data will not persist). Add a Postgres database.");
  }
  const client = new PGlite(dir);
  await client.exec(schema.BOOTSTRAP_SQL);
  return drizzlePglite(client, { schema }) as unknown as DB;
}

export function getDb(): Promise<DB> {
  if (!g.__stockaiDb) {
    g.__stockaiDb = create().catch((e) => {
      g.__stockaiDb = undefined;
      throw e;
    });
  }
  return g.__stockaiDb;
}

export { schema };
