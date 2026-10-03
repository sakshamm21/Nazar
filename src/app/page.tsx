import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { DemoButton } from "@/components/auth/demo-button";
import { CountUp, Reveal, Tilt } from "@/components/landing/fx";
import { NazarMark, Wordmark } from "@/components/rings/nazar-mark";
import { ThemeToggle } from "@/components/shell/theme-toggle";
import { buttonClass } from "@/components/ui/button";
import { currentUser } from "@/lib/current-user";
import { TEST_ACCOUNTS, TEST_PASSWORD } from "@/lib/demo/config";

const showDemo = process.env.NEXT_PUBLIC_SHOW_DEMO_ACCOUNTS !== "false";

export const metadata: Metadata = { title: "Nazar · Your portfolio, watched" };
export const dynamic = "force-dynamic";

const ASSETS = ["Stocks", "Mutual funds", "ETFs", "Gold", "US stocks", "Crypto", "REITs", "FDs", "PPF", "EPF", "NPS", "Bonds"];
const VERBS = ["What moved", "Why it moved", "How it compares", "What changed today", "Which holding did it", "How much was the market"];
const big = "font-[family-name:var(--font-display)] font-black uppercase leading-[0.84] text-text";
// The colour blocks keep their colours in both themes, so their ink is always black.
const BLOCK = { violet: "#b49cff", bone: "#f7f4ea", orange: "#ff7a45", yellow: "#ffe500" };

