/**
 * Deletes the local PGlite database and rebuilds it with fresh demo data: `npm run demo:reset`.
 * (Stop `npm run dev` first; PGlite allows one process at a time.)
 */
import { rmSync } from "node:fs";
import { loadEnv } from "./env";

async function main() {
  loadEnv();
  const { createPglite, closeDb, installDb, getDb, localDir } = await import("../src/lib/db");
  const dir = localDir();
  rmSync(dir, { recursive: true, force: true });
  const db = await createPglite(dir);
  installDb(db);
  await getDb();
  await closeDb(db);
  console.log("Local database rebuilt with fresh demo data.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
