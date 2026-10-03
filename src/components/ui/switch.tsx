"use client";
import { cn } from "@/lib/cn";

export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn("relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors duration-200", checked ? "border-transparent bg-accent" : "border-line bg-surface-3", disabled && "opacity-50")}
    >
      <span className={cn("inline-block h-5 w-5 rounded-full shadow transition-transform duration-200 ease-[var(--ease-calm)]", checked ? "translate-x-6 bg-surface-1" : "translate-x-1 bg-muted")} />
    </button>
  );
}

export function Segmented<T extends string>({ value, onChange, options, label, size = "md" }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; label: string; size?: "sm" | "md" }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex flex-wrap rounded-[14px] border border-line bg-surface-2 p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn("rounded-[10px] font-medium transition-colors duration-150", size === "sm" ? "px-2.5 py-1 text-xs" : "px-3.5 py-1.5 text-sm", value === o.value ? "bg-surface-1 text-text shadow-[var(--shadow-card)]" : "text-muted hover:text-text")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
