"use client";
import Link from "next/link";
import type { ReactNode } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Insights } from "@/lib/insights";
import { LocalTime } from "./LocalTime";
import { TOOL_LABELS } from "@/lib/followups";
import { FEEDBACK_REASONS } from "@/lib/feedback-reasons";
import { getModel } from "@/lib/models";

/* Single-hue sequential palette on the app's dark surface: one series per chart, so no legend. */
const INK = { bar: "#34d399", track: "#27272a", grid: "#27272a", axis: "#71717a" };

const pct = (v: number | null | undefined, digits = 0) => (v == null ? "—" : `${(v * 100).toFixed(digits)}%`);
const secs = (ms: number | null | undefined) => (ms == null ? "—" : ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`);
const usd = (v: number | null | undefined) => (v == null ? "—" : v < 0.01 ? `$${v.toFixed(4)}` : `$${v.toFixed(3)}`);

function delta(cur: number, prev: number) {
  if (!prev) return cur ? "new this week" : "no change";
  const d = cur / prev - 1;
  return `${d >= 0 ? "▲" : "▼"} ${Math.abs(d * 100).toFixed(0)}% vs prior 7d`;
}

function Tile({ label, value, hint, note }: { label: string; value: ReactNode; hint?: string; note?: string }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-3" title={hint}>
      <div className="text-[11px] uppercase tracking-wide text-zinc-500">{label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums text-zinc-100">{value}</div>
      {note && <div className="mt-0.5 text-[11px] text-zinc-500">{note}</div>}
    </div>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
      <h2 className="text-sm font-semibold text-zinc-100">{title}</h2>
      {subtitle && <p className="mt-0.5 text-xs text-zinc-500">{subtitle}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

/** Ranked horizontal bars with the value printed (identity is the text label, never color). */
function Ranked({ rows, format = (n) => String(n), empty = "No data yet." }: { rows: { name: string; value: number }[]; format?: (n: number) => string; empty?: string }) {
  if (!rows.length) return <div className="text-xs text-zinc-600">{empty}</div>;
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <ul className="space-y-1.5">
      {rows.map((r) => (
        <li key={r.name} className="grid grid-cols-[minmax(0,9rem)_1fr_3rem] items-center gap-2 text-xs" title={`${r.name}: ${format(r.value)}`}>
          <span className="truncate text-zinc-300">{r.name}</span>
          <span className="h-2 rounded-full" style={{ background: INK.track }}>
            <span className="block h-2 rounded-full" style={{ width: `${(r.value / max) * 100}%`, background: INK.bar }} />
          </span>
          <span className="text-right tabular-nums text-zinc-400">{format(r.value)}</span>
        </li>
      ))}
    </ul>
  );
}

function DailyChart({ data, dataKey, label }: { data: Insights["days"]; dataKey: "questions" | "users" | "blocked"; label: string }) {
  return (
    <div className="h-40" role="img" aria-label={`${label} per day, last 14 days`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 4, left: -24, bottom: 0 }} barCategoryGap={4}>
          <CartesianGrid stroke={INK.grid} vertical={false} />
          <XAxis dataKey="day" tick={{ fill: INK.axis, fontSize: 10 }} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={16} />
          <YAxis allowDecimals={false} tick={{ fill: INK.axis, fontSize: 10 }} tickLine={false} axisLine={false} />
          <Tooltip cursor={{ fill: "#ffffff0d" }} contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", borderRadius: 8, fontSize: 12 }} labelStyle={{ color: "#a1a1aa" }} itemStyle={{ color: "#e4e4e7" }} formatter={(v) => [v, label]} />
          <Bar dataKey={dataKey} fill={INK.bar} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function InsightsView({ data }: { data: Insights }) {
  const k = data.kpis;
  const funnelTop = Math.max(data.funnel[0]?.users ?? 0, 1);
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-10 border-b border-zinc-800/80 bg-zinc-950/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div>
            <h1 className="text-base font-semibold">Stock AI · Product insights</h1>
            <p className="text-xs text-zinc-500">Last 30 days of first-party events · generated <LocalTime iso={data.generatedAt} /></p>
          </div>
          <Link href="/" className="rounded-lg border border-zinc-800 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-900">Back to app</Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-4 px-4 py-5">
        {/* North Star + KPI row */}
        <div className="grid gap-3 lg:grid-cols-[minmax(0,18rem)_1fr]">
          <div className="rounded-xl border border-emerald-800/50 bg-emerald-950/20 p-4">
            <div className="text-[11px] uppercase tracking-wide text-emerald-300/80">North Star · Weekly Active Researchers</div>
            <div className="mt-1 text-5xl font-semibold tabular-nums text-zinc-50">{data.nsm.value}</div>
            <div className="mt-1 text-xs text-zinc-400">{delta(data.nsm.value, data.nsm.prev)}</div>
            <p className="mt-3 text-[11px] leading-relaxed text-zinc-500">Users who received at least one answer backed by live market data in the last 7 days. It counts delivered value, not visits or raw message volume.</p>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            <Tile label="Questions answered (7d)" value={k.questions7} note={delta(k.questions7, k.questionsPrev)} />
            <Tile label="Helpful rate (7d)" value={pct(k.helpfulRate7)} note={`${k.ratings7} ratings · ${pct(k.feedbackCoverage7)} of answers rated`} hint="👍 / (👍 + 👎)" />
            <Tile label="Returning users" value={pct(k.returningRate)} note="asked on 2+ different days" />
            <Tile label="Questions per user" value={k.avgQuestionsPerUser?.toFixed(1) ?? "—"} note="30-day average" />
            <Tile label="Cost per answer" value={usd(k.costPerAnswer7)} note={`7d spend ${usd(k.spend7)} incl. guard`} />
            <Tile label="Latency p50 / p95" value={`${secs(k.p50Latency)} / ${secs(k.p95Latency)}`} note={`first text at ${secs(k.p50Ttft)} (p50)`} />
            <Tile label="Scope-guard blocks" value={pct(k.blockRate7)} note={`adds ${secs(k.p50Guard)} (p50) per question`} />
            <Tile label="Data reliability" value={pct(k.toolErrorRate7 == null ? null : 1 - k.toolErrorRate7, 1)} note={`${k.answerErrors7} answer errors · ${k.rateLimited7} rate-limited`} hint="Share of tool calls that returned data" />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Section title="Questions answered per day" subtitle="Last 14 days (excludes blocked requests)">
            <DailyChart data={data.days} dataKey="questions" label="Questions" />
          </Section>
          <Section title="Active users per day" subtitle="Distinct users with any event">
            <DailyChart data={data.days} dataKey="users" label="Users" />
          </Section>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Section title="Activation funnel (30 days)" subtitle="Where new users drop off. Each step shows % of the step above.">
            <ul className="space-y-2">
              {data.funnel.map((f, i) => {
                const prev = i ? data.funnel[i - 1].users : f.users;
                return (
                  <li key={f.step} className="text-xs">
                    <div className="mb-0.5 flex justify-between text-zinc-300">
                      <span>{f.step}</span>
                      <span className="tabular-nums text-zinc-400">
                        {f.users} {i > 0 && <span className="text-zinc-500">· {pct(prev ? f.users / prev : null)}</span>}
                      </span>
                    </div>
                    <div className="h-2.5 rounded-full" style={{ background: INK.track }}>
                      <div className="h-2.5 rounded-full" style={{ width: `${(f.users / funnelTop) * 100}%`, background: INK.bar }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          </Section>
          <Section title="What people research" subtitle="Most-asked tickers (30 days)">
            <Ranked rows={data.tickers} />
            <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
              <div>
                <div className="mb-1 text-zinc-500">Market</div>
                <Ranked rows={data.markets.map((m) => ({ name: { IN: "India", US: "US", MIXED: "India + US", NONE: "No ticker", OTHER: "Other" }[m.name] ?? m.name, value: m.value }))} />
              </div>
              <div>
                <div className="mb-1 text-zinc-500">Language</div>
                <Ranked rows={data.languages.map((l) => ({ name: l.name === "hi" ? "Hindi (Devanagari)" : "English / Hinglish", value: l.value }))} />
              </div>
            </div>
          </Section>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Section title="Tool usage" subtitle="Which research capabilities the agent calls">
            <Ranked rows={data.tools.map((t) => ({ name: TOOL_LABELS[t.name] ?? t.name, value: t.value }))} />
          </Section>
          <Section title="Model mix" subtitle={`Auto routing chose the model for ${pct(data.autoShare)} of answers`}>
            <Ranked rows={data.models.map((m) => ({ name: getModel(m.name)?.label ?? m.name, value: m.value }))} />
            <div className="mt-3 mb-1 text-xs text-zinc-500">Answer style</div>
            <Ranked rows={data.modes.map((m) => ({ name: m.name === "pro" ? "Pro" : "Simple", value: m.value }))} />
          </Section>
          <Section title="Quality signals" subtitle="👍/👎 by answer style, and why answers got 👎">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-zinc-500"><th className="text-left font-medium">Style</th><th className="text-right font-medium">👍</th><th className="text-right font-medium">👎</th><th className="text-right font-medium">Helpful</th></tr>
              </thead>
              <tbody>
                {data.helpfulByMode.map((m) => (
                  <tr key={m.mode} className="border-t border-zinc-800/60">
                    <td className="py-1 text-zinc-300">{m.mode === "pro" ? "Pro" : "Simple"}</td>
                    <td className="py-1 text-right tabular-nums">{m.up}</td>
                    <td className="py-1 text-right tabular-nums">{m.down}</td>
                    <td className="py-1 text-right tabular-nums">{pct(m.up + m.down ? m.up / (m.up + m.down) : null)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-3 mb-1 text-xs text-zinc-500">👎 reasons</div>
            <Ranked rows={data.downReasons.map((r) => ({ name: FEEDBACK_REASONS[r.name as keyof typeof FEEDBACK_REASONS] ?? r.name, value: r.value }))} empty="No negative feedback yet." />
          </Section>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Section title="Guardrail: what gets blocked" subtitle="Topic labels from the scope classifier. Raw questions are never stored in analytics.">
            <Ranked rows={data.blockedTopics} empty="Nothing blocked yet." />
            <div className="mt-3 flex gap-4 text-xs text-zinc-500">
              {data.blockVerdicts.map((v) => (
                <span key={v.name}>{v.name === "prompt_attack" ? "Jailbreak / prompt attacks" : "Off-topic"}: <b className="text-zinc-300">{v.value}</b></span>
              ))}
            </div>
          </Section>
          <Section title="Feature engagement (30 days)" subtitle={`Follow-up suggestions are clicked on ${pct(data.suggestionCtr)} of answers`}>
            <Ranked rows={data.engagement} />
            <div className="mt-3 text-xs text-zinc-500">
              Live state: {data.totals.chats} chats · {data.totals.watchlistItems} watchlist items · {data.totals.activeAlerts} active alerts · {data.totals.events} events tracked
            </div>
          </Section>
        </div>

        <Section title="Metric definitions" subtitle="How each number is computed (src/lib/insights.ts)">
          <dl className="grid gap-x-6 gap-y-2 text-xs sm:grid-cols-2">
            {[
              ["Weekly Active Researchers", "Distinct users with ≥1 answered question that used ≥1 live-data tool in the last 7 days."],
              ["Helpful rate", "👍 ÷ (👍 + 👎) on answers rated in the last 7 days; coverage = rated ÷ answered."],
              ["Scope-guard block rate", "Blocked requests ÷ (blocked + answered) in the last 7 days."],
              ["Cost per answer", "Estimated OpenAI cost of answered questions ÷ count (list prices in src/lib/models.ts)."],
              ["Latency", "Server time from request to finished answer; first text = time to first streamed token."],
              ["Data reliability", "Share of tool calls in the last 7 days that returned data rather than an error."],
              ["Returning users", "Users who asked questions on 2+ distinct days ÷ users who asked any question (30d)."],
              ["Funnel", "Distinct users reaching each step in the last 30 days."],
            ].map(([t, d]) => (
              <div key={t}>
                <dt className="font-medium text-zinc-300">{t}</dt>
                <dd className="text-zinc-500">{d}</dd>
              </div>
            ))}
          </dl>
        </Section>
      </main>
    </div>
  );
}
