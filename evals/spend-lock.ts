/**
 * A lock on everything in this folder that calls a paid model.
 *
 * The model account also serves the live app, and its credit is not being topped up. So an eval
 * that spends from it runs only when the person paying says so, in the shell, for that one command:
 *
 *   PowerShell:  $env:NAZAR_ALLOW_MODEL_SPEND = "1"; npm run eval:agent -- --no-judge
 *   bash:        NAZAR_ALLOW_MODEL_SPEND=1 npm run eval:agent -- --no-judge
 *
 * It is read before any .env file is loaded, so a line left in .env.local cannot switch it on by
 * accident. Nothing else needs it: tests, the build, deploys, the nightly checkup, and the free
 * tools here (eval:regrade, eval:calibrate, eval:archive, eval:harvest) never call a model.
 */
const allowed = process.env.NAZAR_ALLOW_MODEL_SPEND === "1";

export function requireSpendAllowed(what: string, roughCost: string) {
  if (allowed) return;
  console.error(`\n${what} calls a paid model and is locked.`);
  console.error(`It would spend about ${roughCost} of the OpenRouter credit the live app also runs on.`);
  console.error(`To run it on purpose, set NAZAR_ALLOW_MODEL_SPEND=1 for this one command (see evals/spend-lock.ts).`);
  console.error(`Free alternatives: npm test (the whole request path on a scripted model), npm run eval:regrade (re-score saved answers).\n`);
  process.exit(2);
}
