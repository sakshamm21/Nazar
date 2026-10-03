/**
 * Applies Drizzle migrations to NAZAR_DATABASE_URL (or DATABASE_URL), then makes sure the demo
 * market, demo template and test accounts exist. Runs before `next build` on Vercel.
 * Refuses to touch a StockAI v1 database. Without a URL it does nothing: local PGlite sets itself up.
 *
 *   npm run db:migrate
 */
import path from "node:path";
import { loadEnv } from "./env";

async function main() {
  loadEnv();
  const { connect, databaseUrl, isLegacyDatabase, installDb } = await import("../src/lib/db");
  if (!databaseUrl) {
    console.log("[migrate] No NAZAR_DATABASE_URL / DATABASE_URL set: skipping (local PGlite migrates on first use).");
    return;
  }
  const db = await connect(databaseUrl);
  if (await isLegacyDatabase(db)) {
    throw new Error("[migrate] This database belongs to StockAI v1 (users.fingerprint_hash exists). Point NAZAR_DATABASE_URL at Nazar's own database.");
  }
  const migrationsFolder = path.join(process.cwd(), "drizzle");
  if (/\.neon\.tech/.test(databaseUrl)) {
    const { migrate } = await import("drizzle-orm/neon-http/migrator");
    await migrate(db as never, { migrationsFolder });
  } else {
    const { migrate } = await import("drizzle-orm/postgres-js/migrator");
    await migrate(db as never, { migrationsFolder });
  }
  console.log("[migrate] Database is up to date.");
  installDb(db);
  const { ensureDemoMarket } = await import("../src/lib/demo/seed");
  const t = Date.now();
  const r = await ensureDemoMarket(db, { maxStaleDays: 0 });
  console.log(`[migrate] Demo data ${r.rebuilt ? "rebuilt" : "already current"} (${r.today}) in ${((Date.now() - t) / 1000).toFixed(1)}s.`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
