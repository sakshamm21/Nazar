import { ArrowRight, Bitcoin, Building2, Coins, Globe2, Landmark, Layers, PieChart, PiggyBank, ShieldCheck, TrendingUp } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { DemoButton } from "@/components/auth/demo-button";
import { CountUp, Reveal, Tilt } from "@/components/landing/fx";
import { NazarMark, Wordmark } from "@/components/rings/nazar-mark";
import { ThemeToggle } from "@/components/shell/theme-toggle";
import { buttonClass } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { currentUser } from "@/lib/current-user";
import { TEST_ACCOUNTS, TEST_PASSWORD } from "@/lib/demo/config";

const showDemo = process.env.NEXT_PUBLIC_SHOW_DEMO_ACCOUNTS !== "false";

export const metadata: Metadata = { title: "Nazar · Your portfolio, watched" };
export const dynamic = "force-dynamic";

const ASSETS = [
  { icon: TrendingUp, label: "Stocks" },
  { icon: PieChart, label: "Mutual funds" },
  { icon: Layers, label: "ETFs" },
  { icon: Coins, label: "Gold and silver" },
  { icon: Globe2, label: "US stocks" },
  { icon: Bitcoin, label: "Crypto" },
  { icon: Building2, label: "REITs" },
  { icon: Landmark, label: "FDs and bonds" },
  { icon: PiggyBank, label: "PPF, EPF, NPS" },
];

// A small made-up portfolio for the pictures on this page: name, share of the box, today's move.
const TILES: [string, string, number][] = [
  ["HDFC Bank", "col-span-3 row-span-2", 1.8],
  ["Flexi Cap Fund", "col-span-3 row-span-1", -0.6],
  ["Infosys", "col-span-2 row-span-1", 3.9],
  ["Gold", "col-span-1 row-span-1", 0.4],
  ["Reliance", "col-span-2 row-span-1", -1.6],
  ["Nifty ETF", "col-span-2 row-span-1", -0.2],
  ["Apple", "col-span-2 row-span-1", 0.9],
];
const tileBg = (p: number) => `color-mix(in srgb, ${p >= 0 ? "var(--gain)" : "var(--loss)"} ${Math.round(22 + Math.min(1, Math.abs(p) / 4) * 55)}%, var(--surface-2))`;

