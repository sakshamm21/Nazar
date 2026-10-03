import Link from "next/link";
import type { ReactNode } from "react";
import { Wordmark } from "@/components/rings/nazar-mark";
import { Card } from "@/components/ui/card";

export function AuthCard({ title, subtitle, children, footer }: { title: string; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center px-4 py-8 sm:justify-center">
      <Link href="/" className="mb-8" aria-label="Nazar home">
        <Wordmark />
      </Link>
      <Card className="w-full max-w-[420px] p-6 sm:p-8">
        <h1 className="t-title-1 text-text">{title}</h1>
        {subtitle && <p className="mt-1.5 text-[15px] text-muted">{subtitle}</p>}
        <div className="mt-6">{children}</div>
      </Card>
      {footer && <div className="mt-6 text-center text-sm text-muted">{footer}</div>}
      <p className="mt-8 max-w-[420px] text-center text-[12px] leading-5 text-subtle">We watch and explain; you decide. Nazar is not a SEBI-registered investment adviser and never tells you what to do with your money.</p>
    </div>
  );
}

export const linkClass = "font-medium text-accent hover:underline underline-offset-4";
