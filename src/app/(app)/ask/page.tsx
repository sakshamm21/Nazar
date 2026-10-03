import { randomUUID } from "node:crypto";
import type { Metadata } from "next";
import { Suspense } from "react";
import { AskWorkspace } from "@/components/ask/ask-workspace";
import { requirePageUser } from "@/lib/current-user";
import { remainingToday } from "@/lib/limits";

export const metadata: Metadata = { title: "Ask" };

export default async function AskPage({ searchParams }: { searchParams: Promise<{ c?: string; q?: string }> }) {
  const user = await requirePageUser();
  const { c, q } = await searchParams;
  // Decided on the server so the first render and hydration agree: an existing conversation (?c=)
  // loads on the client; otherwise a new one starts, optionally with a question from ?q= (e.g. "Ask about this").
  const start = c ? { openId: c.slice(0, 64) } : { newId: randomUUID(), question: q?.slice(0, 500) || null };
  return (
    <Suspense>
      <AskWorkspace remaining={await remainingToday(user.id, user.isDemo)} start={start} />
    </Suspense>
  );
}
