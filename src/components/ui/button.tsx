import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";
import { IrisLoader } from "@/components/rings/iris";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const base = "inline-flex items-center justify-center gap-2 font-bold uppercase tracking-[0.06em] disabled:pointer-events-none disabled:opacity-50 select-none";
const variants: Record<Variant, string> = {
  primary: "nz-press bg-cta text-cta-ink shadow-[4px_4px_0_0_var(--cta-edge)]",
  secondary: "nz-press border border-line-strong bg-surface-1 text-text shadow-[4px_4px_0_0_var(--line-strong)]",
  ghost: "text-muted transition-colors hover:bg-surface-2 hover:text-text",
  danger: "nz-press border border-loss bg-surface-1 text-loss shadow-[4px_4px_0_0_var(--loss)]",
};
const sizes: Record<Size, string> = { sm: "h-9 px-3.5 text-[12px]", md: "h-11 px-5 text-[13px]", lg: "h-[52px] px-7 text-[14px]" };

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
