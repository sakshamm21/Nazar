"use client";
import { useEffect, useRef, useState } from "react";

/**
 * Odometer-style number: each digit rolls into place (~400ms) when the value changes, and rolls
 * up from zero on first render. Static when the user prefers reduced motion.
 */
export function AnimatedNumber({ value, format, className }: { value: number; format: (n: number) => string; className?: string }) {
  const text = format(value);
  const [shown, setShown] = useState(() => text.replace(/\d/g, "0"));
  const first = useRef(true);
  useEffect(() => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setShown(text);
      return;
    }
    const t = setTimeout(() => setShown(text), first.current ? 60 : 0);
    first.current = false;
    return () => clearTimeout(t);
  }, [text]);
  // Keep the digit slots aligned with the final text (lengths can differ between values).
  const display = shown.length === text.length ? shown : text;
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