export default async function Landing() {
  if (await currentUser()) redirect("/home");
  const demo = { email: TEST_ACCOUNTS[0].email, password: TEST_PASSWORD };
  return (
    <div className="min-h-dvh overflow-x-hidden">
      <header className="mx-auto flex max-w-[1120px] items-center justify-between px-4 py-5 sm:px-6 lg:px-8">
        <Wordmark size={30} />
        <nav className="flex items-center gap-2">
          <ThemeToggle />
          <Link href="/signin" className={buttonClass("secondary", "sm")}>
            Sign in
          </Link>
        </nav>
      </header>

      <main>
        {/* Hero */}
        <section className="relative mx-auto grid max-w-[1120px] grid-cols-1 items-center gap-12 px-4 pb-20 pt-8 sm:px-6 lg:grid-cols-[1.02fr_0.98fr] lg:px-8 lg:pb-28 lg:pt-16">
          <div aria-hidden className="pointer-events-none absolute -left-40 -top-24 -z-10 h-[420px] w-[620px] rounded-full opacity-70 blur-3xl" style={{ background: "radial-gradient(closest-side, var(--accent-soft), transparent)" }} />
          <div className="nz-stagger min-w-0">
            <p className="inline-flex items-center gap-2 rounded-full border border-line bg-surface-1 px-3 py-1.5 text-[13px] text-muted">
              <span className="relative grid h-2 w-2 place-items-center">
                <span className="nz-breathe absolute inset-[-3px] rounded-full border border-accent" />
                <span className="h-1.5 w-1.5 rounded-full bg-accent" />
              </span>
              Your whole portfolio, in one place
            </p>
            <h1 className="mt-5 font-[family-name:var(--font-display)] text-[40px] font-semibold leading-[1.05] tracking-[-0.035em] text-text sm:text-[60px]">
              See what your money did. <span className="text-accent">Understand why.</span>
            </h1>
            <p className="mt-5 max-w-lg text-[17px] leading-7 text-muted">Nazar tracks everything you own, from stocks and funds to gold, crypto and FDs, and explains every move in plain words.</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              {showDemo && <DemoButton email={demo.email} password={demo.password} />}
              <Link href="/signup" className={buttonClass(showDemo ? "secondary" : "primary", "lg")}>
                Create an account
              </Link>
            </div>
            <p className="mt-4 flex items-center gap-2 text-sm text-subtle">
              <ShieldCheck className="h-4 w-4" /> Free. No tips, no predictions.
            </p>
          </div>
          <HeroVisual />
        </section>

        {/* Everything you own */}
        <section className="border-y border-line bg-surface-1/40">
          <Reveal className="mx-auto max-w-[1120px] px-4 py-8 sm:px-6 lg:px-8">
            <ul className="flex flex-wrap items-center justify-center gap-x-6 gap-y-3 text-sm text-muted">
              {ASSETS.map(({ icon: Icon, label }) => (
                <li key={label} className="flex items-center gap-2">
                  <Icon className="h-4 w-4 text-accent" /> {label}
                </li>
              ))}
            </ul>
          </Reveal>
        </section>

        {/* What it does */}
        <section className="mx-auto max-w-[1120px] px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
          <Reveal className="max-w-2xl">
            <div className="t-overline">What you get</div>
            <h2 className="mt-2 font-[family-name:var(--font-display)] text-[30px] font-semibold leading-[1.1] tracking-[-0.03em] text-text sm:text-[40px]">Four screens. Every answer about your money.</h2>
          </Reveal>

          <div className="mt-10 grid gap-4 lg:grid-cols-5">
            <Reveal className="lg:col-span-3">
              <Feature title="At a glance" body="One map of everything you own. Bigger tile, more of your money. Green rose, red fell.">
                <div className="grid h-44 grid-cols-6 grid-rows-3 gap-1.5">
                  {TILES.map(([name, span, p], i) => (
                    <div key={name} className={`nz-pop flex flex-col justify-between rounded-[10px] p-2 ${span}`} style={{ background: tileBg(p), "--d": `${i * 70}ms` } as React.CSSProperties}>
                      <span className="truncate text-[11px] font-semibold text-text">{name}</span>
                      <span className="num text-[11px] text-text/80">{p > 0 ? "+" : "−"}{Math.abs(p).toFixed(1)}%</span>
                    </div>
                  ))}
                </div>
              </Feature>
            </Reveal>
            <Reveal className="lg:col-span-2" delay={0.08}>
              <Feature title="Charts you can drag" body="Value over a week or a year, against the Nifty. Slide along the line to read any day.">
                <svg viewBox="0 0 300 130" className="h-44 w-full" aria-hidden>
                  <defs>
                    <linearGradient id="lf" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.28" />
                      <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <path d="M0,104 C30,98 46,70 76,76 S118,104 150,78 196,36 226,48 270,30 300,14 L300,130 L0,130 Z" fill="url(#lf)" />
                  <path d="M0,104 C30,98 46,70 76,76 S118,104 150,78 196,36 226,48 270,30 300,14" pathLength={1} fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeDasharray="1" className="nz-draw" />
                  <path d="M0,110 C40,104 70,96 110,98 S190,80 230,74 280,62 300,58" fill="none" stroke="var(--subtle)" strokeWidth="1.5" strokeDasharray="4 5" />
                  <line x1="196" y1="8" x2="196" y2="130" stroke="var(--line-strong)" />
                  <circle cx="196" cy="42" r="5" fill="var(--accent)" stroke="var(--surface-1)" strokeWidth="3" />
                </svg>
              </Feature>
            </Reveal>
            <Reveal className="lg:col-span-2">
              <Feature title="Analysis that explains" body="Pick a period and read what moved, which holdings did it, and how much was simply the market.">
                <p className="text-[15px] leading-6 text-text">
                  <span className="font-medium text-gain">Up ₹41,200 this month.</span> Gold and HDFC Bank added the most.
                </p>
                <div className="mt-4 flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full">
                  <div className="h-full w-[62%] rounded-l-full bg-subtle" />
                  <div className="h-full flex-1 rounded-r-full bg-accent" />
                </div>
                <div className="mt-2 flex justify-between text-[12px] text-muted">
                  <span>The market, 62%</span>
                  <span>Specific to you, 38%</span>
                </div>
              </Feature>
            </Reveal>
            <Reveal className="lg:col-span-3" delay={0.08}>
              <Feature title="Ask, in your own words" body="Questions about your portfolio, a company or the market, answered from live data in English, Hindi or Hinglish.">
                <div className="space-y-2.5">
                  <div className="ml-auto w-fit max-w-[85%] rounded-[16px] rounded-br-[5px] border border-accent/25 bg-accent-soft px-3.5 py-2 text-sm text-text">Which of my holdings is riskiest, and why?</div>
                  <div className="flex max-w-[92%] gap-2.5">
                    <NazarMark size={24} className="mt-0.5" />
                    <div className="rounded-[16px] rounded-tl-[5px] border border-line bg-surface-2 px-3.5 py-2 text-sm leading-6 text-muted">
                      <span className="text-text">Tata Motors.</span> It swings 1.4× as much as the Nifty and its health score is the lowest you own, at 33.
                    </div>
                  </div>
                </div>
              </Feature>
            </Reveal>
          </div>
        </section>

        {/* Numbers */}
        <section className="border-y border-line bg-surface-1/40">
          <div className="mx-auto grid max-w-[1120px] gap-8 px-4 py-14 sm:grid-cols-3 sm:px-6 lg:px-8">
            <Count to={11000} suffix="+" label="stocks, funds and ETFs to search" />
            <Count to={15} label="kinds of asset, from crypto to PPF" />
            <Count to={0} prefix="₹" label="what it costs" />
          </div>
        </section>

        {/* How it starts */}
        <section className="mx-auto max-w-[1120px] px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
          <div className="grid gap-6 text-sm sm:grid-cols-3">
            <Step n="1" title="Add what you own" body="Search it and type a quantity, or import a broker file. It takes a minute." />
            <Step n="2" title="Prices keep themselves fresh" body="Every time you open the app, and every evening after the market closes." />
            <Step n="3" title="Read it, or ask" body="Open Analysis for the full picture, or ask a question and get it explained." />
          </div>
          <Reveal>
            <Card className="mt-14 flex flex-col items-start justify-between gap-6 p-7 sm:flex-row sm:items-center sm:p-10">
              <div>
                <h2 className="font-[family-name:var(--font-display)] text-[26px] font-semibold leading-tight tracking-[-0.025em] text-text sm:text-[32px]">Look around before you sign up.</h2>
                <p className="mt-2 max-w-lg text-muted">The demo is a full portfolio on live prices: stocks, funds, gold, US shares, Bitcoin and deposits.</p>
              </div>
              {showDemo ? (
                <DemoButton email={demo.email} password={demo.password} label="Open the demo" />
              ) : (
                <Link href="/signup" className={buttonClass("primary", "lg")}>
                  Create an account <ArrowRight className="h-4 w-4" />
                </Link>
              )}
            </Card>
          </Reveal>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-[1120px] flex-col gap-3 px-4 py-8 text-[13px] text-subtle sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <div className="flex items-center gap-2">
            <NazarMark size={20} /> Nazar · a project by Saksham Malhotra
          </div>
          <p>Nazar explains; you decide. Not a SEBI-registered investment adviser. Prices can be delayed.</p>
          {process.env.NEXT_PUBLIC_LEGACY_URL && (
            <a href={process.env.NEXT_PUBLIC_LEGACY_URL} className="hover:text-text">
              StockAI (legacy)
            </a>
          )}
        </div>
      </footer>
    </div>
  );
}

