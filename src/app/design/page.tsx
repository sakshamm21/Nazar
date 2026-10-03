import type { Metadata } from "next";
import Link from "next/link";
import { StyleGuide } from "@/components/design/style-guide";
import { Wordmark } from "@/components/rings/nazar-mark";

export const metadata: Metadata = { title: "Design system" };

/** Live style guide: every token and component, dark and light side by side. */
export default function DesignPage() {
  return (
    <div>
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4 sm:px-8">
        <Link href="/" aria-label="Nazar home">
          <Wordmark />
        </Link>
        <p className="text-sm text-muted">Design system</p>
      </header>
      <StyleGuide />
    </div>
  );
}
