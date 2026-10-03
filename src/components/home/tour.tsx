"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

/**
 * First-visit guided tour (7 steps, skippable, restartable from Settings). Walks H1–H6 on Home and
 * ends on "Simulate a bad day". Each step spotlights a [data-tour="…"] element; if one is missing
 * (e.g. no results this week) the step shows centred instead.
 */
export const TOUR_STEPS = [
  { target: "h2", title: "Why did my portfolio move today?", body: "One line tells you how much you're up or down and which holdings caused it. Tap it for the full breakdown: market vs. your stocks." },
  { target: "h1", title: "Alerts that explain why", body: "Nazar only messages you when something important happens, with the likely reason (whole market, sector or the company itself) and what it means in rupees for you." },
  { target: "h3", title: "Hidden risks", body: "The outer ring is your portfolio's financial health; the inner ring is diversification and risk. Open it for a stress test and the stocks that secretly move together." },
  { target: "h4", title: "Results, explained", body: "When a company you own reports quarterly results, Nazar shows what improved and what got worse, in plain language." },
  { target: "h5", title: "Alerts that learn", body: "Rate alerts with 👍/👎. When small moves aren't useful to you, Nazar raises the bar, tells you, and lets you undo it in Settings." },
  { target: "h6", title: "Family portfolios, in Hindi", body: "Track Papa's portfolio separately. His weekly report and major alerts go to his email in simple Hindi." },
  { target: "simulate", title: "Now, try a bad day", body: "Run a simulated market drop and watch real alerts arrive, with reasons and rupee impact. You can email yourself a copy." },
] as const;

type Rect = { top: number; left: number; width: number; height: number };

export function Tour({ autoStart }: { autoStart: boolean }) {
  const params = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  const forced = params.get("tour") === "1";
  const [step, setStep] = useState<number | null>(forced || autoStart ? 0 : null);
  const [rect, setRect] = useState<Rect | null>(null);
  // "Replay tour" adds ?tour=1 to the current page: restart when it appears (adjusting state on a
  // prop change during render, as React recommends, rather than in an effect).
  const [wasForced, setWasForced] = useState(forced);
  if (forced !== wasForced) {
    setWasForced(forced);
    if (forced) setStep(0);
  }

  const finish = useCallback(
    async (action: "complete" | "skip") => {
      const at = step ?? 0;
      setStep(null);
      // Drop ?tour=1 first, so a reload can't restart a tour that was just finished.
      if (forced) router.replace(path, { scroll: false });
      // keepalive: the save completes even if the user navigates away right after closing the tour.
      await fetch("/api/tour", { method: "POST", keepalive: true, headers: { "content-type": "application/json" }, body: JSON.stringify({ action, step: at }) }).catch(() => {});
    },
    [step, forced, router, path],
  );

  const measure = useCallback(() => {
    if (step === null) return;
    const el = document.querySelector<HTMLElement>(`[data-tour="${TOUR_STEPS[step].target}"]`);
    if (!el || el.offsetParent === null) return setRect(null);
    const r = el.getBoundingClientRect();
    setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
  }, [step]);

  useLayoutEffect(() => {
    if (step === null) return;
    const el = document.querySelector<HTMLElement>(`[data-tour="${TOUR_STEPS[step].target}"]`);
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (el && el.offsetParent !== null) el.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
    const t = setTimeout(measure, reduce ? 0 : 320);
    void fetch("/api/events", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: "tour_step", props: { step } }) }).catch(() => {});
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, { passive: true });
    return () => {
      clearTimeout(t);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure);
    };
  }, [step, measure]);

  useEffect(() => {
    if (step === null) return;
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") void finish("skip");
      if (e.key === "ArrowRight") setStep((s) => (s !== null && s < TOUR_STEPS.length - 1 ? s + 1 : s));
      if (e.key === "ArrowLeft") setStep((s) => (s !== null && s > 0 ? s - 1 : s));
    };
    document.addEventListener("keydown", k);
    return () => document.removeEventListener("keydown", k);
  }, [step, finish]);

  if (step === null) return null;
  const s = TOUR_STEPS[step];
  const last = step === TOUR_STEPS.length - 1;
  const pad = 8;
  const vw = typeof window !== "undefined" ? window.innerWidth : 1024;
  const vh = typeof window !== "undefined" ? window.innerHeight : 768;
  const cardW = Math.min(360, vw - 32);
  let pos: React.CSSProperties = { left: (vw - cardW) / 2, top: vh / 2 - 110, width: cardW };
  if (rect) {
    const below = rect.top + rect.height + pad + 12;
    const fitsBelow = below + 220 < vh;
    pos = { width: cardW, left: Math.max(16, Math.min(rect.left, vw - cardW - 16)), top: fitsBelow ? below : Math.max(16, rect.top - pad - 12 - 210) };
  }
  return (
    <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-labelledby="tour-title" aria-describedby="tour-body">
      {rect ? (
        <div
          aria-hidden
          className="pointer-events-none absolute rounded-[22px] ring-2 ring-accent transition-all duration-200 ease-[var(--ease-calm)]"
          style={{ top: rect.top - pad, left: rect.left - pad, width: rect.width + pad * 2, height: rect.height + pad * 2, boxShadow: "0 0 0 9999px var(--overlay)" }}
        />
      ) : (
        <div aria-hidden className="absolute inset-0 bg-overlay" />
      )}
      <div className="nz-enter absolute rounded-[20px] border border-line bg-surface-1 p-5 shadow-[var(--shadow-pop)]" style={pos}>
        <div className="flex items-center justify-between">
          <span className="t-overline">
            Step {step + 1} of {TOUR_STEPS.length}
          </span>
          <button onClick={() => void finish("skip")} className="text-[13px] font-medium text-muted hover:text-text">
            Skip tour
          </button>
        </div>
        <h2 id="tour-title" className="t-title-2 mt-2 text-text">
          {s.title}
        </h2>
        <p id="tour-body" className="mt-1.5 text-[15px] leading-6 text-muted">
          {s.body}
        </p>
        <div className="mt-4 flex items-center gap-2">
          <div className="flex flex-1 gap-1" aria-hidden>
            {TOUR_STEPS.map((_, i) => (
              <span key={i} className={cn("h-1.5 rounded-full transition-all", i === step ? "w-5 bg-accent" : "w-1.5 bg-line-strong")} />
            ))}
          </div>
          {step > 0 && (
            <Button variant="ghost" size="sm" onClick={() => setStep(step - 1)}>
              Back
            </Button>
          )}
          <Button size="sm" autoFocus onClick={() => (last ? void finish("complete") : setStep(step + 1))}>
            {last ? "Got it" : "Next"}
          </Button>
        </div>
      </div>
    </div>
  );
}