function Feature({ title, body, children }: { title: string; body: string; children: React.ReactNode }) {
  return (
    <Card className="flex h-full flex-col p-5 transition-[transform,border-color] duration-200 hover:-translate-y-1 hover:border-line-strong sm:p-6">
      <div className="rounded-[14px] border border-line bg-bg/60 p-4">{children}</div>
      <h3 className="t-title-2 mt-5 text-text">{title}</h3>
      <p className="mt-1.5 text-sm leading-6 text-muted">{body}</p>
    </Card>
  );
}

function Count({ to, prefix, suffix, label }: { to: number; prefix?: string; suffix?: string; label: string }) {
  return (
    <div>
      <CountUp to={to} prefix={prefix} suffix={suffix} className="num block font-[family-name:var(--font-display)] text-[44px] font-semibold leading-none tracking-[-0.03em] text-text sm:text-[52px]" />
      <div className="mt-2 text-sm text-muted">{label}</div>
    </div>
  );
}

function Step({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <Reveal delay={Number(n) * 0.06}>
      <div className="num grid h-9 w-9 place-items-center rounded-full bg-accent-soft text-[13px] font-semibold text-accent">{n}</div>
      <h3 className="mt-3 text-[15px] font-medium text-text">{title}</h3>
      <p className="mt-1 leading-6 text-muted">{body}</p>
    </Reveal>
  );
}

function HeroVisual() {
  const line = "M0,74 C30,70 44,52 70,56 S112,78 138,60 178,30 206,36 250,58 276,34 320,14 340,10";
  return (
    <Tilt className="mx-auto w-full min-w-0 max-w-md">
      <div className="relative pb-20">
        <Card className="p-6 shadow-[var(--shadow-pop)]">
          <div className="t-overline">My portfolio · past 3 months</div>
          <div className="t-display num mt-2 text-text">₹18,64,210</div>
          <div className="num mt-1 text-[15px] font-medium text-gain">▲ +₹1,12,480 (+6.4%)</div>
          <svg viewBox="0 0 340 90" className="mt-4 w-full" aria-hidden>
            <defs>
              <linearGradient id="lv" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--gain)" stopOpacity="0.3" />
                <stop offset="100%" stopColor="var(--gain)" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={`${line} L340,90 L0,90 Z`} fill="url(#lv)" />
            <path d={line} pathLength={1} fill="none" stroke="var(--gain)" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="1" className="nz-draw" />
          </svg>
          <div className="mt-3 flex gap-1">
            {["1W", "1M", "3M", "6M", "1Y"].map((r) => (
              <span key={r} className={`num rounded-full px-3 py-1 text-[12px] font-semibold ${r === "3M" ? "bg-accent-soft text-accent" : "text-muted"}`}>{r}</span>
            ))}
          </div>
        </Card>
        <Card className="nz-float absolute bottom-0 right-0 w-[78%] p-4 shadow-[var(--shadow-pop)] sm:-right-6">
          <div className="flex items-center gap-2 text-sm font-medium text-text">
            <span className="h-2 w-2 rounded-full bg-gain" /> Why you&apos;re up this month
          </div>
          <p className="mt-1 text-[13px] leading-5 text-muted">HDFC Bank and gold added the most. About half of it is simply the market rising.</p>
        </Card>
      </div>
    </Tilt>
  );
}
