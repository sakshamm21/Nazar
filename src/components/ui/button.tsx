import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";
import { IrisLoader } from "@/components/rings/iris";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const base = "inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-[background-color,filter,color] duration-150 ease-[var(--ease-calm)] disabled:pointer-events-none disabled:opacity-50 select-none";
const variants: Record<Variant, string> = {
  primary: "bg-accent text-accent-ink shadow-[0_8px_24px_-10px_var(--accent)] hover:brightness-110 active:brightness-95 active:scale-[0.98]",
  secondary: "border border-line bg-surface-2 text-text hover:bg-surface-3",
  ghost: "text-muted hover:bg-surface-2 hover:text-text",
  danger: "border border-line bg-surface-2 text-loss hover:bg-loss-soft",
};
const sizes: Record<Size, string> = { sm: "h-9 px-3.5 text-sm", md: "h-11 px-5 text-[15px]", lg: "h-12 px-6 text-base" };

export const buttonClass = (variant: Variant = "primary", size: Size = "md", className?: string) => cn(base, variants[variant], sizes[size], className);

export function Button({ variant = "primary", size = "md", loading, className, children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; loading?: boolean }) {
  return (
    <button className={buttonClass(variant, size, className)} disabled={loading || props.disabled} aria-busy={loading || undefined} {...props}>
      {loading ? <IrisLoader size={18} /> : null}
      {children}
    </button>
  );
}

export function ButtonLink({ href, variant = "primary", size = "md", className, children, ...rest }: { href: string; variant?: Variant; size?: Size; className?: string; children: ReactNode; prefetch?: boolean; "data-tour"?: string }) {
  return (
    <Link href={href} className={buttonClass(variant, size, className)} {...rest}>
      {children}
    </Link>
  );
}
