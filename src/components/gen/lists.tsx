"use client";

import { ExternalLink, Search } from "lucide-react";
import { useState } from "react";
import { fmt, fmtLarge, money, pct, upDown } from "@/lib/format";
import { Panel, Stat } from "./ui";
import { marketLabel } from "./views";

/**
 * Ticker lookups are plumbing: the agent resolving a name to a symbol. Rendered as one compact
 * line (not a full card) so they don't push the real answer below the fold.
 */
export function SearchView({ data, onPick }: { data: any; onPick?: (s: string) => void }) {
  const [open, setOpen] = useState(false);
  const shown = open ? data.results : data.results.slice(0, 3);
  return (
    <div className="gen-in my-1.5 flex flex-wrap items-center gap-1.5 text-xs text-subtle">
      <Search className="h-3.5 w-3.5" />
      <span>Looked up “{data.query}”:</span>
      {shown.map((r: any) => (
        <button key={r.symbol} onClick={() => onPick?.(`Give me an overview of ${r.symbol}`)} title={`${r.name} · ${r.exchange}`} className="rounded-md border border-line bg-surface-1 px-1.5 py-0.5 font-mono text-[11px] text-text hover:border-accent">
          {r.symbol}
        </button>
      ))}
      {!open && data.results.length > 3 && (
        <button onClick={() => setOpen(true)} className="text-subtle hover:text-text">+{data.results.length - 3} more</button>
      )}
      {!data.results.length && <span>no matches</span>}
    </div>
  );
}

export function ProfileView({ data }: { data: any }) {
  return (
    <Panel title={<span><span className="font-mono">{data.symbol}</span> · {data.name}</span>} subtitle={[data.sector, data.industry].filter(Boolean).join(" · ")}
      right={data.website && <a href={data.website} target="_blank" rel="noreferrer" className="text-xs text-accent hover:underline">Website ↗</a>}>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Employees" value={data.employees?.toLocaleString() ?? "—"} />
        <Stat label="Headquarters" value={data.location || "—"} />
        <Stat label="Sector" value={data.sector ?? "—"} />
      </div>
      {data.summary && <p className="mt-3 line-clamp-6 text-sm leading-relaxed text-text">{data.summary}</p>}
      {data.officers?.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {data.officers.map((o: any) => (
            <span key={o.name} className="rounded-md bg-surface-3 px-2 py-1 text-[11px] text-text">{o.name} <span className="text-subtle">· {o.title}</span></span>
          ))}
        </div>
      )}
    </Panel>
  );
}

export function NewsView({ data }: { data: any }) {
  return (
    <Panel title={`News · ${data.query}`}>
      <ul className="divide-y divide-line">
        {data.articles.map((a: any, i: number) => (
          <li key={i} className="py-2">
            <a href={a.link} target="_blank" rel="noreferrer" className="group flex items-start gap-2">
              <div className="flex-1">
                <div className="text-sm text-text group-hover:text-accent">{a.title}</div>
                <div className="mt-0.5 text-[11px] text-subtle">{a.publisher} · {a.published} {a.tickers?.length ? `· ${a.tickers.slice(0, 4).join(", ")}` : ""}</div>
              </div>
              <ExternalLink className="mt-1 h-3.5 w-3.5 shrink-0 text-subtle group-hover:text-accent" />
            </a>
          </li>
        ))}
        {!data.articles.length && <li className="text-sm text-subtle">No recent articles.</li>}
      </ul>
    </Panel>
  );
}

