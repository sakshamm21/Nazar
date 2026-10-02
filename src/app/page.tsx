import { BellRing, CloudLightning, FileBarChart2, Languages, ShieldCheck, Sparkles, TrendingDown } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { DemoButton } from "@/components/landing/demo-button";
import { ThemeToggle } from "@/components/shell/theme-toggle";
import { RingGauge } from "@/components/rings/ring-gauge";
import { NazarMark, Wordmark } from "@/components/rings/nazar-mark";
import { buttonClass } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { SeverityIcon } from "@/components/ui/severity";
import { currentUser } from "@/lib/current-user";

export const metadata: Metadata = { title: "Nazar · Your portfolio, watched" };
export const dynamic = "force-dynamic";

export default async function Landing() {
  if (await currentUser()) redirect("/home");
  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex max-w-[1120px] items-center justify-between px-4 py-5 sm:px-6 lg:px-8">
        <Wordmark />
        <nav className="flex items-center gap-1.5 sm:gap-2">
          <ThemeToggle />
          <Link href="/signin" className={buttonClass("ghost", "sm")}>
            Sign in
          </Link>
          <Link href="/signup" className={buttonClass("secondary", "sm", "hidden sm:inline-flex")}>
            Create account
          </Link>
        </nav>
      </header>

      <main>
        {/* Hero */}
        <section className="mx-auto grid max-w-[1120px] items-center gap-10 px-4 pb-16 pt-6 sm:px-6 lg:grid-cols-[1.1fr_0.9fr] lg:px-8 lg:pb-24 lg:pt-14">
          <div>
            <Chip tone="accent" className="mb-5">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" /> For Indian investors on Zerodha, Groww and Upstox
            </Chip>
            <h1 className="font-[family-name:var(--font-display)] text-[40px] font-semibold leading-[44px] tracking-[-0.03em] text-text sm:text-[56px] sm:leading-[60px]">
              Your stocks,
              <br />
              watched.
            </h1>
            <p className="mt-5 max-w-xl text-[17px] leading-7 text-muted">
              Nazar watches your stocks every day and messages you only when something important happens, explaining what happened and why, in plain language.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <DemoButton />
              <Link href="/signin" className={buttonClass("secondary", "lg")}>
                Sign in
              </Link>
            </div>
            <p className="mt-4 flex items-center gap-2 text-sm text-subtle">
              <ShieldCheck className="h-4 w-4" /> We watch and explain; you decide. No buy or sell tips, ever.
            </p>
          </div>
          <HeroVisual />
        </section>

        {/* Six hero features */}
        <section className="border-t border-line bg-surface-1/40">
          <div className="mx-auto max-w-[1120px] px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
            <div className="max-w-2xl">
              <div className="t-overline">What Nazar does</div>
              <h2 className="t-title-1 mt-2 text-text">Six things a busy investor actually needs</h2>
              <p className="mt-3 text-muted">You don&apos;t have time to track results, news and market swings for 15 stocks, plus your parents&apos; portfolio. Nazar does, and stays quiet unless it matters.</p>
            </div>
            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Feature n="1" icon={<BellRing className="h-5 w-5" />} title="Alerts that explain why" body="Not just “Tata Motors fell 7%”, but the likely reason (whole market, sector or the company) and your ₹ impact.">
                <MiniAlert />
              </Feature>
              <Feature n="2" icon={<TrendingDown className="h-5 w-5" />} title="Why did I move today?" body="One line on Home: how much you're up or down and which holdings did it. Tap for the full breakdown.">
                <p className="rounded-[12px] bg-surface-2 p-3 text-[13px] leading-5 text-text">
                  You&apos;re down <b className="num">₹8,012</b> today. <b className="num">₹6,240</b> of that came from Tata Motors and Infosys.
                </p>
              </Feature>
              <Feature n="3" icon={<Sparkles className="h-5 w-5" />} title="Hidden-risk checks" body="A stress test for a Nifty fall, the stocks that secretly move together, and concentration by stock and sector.">
                <div className="rounded-[12px] bg-surface-2 p-3 text-[13px]">
                  <div className="flex justify-between text-muted">
                    <span>If the Nifty fell 20%</span>
                    <span className="num font-medium text-loss">−₹3.9 L</span>
                  </div>
                  <div className="mt-2 h-1.5 rounded-full bg-surface-3">
                    <div className="h-full w-[62%] rounded-full bg-accent" />
                  </div>
                  <p className="mt-2 text-muted">14 stocks, but they behave like 6 independent bets.</p>
                </div>
              </Feature>
              <Feature n="4" icon={<FileBarChart2 className="h-5 w-5" />} title="Results, explained" body="When a company you own reports, see what improved and what got worse, in plain words.">
                <ul className="space-y-1.5 rounded-[12px] bg-surface-2 p-3 text-[13px]">
                  <li className="text-gain">▲ Revenue grew 3.9% from last quarter</li>
                  <li className="text-loss">▼ Profit margin narrowed to 15.6%</li>
                </ul>
              </Feature>
              <Feature n="5" icon={<Sparkles className="h-5 w-5" />} title="Alerts that learn" body="Rate alerts 👍 or 👎. Nazar raises the bar for the kinds you don't find useful, tells you, and lets you undo it.">
                <p className="rounded-[12px] bg-surface-2 p-3 text-[13px] leading-5 text-text">“You found small-move alerts less useful, so I&apos;ll only alert you for moves above 5%.”</p>
              </Feature>
              <Feature n="6" icon={<Languages className="h-5 w-5" />} title="Family portfolios, in Hindi" body="Track Papa's portfolio separately. His weekly report and major alerts reach him by email in simple Hindi.">
                <p lang="hi" className="hi rounded-[12px] bg-surface-2 p-3 text-[13px] text-text">इस हफ़्ते आपका पोर्टफोलियो 1.8% बढ़ा; निफ्टी 1.1% बढ़ा।</p>
              </Feature>
            </div>
          </div>
        </section>

        {/* Demo */}
        <section className="mx-auto max-w-[1120px] px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
          <Card className="grid items-center gap-8 p-6 sm:p-10 lg:grid-cols-[1fr_auto]">
            <div className="flex items-start gap-4">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-[14px] bg-accent-soft text-accent">
                <CloudLightning className="h-6 w-6" />
              </span>
              <div>
                <h2 className="t-title-1 text-text">See it on a bad day</h2>
                <p className="mt-2 max-w-xl text-muted">Open the demo: a real 14-stock portfolio plus a parent&apos;s Hindi portfolio, 60 days of history, and a button that simulates a market fall so you can watch real alerts arrive. A short tour shows you around.</p>
              </div>
            </div>
            <DemoButton label="Open the demo" />
          </Card>
          <div className="mt-12 grid gap-6 text-sm sm:grid-cols-3">
            <Step n="1" title="Add your holdings" body="Import the holdings file from Zerodha, Groww or Upstox, or add stocks by hand. Names map to NSE tickers automatically." />
            <Step n="2" title="Nazar checks every evening" body="After the market closes, Nazar fetches prices, results and news for your stocks once, and runs its checks." />
            <Step n="3" title="You hear only what matters" body="An alert in the app and one calm email digest, with the reason and your ₹ impact. Quiet days stay quiet." />
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-[1120px] flex-col gap-4 px-4 py-8 text-[13px] text-subtle sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <div className="flex items-center gap-2">
            <NazarMark size={20} /> Nazar · a portfolio project by Saksham Malhotra
          </div>
          <p className="max-w-2xl">We watch and explain; you decide. Nazar is not a SEBI-registered investment adviser and never tells you to buy, sell or hold. Market data from Yahoo Finance may be delayed.</p>
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

function Feature({ n, icon, title, body, children }: { n: string; icon: React.ReactNode; title: string; body: string; children: React.ReactNode }) {
  return (
    <Card className="flex flex-col p-5">
      <div className="flex items-center gap-3">
        <span className="grid h-9 w-9 place-items-center rounded-[11px] bg-accent-soft text-accent">{icon}</span>
        <span className="t-overline">H{n}</span>
      </div>
      <h3 className="t-title-2 mt-4 text-text">{title}</h3>
      <p className="mt-1.5 flex-1 text-sm leading-6 text-muted">{body}</p>
      <div className="mt-4">{children}</div>
    </Card>
  );
}

function Step({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <div>
      <div className="num grid h-8 w-8 place-items-center rounded-full border border-line-strong text-[13px] font-semibold text-text">{n}</div>
      <h3 className="mt-3 font-medium text-text">{title}</h3>
      <p className="mt-1 leading-6 text-muted">{body}</p>
    </div>
  );
}

function MiniAlert() {
  return (
    <div className="rounded-[12px] bg-surface-2 p-3 text-[13px]">
      <div className="flex items-center gap-2 font-medium text-text">
        <SeverityIcon severity="critical" size={12} /> Tata Motors fell 7.0%
      </div>
      <p className="mt-1 leading-5 text-muted">Likely reason: something specific to Tata Motors. It is 22% of your portfolio; its value fell ~₹8,400 today.</p>
    </div>
  );
}

function HeroVisual() {
  return (
    <div className="relative mx-auto w-full max-w-md">
      <Card className="p-6">
        <div className="t-overline">My portfolio · as of today&apos;s close</div>
        <div className="t-display num mt-2 text-text">₹18,64,210</div>
        <div className="num mt-1 text-[15px] font-medium text-loss">▼ −₹8,012 (−0.4%) today</div>
        <div className="mt-5 flex items-center gap-5">
          <RingGauge outer={78} inner={54} size={116} label="health" />
          <div className="space-y-3 text-sm">
            <div className="flex items-center gap-2 text-muted">
              <span className="h-2.5 w-2.5 rounded-full bg-accent" /> Health 78
            </div>
            <div className="flex items-center gap-2 text-muted">
              <span className="h-2.5 w-2.5 rounded-full bg-ice" /> Diversification 54
            </div>
            <div className="flex items-center gap-2 text-muted">
              <span className="relative inline-grid h-3 w-3 place-items-center">
                <span className="nz-breathe absolute inset-0 rounded-full border border-accent" />
              </span>
              Watching 14 stocks
            </div>
          </div>
        </div>
      </Card>
      <Card className="relative -mt-6 ml-6 p-4 shadow-[var(--shadow-pop)] sm:ml-10">
        <div className="flex items-center gap-2 text-sm font-medium text-text">
          <SeverityIcon severity="important" size={13} /> Infosys reported Apr–Jun results
        </div>
        <p className="mt-1 text-[13px] leading-5 text-muted">Revenue grew 3.9% from last quarter. Earnings per share came in 0.3% above what analysts expected.</p>
      </Card>
    </div>
  );
}
