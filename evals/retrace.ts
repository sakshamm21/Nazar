/**
 * Re-applies the number-provenance check to the answers of saved runs, at no cost: for tuning the
 * check against real answers before it is allowed to decide anything.
 *
 *   npx tsx --conditions=react-server evals/retrace.ts 2026-10-08T13-54-51 [more runs]
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { traceNumbers } from "@/lib/ask/checks";
import type { RunRecord } from "./types";

for (const run of process.argv.slice(2)) {
  const { records } = JSON.parse(readFileSync(path.join(process.cwd(), "evals", "runs", run, "results.json"), "utf8")) as { records: RunRecord[] };
  let answers = 0, clean = 0, numbers = 0, untraced = 0;
  const flagged: string[] = [];
  for (const r of records) {
    const last = r.turns.at(-1)!;
    if (last.blocked || !last.answer.trim()) continue;
    const context = [...r.turns.map((t) => t.question), ...r.turns.slice(0, -1).flatMap((t) => [t.answer, ...t.modelViews])];
    const p = traceNumbers(last.answer, last.tools.map((t) => t.output), context);
    answers++;
    numbers += p.total;
    untraced += p.untraced.length;
    if (p.untraced.length) flagged.push(`  ${r.caseId} (run ${r.repeat}): ${p.untraced.slice(0, 6).join(", ")}`);
    else clean++;
  }
  console.log(`${run}: ${clean}/${answers} answers with every number traced · ${numbers - untraced}/${numbers} numbers (${(100 * (1 - untraced / Math.max(1, numbers))).toFixed(2)}%)`);
  for (const f of flagged) console.log(f);
}
