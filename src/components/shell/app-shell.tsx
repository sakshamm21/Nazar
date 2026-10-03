"use client";
import { Bell, Home, MessageCircle, UserRound, Wallet } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Wordmark } from "@/components/rings/nazar-mark";
import { Avatar } from "@/components/ui/avatar";
import { buttonClass } from "@/components/ui/button";
import { cn } from "@/lib/cn";

const NAV = [
  { href: "/home", label: "Home", icon: Home },
  { href: "/alerts", label: "Alerts", icon: Bell },
  { href: "/ask", label: "Ask", icon: MessageCircle },
  { href: "/portfolio", label: "Portfolio", icon: Wallet },
  { href: "/settings", label: "You", icon: UserRound },
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
            <Link key={href} href={href} aria-current={active(href) ? "page" : undefined} className={cn("flex items-center gap-3 rounded-full px-4 py-2.5 text-[15px] font-semibold transition-colors", active(href) ? "bg-surface-2 text-text" : "text-muted hover:bg-surface-2 hover:text-text")}>
              <Icon className={cn("h-[18px] w-[18px]", active(href) && "text-accent")} />
              {label}
              {href === "/alerts" && unread > 0 && <span className="num ml-auto rounded-full bg-cta px-1.5 text-[11px] font-semibold text-cta-ink">{unread > 99 ? "99+" : unread}</span>}
            </Link>
          ))}
        </nav>
        <div className="mt-auto space-y-2">
          <Link href="/settings" className="flex items-center gap-2.5 rounded-[18px] border border-line bg-surface-1 p-2.5 transition-colors hover:bg-surface-2">
            <Avatar name={user.name} size={36} />
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-text">{user.name}</span>
              <span className="block truncate text-[12px] text-subtle">{user.isTestAccount ? "Demo account" : "Profile and settings"}</span>
            </span>
          </Link>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        {user.sim && <SimBanner label={user.sim.label} />}
        {/* Mobile top bar */}
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-bg/90 px-4 py-3 backdrop-blur lg:hidden">
          <Link href="/home" aria-label="Nazar home">
            <Wordmark />
          </Link>
          <Link href="/settings" aria-label="Your profile">
            <Avatar name={user.name} size={32} />
          </Link>
        </header>
        <main id="main" className="mx-auto w-full max-w-[1120px] px-4 pb-28 pt-5 sm:px-6 lg:px-8 lg:pb-12 lg:pt-8">
          {children}
          <footer className="mt-12 border-t border-line pt-5 text-[12px] leading-5 text-subtle">
            Nazar explains; you decide. It is not a SEBI-registered investment adviser, and prices can be delayed.
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
                {href === "/alerts" && unread > 0 && <span className="absolute right-[calc(50%-20px)] top-1.5 h-2 w-2 rounded-full bg-cta" aria-label={`${unread} unread`} />}
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
