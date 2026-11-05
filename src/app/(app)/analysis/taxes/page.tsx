import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { TaxYearDownload, type TaxRow } from "@/components/analysis/tax-year-download";
import { QuietRings } from "@/components/rings/quiet-rings";
import { Card, CardHeader } from "@/components/ui/card";
import { Delta } from "@/components/ui/delta";
import { requirePageUser } from "@/lib/current-user";
import { istDate } from "@/lib/data/provider";
import { dayLabel, inr, inrCompact } from "@/lib/format";
import { TAX_RULES, financialYear, realisedParts, summariseGains, type Rate } from "@/lib/portfolio/capital-gains";
import { incomeForUser } from "@/lib/repo/income";
import { salesForUser } from "@/lib/repo/sales";

export const metadata: Metadata = { title: "Capital gains by year" };

const rateLabel = (r: Rate, slab: number | null) => (r === "slab" ? (slab == null ? "your slab" : `${slab}% slab`) : `${Math.round(r * 1000) / 10}%`);

/** Every sale in an Indian financial year: what each part of it was held for, the rules it follows, and the tax the rates give. */
export default async function TaxesPage({ searchParams }: { searchParams: Promise<{ fy?: string }> }) {
  const user = await requirePageUser();
  const slab = user.prefs?.taxSlabPct ?? null;
  const [sales, income] = await Promise.all([salesForUser(user.id), incomeForUser(user.id)]);
  const current = financialYear(istDate(new Date())).label;
  const years = [...new Set([current, ...sales.map((s) => financialYear(s.date).label), ...income.map((x) => financialYear(x.date).label)])].sort().reverse();
  const { fy: asked } = await searchParams;
  const fy = years.includes(asked ?? "") ? asked! : (years.find((y) => sales.some((s) => financialYear(s.date).label === y)) ?? current);
  const inYear = sales.filter((s) => financialYear(s.date).label === fy);
  const paid = income.filter((x) => financialYear(x.date).label === fy);
  const parts = inYear.flatMap((s) => realisedParts(s).map((p) => ({ ...p, sale: s })));
  const sum = summariseGains(parts, slab);

  const rows: TaxRow[] = parts.map((p) => ({ sold: p.sale.date, name: p.name, rules: TAX_RULES[p.kind].label, bought: p.bought ?? "", units: p.units, cost: p.cost, proceeds: p.value, gain: p.gain, term: TAX_RULES[p.kind].longAfterDays == null ? "no long term" : p.longTerm ? "long-term" : "short-term", days: p.daysHeld }));

  return (
    <div className="nz-stagger space-y-5">
      <Link href="/analysis" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-text">
        <ArrowLeft className="h-4 w-4" /> Analysis
      </Link>
      <div>
        <h1 className="t-title-1 text-text">Capital gains by financial year</h1>
        <p className="mt-1 text-sm text-muted">Every sale you recorded, across all your portfolios, sorted by the rules each part of it follows. A record to check against your broker&apos;s statement, not a tax return.</p>
      </div>
      <div role="tablist" aria-label="Financial year" className="flex flex-wrap gap-1">
        {years.map((y) => (
          <Link key={y} role="tab" aria-selected={y === fy} href={`/analysis/taxes?fy=${y}`} className={`rounded-full px-3 py-1.5 text-[13px] font-semibold ${y === fy ? "bg-accent-soft text-accent" : "text-muted hover:bg-surface-2 hover:text-text"}`}>
            FY {y}
          </Link>
        ))}
      </div>

      {!inYear.length ? (
        <Card className="p-2">
          <QuietRings title={`No sales recorded in FY ${fy}`} body="A sale recorded with “Sold some” on a holding appears here, with its gain and the rules it follows." />
        </Card>
      ) : (
        <>
          <Card className="p-5 sm:p-6">
            <CardHeader overline={`FY ${fy}`} title="What your sales came to" right={<TaxYearDownload fy={fy} rows={rows} />} />
            <div className="mt-3 flex flex-wrap items-baseline gap-x-6 gap-y-2">
              <div>
                <div className="text-[12px] text-subtle">Net gain</div>
                <Delta amount={sum.totalGain} />
              </div>
              <div>
                <div className="text-[12px] text-subtle">Tax at these rates, with cess</div>
                <div className="num text-[15px] font-medium text-text">
                  {sum.tax >= 0.5 ? inr(Math.round(sum.tax), { decimals: 0 }) : "nil"}
                  {sum.untaxedSlabGain > 0 ? " + slab" : ""}
                </div>
              </div>
              {paid.length > 0 && (
                <div>
                  <div className="text-[12px] text-subtle">Dividends and interest (taxed as income)</div>
                  <div className="num text-[15px] font-medium text-text">{inr(Math.round(paid.reduce((a, x) => a + x.amount, 0)))}</div>
                </div>
              )}
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {sum.buckets.map((b) => (
                <div key={`${b.kind}:${b.term}`} className="rounded-[12px] bg-surface-2 px-3 py-2.5">
                  <div className="flex items-baseline justify-between gap-2 text-[13px] text-muted">
                    <span>
                      {TAX_RULES[b.kind].label}
                      {TAX_RULES[b.kind].longAfterDays == null ? "" : b.term === "long" ? ", long-term" : ", short-term"}
                    </span>
                    <span className="text-[11px] text-subtle">{rateLabel(b.rate, slab)}</span>
                  </div>
                  <div className="mt-0.5 flex items-baseline justify-between gap-2">
                    <Delta amount={b.gain} size="sm" showArrow={false} />
                    <span className="num text-[13px] font-medium text-text">{b.tax == null ? "at your slab" : b.tax >= 0.5 ? inr(Math.round(b.tax), { decimals: 0 }) : "nil"}</span>
                  </div>
                  {b.exempt > 0 && <div className="text-[11px] text-subtle">{inrCompact(b.exempt)} within the yearly exemption</div>}
                </div>
              ))}
            </div>
            <p className="mt-4 text-[13px] leading-5 text-subtle">
              Indicative: rates for sales after 23 July 2024, with the 4% cess, before any surcharge. Losses are set off within the year as the rules allow; losses carried from earlier years are not included. Check the figures with your tax filer.
              {slab == null && sum.untaxedSlabGain > 0 && (
                <>
                  {" "}
                  <Link href="/settings#tax" className="font-medium text-accent hover:underline">
                    Set your slab
                  </Link>{" "}
                  to put a figure on {inr(Math.round(sum.untaxedSlabGain))} of slab-rate gains.
                </>
              )}
            </p>
          </Card>

          <Card className="overflow-hidden">
            <ul className="divide-y divide-line">
              {parts.map((p, i) => (
                <li key={i} className="flex items-center justify-between gap-3 px-5 py-3 sm:px-6">
                  <span className="min-w-0">
                    <span className="block truncate text-[14px] text-text">{p.name}</span>
                    <span className="num block text-[12px] text-subtle">
                      Sold {dayLabel(p.sale.date, "en")} · {p.units.toLocaleString("en-IN", { maximumFractionDigits: 3 })} units held {p.daysHeld} days · {TAX_RULES[p.kind].label}, {TAX_RULES[p.kind].longAfterDays == null ? "no long term" : p.longTerm ? "long-term" : "short-term"}
                    </span>
                  </span>
                  <Delta amount={p.gain} size="sm" />
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}
    </div>
  );
}
