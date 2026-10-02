/**
 * Deletes the local PGlite database and rebuilds it with fresh demo data: `npm run demo:reset`.
 * (Stop `npm run dev` first; PGlite allows one process at a time.)
 */
import { rmSync } from "node:fs";
import path from "node:path";
import { loadEnv } from "./env";

async function main() {
  loadEnv();
  const dir = path.join(process.cwd(), ".data", "nazar");
  rmSync(dir, { recursive: true, force: true });
  const { createPglite, useDb, getDb } = await import("../src/lib/db");
  const db = await createPglite(dir);
  useDb(db);
  await getDb();
  await (db as unknown as { $client: { close: () => Promise<void> } }).$client.close();
  console.log("Local database rebuilt with fresh demo data.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
