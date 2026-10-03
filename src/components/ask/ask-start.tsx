"use client";
import { ArrowUpRight, BarChart3, Building2, FileSpreadsheet, GraduationCap, Globe2, MessageCircleQuestion, Scale, Search, Wallet, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { TOOL_COUNT } from "@/lib/ask/tool-catalog";

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
        ? ["Why is my portfolio down this month?", "Which of my holdings is riskiest, and why?", "How diversified am I really?"]
        : ["How are Indian markets doing today?", "What is a healthy number of stocks to track?", "What does diversification actually mean?"],
    },
    {
      id: "company",
      label: "One company",
      icon: Building2,
      blurb: "Results, financial health, what the business is worth, and the latest news.",
      questions: [`Explain ${stock}'s latest results in simple words`, `Is ${stock} financially healthy?`, `What is ${stock} worth? Run a DCF valuation`],
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
      questions: ["How are Indian markets doing today?", "Top Nifty 50 losers today", `Latest news on ${stock}`],
    },
    {
      id: "learn",
      label: "Plan and learn",
      icon: GraduationCap,
      blurb: "Back-test a monthly SIP, or have a term explained with your own holdings as the example.",
      questions: ["If I had done a ₹10,000 monthly SIP in the Nifty 50 for 5 years, what would it be worth?", "What does beta mean? Use my holdings as examples", "Mere portfolio mein sabse risky share kaunsa hai? Hinglish mein samjhao"],
    },
  ];
}

const STEPS: { icon: LucideIcon; title: string; body: string }[] = [
  { icon: MessageCircleQuestion, title: "Ask in your own words", body: "English, Hindi or Hinglish. No commands to learn." },
  { icon: Search, title: "Nazar fetches live data", body: `It picks from ${TOOL_COUNT} tools and shows which ones it used.` },
  { icon: BarChart3, title: "You get it explained", body: "Charts and tables with the answer, every one downloadable as Excel." },
];

/** The first thing you see in Ask: what it is, how it works, and a question to start from. */
export function AskStart({ context, mode, onPick }: { context: AskContext; mode: "simple" | "pro"; onPick: (q: string) => void }) {
  const list = topics(context);
  const [active, setActive] = useState(list[0].id);
  const topic = list.find((t) => t.id === active) ?? list[0];
  return (
    <div className="no-print pb-2 pt-2 sm:pt-6">
      <div className="t-overline">Ask</div>
      <h1 className="mt-1 font-[family-name:var(--font-display)] text-[30px] font-extrabold leading-[32px] tracking-[-0.04em] text-text sm:text-[40px] sm:leading-[42px]">
        Ask anything about <span className="t-accent nz-grad pr-1 font-medium">your money.</span>
      </h1>
      <p className="mt-3 max-w-xl text-[15px] leading-6 text-muted">A research assistant that reads your portfolio and live market data, then explains in plain language. It never tells you what to do with your money.</p>

      <ol className="mt-6 grid gap-2 sm:grid-cols-3">
        {STEPS.map((s, i) => (
          <li key={s.title} className="flex gap-3 rounded-[18px] border border-line bg-surface-2/60 p-3.5">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent-soft text-accent">
              <s.icon className="h-[18px] w-[18px]" />
            </span>
            <span>
              <span className="block text-sm font-semibold text-text">
                <span className="num text-subtle">{i + 1}.</span> {s.title}
              </span>
              <span className="mt-0.5 block text-[13px] leading-5 text-muted">{s.body}</span>
            </span>
          </li>
        ))}
      </ol>

      <div className="mt-8">
        <h2 className="t-title-2 text-text">Start with a question</h2>
        <div className="-mx-1 mt-3 flex gap-1.5 overflow-x-auto px-1 pb-1" role="tablist" aria-label="Kinds of question">
          {list.map((t) => (
            <button key={t.id} role="tab" aria-selected={t.id === active} onClick={() => setActive(t.id)} className={cn("flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[13px] font-semibold transition-colors", t.id === active ? "border-transparent bg-text text-bg" : "border-line text-muted hover:text-text")}>
              <t.icon className="h-3.5 w-3.5" /> {t.label}
            </button>
          ))}
        </div>
        <p className="mt-3 text-[13px] text-muted">{topic.blurb}</p>
        <ul className="mt-3 grid gap-2">
          {topic.questions.map((q) => (
            <li key={q}>
              <button onClick={() => onPick(q)} className="group flex w-full items-center justify-between gap-3 rounded-[16px] border border-line bg-surface-1 px-4 py-3 text-left text-[15px] text-text transition-colors hover:border-accent hover:bg-surface-2">
                {q}
                <ArrowUpRight className="h-4 w-4 shrink-0 text-subtle transition-colors group-hover:text-accent" />
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px] text-muted">
        <span>
          Answer style: <b className="font-semibold text-text">{mode === "pro" ? "Pro" : "Simple"}</b> ({mode === "pro" ? "full numbers and terms" : "plain words, fewer numbers"}). Switch it at the top.
        </span>
        <Link href="/ask/research" className="inline-flex items-center gap-1.5 font-semibold text-accent">
          <FileSpreadsheet className="h-4 w-4" /> See all {TOOL_COUNT} tools
        </Link>
      </div>
    </div>
  );
}
