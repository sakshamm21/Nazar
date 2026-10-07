"use client";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { Wordmark } from "@/components/rings/nazar-mark";
import { Card, CardHeader } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import type { Insights } from "@/lib/insights";

const pct = (x: number | null | undefined) => (x == null ? "—" : `${Math.round(x * 100)}%`);
const usd = (x: number | null | undefined, d = 2) => (x == null ? "—" : `$${x.toFixed(d)}`);

/** /insights: product analytics. North Star = people who track a portfolio and used Nazar this week. */
export function InsightsView({ data }: { data: Insights }) {
  const delta = data.nsm.value - data.nsm.prev;
  const top = Math.max(1, ...data.funnel.map((f) => f.users));
  const viewTop = Math.max(1, ...data.areas.map((a) => a.views));
  const assetTop = Math.max(1, ...data.assets.map((a) => a.holdings));
  const noViews = data.areas.every((a) => a.views === 0);
  return (
    <div className="mx-auto max-w-[1120px] space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Wordmark />
          <span className="t-overline">Product insights</span>
        </div>
        <span className="t-caption">Generated {new Date(data.generatedAt).toLocaleString("en-IN")} · real users only (the shared demo is reported at the bottom)</span>
      </div>

      {/* Who uses it */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="p-5 md:col-span-2">
          <div className="t-overline">North Star</div>
          <div className="mt-1 text-sm text-muted">People who track a portfolio and used Nazar in the last 7 days</div>
          <div className="num mt-3 text-[44px] font-semibold leading-none text-text">{data.nsm.value}</div>
          <div className={`num mt-2 text-sm ${delta >= 0 ? "text-gain" : "text-loss"}`}>
            {delta >= 0 ? "▲" : "▼"} {Math.abs(delta)} vs the 7 days before
          </div>
        </Card>
        <Kpi label="Real users" value={String(data.kpis.realUsers)} sub={`${data.kpis.newUsers7} new this week · ${pct(data.kpis.verifiedRate)} verified`} />
        <Kpi label="Tracking a portfolio" value={String(data.kpis.trackers)} sub={`${pct(data.kpis.realUsers ? data.kpis.trackers / data.kpis.realUsers : null)} of users · ${data.kpis.portfolios} portfolios`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <CardHeader overline="Activation (signed up in the last 30 days)" title="From sign-up to reading the analysis" />
          <ul className="mt-4 space-y-3">
            {data.funnel.map((f, i) => (
              <li key={f.step}>
                <div className="flex justify-between text-sm">
                  <span className="text-text">{f.step}</span>
                  <span className="num text-muted">
                    {f.users}
                    {i > 0 && data.funnel[0].users > 0 && <span className="text-subtle"> · {pct(f.users / data.funnel[0].users)}</span>}
                  </span>
                </div>
                <div className="mt-1 h-2 rounded-full bg-surface-3">
                  <div className="h-full rounded-full bg-accent" style={{ width: `${(f.users / top) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </Card>
        <Card className="p-5">
          <CardHeader overline="Last 14 days" title="Active users, questions and sign-ups" />
          <div className="mt-4 h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.daily}>
                <XAxis dataKey="day" tick={{ fill: "var(--subtle)", fontSize: 11 }} tickLine={false} axisLine={false} />
                <Tooltip cursor={{ fill: "var(--surface-2)" }} contentStyle={{ background: "var(--surface-1)", border: "1px solid var(--line)", borderRadius: 12, fontSize: 12 }} />
                <Bar dataKey="active" name="Active users" fill="var(--accent)" radius={[3, 3, 0, 0]} />
                <Bar dataKey="questions" name="Questions" fill="var(--ice)" radius={[3, 3, 0, 0]} />
                <Bar dataKey="signups" name="Sign-ups" fill="var(--gain)" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm">
            <span>
              <span className="num text-text">{pct(data.retention.rate)}</span> <span className="text-muted">came back on a second day (14d)</span>
            </span>
            <span className="text-muted">
              <span className="num text-text">{data.retention.returning14}</span> of <span className="num text-text">{data.retention.active14}</span> active users
            </span>
          </div>
        </Card>
      </div>

      {/* What they use */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <CardHeader overline="Screens (last 7 days)" title="Where people spend their visits" />
          {noViews ? (
            <p className="mt-4 text-sm text-muted">No screen views recorded yet. They are counted from this release on, so this fills in as people use the app.</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {data.areas.map((a) => (
                <li key={a.area}>
                  <div className="flex justify-between text-sm">
                    <span className="text-text">{a.area}</span>
                    <span className="num text-muted">
                      {a.views} views · {a.users} {a.users === 1 ? "person" : "people"}
                    </span>
                  </div>
                  <div className="mt-1 h-2 rounded-full bg-surface-3">
                    <div className="h-full rounded-full bg-accent" style={{ width: `${(a.views / viewTop) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
          {data.periods.length > 0 && (
            <p className="mt-4 text-sm text-muted">
              Analysis periods picked (30d):{" "}
              {data.periods.map((p, i) => (
                <span key={p.period}>
                  {i > 0 && ", "}
                  <span className="num text-text">{p.period}</span> ×{p.n}
                </span>
              ))}
            </p>
          )}
        </Card>
        <Card className="p-5">
          <CardHeader overline="What people track" title="Holdings by asset type" />
          {data.assets.length === 0 ? (
            <p className="mt-4 text-sm text-muted">No holdings yet.</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {data.assets.map((a) => (
                <li key={a.label}>
                  <div className="flex justify-between text-sm">
                    <span className="text-text">{a.label}</span>
                    <span className="num text-muted">
                      {a.holdings} · {a.users} {a.users === 1 ? "person" : "people"}
                    </span>
                  </div>
                  <div className="mt-1 h-2 rounded-full bg-surface-3">
                    <div className="h-full rounded-full bg-ice" style={{ width: `${(a.holdings / assetTop) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
          <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-line pt-4 text-sm">
            <Mini label="Holdings tracked" value={data.kpis.holdings} />
            <Mini label="Median per person" value={data.kpis.medianHoldings ?? "—"} />
            <Mini label="Track 2+ asset types" value={pct(data.mix.multiAsset)} />
          </dl>
          {data.sources.length > 0 && (
            <p className="mt-3 text-sm text-muted">
              How they got in:{" "}
              {data.sources.map((s, i) => (
                <span key={s.label}>
                  {i > 0 && ", "}
                  {s.label} <span className="num text-text">{s.holdings}</span>
                </span>
              ))}
              . <span className="num text-text">{data.mix.added7}</span> added this week.
            </p>
          )}
        </Card>
      </div>

      {/* Ask */}
      <div className="grid gap-4 md:grid-cols-4">
        <Kpi label="Ask questions (7d)" value={String(data.ask.questions7)} sub={`${data.ask.askers7} ${data.ask.askers7 === 1 ? "person" : "people"} · ${pct(data.ask.portfolioToolShare)} about their portfolio`} />
        <Kpi label="Answers rated helpful" value={pct(data.ask.helpfulRate7)} sub={`${data.ask.ratings7} ratings · ${pct(data.ask.blockRate7)} off-topic, declined`} />
        <Kpi label="Answer time" value={data.ask.p50Latency ? `${(data.ask.p50Latency / 1000).toFixed(1)}s` : "—"} sub={`p95 ${data.ask.p95Latency ? `${(data.ask.p95Latency / 1000).toFixed(1)}s` : "—"} · ${data.ask.errors7} errors`} />
        <Kpi label="AI spend (7d)" value={usd(data.ask.spend7)} sub={`${usd(data.ask.costPerAnswer7, 4)} per answer · ${usd(data.ask.spend30)} in 30 days`} />
      </div>

      {/* Data and demo */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <CardHeader overline="Market data" title="Is it current?" />
          <dl className="mt-3 grid grid-cols-3 gap-3 text-sm">
            <Mini label="Latest session" value={data.data.latestSession ?? "none yet"} />
            <Mini label="Symbols in the checkup" value={data.data.symbols ?? "—"} />
            <Mini label="Failed last night" value={data.data.failed ?? "—"} />
          </dl>
          {data.data.stale.length > 0 && <p className="mt-3 text-sm text-warn">Not refreshed: {data.data.stale.join(", ")}</p>}
          <ul className="mt-3 divide-y divide-line border-t border-line text-sm">
            {data.runs.slice(0, 8).map((r, i) => (
              <li key={i} className="flex items-center justify-between gap-3 py-2">
                <span className="text-text">
                  {r.kind} · {r.runDate}
                </span>
                <span className="flex items-center gap-2">
                  <span className="num text-[12px] text-subtle">{typeof (r.stats as any)?.processed === "number" ? `${(r.stats as any).processed} symbols` : ((r.stats as any)?.reason ?? "")}</span>
                  {r.errors > 0 && <Chip tone="warn">{r.errors} errors</Chip>}
                  <Chip tone={r.status === "done" ? "gain" : r.status === "running" ? "accent" : r.status === "failed" ? "loss" : "neutral"}>{r.status}</Chip>
                </span>
              </li>
            ))}
            {data.runs.length === 0 && <li className="py-2 text-muted">No runs yet.</li>}
          </ul>
        </Card>
        <Card className="p-5">
          <CardHeader overline="The shared demo (last 30 days)" title="Are visitors looking around?" />
          <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
            <Mini label="Demo sign-ins" value={data.demo.signIns} />
            <Mini label="Screens opened" value={data.demo.views} />
            <Mini label="Opened Analysis" value={data.demo.analysisViews} />
            <Mini label="Questions asked" value={data.demo.questions} />
          </dl>
          <p className="t-caption mt-4">Everyone who presses “Try the demo” shares the same accounts, so these are counts of actions, not of people.</p>
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
