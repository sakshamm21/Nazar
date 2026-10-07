"use client";
import { ArrowUpRight, Building2, GraduationCap, Globe2, Scale, Wallet, Wrench, type LucideIcon } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { useState } from "react";
import { NazarMark } from "@/components/rings/nazar-mark";
import { cn } from "@/lib/cn";
import { TOOL_COUNT } from "@/lib/ask/registry";

/** What the page knows about the person asking, used to make the examples about their own money. */
export type AskContext = { stock: string | null; second: string | null; hasPortfolio: boolean };

type Topic = { id: string; label: string; icon: LucideIcon; blurb: string; questions: string[] };

function topics(c: AskContext): Topic[] {
  const stock = c.stock ?? "Infosys";
  const second = c.second ?? "TCS";
  return [
    {
      id: "portfolio",
      label: "My portfolio",
      icon: Wallet,
      blurb: "Nazar reads your holdings from the last checkup. It can see them; it can never change them.",
      questions: c.hasPortfolio
        ? ["Why is my portfolio down this month?", "Which of my holdings is riskiest, and why?", "How diversified am I really?", "What does beta mean? Use my holdings as examples"]
        : ["How are Indian markets doing today?", "What is a healthy number of stocks to track?", "What does diversification actually mean?"],
    },
    {
      id: "company",
      label: "One company",
      icon: Building2,
      blurb: "Results, financial health, what the business is worth, and the latest news.",
      questions: [`Explain ${stock}'s latest results in simple words`, `Is ${stock} financially healthy?`, `What is ${stock} worth? Run a DCF valuation`, `Latest news on ${stock}`],
    },
    {
      id: "compare",
      label: "Compare",
      icon: Scale,
      blurb: "Put up to six companies side by side, or check how closely they move together.",
      questions: [`Compare ${stock} and ${second} on margins and valuation`, "Value HDFC Bank against ICICI Bank, Kotak and Axis Bank using comps", "Show the correlation between TCS, HDFC Bank, Reliance and ITC"],
    },
    {
      id: "markets",
      label: "Markets today",
      icon: Globe2,
      blurb: "Indices, sectors, the day's movers and headlines, from live data.",
      questions: ["How are Indian markets doing today?", "Top Nifty 50 losers today", "Which sectors are up the most this week?"],
    },
    {
      id: "learn",
      label: "Plan and learn",
      icon: GraduationCap,
      blurb: "Back-test a monthly SIP, or have a term explained in plain words.",
      questions: ["If I had done a ₹10,000 monthly SIP in the Nifty 50 for 5 years, what would it be worth?", "Explain XIRR like I am new to investing", "Mere portfolio mein sabse risky share kaunsa hai? Hinglish mein samjhao"],
    },
  ];
}

/** The first thing you see in Ask: one line on what it is, then a question to start from. */
export function AskStart({ context, mode, onPick }: { context: AskContext; mode: "simple" | "pro"; onPick: (q: string) => void }) {
  const list = topics(context);
  const [active, setActive] = useState(list[0].id);
  const topic = list.find((t) => t.id === active) ?? list[0];
  const reduce = useReducedMotion();
  return (
    <div className="no-print mx-auto max-w-2xl pb-2 pt-4 text-center sm:pt-10">
      <span className="nz-float inline-block">
        <NazarMark size={52} />
      </span>
      <h1 className="mt-5 font-[family-name:var(--font-display)] text-[28px] font-semibold leading-[34px] tracking-[-0.025em] text-text sm:text-[36px] sm:leading-[42px]">
        Ask anything about <span className="text-accent">your money</span>
      </h1>
      <p className="mx-auto mt-3 max-w-lg text-[15px] leading-6 text-muted">Nazar reads your portfolio and live market data, then explains in plain words. English, Hindi or Hinglish.</p>

      <div className="mt-8 flex flex-wrap justify-center gap-1.5" role="tablist" aria-label="Kinds of question">
        {list.map((t) => (
          <button key={t.id} role="tab" aria-selected={t.id === active} onClick={() => setActive(t.id)} className={cn("relative flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[13px] font-medium transition-colors", t.id === active ? "text-accent" : "text-muted hover:text-text")}>
            {t.id === active && <motion.span layoutId="ask-topic" className="absolute inset-0 rounded-full bg-accent-soft" transition={{ type: "spring", stiffness: 420, damping: 34 }} />}
            <t.icon className="relative h-3.5 w-3.5" /> <span className="relative">{t.label}</span>
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={topic.id} initial={reduce ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={reduce ? undefined : { opacity: 0, y: -4 }} transition={{ duration: 0.18 }}>
          <p className="mt-4 text-[13px] text-subtle">{topic.blurb}</p>
          <ul className="mt-4 grid gap-2 text-left sm:grid-cols-2">
            {topic.questions.map((q, i) => (
              <motion.li key={q} initial={reduce ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, delay: 0.04 * i }}>
                <button onClick={() => onPick(q)} className="group flex h-full w-full items-start justify-between gap-3 rounded-[16px] border border-line bg-surface-2/60 px-4 py-3.5 text-left text-[14px] leading-5 text-text transition-[border-color,background-color,transform] duration-150 hover:-translate-y-0.5 hover:border-accent hover:bg-surface-2">
                  {q}
                  <ArrowUpRight className="mt-0.5 h-4 w-4 shrink-0 text-subtle transition-colors group-hover:text-accent" />
                </button>
              </motion.li>
            ))}
          </ul>
        </motion.div>
      </AnimatePresence>

      <div className="mt-7 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[13px] text-subtle">
        <span>
          Answers are in <b className="font-medium text-text">{mode === "pro" ? "Pro" : "Simple"}</b> style ({mode === "pro" ? "full numbers and terms" : "plain words, fewer numbers"}).
        </span>
        <Link href="/ask/research" className="inline-flex items-center gap-1.5 font-medium text-accent">
          <Wrench className="h-3.5 w-3.5" /> All {TOOL_COUNT} tools
        </Link>
      </div>
    </div>
  );
}
