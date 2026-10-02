/**
 * Runs the nightly checkup (or the weekly report / maintenance) once against the configured
 * database, with real Yahoo data: `npm run pipeline:run [nightly|weekly|maintenance]`.
 */
import { loadEnv } from "./env";

async function main() {
  loadEnv();
  const kind = process.argv[2] ?? "nightly";
  const { runNightly, runWeekly, runMaintenance } = await import("../src/lib/pipeline/run");
  let r: unknown;
  if (kind === "weekly") r = await runWeekly();
  else if (kind === "maintenance") r = await runMaintenance();
  else {
    let res = await runNightly();
    while (res.more && !res.busy) res = await runNightly();
    r = res;
  }
  console.log(JSON.stringify(r, null, 2));
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
