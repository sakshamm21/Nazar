/** What Ask offers on its start screen because of what is in this person's portfolio today. */
import { describe, expect, it } from "vitest";
import { startersFor } from "@/lib/ask/starters";

const note = (kind: "results" | "concentration" | "upcoming" | "stale" | "cluster", title: string) => ({ id: `${kind}-${title}`, kind, title });

describe("questions from today's portfolio", () => {
  it("asks about today's move, in the direction it went", () => {
    expect(startersFor({ dayChange: -4321, dayChangePct: -0.0035, notes: [] })).toEqual([{ id: "today", label: "Down ₹4,321 today", question: "Why am I down today?" }]);
    expect(startersFor({ dayChange: 900, dayChangePct: 0.004, notes: [] })[0]).toMatchObject({ label: "Up ₹900 today", question: "Why am I up today?" });
  });
  it("says nothing about a day that barely moved", () => {
    expect(startersFor({ dayChange: 12, dayChangePct: 0.00001, notes: [] })).toEqual([]);
    expect(startersFor({ dayChange: 0, dayChangePct: null, notes: [] })).toEqual([]);
  });
  it("turns what the engine noticed into a question the tools can answer", () => {
    const s = startersFor({ dayChange: 0, dayChangePct: 0, notes: [note("results", "Infosys reported results"), note("cluster", "Less diversified than it looks"), note("concentration", "IT is 34% of this portfolio")] });
    expect(s.map((x) => x.question)).toEqual(["Explain Infosys's latest results in simple words", "Which of my holdings move together, and how much of my money is that?", "IT is 34% of my portfolio. What does that mean for how it behaves?"]);
    expect(s.map((x) => x.label)).toEqual(["Infosys reported results", "Less diversified than it looks", "IT is 34% of this portfolio"]);
  });
  it("offers at most three, today's move first, and skips notes Ask has no data to explain", () => {
    const s = startersFor({ dayChange: -500, dayChangePct: -0.01, notes: [note("stale", "2 prices are from an earlier day"), note("upcoming", "TCS reports results soon"), note("results", "A reported results"), note("results", "B reported results"), note("cluster", "c")] });
    expect(s.map((x) => x.id)).toEqual(["today", "results-A reported results", "results-B reported results"]);
  });
});
