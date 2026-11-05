import Link from "next/link";
import type { ReactNode } from "react";
import { NazarMark, Wordmark } from "@/components/rings/nazar-mark";

/** The frame for the plain pages anyone can read without signing in: privacy, terms, contact. */
export function LegalPage({ title, updated, children }: { title: string; updated?: string; children: ReactNode }) {
  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-4 py-5 sm:px-6">
        <Link href="/" aria-label="Nazar home">
          <Wordmark size={26} />
        </Link>
      </header>
      <main className="mx-auto max-w-3xl px-4 pb-16 sm:px-6">
        <h1 className="t-title-1 text-text">{title}</h1>
        {updated && <p className="mt-1 text-sm text-subtle">Last updated {updated}</p>}
        <div className="prose-nazar mt-6 space-y-4 text-[15px] leading-7 text-muted [&_a]:font-medium [&_a]:text-accent [&_h2]:mt-8 [&_h2]:text-[17px] [&_h2]:font-semibold [&_h2]:text-text [&_li]:ml-5 [&_li]:list-disc [&_strong]:text-text">{children}</div>
      </main>
      <LegalFooter />
    </div>
  );
}

/** The links every public page carries. */
export function LegalFooter() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex max-w-[1120px] flex-wrap items-center gap-x-5 gap-y-2 px-4 py-6 text-[13px] text-subtle sm:px-6 lg:px-8">
        <span className="flex items-center gap-2">
          <NazarMark size={18} /> Nazar
        </span>
        <Link href="/privacy" className="hover:text-text">Privacy</Link>
        <Link href="/terms" className="hover:text-text">Terms</Link>
        <Link href="/contact" className="hover:text-text">Contact</Link>
        <span>Not a SEBI-registered investment adviser.</span>
      </div>
    </footer>
  );
}
