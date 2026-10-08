/**
 * Judge calibration: is a judge's verdict worth trusting? Only a person can say, by labelling the
 * same answers blind and seeing how often the judge agrees. Neither step calls a model.
 *
 *   npm run eval:calibrate -- sample [run]     write evals/calibration/labels.json: 40 judged answers, verdicts hidden
 *   npm run eval:calibrate -- score            compare your labels with the judge's verdicts
 *
 * To label: open labels.json and set each "human" to true (the answer passes that judge's rubric)
 * or false. Leave null to skip. A judge is usable when it agrees with you on at least 90% of what
 * you labelled; below that, the rubric needs work before its verdicts decide anything.
 *
 * The sample takes every answer the judge failed and fills up with passes, spread across judges:
 * a judge that passes nearly everything is only tested by its failures and by the passes it should
 * not have given.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { RUBRICS } from "./graders/judge";
import type { JudgeName, RunRecord } from "./types";

const DIR = path.join(process.cwd(), "evals");
const OUT = path.join(DIR, "calibration", "labels.json");
const DEFAULT_RUN = "2026-10-08T13-01-33";
const SIZE = 40;
const USABLE = 0.9;

type Item = { n: number; key: string; judge: JudgeName; rubric: string; question: string; answer: string; toolResults?: string[]; human: boolean | null };
type Sheet = { run: string; instructions: string; items: Item[] };

const load = (run: string) => (JSON.parse(readFileSync(path.join(DIR, "runs", run, "results.json"), "utf8")) as { records: RunRecord[] }).records;
const keyOf = (r: RunRecord, judge: string) => `${r.caseId}#${r.repeat}#${judge}`;
const order = (s: string) => createHash("sha256").update(s).digest("hex");
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}… [cut]` : s);

function sample(run: string) {
  const all = load(run).flatMap((r) => r.grades.filter((g) => g.grader.startsWith("judge:") && !g.detail.startsWith("JUDGE DID NOT RUN")).map((g) => ({ r, judge: g.grader.slice(6) as JudgeName, pass: g.pass })));
  if (!all.length) throw new Error(`Run ${run} has no judge verdicts. Pick one that was run with judges.`);
  const failed = all.filter((x) => !x.pass).sort((a, b) => order(keyOf(a.r, a.judge)).localeCompare(order(keyOf(b.r, b.judge))));
  const passed = all.filter((x) => x.pass).sort((a, b) => order(keyOf(a.r, a.judge)).localeCompare(order(keyOf(b.r, b.judge))));
  const picked = failed.slice(0, SIZE / 2);
  // Fill with passes, taking judges in turn so no one judge crowds the sheet.
  const judges = [...new Set(passed.map((x) => x.judge))];
  for (let i = 0; picked.length < SIZE && passed.length; i++) {
    const at = passed.findIndex((x) => x.judge === judges[i % judges.length]);
    picked.push(...passed.splice(at >= 0 ? at : 0, 1));
  }
  // Shuffled, so the order says nothing about which the judge failed.
  picked.sort((a, b) => order(`shuffle:${keyOf(a.r, a.judge)}`).localeCompare(order(`shuffle:${keyOf(b.r, b.judge)}`)));
  const items: Item[] = picked.map((x, i) => {
    const turn = x.r.turns.at(-1)!;
    const earlier = x.r.turns.slice(0, -1);
    return {
      n: i + 1,
      key: keyOf(x.r, x.judge),
      judge: x.judge,
      rubric: RUBRICS[x.judge].split("\n")[0],
      question: [...earlier.map((t) => `(earlier) ${t.question}`), turn.question].join("\n"),
      answer: turn.answer,
      // Grounding can only be judged against what the model was given.
      ...(x.judge === "grounded" ? { toolResults: [...earlier, turn].flatMap((t) => t.tools.map((u, k) => `${u.name}(${clip(JSON.stringify(u.input), 120)}) → ${clip(t.modelViews[k] ?? JSON.stringify(u.output), 4000)}`)) } : {}),
      human: null,
    };
  });
  mkdirSync(path.dirname(OUT), { recursive: true });
  const sheet: Sheet = { run, instructions: 'Set each "human" to true if the answer passes that judge\'s rubric, false if it fails, and leave null to skip. Do not look the verdicts up first. Then run: npm run eval:calibrate -- score', items };
  writeFileSync(OUT, `${JSON.stringify(sheet, null, 1)}\n`);
  const count = (j: string) => items.filter((x) => x.judge === j).length;
  console.log(`Wrote ${items.length} answers to ${path.relative(process.cwd(), OUT)} from run ${run}: ${[...new Set(items.map((x) => x.judge))].map((j) => `${j} ${count(j)}`).join(", ")}.`);
  console.log(`The judge failed ${failed.length} of ${all.length} verdicts in that run; ${Math.min(failed.length, SIZE / 2)} of those are in the sheet, unmarked.`);
}

function score() {
  if (!existsSync(OUT)) throw new Error("No labels yet. Run: npm run eval:calibrate -- sample");
  const sheet = JSON.parse(readFileSync(OUT, "utf8")) as Sheet;
  const verdict = new Map<string, { pass: boolean; detail: string }>();
  for (const r of load(sheet.run)) for (const g of r.grades) if (g.grader.startsWith("judge:")) verdict.set(keyOf(r, g.grader.slice(6)), { pass: g.pass, detail: g.detail });
  const labelled = sheet.items.filter((x) => typeof x.human === "boolean");
  if (!labelled.length) {
    console.log(`Nothing is labelled yet: all ${sheet.items.length} "human" fields in ${path.relative(process.cwd(), OUT)} are null.`);
    return;
  }
  const by = new Map<string, { n: number; agree: number; judgeTooStrict: number; judgeTooLenient: number }>();
  const disagreements: string[] = [];
  for (const x of labelled) {
    const v = verdict.get(x.key);
    if (!v) continue;
    const s = by.get(x.judge) ?? { n: 0, agree: 0, judgeTooStrict: 0, judgeTooLenient: 0 };
    s.n++;
    if (v.pass === x.human) s.agree++;
    else {
      if (x.human) s.judgeTooStrict++;
      else s.judgeTooLenient++;
      disagreements.push(`  #${x.n} ${x.judge}: you said ${x.human ? "pass" : "fail"}, the judge said ${v.pass ? "pass" : "fail"} · ${v.detail.slice(0, 160)}`);
    }
    by.set(x.judge, s);
  }
  console.log(`${labelled.length} of ${sheet.items.length} labelled (run ${sheet.run}). A judge is usable at ${USABLE * 100}% agreement or more.\n`);
  for (const [judge, s] of by) {
    const rate = s.agree / s.n;
    console.log(`  ${judge.padEnd(22)} agrees on ${s.agree}/${s.n} (${Math.round(rate * 100)}%)  ${s.n < 8 ? "too few to say" : rate >= USABLE ? "usable" : "NOT usable: fix the rubric"}${s.judgeTooStrict ? ` · failed ${s.judgeTooStrict} you passed` : ""}${s.judgeTooLenient ? ` · passed ${s.judgeTooLenient} you failed` : ""}`);
  }
  if (disagreements.length) console.log(`\nWhere you and the judge differ:\n${disagreements.join("\n")}`);
}

const [command, run] = process.argv.slice(2);
if (command === "sample") sample(run ?? DEFAULT_RUN);
else if (command === "score") score();
else console.log("Usage: npm run eval:calibrate -- sample [run]   |   npm run eval:calibrate -- score");
