import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export const inputClass = "h-11 w-full rounded-[14px] border border-line bg-surface-2 px-3.5 text-[15px] text-text placeholder:text-subtle outline-none transition-colors focus:border-accent";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(inputClass, className)} {...props} />;
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(inputClass, "pr-8", className)} {...props}>
      {children}
    </select>
  );
}

export function Field({ label, htmlFor, hint, children, error }: { label: ReactNode; htmlFor?: string; hint?: ReactNode; children: ReactNode; error?: string | null }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-[13px] font-medium text-muted">
        {label}
      </label>
      {children}
      {error ? (
        <p className="text-[13px] text-loss" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="t-caption">{hint}</p>
      ) : null}
    </div>
  );
}

export function FormAlert({ message, tone = "loss" }: { message: string | null | undefined; tone?: "loss" | "accent" | "warn" }) {
  if (!message) return null;
  const c = tone === "loss" ? "bg-loss-soft text-loss" : tone === "warn" ? "bg-warn-soft text-warn" : "bg-accent-soft text-accent";
  return (
    <div role="alert" className={cn("rounded-[12px] px-3.5 py-2.5 text-sm", c)}>
      {message}
    </div>
  );
}
