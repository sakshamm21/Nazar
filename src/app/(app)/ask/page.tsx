import type { Metadata } from "next";
import { Suspense } from "react";
import { AskWorkspace } from "@/components/ask/ask-workspace";
import { requirePageUser } from "@/lib/current-user";
import { remainingToday } from "@/lib/limits";

export const metadata: Metadata = { title: "Ask" };

export default async function AskPage() {
  const user = await requirePageUser();
  return (
    <Suspense>
      <AskWorkspace remaining={await remainingToday(user.id, user.isDemo)} />
    </Suspense>
  );
}
