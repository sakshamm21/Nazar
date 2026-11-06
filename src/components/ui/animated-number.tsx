"use client";
import { useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";

/**
 * Odometer-style number: each digit rolls into place (~400ms) when the value changes, and rolls
 * up from zero on first render. Static when the user prefers reduced motion.
 */
export function AnimatedNumber({ value, format, className }: { value: number; format: (n: number) => string; className?: string }) {
  const text = format(value);
  // Only the first paint shows zeros, so the digits can roll up. After that the digits are always
  // drawn from the current value, never from a copy kept in state that could lag behind a refresh;
  // the CSS transition on each digit does the rolling when the value changes.
  const [rolledIn, setRolledIn] = useState(false);
  const reduce = useReducedMotion();
  useEffect(() => {
    const t = setTimeout(() => setRolledIn(true), 60);
    return () => clearTimeout(t);
  }, []);
  const display = reduce || rolledIn ? text : text.replace(/\d/g, "0");
  return (
    <span className={`num inline-flex ${className ?? ""}`}>
      <span className="sr-only">{text}</span>
      {display.split("").map((ch, i) =>
        /\d/.test(ch) ? (
          <span key={i} aria-hidden className="relative inline-block h-[1.08em] overflow-hidden" style={{ width: "0.64em" }}>
            <span className="absolute inset-x-0 top-0 flex flex-col transition-transform duration-[420ms] ease-[var(--ease-calm)]" style={{ transform: `translateY(-${Number(ch) * 10}%)`, transitionDelay: `${Math.min(i, 8) * 16}ms` }}>
              {Array.from({ length: 10 }, (_, d) => (
                <span key={d} className="block h-[1.08em] text-center leading-[1.08em]">
                  {d}
                </span>
              ))}
            </span>
          </span>
        ) : (
          <span key={i} aria-hidden className="leading-[1.08em]">
            {ch}
          </span>
        ),
      )}
    </span>
  );
}
