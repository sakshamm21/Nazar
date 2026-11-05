"use client";
import { Download } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { selectPortfolio } from "@/components/portfolio/portfolio-tabs";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Field, Select } from "@/components/ui/field";
import { apiCall } from "@/lib/api-client";
import { downloadSheets, type Sheet } from "@/lib/excel-sheets";

type Rows = Record<string, Record<string, string | number | boolean | null>[]>;

const SHEETS: { key: string; name: string; columns: [field: string, header: string, format?: Sheet["columns"][number]["format"]][] }[] = [
  { key: "holdings", name: "Holdings", columns: [["portfolio", "Portfolio"], ["name", "Holding"], ["symbol", "Symbol"], ["kind", "Kind"], ["units", "Units", "num"], ["avgPrice", "Average price (₹)", "num"], ["firstBought", "First bought", "date"], ["value", "Value entered (₹)", "inr"], ["source", "Added from"]] },
  { key: "purchases", name: "Purchases", columns: [["portfolio", "Portfolio"], ["name", "Holding"], ["date", "Date", "date"], ["units", "Units", "num"], ["price", "Price (₹)", "num"], ["stillHeld", "Still held", "num"], ["sip", "SIP"]] },
  { key: "sales", name: "Sales", columns: [["portfolio", "Portfolio"], ["name", "Holding"], ["date", "Date", "date"], ["units", "Units", "num"], ["price", "Price (₹)", "num"], ["cost", "Cost (₹)", "inr"], ["gain", "Gain (₹)", "inr"]] },
  { key: "income", name: "Income", columns: [["portfolio", "Portfolio"], ["name", "Holding"], ["date", "Date", "date"], ["kind", "Kind"], ["amount", "Amount (₹)", "inr"]] },
  { key: "sips", name: "SIPs", columns: [["portfolio", "Portfolio"], ["name", "Holding"], ["amount", "Monthly (₹)", "inr"], ["day", "Day"], ["started", "Started", "date"], ["ends", "Ends", "date"], ["active", "Active"], ["nextDue", "Next due", "date"]] },
  { key: "goals", name: "Goals", columns: [["name", "Goal"], ["target", "Target (₹)", "inr"], ["byDate", "By", "date"], ["saved", "Saved (₹)", "inr"], ["savedAsOf", "Saved as of", "date"], ["monthly", "Monthly (₹)", "inr"]] },
  { key: "watching", name: "Watching", columns: [["name", "Name"], ["symbol", "Symbol"]] },
];

/** Which portfolio the app opens on, and a copy of everything entered, to keep. */
export function DataCard({ portfolios, opensOn }: { portfolios: { id: string; name: string }[]; opensOn: string }) {
  const [value, setValue] = useState(opensOn);
  const [busy, setBusy] = useState(false);
  return (
    <Card className="p-5 sm:p-6">
      <CardHeader overline="Your data" title="Where Nazar opens, and a copy to keep" />
      {portfolios.length > 1 && (
        <div className="mt-3 max-w-xs">
          <Field label="Open the app on" htmlFor="opens-on">
            <Select
              id="opens-on"
              value={value}
              onChange={async (e) => {
                setValue(e.target.value);
                selectPortfolio(e.target.value);
                await apiCall("/api/settings", "PATCH", { prefs: { defaultPortfolio: e.target.value } }).catch(() => null);
                toast("Saved");
              }}
            >
              <option value="all">All portfolios</option>
              {portfolios.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      )}
      <p className="mt-3 text-[13px] leading-5 text-muted">One Excel workbook with your holdings, every purchase and sale, income, SIPs, goals and Watching list.</p>
      <Button
        className="mt-3"
        variant="secondary"
        loading={busy}
        onClick={async () => {
          setBusy(true);
          try {
            const rows = await apiCall<Rows>("/api/account/export", "GET");
            await downloadSheets(`Nazar data ${new Date().toISOString().slice(0, 10)}.xlsx`, SHEETS.map((s) => ({ name: s.name, title: s.name, columns: s.columns.map(([, header, format]) => ({ header, format })), rows: (rows[s.key] ?? []).map((r) => s.columns.map(([f]) => (typeof r[f] === "boolean" ? (r[f] ? "yes" : "no") : (r[f] as string | number | null)))) })));
          } catch (e) {
            toast.error((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Download className="h-4 w-4" /> Download my data
      </Button>
    </Card>
  );
}