export function MoversView({ data, onPick }: { data: any; onPick?: (s: string) => void }) {
  return (
    <Panel title={data.title} subtitle={`${data.rows.length} stocks`}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[420px] text-sm">
          <thead><tr className="text-xs text-subtle"><th className="py-1 text-left font-medium">Symbol</th><th className="text-right font-medium">Price</th><th className="text-right font-medium">Change</th><th className="text-right font-medium">Volume</th><th className="text-right font-medium">Mkt cap</th></tr></thead>
          <tbody>
            {data.rows.map((r: any) => (
              <tr key={r.symbol} className="cursor-pointer border-t border-line/60 hover:bg-surface-3/40" onClick={() => onPick?.(`Analyze ${r.symbol}`)}>
                <td className="py-1.5"><span className="font-mono font-semibold">{r.symbol}</span> <span className="ml-1 hidden text-xs text-subtle sm:inline">{r.name}</span></td>
                <td className="text-right tabular-nums">{fmt(r.price, "currency", r.currency)}</td>
                <td className={`text-right tabular-nums ${upDown(r.changePercent)}`}>{pct(r.changePercent, true)}</td>
                <td className="text-right tabular-nums text-muted">{fmtLarge(r.volume, "", r.currency)}</td>
                <td className="text-right tabular-nums text-muted">{money(r.marketCap, r.currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

export function OwnershipView({ data }: { data: any }) {
  const ins = data.insidersPct ?? 0;
  const inst = data.institutionsPct ?? 0;
  return (
    <Panel title={<span><span className="font-mono">{data.symbol}</span> · Ownership</span>} subtitle={data.institutionCount ? `${data.institutionCount.toLocaleString()} institutions` : undefined}>
      <div className="flex h-3 overflow-hidden rounded-full bg-surface-3">
        <div className="bg-warn" style={{ width: `${Math.min(100, ins * 100)}%` }} />
        <div className="bg-ice" style={{ width: `${Math.min(100, inst * 100)}%` }} />
      </div>
      <div className="mt-2 flex gap-4 text-xs">
        <span className="text-warn">■ Insiders {pct(ins).replace("+", "")}</span>
        <span className="text-ice">■ Institutions {pct(inst).replace("+", "")}</span>
        <span className="text-subtle">■ Other {pct(Math.max(0, 1 - ins - inst)).replace("+", "")}</span>
      </div>
      {data.topHolders?.length > 0 && (
        <table className="mt-4 w-full text-xs">
          <thead><tr className="text-subtle"><th className="text-left font-medium">Top holders</th><th className="text-right font-medium">% held</th><th className="text-right font-medium">Value</th></tr></thead>
          <tbody>{data.topHolders.map((h: any) => (
            <tr key={h.organization} className="border-t border-line/60"><td className="py-1 text-text">{h.organization}</td><td className="py-1 text-right tabular-nums">{pct(h.pctHeld).replace("+", "")}</td><td className="py-1 text-right tabular-nums">{money(h.value, data.currency)}</td></tr>
          ))}</tbody>
        </table>
      )}
      {data.insiderTransactions?.length > 0 && (
        <table className="mt-4 w-full text-xs">
          <thead><tr className="text-subtle"><th className="text-left font-medium">Insider</th><th className="text-left font-medium">Transaction</th><th className="text-right font-medium">Value</th></tr></thead>
          <tbody>{data.insiderTransactions.map((t: any, i: number) => (
            <tr key={i} className="border-t border-line/60"><td className="py-1 text-text">{t.name}<div className="text-[10px] text-subtle">{t.relation} · {t.date}</div></td><td className="py-1 text-muted">{t.text || "—"}</td><td className="py-1 text-right tabular-nums">{money(t.value, data.currency)}</td></tr>
          ))}</tbody>
        </table>
      )}
    </Panel>
  );
}

export function IndicesView({ data, onPick }: { data: any; onPick?: (s: string) => void }) {
  const title = { IN: "Indian markets", US: "US markets", GLOBAL: "Global markets" }[data.region as string] ?? "Markets";
  return (
    <Panel title={title} subtitle={marketLabel(data.indices.find((i: any) => i.marketState)?.marketState) ?? undefined}>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {data.indices.map((i: any) => (
          <button key={i.symbol} onClick={() => onPick?.(`How has ${i.label} (${i.symbol}) performed over the last year?`)} className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-left transition hover:border-accent">
            <div className="truncate text-[11px] text-subtle">{i.label}</div>
            <div className="text-sm font-semibold tabular-nums text-text">{i.price == null ? "—" : i.price.toLocaleString(i.currency === "INR" ? "en-IN" : "en-US", { maximumFractionDigits: 2 })}</div>
            <div className={`text-xs tabular-nums ${upDown(i.changePercent)}`}>{pct(i.changePercent, true)}</div>
          </button>
        ))}
      </div>
    </Panel>
  );
}

export function WatchlistView({ data, onPick }: { data: any; onPick?: (s: string) => void }) {
  const notes = [
    data.added?.length ? `Added ${data.added.join(", ")}` : null,
    data.removed?.length ? `Removed ${data.removed.join(", ")}` : null,
    data.notFound?.length ? `Not found: ${data.notFound.join(", ")}` : null,
    data.full ? "Watchlist is full" : null,
  ].filter(Boolean);
  return (
    <Panel title="Your watchlist" subtitle={notes.join(" · ") || `${data.items.length} stocks`}>
      {data.items.length ? (
        <table className="w-full text-sm">
          <tbody>
            {data.items.map((w: any) => (
              <tr key={w.symbol} className="cursor-pointer border-t border-line/60 first:border-0 hover:bg-surface-3/40" onClick={() => onPick?.(`Analyze ${w.symbol}`)}>
                <td className="py-1.5"><span className="font-mono font-semibold">{w.symbol}</span> <span className="ml-1 hidden text-xs text-subtle sm:inline">{w.name}</span></td>
                <td className="text-right tabular-nums">{fmt(w.price, "currency", w.currency ?? "USD")}</td>
                <td className={`w-20 text-right tabular-nums ${upDown(w.changePercent)}`}>{pct(w.changePercent, true)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="text-sm text-subtle">Your watchlist is empty.</div>
      )}
    </Panel>
  );
}

export function PortfolioToolView({ data }: { data: any }) {
  if (data.empty) return <Panel title="Your portfolio" subtitle="No holdings yet">Import your holdings on the Portfolio page and Nazar starts watching.</Panel>;
  const top = [...(data.holdings ?? [])].sort((a: any, b: any) => b.weight - a.weight).slice(0, 8);
  return (
    <Panel title={<span>{data.portfolio}</span>} subtitle={`As of ${data.asOf} close · read-only from Nazar's checkup`} right={<div className={`text-sm font-semibold tabular-nums ${upDown(data.today?.changePct)}`}>{pct(data.today?.changePct)} today</div>}>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Value" value={fmt(data.value, "currency", "INR")} />
        <Stat label="Unrealised P&L" value={pct(data.unrealisedPct)} tone={upDown(data.unrealised)} />
        <Stat label="Health" value={data.healthScore ?? "—"} />
        <Stat label="Portfolio beta" value={data.risk?.portfolioBeta?.toFixed?.(2) ?? "—"} />
      </div>
      <table className="mt-4 w-full text-sm tabular-nums">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wide text-subtle">
            <th className="py-1 font-medium">Holding</th>
            <th className="py-1 text-right font-medium">Weight</th>
            <th className="py-1 text-right font-medium">Today</th>
            <th className="py-1 text-right font-medium">Health</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {top.map((h: any) => (
            <tr key={h.symbol ?? h.name}>
              <td className="py-1.5 text-text">{h.name}</td>
              <td className="py-1.5 text-right text-muted">{(h.weight * 100).toFixed(0)}%</td>
              <td className={`py-1.5 text-right ${upDown(h.todayPct)}`}>{pct(h.todayPct)}</td>
              <td className="py-1.5 text-right text-muted">{h.health ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}

const rupees = (n: number | null | undefined) => (n == null ? "—" : `${n < 0 ? "−" : ""}₹${Math.abs(Math.round(n)).toLocaleString("en-IN")}`);
const signedRupees = (n: number | null | undefined) => (n == null ? "—" : `${n > 0 ? "+" : n < 0 ? "−" : ""}₹${Math.abs(Math.round(n)).toLocaleString("en-IN")}`);
const EmptyPortfolio = ({ title }: { title: string }) => <Panel title={title} subtitle="No holdings yet">Import your holdings on the Portfolio page and Nazar starts watching.</Panel>;

/** How the portfolio did over a period: the change, who caused it, and how much was the market. */
export function PerformanceToolView({ data }: { data: any }) {
  if (data.empty) return <EmptyPortfolio title="Your portfolio over a period" />;
  const movers = [...(data.addedMost ?? []).slice(0, 4), ...(data.tookAwayMost ?? []).slice(0, 4)];
  return (
    <Panel
      title={<span>{data.summary?.headline ?? data.portfolio}</span>}
      subtitle={`${data.portfolio} · ${data.from} to ${data.to}${data.coversWholePeriod ? "" : " · as far back as Nazar has prices"} · read-only from Nazar's checkup`}
      right={<div className={`text-sm font-semibold tabular-nums ${upDown(data.changePct)}`}>{pct(data.changePct)}</div>}
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Change" value={signedRupees(data.change)} tone={upDown(data.change)} />
        <Stat label="Nifty" value={pct(data.niftyPct)} tone={upDown(data.niftyPct)} />
        <Stat label="The market" value={signedRupees(data.explainedByMarket)} tone={upDown(data.explainedByMarket)} />
        <Stat label="What you own" value={signedRupees(data.specificToHoldings)} tone={upDown(data.specificToHoldings)} />
      </div>
      {movers.length > 0 && (
        <table className="mt-4 w-full text-sm tabular-nums">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-subtle">
              <th className="py-1 font-medium">Moved it most</th>
              <th className="py-1 text-right font-medium">Amount</th>
              <th className="py-1 text-right font-medium">Change</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {movers.map((m: any) => (
              <tr key={`${m.name}:${m.amount}`}>
                <td className="py-1.5 text-text">{m.name}</td>
                <td className={`py-1.5 text-right ${upDown(m.amount)}`}>{signedRupees(m.amount)}</td>
                <td className={`py-1.5 text-right ${upDown(m.pct)}`}>{pct(m.pct)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="mt-3 text-[11px] leading-4 text-subtle">Prices what you own today on each past day; purchases and sales along the way are not replayed.</div>
    </Panel>
  );
}

/** Gains not yet realised, by holding, with how long each has been owned. */
export function GainsToolView({ data }: { data: any }) {
  if (data.empty) return <EmptyPortfolio title="Your unsold gains" />;
  const rows = (data.holdings ?? []).slice(0, 8);
  return (
    <Panel title="Your unsold gains" subtitle={`${data.portfolio} · as of ${data.asOf} close · nothing here is taxed until units leave`} right={<div className={`text-sm font-semibold tabular-nums ${upDown(data.unrealisedGain)}`}>{signedRupees(data.unrealisedGain)}</div>}>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Shares · long-term" value={signedRupees(data.sharesAndEquityFunds?.longTerm)} tone={upDown(data.sharesAndEquityFunds?.longTerm)} />
        <Stat label="Shares · short-term" value={signedRupees(data.sharesAndEquityFunds?.shortTerm)} tone={upDown(data.sharesAndEquityFunds?.shortTerm)} />
        <Stat label="Other · long-term" value={signedRupees(data.otherAssets?.longTerm)} tone={upDown(data.otherAssets?.longTerm)} />
        <Stat label="Other · short-term" value={signedRupees(data.otherAssets?.shortTerm)} tone={upDown(data.otherAssets?.shortTerm)} />
      </div>
      {rows.length > 0 && (
        <table className="mt-4 w-full text-sm tabular-nums">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-subtle">
              <th className="py-1 font-medium">Holding</th>
              <th className="py-1 text-right font-medium">Gain</th>
              <th className="py-1 text-right font-medium">Owned for</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((h: any) => (
              <tr key={`${h.name}:${h.gain}`}>
                <td className="py-1.5 text-text">{h.name}</td>
                <td className={`py-1.5 text-right ${upDown(h.gain)}`}>{signedRupees(h.gain)}</td>
                <td className="py-1.5 text-right text-muted">{h.daysOwned} days · {h.wouldBeLongTermToday ? "long-term" : "short-term"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Panel>
  );
}

/** Savings goals as the user entered them, with what each needs from here. */
export function GoalsToolView({ data }: { data: any }) {
  const goals = data.goals ?? [];
  if (!goals.length) return <Panel title="Your savings goals" subtitle="None yet">A goal is an amount and a date. Add one from the You page.</Panel>;
  return (
    <Panel title="Your savings goals" subtitle="Your own figures · a goal is not tied to particular investments" right={<div className="text-sm font-semibold tabular-nums text-text">{rupees(data.stillToSave)} to go</div>}>
      <table className="w-full text-sm tabular-nums">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wide text-subtle">
            <th className="py-1 font-medium">Goal</th>
            <th className="py-1 text-right font-medium">Saved</th>
            <th className="py-1 text-right font-medium">Needs each month</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {goals.map((g: any) => (
            <tr key={`${g.name}:${g.by}`}>
              <td className="py-1.5 text-text">
                {g.name}
                <div className="text-[11px] text-subtle">{rupees(g.target)} by {g.by} · {g.status}</div>
              </td>
              <td className="py-1.5 text-right text-muted">{rupees(g.saved)} ({Math.round((g.progress ?? 0) * 100)}%)</td>
              <td className="py-1.5 text-right text-text">{rupees(g.monthlyNeededFromHere)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}

/** A market move applied to the portfolio: the estimated change and what accounts for most of it. */
export function StressToolView({ data }: { data: any }) {
  if (data.empty) return <EmptyPortfolio title="A market move, applied to your portfolio" />;
  const fall = Number(data.niftyMovePct) < 0;
  return (
    <Panel
      title={`If the Nifty ${fall ? "fell" : "rose"} ${Math.abs(Number(data.niftyMovePct))}%`}
      subtitle={`${data.portfolio} · as of ${data.asOf} close · an estimate from how each holding has followed the Nifty`}
      right={<div className={`text-sm font-semibold tabular-nums ${upDown(data.change)}`}>{pct(data.changePct)}</div>}
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Now" value={rupees(data.valueNow)} />
        <Stat label="Estimated change" value={signedRupees(data.change)} tone={upDown(data.change)} />
        <Stat label="After" value={rupees(data.valueAfter)} />
        <Stat label="Portfolio beta" value={data.portfolioBeta?.toFixed?.(2) ?? "—"} />
      </div>
      {(data.biggestEffects ?? []).length > 0 && (
        <table className="mt-4 w-full text-sm tabular-nums">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-subtle">
              <th className="py-1 font-medium">Accounts for most of it</th>
              <th className="py-1 text-right font-medium">Beta</th>
              <th className="py-1 text-right font-medium">Change</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {data.biggestEffects.slice(0, 6).map((h: any) => (
              <tr key={`${h.name}:${h.change}`}>
                <td className="py-1.5 text-text">{h.name}</td>
                <td className="py-1.5 text-right text-muted">{Number(h.beta).toFixed(2)}</td>
                <td className={`py-1.5 text-right ${upDown(h.change)}`}>{signedRupees(h.change)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="mt-3 text-[11px] leading-4 text-subtle">
        {data.holdingsThatWouldNot > 0 && `${data.holdingsThatWouldNot} of what you own (deposits, provident funds, cash) would not move. `}Real falls are uneven; this is arithmetic, not a forecast.
      </div>
    </Panel>
  );
}
