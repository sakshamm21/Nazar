"use client";
import { ExternalLink, ThumbsDown, ThumbsUp } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { Chip } from "@/components/ui/chip";
import { Delta } from "@/components/ui/delta";
import { SeverityIcon, severityLabel } from "@/components/ui/severity";
import { cn } from "@/lib/cn";
import { dayLabel } from "@/lib/format";

export type AlertDTO = {
  id: string;
  type: string;
  symbol: string | null;
  severity: "critical" | "important" | "info";
  tradeDate: string;
  titleEn: string;
  bodyEn: string;
  titleHi: string;
  bodyHi: string;
  data: Record<string, any>;
  isSimulated: boolean;
  readAt: string | null;
  rating: "up" | "down" | null;
  portfolio: { id: string; label: string; language: "en" | "hi" } | null;
};

const REASON: Record<string, string> = { market: "Whole market", sector: "Sector-wide", results: "After results", company: "Company-specific" };

function analysisHref(a: AlertDTO) {
  if (a.type === "portfolio_move") return "/home/today";
  if (a.type === "learned") return "/settings#learned";
  if (a.type === "concentration") return "/risk";
  if (a.type === "results" && a.symbol) return `/stock/${encodeURIComponent(a.symbol)}#results`;
  if (a.symbol) return `/stock/${encodeURIComponent(a.symbol)}`;
  return "/alerts";
}

