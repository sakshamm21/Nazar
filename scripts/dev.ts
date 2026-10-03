/**
 * One command for local development: `npm run dev`.
 * Without a database URL it prepares the embedded PGlite database in .data/nazar (migrations,
 * test accounts on live data) before starting Next.js, so the first page is instant.
 * Works the same on Windows, macOS and Linux.
 */
import { spawn } from "node:child_process";
import { loadEnv } from "./env";

async function main() {
  loadEnv();
  const { databaseUrl, createPglite, closeDb, installDb, getDb, localDir } = await import("../src/lib/db");
  if (!databaseUrl) {
    const t = Date.now();
    console.log("Preparing the local database (the first run fetches live prices for the test accounts, about a minute)…");
    const db = await createPglite(localDir());
    installDb(db);
    await getDb();
    await closeDb(db);
    console.log(`Local database ready in ${((Date.now() - t) / 1000).toFixed(1)}s. Test accounts: demo@nazar.dev / nazar123`);
  }
  const port = process.env.PORT ?? "3000";
  const child = spawn(`npx next dev -p ${Number(port) || 3000}`, { stdio: "inherit", shell: true });
  child.on("exit", (code) => process.exit(code ?? 0));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
