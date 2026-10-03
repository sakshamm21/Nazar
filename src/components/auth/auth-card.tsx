import Link from "next/link";
import type { ReactNode } from "react";
import { Wordmark } from "@/components/rings/nazar-mark";
import { Card } from "@/components/ui/card";

/** `accent`: the word of the title set in the italic serif. */
export function AuthCard({ title, accent, subtitle, children, footer }: { title: string; accent?: string; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  const [before, after] = accent && title.includes(accent) ? title.split(accent) : [title, ""];
  return (
    <div className="nz-aura flex min-h-dvh flex-col items-center overflow-hidden px-4 py-8 sm:justify-center">
      <Link href="/" className="mb-8" aria-label="Nazar home">
        <Wordmark />
      </Link>
      <Card className="w-full max-w-[440px] p-6 sm:p-8">
        <h1 className="t-title-1 text-text">
          {before}
          {accent && after !== undefined && title.includes(accent) && <span className="t-accent nz-grad">{accent}</span>}
          {after}
        </h1>
        {subtitle && <p className="mt-1.5 text-[15px] text-muted">{subtitle}</p>}
        <div className="mt-6">{children}</div>
      </Card>
      {footer && <div className="mt-6 text-center text-sm text-muted">{footer}</div>}
      <p className="mt-8 max-w-[420px] text-center text-[12px] leading-5 text-subtle">We watch and explain; you decide. Nazar is not a SEBI-registered investment adviser and never tells you what to do with your money.</p>
    </div>
  );
}

export const linkClass = "font-medium text-accent hover:underline underline-offset-4";
