/**
 * Turns real answers that went wrong into candidate eval cases.
 *
 *   npm run eval:harvest              the last 30 days
 *   npm run eval:harvest -- --days 7
 *
 * An answer is a candidate when its reader marked it not helpful, or when the checks run on every
 * answer flagged it: a sentence removed as advice, an answer in the wrong language, a number with
 * no source, or a provider failure. Each candidate is the conversation up to that question.
 *
 * Only conversations from the shared test accounts and from admins are read. A candidate is a
 * person's own words, and a real user's questions do not belong in a file in the repository.
 *
 * Candidates are written to evals/cases/candidates.jsonl, which the runner does not load. Read
 * them, decide what a good answer would have had to do, fill in `expect`, pick the persona, and
 * move the line into golden.jsonl or adversarial.jsonl. That reading is the point of the exercise.
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { and, eq, gte, inArray, or } from "drizzle-orm";
import { schema, type DB } from "@/lib/db";
import { detectLang } from "@/lib/ask/context";
import type { EvalCase } from "./types";

export type Candidate = EvalCase & { why: string[]; model: string | null; promptVersion: string | null };

type StoredMessage = { id?: string; role?: string; parts?: { type?: string; text?: string }[] };
const textOf = (m: StoredMessage) => (m.parts ?? []).filter((p) => p.type === "text").map((p) => p.text ?? "").join(" ").trim();

export async function harvestCandidates(db: DB, opts: { since: Date; adminEmails?: string[] }): Promise<Candidate[]> {
  const admins = (opts.adminEmails ?? []).map((e) => e.trim().toLowerCase()).filter(Boolean);
  const allowed = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(or(eq(schema.users.isTestAccount, true), eq(schema.users.isAdmin, true), ...(admins.length ? [inArray(schema.users.email, admins)] : [])));
  const users = allowed.map((u) => u.id);
  if (!users.length) return [];

  /** message id → why it is a candidate. */
  const why = new Map<string, { chatId: string; reasons: string[]; model: string | null; promptVersion: string | null }>();
  const note = (messageId: string, chatId: string, reason: string, model: string | null, promptVersion: string | null) => {
    const w = why.get(messageId) ?? { chatId, reasons: [], model, promptVersion };
    w.reasons.push(reason);
    w.model ??= model;
    w.promptVersion ??= promptVersion;
    why.set(messageId, w);
  };

  const down = await db.select().from(schema.feedback).where(and(eq(schema.feedback.rating, "down"), gte(schema.feedback.createdAt, opts.since), inArray(schema.feedback.userId, users)));
  for (const f of down) note(f.messageId, f.chatId, `marked not helpful${f.reason ? ` (${f.reason})` : ""}`, f.model, f.promptVersion);

  const traces = await db.select().from(schema.askTraces).where(and(gte(schema.askTraces.createdAt, opts.since), inArray(schema.askTraces.userId, users)));
  for (const t of traces) {
    const f = t.flags ?? {};
    if (f.advicePatterns?.length) note(t.messageId, t.chatId, `advice filter: ${[...new Set(f.advicePatterns)].join(", ")}`, t.model, t.promptVersion);
    if (f.lang && !f.lang.match) note(t.messageId, t.chatId, `asked in ${f.lang.asked}, answered in ${f.lang.answered}`, t.model, t.promptVersion);
    if ((f.numbers?.untraced ?? 0) > 0) note(t.messageId, t.chatId, `${f.numbers!.untraced} of ${f.numbers!.total} numbers had no source`, t.model, t.promptVersion);
    if (t.outcome === "error") note(t.messageId, t.chatId, `the provider failed${t.error ? `: ${t.error.slice(0, 80)}` : ""}`, t.model, t.promptVersion);
    const failed = t.steps.flatMap((s) => s.tools).filter((x) => !x.ok).map((x) => x.name);
    if (failed.length) note(t.messageId, t.chatId, `tool failed: ${[...new Set(failed)].join(", ")}`, t.model, t.promptVersion);
  }
  if (!why.size) return [];

  const chats = await db.select().from(schema.chats).where(inArray(schema.chats.id, [...new Set([...why.values()].map((w) => w.chatId))]));
  const out: Candidate[] = [];
  const seen = new Set<string>();
  for (const [messageId, w] of why) {
    const messages = ((chats.find((c) => c.id === w.chatId)?.messages ?? []) as StoredMessage[]) ?? [];
    const at = messages.findIndex((m) => m.id === messageId);
    if (at < 1) continue;
    const turns = messages.slice(0, at).filter((m) => m.role === "user").map(textOf).filter(Boolean);
    if (!turns.length) continue;
    const key = turns.join("\n").toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      id: `cand-${messageId.slice(-8)}`,
      suite: "golden",
      category: "harvested",
      lang: detectLang(turns.at(-1)!),
      persona: "investor",
      turns,
      expect: { judges: ["answers_question", "grounded", "no_directive_advice"] },
      note: "Harvested from a real answer. Fill in `expect`, check the persona, then move it into a suite.",
      why: w.reasons,
      model: w.model,
      promptVersion: w.promptVersion,
    });
  }
  return out;
}

async function main() {
  const { loadEnv } = await import("../scripts/env");
  loadEnv();
  process.env.LOG_LEVEL ??= "error";
  const i = process.argv.indexOf("--days");
  const days = i >= 0 ? Number(process.argv[i + 1]) || 30 : 30;
  // connect(), not getDb(): this reads what is there and must not build the test accounts first.
  const { connect } = await import("@/lib/db");
  const db = await connect();
  const found = await harvestCandidates(db, { since: new Date(Date.now() - days * 86_400_000), adminEmails: (process.env.ADMIN_EMAILS ?? "").split(",") });
  const file = path.join(process.cwd(), "evals", "cases", "candidates.jsonl");
  writeFileSync(file, found.map((c) => JSON.stringify(c)).join("\n") + (found.length ? "\n" : ""));
  console.log(`${found.length} candidate case(s) from the last ${days} days written to ${path.relative(process.cwd(), file)}.`);
  for (const c of found) console.log(`  ${c.id}  ${c.turns.at(-1)!.slice(0, 70)}  ·  ${c.why.join("; ")}`);
  process.exit(0);
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("evals/harvest.ts")) main().catch((e) => {
  console.error(e);
  process.exit(1);
});
