"use client";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { Wordmark } from "@/components/rings/nazar-mark";
import { Card, CardHeader } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import type { Insights } from "@/lib/insights";

const pct = (x: number | null | undefined) => (x == null ? "—" : `${Math.round(x * 100)}%`);
const TYPE: Record<string, string> = { stock_move: "Stock moves", portfolio_move: "Portfolio moves", results: "Results", health_change: "Health changes", concentration: "Concentration", results_upcoming: "Upcoming results", price_target: "Price alerts", digest: "Digests", learned: "Learned" };

/** /insights: product analytics. North Star = weekly users who rated at least one alert useful. */
export function InsightsView({ data }: { data: Insights }) {
  const delta = data.nsm.value - data.nsm.prev;
  const top = Math.max(1, ...data.funnel.map((f) => f.users));
  return (
    <div className="mx-auto max-w-[1120px] space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Wordmark />
          <span className="t-overline">Product insights</span>
        </div>
        <span className="t-caption">Generated {new Date(data.generatedAt).toLocaleString("en-IN")} · real users only (demo and test accounts excluded)</span>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card className="p-5 md:col-span-2">
          <div className="t-overline">North Star</div>
          <div className="mt-1 text-sm text-muted">Weekly users who rated at least one alert useful</div>
          <div className="num mt-3 text-[44px] font-semibold leading-none text-text">{data.nsm.value}</div>
          <div className={`num mt-2 text-sm ${delta >= 0 ? "text-gain" : "text-loss"}`}>
            {delta >= 0 ? "▲" : "▼"} {Math.abs(delta)} vs previous 7 days
          </div>
        </Card>
        <Kpi label="Alerts rated useful (30d)" value={pct(data.kpis.usefulRate30)} sub={`${data.kpis.ratings30} ratings`} />
        <Kpi label="Alerts per user per week" value={data.kpis.alertsPerUserWeek?.toFixed(1) ?? "—"} sub={`${data.kpis.alerts7} alerts · ${data.kpis.usersWithPortfolio} users with a portfolio`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <CardHeader overline="Alert quality" title="Usefulness by alert type (30d)" />
          <table className="mt-4 w-full text-sm">
            <tbody className="divide-y divide-line">
              {data.byType.length ? (
                data.byType.map((t) => (
                  <tr key={t.type}>
                    <td className="py-2 text-text">{TYPE[t.type] ?? t.type}</td>
                    <td className="num py-2 text-right text-muted">
                      {t.useful}/{t.total}
                    </td>
                    <td className="num py-2 text-right font-medium text-text">{pct(t.rate)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="py-2 text-muted">No ratings yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
        <Card className="p-5">
          <CardHeader overline="Last 14 days" title="Alerts and ratings" />
          <div className="mt-4 h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.daily}>
                <XAxis dataKey="day" tick={{ fill: "var(--subtle)", fontSize: 11 }} tickLine={false} axisLine={false} />
                <Tooltip cursor={{ fill: "var(--surface-2)" }} contentStyle={{ background: "var(--surface-1)", border: "1px solid var(--line)", borderRadius: 12, fontSize: 12 }} />
                <Bar dataKey="alerts" name="Alerts" fill="var(--ice)" radius={[3, 3, 0, 0]} />
                <Bar dataKey="useful" name="👍" fill="var(--gain)" radius={[3, 3, 0, 0]} />
                <Bar dataKey="notUseful" name="👎" fill="var(--loss)" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <CardHeader overline="H5 · alerts that learn" title="Does tuning make alerts more useful?" />
          <div className="mt-3 flex gap-6 text-sm">
            <span>
              <span className="num text-text">{data.tuning.events30}</span> <span className="text-muted">tunings (30d)</span>
            </span>
            <span>
              <span className="num text-text">{pct(data.tuning.undoRate)}</span> <span className="text-muted">undone</span>
            </span>
          </div>
          <table className="mt-3 w-full text-sm">
            <thead>
              <tr className="text-left text-[12px] text-subtle">
                <th className="py-1 font-medium">Type</th>
                <th className="py-1 font-medium">Change</th>
                <th className="py-1 text-right font-medium">Useful before</th>
                <th className="py-1 text-right font-medium">after</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {data.tuning.beforeAfter.map((t, i) => (
                <tr key={i}>
                  <td className="py-2 text-text">{TYPE[t.type] ?? t.type}</td>
                  <td className="num py-2 text-muted">
                    {t.from ?? "—"}% → {t.to ?? "muted"}
                    {t.to != null ? "%" : ""} {t.undone && <Chip>undone</Chip>}
                  </td>
                  <td className="num py-2 text-right text-muted">{pct(t.before)}</td>
                  <td className="num py-2 text-right font-medium text-text">{pct(t.after)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <Card className="p-5">
          <CardHeader overline="Activation (30-day cohort)" title="From sign-up to a useful alert" />
          <ul className="mt-4 space-y-3">
            {data.funnel.map((f) => (
              <li key={f.step}>
                <div className="flex justify-between text-sm">
                  <span className="text-text">{f.step}</span>
                  <span className="num text-muted">{f.users}</span>
                </div>
                <div className="mt-1 h-2 rounded-full bg-surface-3">
                  <div className="h-full rounded-full bg-accent" style={{ width: `${(f.users / top) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Kpi label="Email digest on" value={pct(data.channels.emailDigestRate)} sub={`${data.channels.emailRatings} ratings from email`} />
        <Kpi label="Family recipients" value={`${data.channels.familyConfirmed}/${data.channels.familyRecipients}`} sub="confirmed / added" />
        <Kpi label="Returning (14d)" value={pct(data.retention.rate)} sub={`${data.retention.returning14} of ${data.retention.active14} active users`} />
        <Kpi label="Emails (7d)" value={String(data.delivery.find((d) => d.status === "sent")?.n ?? 0)} sub={data.delivery.map((d) => `${d.status.replace("skipped_", "")} ${d.n}`).join(" · ")} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <CardHeader overline="Pipeline" title="Recent runs" />
          <ul className="mt-3 divide-y divide-line text-sm">
            {data.runs.map((r, i) => (
              <li key={i} className="flex items-center justify-between gap-3 py-2">
                <span className="text-text">
                  {r.kind} · {r.runDate}
                </span>
                <span className="flex items-center gap-2">
                  <span className="num text-[12px] text-subtle">{typeof (r.stats as any)?.processed === "number" ? `${(r.stats as any).processed} symbols` : ""}</span>
                  <Chip tone={r.status === "done" ? "gain" : r.status === "running" ? "accent" : r.status === "failed" ? "loss" : "neutral"}>{r.status}</Chip>
                </span>
              </li>
            ))}
          </ul>
        </Card>
        <Card className="p-5">
          <CardHeader overline="Secondary" title="Demo and Ask" />
          <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
            <Mini label="Demos started (30d)" value={data.demo.started} />
            <Mini label="Bad days simulated" value={data.demo.simulated} />
            <Mini label="Tours completed / skipped" value={`${data.demo.tourCompleted} / ${data.demo.tourSkipped}`} />
            <Mini label="Ask questions (7d)" value={data.ask.questions7} />
            <Mini label="Ask helpful rate" value={pct(data.ask.helpfulRate7)} />
            <Mini label="Uses getMyPortfolio" value={pct(data.ask.portfolioToolShare)} />
            <Mini label="Cost per answer" value={data.ask.costPerAnswer7 != null ? `$${data.ask.costPerAnswer7.toFixed(4)}` : "—"} />
            <Mini label="p50 / p95 latency" value={data.ask.p50Latency ? `${(data.ask.p50Latency / 1000).toFixed(1)}s / ${((data.ask.p95Latency ?? 0) / 1000).toFixed(1)}s` : "—"} />
          </dl>
        </Card>
      </div>
    </div>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card className="p-5">
      <div className="text-sm text-muted">{label}</div>
      <div className="num mt-2 text-[28px] font-semibold leading-none text-text">{value}</div>
      {sub && <div className="t-caption mt-2">{sub}</div>}
    </Card>
  );
}

function Mini({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <dt className="t-caption">{label}</dt>
      <dd className="num mt-0.5 text-text">{value}</dd>
    </div>
  );
}
