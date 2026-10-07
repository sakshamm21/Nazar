import { inrWhole } from "@/lib/format";

/** A question Ask offers on its start screen because of something in this person's own portfolio today. */
export type Starter = { id: string; label: string; question: string };

type Note = { id: string; kind: "results" | "concentration" | "upcoming" | "stale" | "cluster"; title: string };

/**
 * Up to three things worth asking about right now, taken from what the engine has already noticed:
 * today's move, a company that has just reported, holdings that move as one, a large position.
 * Each is a question the tools can answer from stored data, so the suggestion never promises
 * more than Ask can ground. Pure: the page passes in what it already loaded.
 */
export function startersFor(view: { dayChange: number; dayChangePct: number | null; notes: Note[] }): Starter[] {
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
  return out.slice(0, 3);
}