export default async function Landing() {
  if (await currentUser()) redirect("/home");
  const demo = { email: TEST_ACCOUNTS[0].email, password: TEST_PASSWORD };
  return (
    <div className="min-h-dvh overflow-x-hidden bg-bg">
      <header className="mx-auto flex max-w-[1240px] items-center justify-between px-5 py-5 sm:px-8">
        <Wordmark size={28} />
        <nav className="flex items-center gap-3">
          <ThemeToggle />
          <Link href="/signin" className={buttonClass("secondary", "sm")}>
            Sign in
          </Link>
        </nav>
      </header>

      <main>
        {/* Hero */}
        <section className="nz-aura mx-auto grid max-w-[1240px] grid-cols-1 items-center gap-12 px-5 pb-24 pt-8 sm:px-8 lg:grid-cols-[1.15fr_0.85fr] lg:pb-32 lg:pt-14">
          <div className="min-w-0">
            <p className="t-overline flex items-center gap-2.5 text-muted">
              <span className="nz-blink h-2 w-2 bg-cta" aria-hidden /> Nazar <span lang="hi">नज़र</span> · the watchful eye
            </p>
            <h1 className={`${big} mt-5 whitespace-nowrap text-[clamp(60px,17.5vw,132px)] lg:text-[clamp(96px,9.4vw,138px)]`}>
              <span className="nz-line"><span>Your money</span></span>{" "}
              <span className="nz-line" style={{ "--d": "110ms" } as React.CSSProperties}><span>is being</span></span>{" "}
              <span className="nz-line" style={{ "--d": "220ms" } as React.CSSProperties}>
                <span className="t-accent nz-grad pb-[0.12em] text-[0.92em] leading-[1]">watched.</span>
              </span>
            </h1>
            <p className="mt-7 max-w-md text-[17px] leading-7 text-muted">One place for everything you own. It shows what moved, tells you why, and shuts up when nothing did.</p>
            <div className="mt-9 flex flex-col gap-4 sm:flex-row sm:items-center">
              {showDemo && <DemoButton email={demo.email} password={demo.password} />}
              <Link href="/signup" className={buttonClass(showDemo ? "secondary" : "primary", "lg")}>
                Create an account
              </Link>
            </div>
            <p className="t-overline mt-6">Free. No tips, no predictions.</p>
          </div>
          <HeroVisual />
        </section>

        {/* Two crossing strips */}
        <section aria-hidden className="relative -mx-6 py-10">
          <div className="-rotate-2 overflow-hidden py-3" style={{ background: BLOCK.yellow, color: "#000" }}>
            <Strip words={ASSETS} />
          </div>
          <div className="-mt-3 rotate-1 overflow-hidden border-y border-line-strong bg-surface-1 py-3 text-text">
            <Strip words={VERBS} reverse />
          </div>
        </section>

        {/* Three acts */}
        <section className="mx-auto max-w-[1240px] space-y-20 px-5 py-20 sm:px-8 lg:space-y-32 lg:py-32">
          <Act n="01" title="See it move" body="Everything you own on one line. Drag across it and the number follows your finger, from last week to last year." bg={BLOCK.violet}>
            <svg viewBox="0 0 340 150" className="w-full" aria-hidden>
              <path d="M0,120 L40,104 L78,112 L120,74 L158,88 L204,46 L244,60 L290,24 L340,12" fill="none" stroke="#000" strokeWidth="5" strokeLinejoin="miter" />
              <rect x="196" y="38" width="16" height="16" fill="#000" />
              <line x1="204" y1="0" x2="204" y2="150" stroke="#000" strokeWidth="1.5" strokeDasharray="4 5" />
            </svg>
            <div className="mt-4 flex items-end justify-between">
              <div>
                <div className="font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-[0.12em]">14 Aug</div>
                <div className="font-[family-name:var(--font-display)] text-[44px] font-black leading-none">₹18,02,460</div>
              </div>
              <div className="flex gap-1 font-[family-name:var(--font-mono)] text-[11px] font-bold">
                {["1W", "1M", "3M", "1Y"].map((r) => (
                  <span key={r} className="px-2 py-1" style={r === "3M" ? { background: "#000", color: BLOCK.violet } : undefined}>{r}</span>
                ))}
              </div>
            </div>
          </Act>

          <Act n="02" title="Know why" body="Which holdings did it, and how much was simply the market. Written as sentences, not a spreadsheet." bg={BLOCK.bone} flip>
            <p className="font-[family-name:var(--font-accent)] text-[30px] italic leading-[1.1]">“Up ₹41,200 this month. Gold and HDFC Bank added the most.”</p>
            <div className="mt-6 flex h-5 w-full">
              <div className="h-full w-[62%] bg-black" />
              <div className="h-full flex-1" style={{ background: BLOCK.orange }} />
            </div>
            <div className="mt-2 flex justify-between font-[family-name:var(--font-mono)] text-[11px] font-bold uppercase tracking-[0.08em]">
              <span>The market · 62%</span>
              <span>Just you · 38%</span>
            </div>
          </Act>

          <Act n="03" title="Hear only what matters" body="A big fall, a result, a holding that has grown too large. Each alert comes with the likely reason and what it cost you in rupees." bg={BLOCK.orange}>
            <div className="border-2 border-black p-4">
              <div className="font-[family-name:var(--font-mono)] text-[11px] font-bold uppercase tracking-[0.12em]">Alert · today</div>
              <div className="mt-1 font-[family-name:var(--font-display)] text-[40px] font-black uppercase leading-[0.95]">Tata Motors −7.0%</div>
              <p className="mt-2 text-[15px] leading-6">Likely reason: something specific to the company. It is 9% of your portfolio; that is about ₹8,400 today.</p>
            </div>
          </Act>
        </section>

        {/* Numbers */}
        <section className="border-y border-line">
          <div className="mx-auto grid max-w-[1240px] divide-y divide-line sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            <Count to={11000} suffix="+" label="stocks, funds and ETFs to search" />
            <Count to={15} label="kinds of asset, from crypto to PPF" />
            <Count to={0} prefix="₹" label="what it costs" />
          </div>
        </section>

        {/* Last word */}
        <section className="mx-auto max-w-[1240px] px-5 py-24 text-center sm:px-8 lg:py-36">
          <Reveal>
            <h2 className={`${big} text-[19vw] sm:text-[140px]`}>
              Go on, <span className="t-accent nz-grad text-[0.92em]">look.</span>
            </h2>
            <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
              {showDemo && <DemoButton email={demo.email} password={demo.password} label="Open the demo" />}
              <Link href="/signup" className={buttonClass(showDemo ? "secondary" : "primary", "lg")}>
                Create an account
              </Link>
            </div>
          </Reveal>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-[1240px] flex-col gap-3 px-5 py-8 text-[13px] text-subtle sm:px-8 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-2">
            <NazarMark size={18} /> Nazar · a project by Saksham Malhotra
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

function Strip({ words, reverse }: { words: string[]; reverse?: boolean }) {
  const run = [...words, ...words];
  return (
    <div className="nz-marquee font-[family-name:var(--font-display)] text-[30px] font-black uppercase leading-none tracking-[0.02em] sm:text-[40px]" style={reverse ? { animationDirection: "reverse" } : undefined}>
      {[0, 1].map((k) => (
        <div key={k} className="flex shrink-0">
          {run.map((w, i) => (
            <span key={i} className="flex items-center whitespace-nowrap">
              <span className="px-5">{w}</span>
              <span className="text-[0.6em]">✦</span>
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

function Act({ n, title, body, bg, flip, children }: { n: string; title: string; body: string; bg: string; flip?: boolean; children: React.ReactNode }) {
  return (
    <div className="grid items-center gap-8 lg:grid-cols-2 lg:gap-16">
      <Reveal from={flip ? "right" : "left"} className={flip ? "lg:order-2" : undefined}>
        <div className="font-[family-name:var(--font-mono)] text-[13px] font-bold tracking-[0.14em] text-hi">{n} / 03</div>
        <h2 className={`${big} mt-3 text-[64px] sm:text-[96px]`}>{title}</h2>
        <p className="mt-5 max-w-md text-[17px] leading-7 text-muted">{body}</p>
      </Reveal>
      <Reveal from={flip ? "left" : "right"} delay={0.08}>
        <div className="p-6 text-black shadow-[10px_10px_0_0_var(--line-strong)] sm:p-8" style={{ background: bg }}>
          {children}
        </div>
      </Reveal>
    </div>
  );
}

function Count({ to, prefix, suffix, label }: { to: number; prefix?: string; suffix?: string; label: string }) {
  return (
    <div className="px-5 py-10 sm:px-8 sm:py-14">
      <CountUp to={to} prefix={prefix} suffix={suffix} className={`${big} block text-[84px] sm:text-[104px]`} />
      <div className="t-overline mt-3">{label}</div>
    </div>
  );
}

function HeroVisual() {
  const line = "M0,78 L34,70 L60,74 L96,50 L128,58 L168,30 L204,40 L246,54 L280,28 L340,8";
  return (
    <Tilt className="mx-auto w-full min-w-0 max-w-[420px] pr-3">
      <div className="relative">
        <div className="border border-line-strong bg-surface-1 p-6 shadow-[10px_10px_0_0_var(--cta)]">
          <div className="t-overline">My portfolio · past 3 months</div>
          <div className="num mt-2 font-[family-name:var(--font-display)] text-[clamp(40px,12.5vw,60px)] font-black leading-none text-text">₹18,64,210</div>
          <div className="num mt-2 text-[15px] font-semibold text-gain">▲ +₹1,12,480 (+6.4%)</div>
          <svg viewBox="0 0 340 90" className="mt-5 w-full" aria-hidden>
            <path d={`${line} L340,90 L0,90 Z`} fill="var(--gain)" opacity="0.12" />
            <path d={line} pathLength={1} fill="none" stroke="var(--gain)" strokeWidth="3" strokeDasharray="1" className="nz-draw" />
            <rect x="333" y="1" width="12" height="12" fill="var(--gain)" />
          </svg>
          <div className="mt-4 flex gap-1 font-[family-name:var(--font-mono)] text-[11px] font-bold">
            {["1W", "1M", "3M", "6M", "1Y"].map((r) => (
              <span key={r} className={r === "3M" ? "bg-text px-2.5 py-1 text-bg" : "px-2.5 py-1 text-muted"}>{r}</span>
            ))}
          </div>
        </div>
        <div className="absolute -bottom-16 left-2 w-[78%] -rotate-3 p-4 text-black shadow-[6px_6px_0_0_#000] sm:-left-10" style={{ background: BLOCK.violet, transform: "translateZ(60px) rotate(-3deg)" }}>
          <div className="font-[family-name:var(--font-mono)] text-[10px] font-bold uppercase tracking-[0.12em]">Why you&apos;re up</div>
          <p className="mt-1 text-[14px] font-medium leading-5">HDFC Bank and gold added the most. About half is simply the market rising.</p>
        </div>
      </div>
    </Tilt>
  );
}
