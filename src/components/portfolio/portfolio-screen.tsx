"use client";
import { BarChart3, SlidersHorizontal } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useRouter, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type Tab = "overview" | "manage";
const TABS = [
  { id: "overview" as const, label: "Overview", hint: "Charts and every detail", icon: BarChart3 },
  { id: "manage" as const, label: "Manage", hint: "Add, change or remove", icon: SlidersHorizontal },
];

/** Portfolio in two halves: Overview to read, Manage to change. The tab lives in the URL. */
export function PortfolioScreen({ overview, manage, switcher, startOnManage }: { overview: ReactNode; manage: ReactNode; switcher: ReactNode; startOnManage: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  const reduce = useReducedMotion();
  const asked = params.get("tab");
  const tab: Tab = asked === "manage" || asked === "overview" ? asked : startOnManage || params.get("add") ? "manage" : "overview";
  return (
    <div className="space-y-5 lg:space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="t-title-1 text-text">Portfolio</h1>
          <p className="mt-1 text-sm text-muted">{tab === "overview" ? "Everything you own, charted." : "Add what you own, change it, or start another portfolio."}</p>
        </div>
        <div role="tablist" aria-label="Portfolio view" className="relative flex rounded-[16px] border border-line bg-surface-1 p-1">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button key={id} role="tab" aria-selected={tab === id} onClick={() => router.replace(`/portfolio?tab=${id}`, { scroll: false })} className={cn("relative flex items-center gap-2 rounded-[12px] px-4 py-2 text-sm font-medium transition-colors", tab === id ? "text-accent-ink" : "text-muted hover:text-text")}>
              {tab === id && <motion.span layoutId="pf-tab" className="absolute inset-0 rounded-[12px] bg-accent" transition={{ type: "spring", stiffness: 420, damping: 34 }} />}
              <Icon className="relative h-4 w-4" />
              <span className="relative">{label}</span>
            </button>
          ))}
        </div>
      </div>
      {switcher}
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={tab} role="tabpanel" initial={reduce ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={reduce ? undefined : { opacity: 0, y: -6 }} transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}>
          {tab === "overview" ? overview : manage}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
