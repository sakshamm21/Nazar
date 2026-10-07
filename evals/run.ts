/**
 * Agent evals: runs labelled questions through the real Ask code (runAsk) and scores the answers.
 *
 *   npm run eval:agent                               golden + adversarial, the app's own model routing
 *   npm run eval:agent -- --suite golden --repeat 3
 *   npm run eval:agent -- --models openai/gpt-6-luna,google/gemini-3.8-flash
 *   npm run eval:agent -- --filter pf- --no-judge    a quick, cheap pass over some cases
 *   npm run eval:agent -- --compare                  show what changed against evals/baseline.json
 *   npm run eval:agent -- --save-baseline            make this run the baseline
 *
 * Flags: --suite golden|adversarial|all · --models a,b (or "auto") · --repeat N · --filter text
 *        --limit N · --no-judge · --frozen (never call Yahoo; replay recordings only)
 *        --effort low|medium|high (reasoning effort for the answering model)
 *        --max-usd N (stop starting new cases past this spend; default 3) · --concurrency N
 *
 * It needs a model key (OPENROUTER_API_KEY, or OPENAI_API_KEY) and spends real money: the report
 * says how much. Market data is replayed from evals/fixtures after the first run.
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { loadEnv } from "../scripts/env";
import type { EvalCase, Grade, RunRecord, ToolUse, TurnRecord } from "./types";

loadEnv();
process.env.LOG_LEVEL ??= "error";

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const opt = (name: string, fallback: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : fallback;
};

const SUITE = opt("suite", "all");
const MODELS = opt("models", "auto").split(",").map((s) => s.trim()).filter(Boolean);
const REPEAT = Math.max(1, Number(opt("repeat", "1")));
const FILTER = opt("filter", "");
const LIMIT = Number(opt("limit", "0"));
const MAX_USD = Number(opt("max-usd", "3"));
const CONCURRENCY = Math.max(1, Number(opt("concurrency", "3")));
const JUDGE = !flag("no-judge");
const FROZEN = flag("frozen");
const EFFORT = opt("effort", "");

const DIR = path.join(process.cwd(), "evals");
const BASELINE = path.join(DIR, "baseline.json");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "n/a");
const median = (xs: number[]) => {
  const a = xs.filter((x) => Number.isFinite(x)).sort((x, y) => x - y);
  return a.length ? a[Math.floor(a.length / 2)] : null;
};

function loadCases(): EvalCase[] {
  const files = SUITE === "all" ? ["golden", "adversarial"] : [SUITE];
  let cases = files.flatMap((f) =>
    readFileSync(path.join(DIR, "cases", `${f}.jsonl`), "utf8")
      .split("\n")
      .filter((l) => l.trim())
      .map((l) => JSON.parse(l) as EvalCase),
  );
  if (FILTER) cases = cases.filter((c) => c.id.includes(FILTER) || c.category.includes(FILTER));
  return LIMIT ? cases.slice(0, LIMIT) : cases;
}

type Summary = {
  model: string;
  cases: number;
  passed: number;
  byCategory: Record<string, { cases: number; passed: number }>;
  byGrader: Record<string, { runs: number; passed: number; gate: boolean }>;
  caseResults: Record<string, boolean>;
  unstable: string[];
  costUsd: number;
  judgeCostUsd: number;
  p50TtftMs: number | null;
  p50LatencyMs: number | null;
  avgInputTokens: number;
  avgSteps: number;
};

async function main() {
  const { runAsk } = await import("@/lib/ask/run");
  const { askConfigured, activeProvider } = await import("@/lib/ask/provider");
  const { promptVersion } = await import("@/lib/ask/prompt-version");
  const { modelViewOf } = await import("@/lib/ask/context");
  const { makeTools } = await import("@/lib/ask/tools");
  const { getModel } = await import("@/lib/ask/models");
  const { schema } = await import("@/lib/db");
  const { buildWorld, EVAL_TODAY } = await import("./world");
  const { withFixtures } = await import("./fixtures");
  const { gradeWithCode } = await import("./graders/code");
  const { judge, judgeModel } = await import("./graders/judge");

  if (!askConfigured()) {
    console.error("No model key found. Set OPENROUTER_API_KEY (or OPENAI_API_KEY) in .env.local.");
    process.exit(1);
  }
  const cases = loadCases();
  if (!cases.length) {
    console.error("No cases matched.");
    process.exit(1);
  }
  console.log(`Building the eval world (demo personas on the fake market, as of ${EVAL_TODAY})…`);
  const world = await buildWorld();
  const { db } = world;
  const views = makeTools("eval-views");
  const version = promptVersion();
  console.log(`${cases.length} cases × ${MODELS.length} model(s) × ${REPEAT} run(s) · provider ${activeProvider()} · prompt ${version} · judges ${JUDGE ? judgeModel() : "off"} · market data ${FROZEN ? "replay only" : "replay, recording what is new"}\n`);

  // A model that is not in Nazar's catalog has no price there: take it from OpenRouter's public list.
  const prices = new Map<string, { input: number; cached: number; output: number }>();
  if (activeProvider() === "openrouter" && MODELS.some((m) => m !== "auto" && !getModel(m))) {
    const list = (await (await fetch("https://openrouter.ai/api/v1/models", { signal: AbortSignal.timeout(20_000) })).json()) as { data: { id: string; pricing: { prompt: string; completion: string; input_cache_read?: string } }[] };
    for (const m of list.data) prices.set(m.id, { input: Number(m.pricing.prompt), cached: Number(m.pricing.input_cache_read ?? m.pricing.prompt), output: Number(m.pricing.completion) });
  }
  const costOf = (model: string, t: { costUsd: number; inputTokens: number; cachedInputTokens: number; outputTokens: number }) => {
    const p = prices.get(model);
    return t.costUsd || !p ? t.costUsd : (t.inputTokens - t.cachedInputTokens) * p.input + t.cachedInputTokens * p.cached + t.outputTokens * p.output;
  };

  let spent = 0;
  let judgeSpend = 0;
  let recorded = 0;
  const missed = new Set<string>();

  /** One case, once, on one model: every turn through runAsk, then read back what was saved. */
  async function runOnce(c: EvalCase, model: string, repeat: number): Promise<RunRecord> {
    const user = await world.account(c.persona ?? "investor");
    const chatId = `eval-${c.id}-${repeat}-${Math.random().toString(36).slice(2, 8)}`.slice(0, 64);
    const turns: TurnRecord[] = [];
    try {
      for (let i = 0; i < c.turns.length; i++) {
        const last = i === c.turns.length - 1;
        const log = { replayed: new Set<string>(), recorded: 0, missed: [] as string[] };
        const res = await runAsk({
          user,
          chatId,
          text: c.turns[i],
          mode: c.mode ?? "simple",
          ip: "eval",
          signal: AbortSignal.timeout(120_000),
          harness: { today: EVAL_TODAY, skipLimits: true, reasoningEffort: EFFORT || undefined, model: model === "auto" ? undefined : model, tools: (t) => withFixtures(t, { frozen: FROZEN, plant: last ? c.plant : undefined, log }) },
        });
        const body = await res.text();
        if (res.status !== 200) throw new Error(`HTTP ${res.status}: ${body.slice(0, 200)}`);
        recorded += log.recorded;
        for (const m of log.missed) missed.add(m);

        // The chat and its trace are written just after the stream ends.
        const want = (i + 1) * 2;
        let messages: any[] = [];
        let trace: (typeof schema.askTraces.$inferSelect) | undefined;
        for (let n = 0; n < 100; n++) {
          const [chat] = await db.select().from(schema.chats).where(eq(schema.chats.id, chatId));
          messages = (chat?.messages as any[]) ?? [];
          trace = (await db.select().from(schema.askTraces).where(eq(schema.askTraces.chatId, chatId))).find((t) => t.turn === i + 1);
          if (messages.length >= want && trace) break;
          await sleep(50);
        }
        const answer = messages[want - 1];
        if (!answer || !trace) throw new Error(`turn ${i + 1} was not saved (stream said: ${body.slice(-200).replace(/\s+/g, " ")})`);
        const parts = (answer.parts ?? []) as any[];
        const tools: ToolUse[] = parts
          .filter((p) => typeof p.type === "string" && p.type.startsWith("tool-"))
          .map((p) => ({ name: p.type.slice(5), input: p.input, output: p.output ?? p.errorText ?? null, ok: p.state === "output-available" && !(p.output && typeof p.output === "object" && "error" in p.output), replayed: log.replayed.has(p.toolCallId) }));
        turns.push({
          question: c.turns[i],
          answer: parts.filter((p) => p.type === "text").map((p) => p.text).join("\n").trim(),
          blocked: trace.outcome === "blocked",
          tools,
          modelViews: tools.map((t) => modelViewOf((views as Record<string, { toModelOutput?: (o: any) => unknown }>)[t.name], t.output)),
          steps: trace.steps.length,
          inputTokens: trace.inputTokens,
          cachedInputTokens: trace.cachedInputTokens,
          outputTokens: trace.outputTokens,
          costUsd: costOf(model, trace),
          ttftMs: trace.ttftMs,
          latencyMs: trace.latencyMs,
          guardMs: trace.guard.ms,
          outcome: trace.outcome,
        });
        if (trace.outcome === "error") throw new Error(`the provider failed on turn ${i + 1}: ${trace.error ?? "unknown"}`);
      }
      const grades: Grade[] = gradeWithCode(c, turns);
      const final = turns.at(-1)!;
      if (JUDGE && !final.blocked)
        for (const name of c.expect.judges ?? []) {
          const j = await judge(name, final, turns.slice(0, -1));
          spent += j.costUsd;
          judgeSpend += j.costUsd;
          grades.push(j.grade);
        }
      spent += turns.reduce((a, t) => a + t.costUsd, 0);
      return { caseId: c.id, model, repeat, turns, grades, pass: grades.every((g) => !g.gate || g.pass) };
    } catch (e) {
      spent += turns.reduce((a, t) => a + t.costUsd, 0);
      return { caseId: c.id, model, repeat, turns, grades: [], pass: false, error: String((e as Error)?.message ?? e).slice(0, 300) };
    }
  }

  const records: RunRecord[] = [];
  const jobs = MODELS.flatMap((model) => cases.flatMap((c) => Array.from({ length: REPEAT }, (_, r) => ({ c, model, r }))));
  let next = 0;
  let stoppedForBudget = false;
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (next < jobs.length) {
        if (spent >= MAX_USD) {
          stoppedForBudget = true;
          return;
        }
        const { c, model, r } = jobs[next++];
        const rec = await runOnce(c, model, r);
        records.push(rec);
        const failed = rec.grades.filter((g) => g.gate && !g.pass).map((g) => g.grader);
        console.log(`${rec.pass ? "  ok " : "  ✗  "} ${c.id.padEnd(24)} ${model.padEnd(28)} ${rec.error ? `ERROR ${rec.error.slice(0, 90)}` : failed.length ? failed.join(", ") : ""}`);
      }
    }),
  );

  /* ── Summarise ─────────────────────────────────────────────── */
  const need = Math.ceil((REPEAT * 2) / 3);
  const summaries: Summary[] = MODELS.map((model) => {
    const mine = records.filter((r) => r.model === model);
    const byCase = new Map<string, RunRecord[]>();
    for (const r of mine) byCase.set(r.caseId, [...(byCase.get(r.caseId) ?? []), r]);
    const caseResults: Record<string, boolean> = {};
    const unstable: string[] = [];
    const byCategory: Summary["byCategory"] = {};
    for (const [id, runs] of byCase) {
      const passes = runs.filter((r) => r.pass).length;
      // Answers vary from run to run: a case passes when at least two runs in three do.
      caseResults[id] = passes >= Math.min(need, runs.length);
      if (passes > 0 && passes < runs.length) unstable.push(id);
      const cat = cases.find((c) => c.id === id)!.category;
      byCategory[cat] ??= { cases: 0, passed: 0 };
      byCategory[cat].cases++;
      if (caseResults[id]) byCategory[cat].passed++;
    }
    const byGrader: Summary["byGrader"] = {};
    for (const r of mine)
      for (const g of r.grades) {
        byGrader[g.grader] ??= { runs: 0, passed: 0, gate: g.gate };
        byGrader[g.grader].runs++;
        if (g.pass) byGrader[g.grader].passed++;
      }
    const answered = mine.flatMap((r) => r.turns.slice(-1)).filter((t) => !t.blocked);
    return {
      model,
      cases: byCase.size,
      passed: Object.values(caseResults).filter(Boolean).length,
      byCategory,
      byGrader,
      caseResults,
      unstable,
      costUsd: mine.reduce((a, r) => a + r.turns.reduce((x, t) => x + t.costUsd, 0), 0),
      judgeCostUsd: 0,
      p50TtftMs: median(answered.map((t) => t.ttftMs ?? NaN)),
      p50LatencyMs: median(answered.map((t) => t.latencyMs)),
      avgInputTokens: answered.length ? Math.round(answered.reduce((a, t) => a + t.inputTokens, 0) / answered.length) : 0,
      avgSteps: answered.length ? Number((answered.reduce((a, t) => a + t.steps, 0) / answered.length).toFixed(2)) : 0,
    };
  });

  const baseline = existsSync(BASELINE) ? (JSON.parse(readFileSync(BASELINE, "utf8")) as { promptVersion: string; createdAt: string; models: Record<string, Summary> }) : null;

  /* ── Report ────────────────────────────────────────────────── */
  const lines: string[] = [];
  const out = (s = "") => lines.push(s);
  out(`# Ask eval · ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC`);
  out();
  out(`Suite \`${SUITE}\`${FILTER ? ` (filter \`${FILTER}\`)` : ""} · ${cases.length} cases · ${REPEAT} run(s) each · prompt \`${version}\` · provider ${activeProvider()} · judges ${JUDGE ? `\`${judgeModel()}\` (reported, not yet gating)` : "off"}`);
  out(`Spent **$${spent.toFixed(3)}** (answers $${(spent - judgeSpend).toFixed(3)}, judges $${judgeSpend.toFixed(3)})${stoppedForBudget ? ` · **stopped early at the $${MAX_USD} cap: ${jobs.length - next} runs not started**` : ""}${recorded ? ` · recorded ${recorded} new market-data results` : ""}`);
  if (missed.size) out(`\n**${missed.size} market-data calls had no recording** and came back as "not found": ${[...missed].slice(0, 6).join("; ")}`);
  for (const s of summaries) {
    out();
    out(`## ${s.model === "auto" ? "App routing (auto)" : s.model}`);
    out();
    out(`**${s.passed} of ${s.cases} cases pass (${pct(s.passed, s.cases)})** · $${s.costUsd.toFixed(3)} · ${s.cases ? `$${(s.costUsd / (s.cases * REPEAT)).toFixed(4)} a case` : ""} · first word p50 ${s.p50TtftMs ?? "n/a"} ms · total p50 ${s.p50LatencyMs ?? "n/a"} ms · ${s.avgInputTokens} input tokens and ${s.avgSteps} steps on average`);
    const b = baseline?.models[s.model];
    if (b && flag("compare")) {
      const regress = Object.keys(s.caseResults).filter((id) => b.caseResults[id] === true && !s.caseResults[id]);
      const fixed = Object.keys(s.caseResults).filter((id) => b.caseResults[id] === false && s.caseResults[id]);
      out();
      out(`Against the baseline of ${baseline!.createdAt.slice(0, 10)} (prompt \`${baseline!.promptVersion}\`): was ${b.passed}/${b.cases}. **${regress.length} regressed**${regress.length ? `: ${regress.join(", ")}` : ""}. ${fixed.length} newly passing${fixed.length ? `: ${fixed.join(", ")}` : ""}.`);
    }
    out();
    out(`| Category | Pass |`);
    out(`|---|---|`);
    for (const [cat, v] of Object.entries(s.byCategory)) out(`| ${cat} | ${v.passed}/${v.cases} |`);
    out();
    out(`| Grader | Pass | Decides a case? |`);
    out(`|---|---|---|`);
    for (const [g, v] of Object.entries(s.byGrader)) out(`| ${g} | ${v.passed}/${v.runs} (${pct(v.passed, v.runs)}) | ${v.gate ? "yes" : "no, reported only"} |`);
    if (s.unstable.length) out(`\nUnstable (passed on some runs, failed on others): ${s.unstable.join(", ")}`);
    const failures = records.filter((r) => r.model === s.model && (!r.pass || r.grades.some((g) => !g.pass)));
    if (failures.length) {
      out();
      out(`### What failed or was flagged`);
      for (const r of failures) {
        const c = cases.find((x) => x.id === r.caseId)!;
        const t = r.turns.at(-1);
        out();
        out(`**${r.caseId}**${REPEAT > 1 ? ` (run ${r.repeat + 1})` : ""} · ${r.pass ? "passes, with flags" : "FAILS"}${c.note ? ` · _${c.note}_` : ""}`);
        out(`- Asked: ${c.turns.at(-1)}`);
        if (r.error) out(`- Run error: ${r.error}`);
        for (const g of r.grades.filter((x) => !x.pass)) out(`- ${g.gate ? "✗" : "flag"} ${g.grader}: ${g.detail}`);
        if (t) out(`- Answer: ${t.answer.replace(/\s+/g, " ").slice(0, 420)}${t.answer.length > 420 ? "…" : ""}`);
      }
    }
  }
  const report = `${lines.join("\n")}\n`;

  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const runDir = path.join(DIR, "runs", stamp);
  mkdirSync(runDir, { recursive: true });
  writeFileSync(path.join(runDir, "report.md"), report);
  writeFileSync(path.join(runDir, "results.json"), JSON.stringify({ createdAt: new Date().toISOString(), promptVersion: version, suite: SUITE, repeat: REPEAT, summaries, records }, null, 1));

  console.log(`\n${"─".repeat(72)}`);
  for (const s of summaries) console.log(`${(s.model === "auto" ? "auto" : s.model).padEnd(30)} ${String(s.passed).padStart(3)}/${s.cases} pass · $${s.costUsd.toFixed(3)} · first word p50 ${s.p50TtftMs ?? "n/a"} ms`);
  console.log(`Spent $${spent.toFixed(3)}. Report: ${path.relative(process.cwd(), path.join(runDir, "report.md"))}`);

  if (flag("save-baseline")) {
    writeFileSync(BASELINE, `${JSON.stringify({ createdAt: new Date().toISOString(), promptVersion: version, suite: SUITE, repeat: REPEAT, models: Object.fromEntries(summaries.map((s) => [s.model, s])) }, null, 1)}\n`);
    console.log(`Baseline saved to ${path.relative(process.cwd(), BASELINE)}.`);
  }
  if (flag("compare") && baseline) {
    const regressed = summaries.some((s) => Object.keys(s.caseResults).some((id) => baseline.models[s.model]?.caseResults[id] === true && !s.caseResults[id]));
    process.exit(regressed ? 1 : 0);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
