import Link from "next/link";
import type { ReactNode } from "react";
import { Wordmark } from "@/components/rings/nazar-mark";
import { Card } from "@/components/ui/card";

/** `accent`: the word of the title set in the italic serif. */
export function AuthCard({ title, accent, subtitle, children, footer }: { title: string; accent?: string; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  const at = accent ? title.lastIndexOf(accent) : -1;
  const [before, after] = at >= 0 ? [title.slice(0, at), title.slice(at + accent!.length)] : [title, ""];
  return (
    <div className="nz-aura flex min-h-dvh flex-col items-center overflow-hidden px-4 py-8 sm:justify-center">
      <Link href="/" className="mb-8" aria-label="Nazar home">
        <Wordmark size={34} />
      </Link>
      <Card className="w-full max-w-[400px] p-6 sm:p-8">
        <h1 className="t-title-1 text-text">
          {before}
          {at >= 0 && <span className="t-accent nz-grad">{accent}</span>}
          {after}
        </h1>
        {subtitle && <p className="mt-1.5 text-[15px] text-muted">{subtitle}</p>}
        <div className="mt-6">{children}</div>
      </Card>
      {footer && <div className="mt-6 text-center text-sm text-muted">{footer}</div>}
      <p className="mt-6 max-w-[380px] text-center text-[12px] leading-5 text-subtle">Nazar explains; you decide. Not investment advice.</p>
    </div>
  );
}

export const linkClass = "font-medium text-accent hover:underline underline-offset-4";
