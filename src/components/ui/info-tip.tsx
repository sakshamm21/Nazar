"use client";
import { Info } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { GLOSSARY } from "@/lib/glossary";
import { cn } from "@/lib/cn";

/** "What does this mean?" — tap/click/focus for a plain-language explanation of a metric. */
export function InfoTip({ k, className }: { k: keyof typeof GLOSSARY; className?: string }) {
  const entry = GLOSSARY[k];
  const [open, setOpen] = useState(false);
  const id = useId();
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const k2 = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", h);
    document.addEventListener("keydown", k2);
    return () => {
      document.removeEventListener("mousedown", h);
      document.removeEventListener("keydown", k2);
    };
  }, [open]);
  if (!entry) return null;
  return (
    <span ref={ref} className={cn("relative inline-flex align-middle", className)}>
      <button type="button" aria-label={`What does ${entry.term} mean?`} aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)} className="rounded-none p-0.5 text-subtle hover:text-text">
        <Info className="h-3.5 w-3.5" />
      </button>
      {open && (
        <span id={id} role="tooltip" className="nz-enter absolute left-1/2 top-full z-40 mt-2 w-[min(18rem,80vw)] -translate-x-1/2 rounded-none border border-line bg-surface-1 p-3 text-left text-[13px] font-normal normal-case leading-5 tracking-normal text-muted shadow-[var(--shadow-pop)]">
          <span className="block font-medium text-text">{entry.term}</span>
          <span className="mt-1 block">{entry.plain}</span>
          {entry.example && <span className="mt-1.5 block text-subtle">{entry.example}</span>}
        </span>
      )}
    </span>
  );
}
