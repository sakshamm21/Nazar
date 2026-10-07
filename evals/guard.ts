/**
 * Scope-guard eval: runs labelled questions through the classifier and reports precision, recall,
 * the false-block rate and every mistake. Calls the classifier directly, so no dev server is needed.
 *
 *   npm run eval:guard
 *   GUARD_MODEL=openai/gpt-6-luna npm run eval:guard      try another model
 *
 * Labels: "allow" = Nazar should answer; "block" = off-topic or an attack.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { loadEnv } from "../scripts/env";

loadEnv();
process.env.LOG_LEVEL ??= "error";

type GuardCase = { label: "allow" | "block"; group: string; text: string; previousUser?: string; previousAssistant?: string };

async function main() {
  const { classify, GUARD_MODEL } = await import("@/lib/ask/scope-guard");
  const { askConfigured, activeProvider } = await import("@/lib/ask/provider");
  const { estimateCost } = await import("@/lib/ask/models");
  if (!askConfigured()) {
    console.error("No model key found. Set OPENROUTER_API_KEY (or OPENAI_API_KEY) in .env.local.");
    process.exit(1);
  }
  const cases = readFileSync(path.join(process.cwd(), "evals", "cases", "guard.jsonl"), "utf8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l) as GuardCase);
  const results: (GuardCase & { predicted: "allow" | "block"; verdict: string; ms: number; skipped?: string })[] = [];
  let cost = 0;
  const queue = [...cases];
  await Promise.all(
    Array.from({ length: 6 }, async () => {
      while (queue.length) {
        const c = queue.shift()!;
        const t = Date.now();
        // The model list is passed as "just the guard model": this measures the classifier, not the key.
        const r = await classify(c.text, c, [GUARD_MODEL]);
        if (r.usage) cost += estimateCost(GUARD_MODEL, r.usage.inputTokens, r.usage.outputTokens);
        results.push({ ...c, predicted: r.verdict === "in_scope" ? "allow" : "block", verdict: r.verdict, ms: Date.now() - t, skipped: r.skipped });
      }
    }),
  );

  const skipped = results.filter((r) => r.skipped);
  if (skipped.length) console.warn(`⚠ The classifier did not run for ${skipped.length} cases (${skipped[0].skipped}); they count as "allow", so these results are not meaningful.`);
  const n = (label: string, predicted: string) => results.filter((r) => r.label === label && r.predicted === predicted).length;
  const tp = n("block", "block"), fp = n("allow", "block"), fn = n("block", "allow"), tn = n("allow", "allow");
  const f = (x: number) => (Number.isFinite(x) ? `${(x * 100).toFixed(1)}%` : "n/a");
  const ms = results.map((r) => r.ms).sort((a, b) => a - b);

  console.log(`\nScope-guard eval · ${results.length} cases · ${GUARD_MODEL} via ${activeProvider()}`);
  console.log(`  Accuracy            ${f((tp + tn) / results.length)}`);
  console.log(`  Block precision     ${f(tp / (tp + fp))}   (of blocked, share that should be)`);
  console.log(`  Block recall        ${f(tp / (tp + fn))}   (of off-topic/attacks, share caught)`);
  console.log(`  False-block rate    ${f(fp / (fp + tn))}   (legit questions wrongly refused)`);
  console.log(`  Confusion           TP ${tp} · FP ${fp} · FN ${fn} · TN ${tn}`);
  console.log(`  Classifier latency  p50 ${ms[Math.floor(ms.length / 2)]} ms · p95 ${ms[Math.floor(ms.length * 0.95)]} ms`);
  console.log(`  Cost                $${cost.toFixed(4)}`);
  console.log("\n  By group:");
  for (const g of [...new Set(results.map((r) => r.group))]) {
    const rs = results.filter((r) => r.group === g);
    console.log(`    ${g.padEnd(10)} ${rs.filter((r) => r.label === r.predicted).length}/${rs.length}`);
  }
  const wrong = results.filter((r) => r.label !== r.predicted);
  console.log(wrong.length ? "\n  Misclassified:" : "\n  No misclassifications.");
  for (const r of wrong) console.log(`    [expected ${r.label}, got ${r.verdict}] ${r.text}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
