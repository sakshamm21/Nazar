/**
 * Re-grades saved runs with the code graders as they are now. No model is called and nothing is
 * spent: the answers and tool results are already on disk in evals/runs.
 *
 *   npm run eval:regrade -- 2026-10-08T15-12-54 [more runs]
 *   npm run eval:regrade -- 2026-10-08T15-12-54 --save-baseline     make the re-graded run the baseline
 *
 * For changing a grader and seeing what it would have said about answers already collected, before
 * (or instead of) paying for a new run. Judge verdicts are kept as they were: only a model can redo
 * those. The run's own results.json is left untouched.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { gradeWithCode } from "./graders/code";
import type { EvalCase, Grade, RunRecord } from "./types";

const DIR = path.join(process.cwd(), "evals");
const args = process.argv.slice(2);
const runs = args.filter((a) => !a.startsWith("--"));
const save = args.includes("--save-baseline");

const cases = new Map<string, EvalCase>();
for (const f of ["golden", "adversarial", "deep"])
  for (const l of readFileSync(path.join(DIR, "cases", `${f}.jsonl`), "utf8").split("\n").filter((x) => x.trim())) {
    const c = JSON.parse(l) as EvalCase;
    cases.set(c.id, c);
  }

type Summary = { model: string; cases: number; passed: number; byCategory: Record<string, { cases: number; passed: number }>; byGrader: Record<string, { runs: number; passed: number; gate: boolean }>; caseResults: Record<string, boolean>; unstable: string[] };

for (const run of runs) {
  const file = path.join(DIR, "runs", run, "results.json");
  const r = JSON.parse(readFileSync(file, "utf8")) as { createdAt: string; promptVersion: string; suite: string; repeat: number; summaries: Summary[]; records: RunRecord[] };
  const changes: string[] = [];
  for (const x of r.records) {
    const c = cases.get(x.caseId);
    if (!c || x.error) continue;
    const judged = x.grades.filter((g) => g.grader.startsWith("judge:"));
    const grades: Grade[] = [...gradeWithCode(c, x.turns), ...judged];
    const pass = grades.every((g) => !g.gate || g.pass);
    if (pass !== x.pass) changes.push(`  ${x.caseId} (run ${x.repeat}): ${x.pass ? "passed" : "failed"} → ${pass ? "passes" : "FAILS"}${pass ? "" : ` · ${grades.filter((g) => g.gate && !g.pass).map((g) => `${g.grader}: ${g.detail.slice(0, 110)}`).join(" | ")}`}`);
    x.grades = grades;
    x.pass = pass;
  }
  const need = Math.ceil((r.repeat * 2) / 3);
  for (const s of r.summaries) {
    const before = s.passed;
    const mine = r.records.filter((x) => x.model === s.model);
    const byCase = new Map<string, RunRecord[]>();
    for (const x of mine) byCase.set(x.caseId, [...(byCase.get(x.caseId) ?? []), x]);
    s.caseResults = {};
    s.unstable = [];
    s.byCategory = {};
    for (const [id, list] of byCase) {
      const passes = list.filter((x) => x.pass).length;
      s.caseResults[id] = passes >= Math.min(need, list.length);
      if (passes > 0 && passes < list.length) s.unstable.push(id);
      const cat = cases.get(id)?.category ?? "unknown";
      s.byCategory[cat] ??= { cases: 0, passed: 0 };
      s.byCategory[cat].cases++;
      if (s.caseResults[id]) s.byCategory[cat].passed++;
    }
    s.byGrader = {};
    for (const x of mine)
      for (const g of x.grades) {
        s.byGrader[g.grader] ??= { runs: 0, passed: 0, gate: g.gate };
        s.byGrader[g.grader].runs++;
        if (g.pass) s.byGrader[g.grader].passed++;
      }
    s.passed = Object.values(s.caseResults).filter(Boolean).length;
    const n = s.byGrader.numbers_traced;
    console.log(`${run} · ${s.model}: was ${before}/${s.cases}, now ${s.passed}/${s.cases}${s.unstable.length ? ` · unstable: ${s.unstable.join(", ")}` : ""}${n ? ` · numbers traced in ${n.passed}/${n.runs} answers` : ""}`);
  }
  for (const c of changes) console.log(c);
  if (save) {
    if (runs.length !== 1) throw new Error("--save-baseline takes exactly one run.");
    writeFileSync(path.join(DIR, "baseline.json"), `${JSON.stringify({ createdAt: r.createdAt, promptVersion: r.promptVersion, suite: r.suite, repeat: r.repeat, regraded: new Date().toISOString(), models: Object.fromEntries(r.summaries.map((s) => [s.model, s])) }, null, 1)}\n`);
    console.log(`Baseline saved from ${run}, re-graded.`);
  }
}
