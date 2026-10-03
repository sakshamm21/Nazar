"use client";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { cn } from "@/lib/cn";
import { trackClient } from "@/lib/events-client";

/** Switch between your portfolios ("Mine" / "Papa's"); remembered in a cookie (H6). */
export function PortfolioSwitcher({ portfolios, activeId }: { portfolios: { id: string; name: string; ownerLabel: string | null; language: "en" | "hi" }[]; activeId: string | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  if (portfolios.length < 2) return null;
  return (
    <div role="tablist" aria-label="Portfolios" data-tour="h6" className={cn("-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1", pending && "opacity-70")}>
      {portfolios.map((p) => {
        const on = p.id === activeId;
        return (
          <button
            key={p.id}
            role="tab"
            aria-selected={on}
            onClick={() => {
              document.cookie = `nazar_pf=${p.id}; Path=/; Max-Age=${60 * 60 * 24 * 180}; SameSite=Lax`;
              trackClient("portfolio_switch", { family: Boolean(p.ownerLabel) });
              start(() => router.refresh());
            }}
            className={cn("flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors", on ? "border-transparent bg-text text-bg" : "border-line bg-surface-1 text-muted hover:text-text")}
          >
            {p.ownerLabel ? `${p.ownerLabel}'s` : p.name}
            {p.language === "hi" && <span className={cn("rounded-full px-1.5 text-[11px] leading-5", on ? "bg-bg/15" : "bg-surface-2")} lang="hi">हिं</span>}
          </button>
        );
      })}
    </div>
  );
}
