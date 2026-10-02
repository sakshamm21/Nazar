import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Importer } from "@/components/portfolio/importer";
import { Card } from "@/components/ui/card";
import { requirePageUser, selectedPortfolioId } from "@/lib/current-user";
import { createPortfolio, listPortfolios } from "@/lib/repo/portfolios";

export const metadata: Metadata = { title: "Import holdings" };

const HOW = [
  { broker: "Zerodha", steps: "Console → Portfolio → Holdings → Download (XLSX). Or Kite → Holdings → Download CSV." },
  { broker: "Groww", steps: "Stocks → Holdings → ⋮ → Download holdings report (XLSX)." },
  { broker: "Upstox", steps: "Portfolio → Holdings → Download (CSV or XLSX)." },
];

export default async function ImportPage() {
  const user = await requirePageUser();
  let portfolios = await listPortfolios(user.id);
  if (!portfolios.length) {
    await createPortfolio(user.id, { name: "My portfolio" });
    portfolios = await listPortfolios(user.id);
  }
  if (!portfolios.length) redirect("/portfolio");
  const sel = await selectedPortfolioId();
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Link href="/portfolio" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-text">
        <ArrowLeft className="h-4 w-4" /> Portfolio
      </Link>
      <div>
        <h1 className="t-title-1 text-text">Import your holdings</h1>
        <p className="mt-1 text-sm text-muted">Nazar detects the broker, maps every row to its NSE ticker (by ISIN first, so renames like Zomato → Eternal just work) and flags anything it can&apos;t match.</p>
      </div>
      <Importer portfolios={portfolios.map((p) => ({ id: p.id, label: p.ownerLabel ? `${p.ownerLabel}'s portfolio` : p.name }))} defaultId={portfolios.find((p) => p.id === sel)?.id ?? portfolios[0].id} />
      <Card className="p-5 sm:p-6">
        <h2 className="t-title-2 text-text">Where to find the file</h2>
        <ul className="mt-3 space-y-3 text-sm">
          {HOW.map((h) => (
            <li key={h.broker}>
              <span className="font-medium text-text">{h.broker}:</span> <span className="text-muted">{h.steps}</span>
            </li>
          ))}
        </ul>
        <p className="t-caption mt-4">Your file is read once to build the preview and isn&apos;t stored. Only the holdings you confirm are saved.</p>
      </Card>
    </div>
  );
}
