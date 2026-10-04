import { Receipt } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { Delta } from "@/components/ui/delta";
import { InfoTip } from "@/components/ui/info-tip";
import { inr, inrCompact } from "@/lib/format";
import { LTCG_EXEMPTION } from "@/lib/portfolio/capital-gains";
import type { Unrealised } from "@/lib/portfolio/capital-gains";

/**
 * The gains sitting in the portfolio, and the buckets a sale would fall into. Facts from the
 * statutory rates, never a suggestion about what to do with them: which bucket applies is decided by
 * the date units leave, and that is the user's call.
 */
export function CapitalGainsCard({ rows }: { rows: Unrealised[] }) {
  if (!rows.length) return null;

  const equity = rows.filter((r) => r.class === "equity");
  const other = rows.filter((r) => r.class !== "equity");
  const totalGain = rows.reduce((a, r) => a + r.gain, 0);
  const equityGain = equity.reduce((a, r) => a + r.gain, 0);
  const equityLong = equity.filter((r) => r.wouldBeLongTerm).reduce((a, r) => a + r.gain, 0);
  const equityShort = equityGain - equityLong;
  // The exemption sits on long-term equity gains only, and only once a year.
  const exempt = Math.min(Math.max(equityLong, 0), LTCG_EXEMPTION);
  const taxableLong = Math.max(equityLong - exempt, 0);
  const otherGain = other.reduce((a, r) => a + r.gain, 0);

  const equityShortTaxable = Math.max(equityShort, 0) * 0.2;
  const equityLongTaxable = taxableLong * 0.125;
  const otherTax = Math.max(otherGain, 0) * 0.125;
  const tax = equityShortTaxable + equityLongTaxable + otherTax;

  const bucket = (label: string, gain: number, rate: string, taxable: number) => (
    <div className="rounded-[12px] bg-surface-2 px-3 py-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[13px] text-muted">{label}</span>
        <span className="text-[11px] text-subtle">{rate}</span>
      </div>
      <div className="mt-0.5 flex items-baseline justify-between gap-2">
        <Delta amount={gain} size="sm" showArrow={false} />
        <span className="text-[13px] font-medium text-text">{taxable > 0 ? inr(Math.round(taxable)) : "—"}</span>
      </div>
      <div className="mt-0.5 text-[11px] text-subtle">{taxable > 0 ? "taxed" : "within the exemption"}</div>
    </div>
  );

  return (
    <Card className="p-5 sm:p-6">
      <CardHeader
        overline="At year end"
        title="What your gains would fall into"
        right={<InfoTip k="capital-gains" />}
      />
      <p className="mt-2 text-[15px] leading-6 text-muted">
        Nothing is taxable until units actually leave a holding, so these are the gains sitting in your portfolio today. If every holding were sold today, the
        buckets below are where they would fall.
      </p>

      <div className="mt-4 flex items-baseline gap-3">
        <Delta amount={totalGain} />
        <span className="text-sm text-muted">
          across {rows.length} priced {rows.length === 1 ? "holding" : "holdings"}
        </span>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {bucket("Equity, under a year", equityShort, "20%", equityShortTaxable)}
        {bucket("Equity, over a year", equityLong, "12.5% above " + inrCompact(LTCG_EXEMPTION), equityLongTaxable)}
        {bucket("Gold, property and the rest", otherGain, "12.5%", otherTax)}
      </div>

      <div className="mt-4 rounded-[12px] border border-line px-3.5 py-3">
        <div className="flex items-baseline justify-between gap-3">
          <span className="flex items-center gap-1.5 text-[13px] text-muted">
            <Receipt className="h-4 w-4 text-subtle" aria-hidden />
            Tax if everything sold today
          </span>
          <span className="num text-[15px] font-medium text-text">{inr(Math.round(tax))}</span>
        </div>
        <p className="mt-1.5 text-[13px] leading-5 text-subtle">
          Indicative, from the Finance Act 2024 rates (surcharge and cess included). Which bucket each holding lands in depends on the date its units are sold, and losses can
          offset gains within a year. This is a calculation, not advice.
        </p>
      </div>

      <ul className="mt-4 divide-y divide-line border-t border-line">
        {rows.slice(0, 6).map((r) => (
          <li key={r.symbol} className="flex items-center justify-between gap-3 py-2.5">
            <span className="min-w-0">
              <span className="block truncate text-[14px] text-text">{r.name}</span>
              <span className="block text-[12px] text-subtle">
                {r.class === "equity" ? "Equity" : "Other assets"} · {r.wouldBeLongTerm ? `${Math.floor(r.daysHeld / 30)} months held` : "under a year"}
              </span>
            </span>
            <Delta amount={r.gain} pct={r.gainPct} size="sm" />
          </li>
        ))}
      </ul>
      {rows.length > 6 && <p className="mt-3 text-[13px] text-subtle">And {rows.length - 6} more priced holdings.</p>}
    </Card>
  );
}