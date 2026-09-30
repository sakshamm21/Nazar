import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import type { UIMessage } from "ai";
import { SharedChat } from "@/components/SharedChat";
import { getDb, schema } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function load(shareId: string) {
  if (!/^[A-Za-z0-9_-]{10,40}$/.test(shareId)) return null;
  const db = await getDb();
  const [chat] = await db
    .select({ title: schema.chats.title, messages: schema.chats.messages, updatedAt: schema.chats.updatedAt })
    .from(schema.chats)
    .where(eq(schema.chats.shareId, shareId))
    .limit(1);
  return chat ?? null;
}

export async function generateMetadata({ params }: { params: Promise<{ shareId: string }> }): Promise<Metadata> {
  const chat = await load((await params).shareId);
  return {
    title: chat ? `${chat.title} · Stock AI` : "Not found · Stock AI",
    description: "Equity research shared from Stock AI.",
    robots: { index: false, follow: false },
  };
}

export default async function SharedPage({ params }: { params: Promise<{ shareId: string }> }) {
  const chat = await load((await params).shareId);
  if (!chat) notFound();
  return <SharedChat title={chat.title} updatedAt={chat.updatedAt.toISOString()} messages={chat.messages as UIMessage[]} />;
}
