/**
 * Runs the nightly checkup (or the maintenance job) once against the configured
 * database, with real Yahoo data: `npm run pipeline:run [nightly|maintenance]`.
 */
import { loadEnv } from "./env";

async function main() {
  loadEnv();
  const kind = process.argv[2] ?? "nightly";
  const { runNightly, runMaintenance } = await import("../src/lib/pipeline/run");
  let r: unknown;
  if (kind === "maintenance") r = await runMaintenance();
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
