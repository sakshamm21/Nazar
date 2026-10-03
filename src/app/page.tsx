import { BellRing, LineChart, ShieldCheck, Sparkles } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ThemeToggle } from "@/components/shell/theme-toggle";
import { NazarMark, Wordmark } from "@/components/rings/nazar-mark";
import { buttonClass } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SeverityIcon } from "@/components/ui/severity";
import { DemoButton } from "@/components/auth/demo-button";
import { currentUser } from "@/lib/current-user";
import { TEST_ACCOUNTS, TEST_PASSWORD } from "@/lib/demo/config";

const showDemo = process.env.NEXT_PUBLIC_SHOW_DEMO_ACCOUNTS !== "false";

export const metadata: Metadata = { title: "Nazar · Your portfolio, watched" };
export const dynamic = "force-dynamic";

export default async function Landing() {
  if (await currentUser()) redirect("/home");
  const demo = { email: TEST_ACCOUNTS[0].email, password: TEST_PASSWORD };
  return (
    <div className="nz-aura min-h-dvh overflow-x-hidden">
      <header className="mx-auto flex max-w-[1120px] items-center justify-between px-4 py-5 sm:px-6 lg:px-8">
        <Wordmark size={30} />
        <nav className="flex items-center gap-1.5 sm:gap-2">
          <ThemeToggle />
          <Link href="/signin" className={buttonClass("secondary", "sm")}>
            Sign in
          </Link>
        </nav>
      </header>

      <main>
        <section className="mx-auto grid max-w-[1120px] items-center gap-10 px-4 pb-16 pt-6 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:px-8 lg:pb-24 lg:pt-14">
          <div>
            <h1 className="font-[family-name:var(--font-display)] text-[42px] font-semibold leading-[1.04] tracking-[-0.03em] text-text sm:text-[64px]">
              Your money,
              <br />
              <span className="t-accent nz-grad pr-2">watched.</span>
            </h1>
            <p className="mt-6 max-w-md text-[17px] leading-7 text-muted">Stocks, funds, gold, crypto, FDs. One place that shows what moved, tells you why, and stays quiet when nothing did.</p>
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

        <section className="mx-auto max-w-[1120px] px-4 pb-16 sm:px-6 lg:px-8 lg:pb-24">
          <div className="grid gap-4 sm:grid-cols-3">
            <Feature icon={<LineChart className="h-5 w-5" />} title="See it move" body="Everything you own on one chart you can drag through, by day, month or year." />
            <Feature icon={<Sparkles className="h-5 w-5" />} title="Know why" body="Which holdings did it, and how much was just the market. In plain words." />
            <Feature icon={<BellRing className="h-5 w-5" />} title="Hear only what matters" body="Alerts for the big moves and results, with the reason and your ₹ impact." />
          </div>
          <div className="mt-14 grid gap-6 text-sm sm:grid-cols-3">
            <Step n="1" title="Add what you own" body="Search it, or import a broker file. Takes a minute." />
            <Step n="2" title="Prices keep themselves fresh" body="Every time you open the app, and every evening after the market closes." />
            <Step n="3" title="Ask anything" body="Ask about your own portfolio and get an answer built on live data." />
          </div>
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

function Feature({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <Card className="p-5 transition-transform duration-200 hover:-translate-y-0.5">
      <span className="grid h-10 w-10 place-items-center rounded-[12px] bg-accent-soft text-accent">{icon}</span>
      <h3 className="t-title-2 mt-4 text-text">{title}</h3>
      <p className="mt-1.5 text-sm leading-6 text-muted">{body}</p>
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

function HeroVisual() {
  const line = "M0,74 C30,70 44,52 70,56 S112,78 138,60 178,30 206,36 250,58 276,34 320,14 340,10";
  return (
    <div className="relative mx-auto w-full max-w-md">
      <Card className="nz-ring p-6">
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
          <path d={line} fill="none" stroke="var(--gain)" strokeWidth="2.5" strokeLinecap="round" />
          <circle cx="340" cy="10" r="4.5" fill="var(--gain)" stroke="var(--surface-1)" strokeWidth="3" />
        </svg>
        <div className="mt-3 flex gap-1">
          {["1W", "1M", "3M", "1Y"].map((r) => (
            <span key={r} className={`num rounded-full px-3 py-1 text-[12px] font-semibold ${r === "3M" ? "bg-accent-soft text-accent" : "text-muted"}`}>{r}</span>
          ))}
        </div>
      </Card>
      <Card className="relative -mt-5 ml-6 p-4 shadow-[var(--shadow-pop)] sm:ml-10">
        <div className="flex items-center gap-2 text-sm font-medium text-text">
          <SeverityIcon severity="important" size={13} /> Why you&apos;re up this month
        </div>
        <p className="mt-1 text-[13px] leading-5 text-muted">HDFC Bank and gold added the most. About half of it is simply the market rising.</p>
      </Card>
    </div>
  );
}
