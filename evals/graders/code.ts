/**
 * Graders that are plain code: free, instant, and the same answer every time. Each takes the
 * record of a run and says pass or fail with a reason a person can check.
 *
 * Pure functions with no server imports, so they are unit-tested like any other logic
 * (tests/unit/eval-graders.test.ts) and can later run on live answers.
 */
import { answerLang, numbersIn, numbersInJson, traceNumbers } from "@/lib/ask/checks";
import { findDirectives } from "@/lib/ask/output-guard";
import type { EvalCase, Grade, TurnRecord } from "../types";

export { answerLang, findDirectives, numbersIn, numbersInJson, traceNumbers };

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean);

/* ------------------------------------------------------------------ */
/* Tool path                                                            */
/* ------------------------------------------------------------------ */

export function gradeToolPath(turn: TurnRecord, expect: EvalCase["expect"]): Grade | null {
  const t = expect.tools;
  if (!t) return null;
  const called = turn.tools.map((x) => x.name);
  const problems: string[] = [];
  for (const m of t.must ?? []) if (!called.includes(m)) problems.push(`did not call ${m}`);
  if (t.any?.length && !t.any.some((a) => called.includes(a))) problems.push(`called none of ${t.any.join(", ")}`);
  for (const m of t.mustNot ?? []) if (called.includes(m)) problems.push(`called ${m}`);
  if (t.maxSteps != null && turn.steps > t.maxSteps) problems.push(`${turn.steps} steps, limit ${t.maxSteps}`);
  return { grader: "tool_path", gate: true, pass: !problems.length, detail: problems.length ? `${problems.join("; ")} (called: ${called.join(", ") || "nothing"})` : `called ${called.join(", ") || "nothing"}` };
}

/** The guard refused when it should have, and did not when it should not. */
export function gradeScope(turn: TurnRecord, expect: EvalCase["expect"]): Grade {
  const pass = expect.refuse === "either" || turn.blocked === Boolean(expect.refuse);
  return { grader: "scope", gate: true, pass, detail: turn.blocked ? "refused by the scope guard" : "answered" };
}

/* ------------------------------------------------------------------ */
/* Language                                                             */
/* ------------------------------------------------------------------ */

export function gradeLanguage(turn: TurnRecord, want: EvalCase["lang"]): Grade {
  const got = answerLang(turn.answer);
  return { grader: "language", gate: true, pass: got === want, detail: `asked in ${want}, answered in ${got}` };
}

/* ------------------------------------------------------------------ */
/* Length and required content                                          */
/* ------------------------------------------------------------------ */

export function gradeLength(turn: TurnRecord, maxWords: number): Grade {
  const n = words(turn.answer).length;
  return { grader: "length", gate: true, pass: n <= maxWords, detail: `${n} words, limit ${maxWords}` };
}

export function gradeMentions(turn: TurnRecord, expect: EvalCase["expect"]): Grade | null {
  if (!expect.mustMention?.length && !expect.mustNotMention?.length) return null;
  const missing = (expect.mustMention ?? []).filter((p) => !new RegExp(p, "i").test(turn.answer));
  const present = (expect.mustNotMention ?? []).filter((p) => new RegExp(p, "i").test(turn.answer));
  const problems = [...missing.map((p) => `missing /${p}/`), ...present.map((p) => `contains /${p}/`)];
  return { grader: "content", gate: true, pass: !problems.length, detail: problems.join("; ") || "as expected" };
}

/* ------------------------------------------------------------------ */
/* Directive advice                                                     */
/* ------------------------------------------------------------------ */

export function gradeDirectives(turn: TurnRecord): Grade {
  const hits = findDirectives(turn.answer).filter((h) => h.blocks);
  return { grader: "no_directive_phrases", gate: true, pass: !hits.length, detail: hits.length ? hits.map((h) => `[${h.pattern}] "${h.sentence}"`).join(" | ") : "none found" };
}

/* ------------------------------------------------------------------ */
/* Number provenance                                                    */
/* ------------------------------------------------------------------ */

/** Report-only until it has been tuned on real answers: it shows, but cannot fail a case. */
export function gradeNumbers(turn: TurnRecord, context: string[]): Grade {
  const p = traceNumbers(turn.answer, turn.tools.map((t) => t.output), context);
  return { grader: "numbers_traced", gate: false, pass: !p.untraced.length, detail: p.total ? `${p.traced}/${p.total} traced${p.untraced.length ? `; not found in any tool result: ${p.untraced.slice(0, 8).join(", ")}` : ""}` : "no numbers in the answer" };
}

/* ------------------------------------------------------------------ */

/** Every code grader that applies to a case, run on its last turn. */
export function gradeWithCode(c: EvalCase, turns: TurnRecord[]): Grade[] {
  const last = turns.at(-1)!;
  const grades: (Grade | null)[] = [gradeScope(last, c.expect)];
  // A refusal is a fixed English text: nothing else about it is worth grading.
  if (!last.blocked) {
    grades.push(gradeToolPath(last, c.expect), gradeLanguage(last, c.lang), gradeDirectives(last), gradeMentions(last, c.expect));
    const limit = c.expect.maxWords ?? ((c.mode ?? "simple") === "simple" ? 300 : null);
    if (limit) grades.push(gradeLength(last, limit));
    // Shown, never failed on: the filter doing its job is not the answer being wrong. A model that needs it often is.
    if (last.adviceRemoved.length) grades.push({ grader: "advice_filter_fired", gate: false, pass: false, detail: `the live filter removed ${last.adviceRemoved.length} sentence(s): ${last.adviceRemoved.join(" | ")}` });
    grades.push(gradeNumbers(last, [...turns.map((t) => t.question), ...turns.slice(0, -1).flatMap((t) => [t.answer, ...t.modelViews])]));
  }
  return grades.filter((g): g is Grade => g !== null);
}
