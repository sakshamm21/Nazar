import { randomUUID } from "node:crypto";
import type { Metadata } from "next";
import { Suspense } from "react";
import { AskWorkspace } from "@/components/ask/ask-workspace";
import { requirePageUser, selectedPortfolioId } from "@/lib/current-user";
import { goalsView } from "@/lib/views/goals";
import { portfolioView } from "@/lib/views/portfolio";
import { headers } from "next/headers";
import { ipHashOf, remainingToday } from "@/lib/limits";
import { startersFor } from "@/lib/ask/starters";

export const metadata: Metadata = { title: "Ask" };

export default async function AskPage({ searchParams }: { searchParams: Promise<{ c?: string; q?: string }> }) {
  const user = await requirePageUser();
  const { c, q } = await searchParams;
  // Decided on the server so the first render and hydration agree: an existing conversation (?c=)
  // loads on the client; otherwise a new one starts, optionally with a question from ?q= (e.g. "Ask about this").
  const start = c ? { openId: c.slice(0, 64) } : { newId: randomUUID(), question: q?.slice(0, 500) || null };
  // The start screen's example questions name the user's two largest stocks.
  const view = await portfolioView(user, await selectedPortfolioId());
  // Beyond today: the week's biggest mover, a goal that is behind, and this year's realised gains.
  const goals = await goalsView(user.id);
  const week = view.empty ? null : view.performance.periods["1W"];
  const mover = week?.contributors.filter((c) => c.pct != null).sort((a, b) => Math.abs(b.pct!) - Math.abs(a.pct!))[0];
  const extras = { goalBehind: goals.rows.find((r) => r.projection.status === "behind" || r.projection.status === "at-risk")?.goal.name ?? null, weekMover: mover ? { name: mover.name, pct: mover.pct! } : null, realisedThisYear: view.empty ? null : view.returns.realisedThisYear };
  const stocks = view.empty ? [] : view.cards.filter((c) => c.assetClass === "stock").map((c) => c.name);
  return (
    <Suspense>
      <AskWorkspace context={{ stock: stocks[0] ?? null, second: stocks[1] ?? null, hasPortfolio: !view.empty, monthPct: view.empty ? null : (view.performance.periods["1M"]?.changePct ?? null), today: view.empty ? [] : startersFor({ dayChange: view.valuation.dayChange, dayChangePct: view.valuation.dayChangePct, notes: view.notes }, extras) }} remaining={await remainingToday(user.id, user.isTestAccount, ipHashOf(await headers()))} start={start} />
    </Suspense>
  );
}
