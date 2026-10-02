"use client";
import { AnimatedNumber } from "@/components/ui/animated-number";
import { inr } from "@/lib/format";

/** The hero number: portfolio value with a short odometer roll on change (DESIGN.md §3, §7). */
export function HeroValue({ value }: { value: number }) {
  return <AnimatedNumber value={Math.round(value)} format={(n) => inr(n)} className="t-display text-text" />;
}
