"use client";
import { AnimatedNumber } from "@/components/ui/animated-number";
import { inr } from "@/lib/format";

/** The headline number: the portfolio's value, rolling to its new figure when it changes. */
export function HomeValue({ value }: { value: number }) {
  return <AnimatedNumber value={Math.round(value)} format={(n) => inr(n)} className="t-display text-text" />;
}
