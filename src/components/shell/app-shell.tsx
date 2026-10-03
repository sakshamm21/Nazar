"use client";
import { Bell, Home, MessageCircle, Settings2, Wallet } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Wordmark } from "@/components/rings/nazar-mark";
import { buttonClass } from "@/components/ui/button";
import { cn } from "@/lib/cn";

const NAV = [
  { href: "/home", label: "Home", icon: Home },
  { href: "/alerts", label: "Alerts", icon: Bell },
  { href: "/ask", label: "Ask", icon: MessageCircle },
  { href: "/portfolio", label: "Portfolio", icon: Wallet },
  { href: "/settings", label: "Settings", icon: Settings2 },
];

export type ShellUser = { name: string; isDemo: boolean; isTestAccount: boolean; demoExpiresAt: string | null; sim: { label: string } | null };

/** Mobile: bottom tab bar. Desktop: slim sidebar. */
export function AppShell({ user, unread, children }: { user: ShellUser; unread: number; children: ReactNode }) {
  const path = usePathname();
  const active = (href: string) => path === href || path.startsWith(`${href}/`) || (href === "/home" && (path.startsWith("/risk") || path.startsWith("/stock") || path.startsWith("/reports")));
  return (
    <div className="min-h-dvh lg:flex">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-surface-1 focus:px-3 focus:py-2">
        Skip to content
      </a>
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh w-[232px] shrink-0 flex-col border-r border-line bg-bg px-3 py-5 lg:flex">
        <Link href="/home" className="px-3" aria-label="Nazar home">
          <Wordmark />
        </Link>
        <nav className="mt-8 space-y-1" aria-label="Main">
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} aria-current={active(href) ? "page" : undefined} className={cn("flex items-center gap-3 rounded-[12px] px-3 py-2.5 text-[15px] font-medium transition-colors", active(href) ? "bg-accent-soft text-accent" : "text-muted hover:bg-surface-2 hover:text-text")}>
              <Icon className="h-[18px] w-[18px]" />
              {label}
              {href === "/alerts" && unread > 0 && <span className="num ml-auto rounded-full bg-accent px-1.5 text-[11px] font-semibold text-accent-ink">{unread > 99 ? "99+" : unread}</span>}
            </Link>
          ))}
        </nav>
        <div className="mt-auto px-3">
          <div className="t-caption truncate">{user.isDemo && !user.isTestAccount ? "Demo account" : user.name}</div>
          <Link href="/ask/research" className="mt-2 block text-[13px] text-muted hover:text-text">Research tools</Link>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        {user.sim && <SimBanner label={user.sim.label} />}
        {!user.sim && user.isDemo && !user.isTestAccount && <DemoRibbon />}
        {/* Mobile top bar */}
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-bg/90 px-4 py-3 backdrop-blur lg:hidden">
          <Link href="/home" aria-label="Nazar home">
            <Wordmark />
          </Link>
          <Link href="/ask/research" className="text-[13px] text-muted">Research</Link>
        </header>
        <main id="main" className="mx-auto w-full max-w-[1120px] px-4 pb-28 pt-5 sm:px-6 lg:px-8 lg:pb-12 lg:pt-8">
          {children}
          <footer className="mt-12 border-t border-line pt-5 text-[12px] leading-5 text-subtle">
            We watch and explain; you decide. Nazar is not a SEBI-registered investment adviser and never tells you what to do with your money. Market data comes from Yahoo Finance via nightly checks and may be delayed or occasionally wrong.
          </footer>
        </main>
      </div>

      {/* Mobile bottom tabs */}
      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
        <ul className="mx-auto grid max-w-md grid-cols-5">
          {NAV.map(({ href, label, icon: Icon }) => (
            <li key={href}>
              <Link href={href} aria-current={active(href) ? "page" : undefined} className={cn("relative flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium", active(href) ? "text-accent" : "text-subtle")}>
                <Icon className="h-[22px] w-[22px]" />
                {label}
                {href === "/alerts" && unread > 0 && <span className="absolute right-[calc(50%-20px)] top-1.5 h-2 w-2 rounded-full bg-accent" aria-label={`${unread} unread`} />}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}

function SimBanner({ label }: { label: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 border-b border-line bg-warn-soft px-4 py-2 text-center text-[13px] text-text" role="status">
      <span>
        <b className="font-semibold">Simulated bad day.</b> {label}
      </span>
      <button
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          await fetch("/api/demo/reset", { method: "POST" });
          toast("Back to normal. The simulated day and its alerts are gone.");
          router.refresh();
          setBusy(false);
        }}
        className={buttonClass("secondary", "sm", "h-8")}
      >
        Back to normal
      </button>
    </div>
  );
}

function DemoRibbon() {
  return (
    <div className="border-b border-line bg-surface-1 px-4 py-2 text-center text-[13px] text-muted">
      This is a private demo built from real NSE prices, with dates shifted to today. It resets in 24 hours.{" "}
      <Link href="/signup" className="font-medium text-accent">
        Create your own
      </Link>
    </div>
  );
}
