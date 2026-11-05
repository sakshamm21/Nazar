"use client";
import { Download } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { downloadSheets } from "@/lib/excel-sheets";

export type TaxRow = { sold: string; name: string; rules: string; bought: string; units: number; cost: number; proceeds: number; gain: number; term: string; days: number };

/** The year's sales as one Excel sheet, a line per purchase each sale came out of. */
export function TaxYearDownload({ fy, rows }: { fy: string; rows: TaxRow[] }) {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="secondary"
      size="sm"
      loading={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await downloadSheets(`Nazar capital gains FY ${fy}.xlsx`, [
            {
              name: `FY ${fy}`,
              title: `Capital gains, FY ${fy}`,
              columns: [
                { header: "Sold on", format: "date", width: 12 },
                { header: "Holding", width: 32 },
                { header: "Rules", width: 26 },
                { header: "Bought on", format: "date", width: 12 },
                { header: "Units", format: "num" },
                { header: "Cost (₹)", format: "inr" },
                { header: "Sale value (₹)", format: "inr", width: 15 },
                { header: "Gain (₹)", format: "inr" },
                { header: "Term", width: 14 },
                { header: "Days held", format: "num" },
              ],
              rows: rows.map((r) => [r.sold, r.name, r.rules, r.bought || null, r.units, Math.round(r.cost), Math.round(r.proceeds), Math.round(r.gain), r.term, r.days]),
            },
          ]);
        } finally {
          setBusy(false);
        }
      }}
    >
      <Download className="h-4 w-4" /> Excel
    </Button>
  );
}
