import { inrWhole } from "@/lib/format";

/** A question Ask offers on its start screen because of something in this person's own portfolio today. */
export type Starter = { id: string; label: string; question: string };

type Note = { id: string; kind: "results" | "concentration" | "upcoming" | "stale" | "cluster" | "split"; title: string };

/**
 * Up to three things worth asking about right now, taken from what the engine has already noticed:
 * today's move, a company that has just reported, holdings that move as one, a large position.
 * Each is a question the tools can answer from stored data, so the suggestion never promises
 * more than Ask can ground. Pure: the page passes in what it already loaded.
 */
export type StarterExtras = {
  /** A savings goal that is behind its plan. */
  goalBehind?: string | null;
  /** A holding that moved more than 5% over the last week, and by how much. */
  weekMover?: { name: string; pct: number } | null;
  /** Gains realised in sales this financial year. */
  realisedThisYear?: number | null;
};

export function startersFor(view: { dayChange: number; dayChangePct: number | null; notes: Note[] }, extra: StarterExtras = {}): Starter[] {
  const out: Starter[] = [];
  // A move too small to see is not worth a question.
  if (view.dayChangePct != null && Math.abs(view.dayChangePct) >= 0.002) {
    const down = view.dayChange < 0;
    out.push({ id: "today", label: `${down ? "Down" : "Up"} ${inrWhole(Math.abs(view.dayChange))} today`, question: down ? "Why am I down today?" : "Why am I up today?" });
  }
  for (const n of view.notes) {
    if (n.kind === "results") {
      const name = n.title.replace(/ reported results$/, "");
      out.push({ id: n.id, label: n.title, question: `Explain ${name}'s latest results in simple words` });
    } else if (n.kind === "cluster") {
      out.push({ id: n.id, label: n.title, question: "Which of my holdings move together, and how much of my money is that?" });
    } else if (n.kind === "concentration") {
      out.push({ id: n.id, label: n.title, question: `${n.title.replace(/ of this portfolio$/, " of my portfolio")}. What does that mean for how it behaves?` });
    }
  }
  // What the week, the goals and this year's sales have to say, after today's own news.
  if (extra.weekMover && Math.abs(extra.weekMover.pct) >= 0.05)
    out.push({ id: "week-mover", label: `${extra.weekMover.name} ${extra.weekMover.pct > 0 ? "up" : "down"} ${Math.abs(extra.weekMover.pct * 100).toFixed(0)}% this week`, question: `Why did ${extra.weekMover.name} move so much this week?` });
  if (extra.goalBehind) out.push({ id: "goal-behind", label: `${extra.goalBehind} is behind plan`, question: `My goal "${extra.goalBehind}" is behind plan. What would it take to get back on track, in plain numbers?` });
  if (extra.realisedThisYear && Math.abs(extra.realisedThisYear) >= 1)
    out.push({ id: "realised", label: `${inrWhole(Math.abs(extra.realisedThisYear))} ${extra.realisedThisYear >= 0 ? "gain" : "loss"} realised this year`, question: "How are the gains I realised this year taxed, by kind of asset?" });
  return out.slice(0, 3);
}
