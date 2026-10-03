import { ArrowLeft, FileSpreadsheet } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { TOOL_CATALOG, TOOL_COUNT } from "@/lib/ask/tool-catalog";

export const metadata: Metadata = { title: "Research tools" };

/** The Research catalog: every Ask tool by category, with example questions. */
export default function ResearchPage() {
  const models = TOOL_CATALOG.flatMap((g) => g.items).filter((i) => i.excel === "model").length;
  return (
    <div className="space-y-6">
      <Link href="/ask" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-text">
        <ArrowLeft className="h-4 w-4" /> Ask
      </Link>
      <div>
        <h1 className="t-title-1 text-text">Research tools</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          {TOOL_COUNT} tools the Ask assistant picks from automatically. Ask in English, Hindi or Hinglish. Results download as Excel; {models} are live models with editable inputs and formulas. They explain; they never tell you what to buy or sell.
        </p>
      </div>
      {TOOL_CATALOG.map((g) => (
        <section key={g.id}>
          <div className="t-overline">{g.blurb}</div>
          <h2 className="t-title-2 mt-0.5 text-text">{g.name}</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {g.items.map((i) => (
              <Card key={i.id} className="flex flex-col p-5">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-medium text-text">{i.name}</h3>
                  {i.excel === "model" && (
                    <Chip tone="accent">
                      <FileSpreadsheet className="h-3 w-3" /> Live model
                    </Chip>
                  )}
                </div>
                <p className="mt-1 flex-1 text-sm text-muted">{i.description}</p>
                <Link href={`/ask?q=${encodeURIComponent(i.example)}`} className="mt-3 text-sm font-medium text-accent">
                  Try: “{i.example}” →
                </Link>
              </Card>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
