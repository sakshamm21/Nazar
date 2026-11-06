import { Receipt } from "lucide-react";
import Link from "next/link";
import { Card, CardHeader } from "@/components/ui/card";
import { Delta } from "@/components/ui/delta";
import { InfoTip } from "@/components/ui/info-tip";
import { inr, inrCompact } from "@/lib/format";
import { LTCG_EXEMPTION, TAX_RULES, byHolding, summariseGains, type Bucket, type GainPart, type Rate } from "@/lib/portfolio/capital-gains";

const rateLabel = (r: Rate, slab: number | null) => (r === "slab" ? (slab == null ? "your slab" : `slab, ${slab}%`) : `${Math.round(r * 1000) / 10}%`);
const ageLabel = (days: number) => (days >= 730 ? `${Math.floor(days / 365)} years held` : days >= 60 ? `${Math.floor(days / 30)} months held` : `${days} days held`);

/**
 * The gains sitting in the portfolio, and the buckets a sale would fall into. Facts from the
 * statutory rates, never a suggestion about what to do with them: which bucket applies is decided by
 * the date units leave, and that is the user's call.
 */
export function CapitalGainsCard({ parts, slabPct }: { parts: GainPart[]; slabPct: number | null }) {
  if (!parts.length) return null;
  const s = summariseGains(parts, slabPct);
  const holdings = byHolding(parts);

  const bucket = (b: Bucket) => {
    const rule = TAX_RULES[b.kind];
    const term = rule.longAfterDays == null ? "" : b.term === "long" ? `, over ${rule.longAfterDays === 365 ? "a year" : "two years"}` : `, under ${rule.longAfterDays === 365 ? "a year" : "two years"}`;
    return (
      <div key={`${b.kind}:${b.term}`} className="rounded-[12px] bg-surface-2 px-3 py-2.5">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[13px] text-muted">
            {rule.label}
            {term}
          </span>
          <span className="text-[11px] text-subtle">
            {rateLabel(b.rate, slabPct)}
            {b.kind === "equity" && b.term === "long" ? ` above ${inrCompact(LTCG_EXEMPTION)}` : ""}
          </span>
        </div>
        <div className="mt-0.5 flex items-baseline justify-between gap-2">
          <Delta amount={b.gain} size="sm" showArrow={false} />
          <span className="num text-[13px] font-medium text-text">{b.gain < 0 ? "nil" : b.tax == null ? "at your slab" : b.tax >= 0.5 ? inr(Math.round(b.tax), { decimals: 0 }) : "nil"}</span>
        </div>
        <div className="mt-0.5 text-[11px] text-subtle">
          {b.kind === "crypto"
            ? "Losses here can't be set off"
            : b.gain < 0
              ? "A loss: set off against other gains"
              : b.exempt > 0
                ? `${inrCompact(b.exempt)} within the yearly exemption`
                : b.tax == null
                  ? "Set your slab to see a figure"
                  : b.tax > 0
                    ? "tax, with cess"
                    : "nothing taxable"}
        </div>
      </div>
    );
  };

  return (
    <Card className="p-5 sm:p-6">
      <CardHeader overline="If sold today" title="What your gains would fall into" right={<InfoTip k="capital-gains" />} />
      <p className="mt-2 text-[15px] leading-6 text-muted">
        Nothing is taxed until units leave a holding, so these are the gains sitting in your portfolio today, sorted by the rules each purchase would follow if it were sold
        today.
      </p>

      <div className="mt-4 flex items-baseline gap-3">
        <Delta amount={s.totalGain} />
        <span className="text-sm text-muted">
          across {holdings.length} priced {holdings.length === 1 ? "holding" : "holdings"}
        </span>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">{s.buckets.map(bucket)}</div>

      <div className="mt-4 rounded-[12px] border border-line px-3.5 py-3">
        <div className="flex items-baseline justify-between gap-3">
          <span className="flex items-center gap-1.5 text-[13px] text-muted">
            <Receipt className="h-4 w-4 text-subtle" aria-hidden />
            Tax if everything sold today
          </span>
          <span className="num text-[15px] font-medium text-text">
            {s.tax >= 0.5 ? inr(Math.round(s.tax), { decimals: 0 }) : "nil"}
            {s.untaxedSlabGain > 0 ? " + slab" : ""}
          </span>
        </div>
        <p className="mt-1.5 text-[13px] leading-5 text-subtle">
          Indicative, from the rates for sales after 23 July 2024, with the 4% cess and before any surcharge, which depends on your income. Short-term losses are set off against
          other gains, as the rules allow.{" "}
          {slabPct == null && s.untaxedSlabGain > 0 ? (
            <>
              {inr(Math.round(s.untaxedSlabGain))} of gains is taxed at your income-tax slab;{" "}
              <Link href="/settings#tax" className="font-medium text-accent hover:underline">
                set your slab
              </Link>{" "}
              to include it.
            </>
          ) : null}{" "}
          This is a calculation, not advice.
        </p>
      </div>

      <ul className="mt-4 divide-y divide-line border-t border-line">
        {holdings.slice(0, 6).map((h) => (
          <li key={h.symbol} className="flex items-center justify-between gap-3 py-2.5">
            <span className="min-w-0">
              <span className="block truncate text-[14px] text-text">{h.name}</span>
              <span className="block text-[12px] text-subtle">
                {TAX_RULES[h.kind].label} ·{" "}
                {h.long !== 0 && h.short !== 0 ? `${inrCompact(Math.abs(h.long))} long-term, ${inrCompact(Math.abs(h.short))} short-term` : h.long !== 0 ? `long-term, ${ageLabel(h.oldestDays)}` : TAX_RULES[h.kind].longAfterDays == null ? "no long term" : "short-term"}
              </span>
            </span>
            <Delta amount={h.gain} pct={h.gainPct} size="sm" />
          </li>
        ))}
      </ul>
      {holdings.length > 6 && <p className="mt-3 text-[13px] text-subtle">And {holdings.length - 6} more priced holdings.</p>}
    </Card>
  );
}
