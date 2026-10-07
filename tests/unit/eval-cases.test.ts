/**
 * The eval cases are data, and bad data fails quietly: a misspelt tool name is a case that can
 * never pass, and a question the interface suggests but no case covers is a promise nobody checks.
 */
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";
import { TOOLS } from "@/lib/ask/registry";
import { TOOL_CATALOG } from "@/lib/ask/tool-catalog";
import { RUBRICS } from "../../evals/graders/judge";
import type { EvalCase } from "../../evals/types";

const read = <T>(name: string) => readFileSync(path.join(process.cwd(), "evals", "cases", `${name}.jsonl`), "utf8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l) as T);
const golden = read<EvalCase>("golden");
const adversarial = read<EvalCase>("adversarial");
const all = [...golden, ...adversarial];

/** Tools a case may expect before they exist: the cases are written first, and fail until the tool is built. */
const PLANNED = ["getPortfolioPerformance", "getCapitalGains", "getGoals", "getHolding", "getHoldingNews", "getSectorPerformance"];

describe("the agent cases", () => {
  it("every id is unique and says which suite it belongs to", () => {
    expect(new Set(all.map((c) => c.id)).size).toBe(all.length);
    for (const c of golden) expect(c.suite, c.id).toBe("golden");
    for (const c of adversarial) expect(c.suite, c.id).toBe("adversarial");
  });

  it("every tool a case names exists, or is one that is planned", () => {
    const known = new Set([...Object.keys(TOOLS), ...PLANNED]);
    for (const c of all) for (const t of [...(c.expect.tools?.must ?? []), ...(c.expect.tools?.any ?? []), ...(c.expect.tools?.mustNot ?? []), ...Object.keys(c.plant ?? {})]) expect(known.has(t), `${c.id}: ${t}`).toBe(true);
  });

  it("every judge a case asks for has a rubric, and every pattern is a valid regular expression", () => {
    for (const c of all) {
      for (const j of c.expect.judges ?? []) expect(Object.keys(RUBRICS), `${c.id}: ${j}`).toContain(j);
      for (const p of [...(c.expect.mustMention ?? []), ...(c.expect.mustNotMention ?? [])]) expect(() => new RegExp(p, "i"), `${c.id}: ${p}`).not.toThrow();
    }
  });

  it("each case has a question and something to check", () => {
    for (const c of all) {
      expect(c.turns.length, c.id).toBeGreaterThan(0);
      expect(Object.keys(c.expect).length, c.id).toBeGreaterThan(0);
    }
  });

  it("every example the Research page offers is a case", () => {
    const asked = new Set(all.flatMap((c) => c.turns));
    const missing = TOOL_CATALOG.flatMap((g) => g.items.map((i) => i.example)).filter((q) => !asked.has(q));
    expect(missing).toEqual([]);
  });

  it("covers all three languages, and both an empty and a full account", () => {
    for (const lang of ["en", "hi", "hinglish"]) expect(all.some((c) => c.lang === lang), lang).toBe(true);
    for (const p of ["investor", "saver", "new"]) expect(all.some((c) => c.persona === p), p).toBe(true);
  });
});

describe("the guard cases", () => {
  const guard = read<{ label: string; group: string; text: string }>("guard");
  it("are labelled allow or block, with both well represented", () => {
    for (const c of guard) expect(["allow", "block"], c.text).toContain(c.label);
    expect(guard.filter((c) => c.label === "allow").length).toBeGreaterThan(30);
    expect(guard.filter((c) => c.label === "block").length).toBeGreaterThan(25);
  });
});

describe("recorded tool results", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "nazar-fixtures-"));
  const cwd = vi.spyOn(process, "cwd").mockReturnValue(dir);
  afterAll(() => {
    cwd.mockRestore();
    rmSync(dir, { recursive: true, force: true });
  });
  type Exec = { execute: (input: unknown, opts: { toolCallId: string }) => Promise<unknown> };
  const call = { toolCallId: "c1" };
  const newLog = () => ({ replayed: new Set<string>(), recorded: 0, missed: [] as string[] });

  it("the first call is real and recorded; after that it is replayed, whatever the field order or letter case", async () => {
    const { withFixtures } = await import("../../evals/fixtures");
    let real = 0;
    const tools: Record<string, Exec> = { getQuote: { execute: async () => ({ price: ++real }) }, getMyPortfolio: { execute: async () => ({ value: ++real }) } };
    const log = newLog();
    const wrapped = withFixtures(tools, { frozen: false, log });
    expect(await wrapped.getQuote.execute({ symbols: ["TCS.NS"], range: "1y" }, call)).toEqual({ price: 1 });
    expect(await wrapped.getQuote.execute({ range: "1y", symbols: ["tcs.ns"] }, call)).toEqual({ price: 1 });
    expect(log).toMatchObject({ recorded: 1 });
    expect(log.replayed.has("c1")).toBe(true);
    // The user's own data is never recorded: it comes from the eval world's database every time.
    expect(await wrapped.getMyPortfolio.execute({}, call)).toEqual({ value: 2 });
    expect(await wrapped.getMyPortfolio.execute({}, call)).toEqual({ value: 3 });
  });

  it("frozen: nothing real is called, and a missing recording reads as not found", async () => {
    const { withFixtures } = await import("../../evals/fixtures");
    const tools: Record<string, Exec> = { getNews: { execute: async () => Promise.reject(new Error("must not be called")) } };
    const log = newLog();
    const out = await withFixtures(tools, { frozen: true, log }).getNews.execute({ query: "x" }, call);
    expect(out).toEqual({ error: "Symbol not found or no data available." });
    expect(log.missed).toHaveLength(1);
  });

  it("a rate limit is not recorded as the answer", async () => {
    const { withFixtures } = await import("../../evals/fixtures");
    let n = 0;
    const tools: Record<string, Exec> = { getEarnings: { execute: async () => (++n === 1 ? { error: "Yahoo Finance is rate-limiting or temporarily unavailable. Try again in a minute." } : { ok: true }) } };
    const wrapped = withFixtures(tools, { frozen: false, log: newLog() });
    await wrapped.getEarnings.execute({ symbol: "A" }, call);
    expect(await wrapped.getEarnings.execute({ symbol: "A" }, call)).toEqual({ ok: true });
  });

  it("a planted result replaces the tool, including a private one", async () => {
    const { withFixtures } = await import("../../evals/fixtures");
    const tools: Record<string, Exec> = { getNews: { execute: async () => ({ real: true }) } };
    const out = await withFixtures(tools, { frozen: true, plant: { getNews: { planted: true } }, log: newLog() }).getNews.execute({ query: "x" }, call);
    expect(out).toEqual({ planted: true });
  });
});
