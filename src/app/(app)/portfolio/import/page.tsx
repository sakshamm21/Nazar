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
  { broker: "Mutual funds (CAMS / KFintech)", steps: "On camsonline.com choose Statements → CAS (CAMS + KFintech), pick “Detailed” and “With zero balance folios: No”, and set a password. The PDF arrives by email in a few minutes; upload it here with that password." },
  { broker: "Any other app", steps: "Export or build a sheet with the name (or ISIN), the units, and either the average price or the amount invested." },
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
        <p className="mt-1 text-sm text-muted">Nazar detects the file, maps every row to the right stock, ETF or mutual fund (by ISIN first, so renames like Zomato → Eternal just work) and flags anything it can&apos;t match.</p>
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
