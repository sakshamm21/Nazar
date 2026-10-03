"use client";
import { Home, LineChart, LogOut, MessageCircle, UserRound, Wallet } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Wordmark } from "@/components/rings/nazar-mark";
import { Avatar } from "@/components/ui/avatar";
import { apiCall } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import { ThemeToggle } from "./theme-toggle";

const NAV = [
  { href: "/home", label: "Home", hint: "Today at a glance", icon: Home },
  { href: "/portfolio", label: "Portfolio", hint: "Charts and holdings", icon: Wallet },
  { href: "/analysis", label: "Analysis", hint: "What moved, and why", icon: LineChart },
  { href: "/ask", label: "Ask", hint: "Questions, answered", icon: MessageCircle },
];
const MOBILE = [...NAV, { href: "/settings", label: "You", hint: "", icon: UserRound }];

export type ShellUser = { name: string; email: string; isTestAccount: boolean };

/** Mobile: bottom tab bar. Desktop: sidebar with the account, theme and sign-out always in view. */
export function AppShell({ user, children }: { user: ShellUser; children: ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const [leaving, setLeaving] = useState(false);
  const active = (href: string) => path === href || path.startsWith(`${href}/`) || (href === "/portfolio" && path.startsWith("/stock")) || (href === "/analysis" && path.startsWith("/risk"));
  const signOut = async () => {
    setLeaving(true);
    await apiCall("/api/auth/logout", "POST").catch(() => null);
    router.push("/");
    router.refresh();
  };
  return (
    <div className="min-h-dvh lg:flex">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-surface-1 focus:px-3 focus:py-2">
        Skip to content
      </a>
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh w-[248px] shrink-0 flex-col border-r border-line bg-surface-1/50 px-3 py-5 lg:flex">
        <Link href="/home" className="px-3" aria-label="Nazar home">
          <Wordmark />
        </Link>
        <nav className="mt-8 space-y-1" aria-label="Main">
          {NAV.map(({ href, label, hint, icon: Icon }) => {
            const on = active(href);
            return (
              <Link key={href} href={href} aria-current={on ? "page" : undefined} className={cn("group relative flex items-center gap-3 rounded-[14px] px-3 py-2.5 transition-colors", on ? "text-text" : "text-muted hover:text-text")}>
                {on && <motion.span layoutId="nav-active" className="absolute inset-0 rounded-[14px] border border-line bg-surface-2 shadow-[var(--shadow-card)]" transition={{ type: "spring", stiffness: 420, damping: 36 }} />}
                <span className={cn("relative grid h-9 w-9 shrink-0 place-items-center rounded-[11px] transition-colors", on ? "bg-accent text-accent-ink" : "bg-surface-2 text-muted group-hover:text-text")}>
                  <Icon className="h-[18px] w-[18px]" />
                </span>
                <span className="relative min-w-0">
                  <span className="block text-[15px] font-medium leading-5">{label}</span>
                  <span className="block truncate text-[12px] leading-4 text-subtle">{hint}</span>
                </span>
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto rounded-[18px] border border-line bg-surface-1 p-2">
          <Link href="/settings" aria-current={active("/settings") ? "page" : undefined} className={cn("flex items-center gap-2.5 rounded-[12px] p-2 transition-colors hover:bg-surface-2", active("/settings") && "bg-surface-2")}>
            <Avatar name={user.name} size={38} />
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium text-text">{user.name}</span>
              <span className="block truncate text-[12px] text-subtle">{user.isTestAccount ? "Demo account" : user.email}</span>
            </span>
          </Link>
          <div className="mt-1.5 flex items-center gap-1.5 border-t border-line pt-2">
            <button onClick={signOut} disabled={leaving} className="flex h-9 flex-1 items-center justify-center gap-2 rounded-[10px] text-[13px] font-medium text-muted transition-colors hover:bg-loss-soft hover:text-loss disabled:opacity-60">
              <LogOut className="h-4 w-4" /> Sign out
            </button>
            <ThemeToggle />
          </div>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        {/* Mobile top bar */}
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-bg/90 px-4 py-3 backdrop-blur lg:hidden">
          <Link href="/home" aria-label="Nazar home">
            <Wordmark size={26} />
          </Link>
          <span className="flex items-center gap-1">
            <button onClick={signOut} disabled={leaving} aria-label="Sign out" className="grid h-9 w-9 place-items-center rounded-[10px] text-muted hover:bg-surface-2 hover:text-text">
              <LogOut className="h-[18px] w-[18px]" />
            </button>
            <Link href="/settings" aria-label="Your profile">
              <Avatar name={user.name} size={32} />
            </Link>
          </span>
        </header>
        <main id="main" className="mx-auto w-full max-w-[1120px] px-4 pb-28 pt-5 sm:px-6 lg:px-8 lg:pb-12 lg:pt-8">
          {children}
          <footer className="mt-12 border-t border-line pt-5 text-[12px] leading-5 text-subtle">Nazar explains; you decide. It is not a SEBI-registered investment adviser, and prices can be delayed.</footer>
        </main>
      </div>

      {/* Mobile bottom tabs */}
      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
        <ul className="mx-auto grid max-w-md grid-cols-5">
          {MOBILE.map(({ href, label, icon: Icon }) => {
            const on = active(href);
            return (
              <li key={href}>
                <Link href={href} aria-current={on ? "page" : undefined} className={cn("relative flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium", on ? "text-accent" : "text-subtle")}>
                  {on && <motion.span layoutId="tab-active" className="absolute top-0 h-0.5 w-8 rounded-full bg-accent" transition={{ type: "spring", stiffness: 420, damping: 36 }} />}
                  <Icon className="h-[22px] w-[22px]" />
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
