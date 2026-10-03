"use client";
import { motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useId, useTransition } from "react";
import { cn } from "@/lib/cn";

export const selectPortfolio = (id: string) => {
  document.cookie = `nazar_pf=${id}; Path=/; Max-Age=${60 * 60 * 24 * 180}; SameSite=Lax`;
};

/** Switch between your portfolios; the choice is remembered. Hidden when there is only one. */
export function PortfolioTabs({ portfolios, activeId }: { portfolios: { id: string; name: string }[]; activeId: string | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const group = useId();
  if (portfolios.length < 2) return null;
  return (
    <div role="tablist" aria-label="Portfolios" className={cn("-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 transition-opacity", pending && "opacity-60")}>
      {portfolios.map((p) => {
        const on = p.id === activeId;
        return (
          <button
            key={p.id}
            role="tab"
            aria-selected={on}
            onClick={() => {
              selectPortfolio(p.id);
              start(() => router.refresh());
            }}
            className={cn("relative shrink-0 rounded-[12px] px-3.5 py-2 text-sm font-medium transition-colors", on ? "text-accent" : "text-muted hover:text-text")}
          >
            {on && <motion.span layoutId={`pf-${group}`} className="absolute inset-0 rounded-[12px] bg-accent-soft" transition={{ type: "spring", stiffness: 420, damping: 34 }} />}
            <span className="relative">{p.name}</span>
          </button>
        );
      })}
    </div>
  );
}
