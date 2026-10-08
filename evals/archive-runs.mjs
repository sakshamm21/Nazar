#!/usr/bin/env node
/**
 * Keeps eval runs for the model-evaluation report. A run's own folder (evals/runs, not committed)
 * holds every tool result in full and runs to megabytes; this writes a compact copy of each run to
 * evals/report/data: the scores, the timings and token counts, which tools were called with what,
 * every grade with its reason, and the answer itself. Tool results are dropped: they are the
 * recorded market data in evals/fixtures and the demo personas, both reproducible.
 *
 *   npm run eval:archive          archive every run that is not archived yet
 *
 * It also rewrites evals/report/data/runs.csv, one line per model per run.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const RUNS = path.join(process.cwd(), "evals", "runs");
const OUT = path.join(process.cwd(), "evals", "report", "data");
mkdirSync(OUT, { recursive: true });

const compact = (r) => ({
  createdAt: r.createdAt,
  promptVersion: r.promptVersion,
  suite: r.suite,
  repeat: r.repeat,
  summaries: r.summaries,
  records: r.records.map((x) => ({
    caseId: x.caseId,
    model: x.model,
    repeat: x.repeat,
    pass: x.pass,
    error: x.error,
    grades: x.grades,
    turns: x.turns.map((t) => ({
      question: t.question,
      answer: t.answer,
      blocked: t.blocked,
      tools: t.tools.map((u) => ({ name: u.name, input: u.input, ok: u.ok, replayed: u.replayed })),
      steps: t.steps,
      inputTokens: t.inputTokens,
      cachedInputTokens: t.cachedInputTokens,
      outputTokens: t.outputTokens,
      costUsd: t.costUsd,
      ttftMs: t.ttftMs,
      latencyMs: t.latencyMs,
      guardMs: t.guardMs,
      outcome: t.outcome,
      adviceRemoved: t.adviceRemoved,
    })),
  })),
});

let added = 0;
for (const d of existsSync(RUNS) ? readdirSync(RUNS).sort() : []) {
  const src = path.join(RUNS, d, "results.json");
  const dst = path.join(OUT, `${d}.json`);
  if (!existsSync(src) || existsSync(dst)) continue;
  writeFileSync(dst, JSON.stringify(compact(JSON.parse(readFileSync(src, "utf8")))));
  added++;
}

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const rows = [["run", "prompt_version", "repeats", "model", "cases", "passed", "run_errors", "cost_usd", "p50_first_word_ms", "p50_total_ms", "avg_input_tokens", "avg_cached_input_tokens", "avg_output_tokens", "avg_steps", "grader_pass_counts"]];
for (const f of readdirSync(OUT).filter((x) => x.endsWith(".json")).sort()) {
  const r = JSON.parse(readFileSync(path.join(OUT, f), "utf8"));
  for (const s of r.summaries) {
    const mine = r.records.filter((x) => x.model === s.model);
    const answered = mine.flatMap((x) => x.turns.slice(-1)).filter((t) => !t.blocked);
    rows.push([
      f.replace(".json", ""),
      r.promptVersion,
      r.repeat,
      s.model,
      s.cases,
      s.passed,
      mine.filter((x) => x.error).length,
      s.costUsd.toFixed(4),
      s.p50TtftMs ?? "",
      s.p50LatencyMs ?? "",
      s.avgInputTokens,
      Math.round(mean(answered.map((t) => t.cachedInputTokens))),
      Math.round(mean(answered.map((t) => t.outputTokens))),
      s.avgSteps,
      Object.entries(s.byGrader).map(([k, v]) => `${k}=${v.passed}/${v.runs}`).join(" "),
    ]);
  }
}
writeFileSync(path.join(OUT, "runs.csv"), `${rows.map((r) => r.map((c) => (/[",]/.test(String(c)) ? `"${String(c).replace(/"/g, '""')}"` : c)).join(",")).join("\n")}\n`);
console.log(`Archived ${added} new run(s). ${rows.length - 1} model-runs listed in evals/report/data/runs.csv.`);