/** One alert: what happened, the likely reason, what it means for you in ₹, and 👍/👎. */
export function AlertCard({ a, variant = "feed" }: { a: AlertDTO; variant?: "feed" | "story" | "detail" }) {
  const [rating, setRating] = useState(a.rating);
  const [lang, setLang] = useState<"en" | "hi">("en");
  const hindi = lang === "hi";
  const rate = async (r: "up" | "down") => {
    const next = rating === r ? null : r;
    setRating(next);
    const ok = await fetch(`/api/alerts/${a.id}/feedback`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ rating: next }) })
      .then((r) => r.ok)
      .catch(() => false);
    if (!ok) {
      setRating(rating);
      toast.error("Couldn't save your rating. Please try again.");
    }
  };
  const d = a.data ?? {};
  return (
    <article className={cn("flex h-full flex-col", variant === "story" ? "p-5" : "")} aria-label={a.titleEn}>
      <div className="flex flex-wrap items-center gap-2 text-[12px] text-subtle">
        <SeverityIcon severity={a.severity} />
        <span>{severityLabel[a.severity]}</span>
        <span aria-hidden>·</span>
        <span>{dayLabel(a.tradeDate, "en")}</span>
        {a.portfolio && <Chip className="ml-auto">{a.portfolio.label}</Chip>}
        {a.isSimulated && <Chip tone="warn">Simulation</Chip>}
      </div>
      <h3 lang={hindi ? "hi" : undefined} className={cn("t-title-2 mt-2 text-text", hindi && "hi")}>
        {hindi ? a.titleHi : a.titleEn}
      </h3>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {d.reason?.kind && <Chip tone="accent">{REASON[d.reason.kind]}</Chip>}
        {a.type === "results" && <Chip tone="accent">Results</Chip>}
        {a.type === "learned" && <Chip tone="accent">Nazar learned</Chip>}
        {typeof d.impactInr === "number" && a.type !== "learned" && <Delta amount={d.impactInr} size="sm" compact />}
      </div>
      {a.type === "results" && Array.isArray(d.improved) ? (
        <ResultsLists improved={d.improved} worse={d.worse ?? []} health={d.healthText} hindi={hindi} />
      ) : (
        <p lang={hindi ? "hi" : undefined} className={cn("mt-3 text-[15px] leading-6 text-muted", hindi && "hi")}>
          {hindi ? a.bodyHi : a.bodyEn}
        </p>
      )}
      {Array.isArray(d.headlines) && d.headlines.length > 0 && (
        <div className="mt-4 rounded-[14px] border border-line bg-surface-2 p-3">
          <div className="t-overline">In the news (third-party headlines)</div>
          <ul className="mt-1.5 space-y-1.5">
            {d.headlines.map((h: { title: string; source: string; link: string }) => (
              <li key={h.link}>
                <a href={h.link} target="_blank" rel="noopener noreferrer nofollow" className="group inline-flex items-start gap-1.5 text-sm text-text hover:underline">
                  <span>{h.title.replace(/\s+-\s+[^-]+$/, "")}</span>
                  <ExternalLink className="mt-1 h-3 w-3 shrink-0 text-subtle" />
                </a>
                <span className="t-caption block">{h.source}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {a.isSimulated && d.reason?.kind === "company" && <p className="t-caption mt-3">In a real alert, Nazar would show company-specific headlines here. Simulations never invent news.</p>}
      {Array.isArray(d.items) && a.type === "digest" && (
        <ul className="mt-3 space-y-1 text-sm text-muted">
          {d.items.map((it: { title: string }, i: number) => (
            <li key={i}>• {it.title}</li>
          ))}
        </ul>
      )}
      <div className={cn("mt-auto flex flex-wrap items-center gap-2 pt-4", variant === "story" && "pt-5")}>
        <Link href={analysisHref(a)} className="text-sm font-medium text-accent">
          {a.type === "learned" ? "See or undo in Settings" : "See the analysis"} →
        </Link>
        {a.portfolio?.language === "hi" && (
          <button onClick={() => setLang(hindi ? "en" : "hi")} className="rounded-full border border-line px-2.5 py-0.5 text-xs font-medium text-muted hover:text-text" aria-pressed={hindi}>
            {hindi ? "English" : "हिंदी"}
          </button>
        )}
        {a.type !== "learned" && a.type !== "digest" && (
          <span className="ml-auto flex items-center gap-1" role="group" aria-label="Was this useful?">
            <span className="mr-1 text-[12px] text-subtle">Useful?</span>
            <button onClick={() => rate("up")} aria-pressed={rating === "up"} aria-label="Useful" className={cn("rounded-full p-2 transition-colors", rating === "up" ? "bg-gain-soft text-gain" : "text-subtle hover:bg-surface-2 hover:text-text")}>
              <ThumbsUp className="h-4 w-4" fill={rating === "up" ? "currentColor" : "none"} />
            </button>
            <button onClick={() => rate("down")} aria-pressed={rating === "down"} aria-label="Not useful" className={cn("rounded-full p-2 transition-colors", rating === "down" ? "bg-loss-soft text-loss" : "text-subtle hover:bg-surface-2 hover:text-text")}>
              <ThumbsDown className="h-4 w-4" fill={rating === "down" ? "currentColor" : "none"} />
            </button>
          </span>
        )}
      </div>
    </article>
  );
}

export function ResultsLists({ improved, worse, health, hindi }: { improved: { en: string; hi: string; key: string }[]; worse: { en: string; hi: string; key: string }[]; health?: { en: string; hi: string }; hindi?: boolean }) {
  return (
    <div lang={hindi ? "hi" : undefined} className={cn("mt-3 grid gap-3 sm:grid-cols-2", hindi && "hi")}>
      <div className="rounded-[14px] bg-gain-soft p-3.5">
        <div className="text-[13px] font-semibold text-gain">{hindi ? "क्या बेहतर हुआ" : "What improved"}</div>
        <ul className="mt-1.5 space-y-1 text-sm text-text">
          {improved.length ? improved.map((p) => <li key={p.key}>▲ {hindi ? p.hi : p.en}</li>) : <li className="text-muted">{hindi ? "कुछ खास नहीं" : "Nothing notable"}</li>}
        </ul>
      </div>
      <div className="rounded-[14px] bg-loss-soft p-3.5">
        <div className="text-[13px] font-semibold text-loss">{hindi ? "क्या कमज़ोर हुआ" : "What got worse"}</div>
        <ul className="mt-1.5 space-y-1 text-sm text-text">
          {worse.length ? worse.map((p) => <li key={p.key}>▼ {hindi ? p.hi : p.en}</li>) : <li className="text-muted">{hindi ? "कुछ खास नहीं" : "Nothing notable"}</li>}
        </ul>
      </div>
      {health?.en && <p className="text-sm text-muted sm:col-span-2">{hindi ? health.hi : health.en}</p>}
    </div>
  );
}
