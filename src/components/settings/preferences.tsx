"use client";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Card, CardHeader } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { Segmented } from "@/components/ui/switch";
import { AUTO_STATS, statsFor, type ModelStats } from "@/lib/ask/model-stats";
import { useHydrated, useStoredPref } from "@/lib/client-store";
import { cn } from "@/lib/cn";

type Model = { id: string; label: string; blurb: string; tier: string; openWeights?: boolean; selfHosted?: boolean };

/** How Nazar looks, and which model answers in Ask. Both are remembered on this device. */
export function Preferences() {
  const { resolvedTheme, setTheme } = useTheme();
  const hydrated = useHydrated(); // the theme is only known in the browser
  const [model, setModel] = useStoredPref<string>("nazar:model", "auto");
  const [models, setModels] = useState<Model[]>([]);
  useEffect(() => {
    fetch("/api/models").then((r) => (r.ok ? r.json() : null)).then((j) => j && setModels(j.models));
  }, []);
  // A stored choice the deployment no longer offers falls back to Auto, here as it does on the server.
  const chosen = model === "auto" || models.some((m) => m.id === model) ? model : "auto";
  const open = models.filter((m) => m.openWeights);
  const closed = models.filter((m) => !m.openWeights);
  const option = (m: Model) => <ModelOption key={m.id} id={m.id} label={m.label} blurb={m.blurb} stats={statsFor(m.id)} badge={m.selfHosted ? "On your own server" : undefined} selected={chosen === m.id} onSelect={setModel} />;
  return (
    <Card className="p-5 sm:p-6">
      <CardHeader overline="Preferences" title="Appearance and Ask" />
      <div className="mt-4 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-sm text-text">Theme</span>
          <Segmented label="Theme" value={hydrated && resolvedTheme === "light" ? "light" : "dark"} onChange={(t) => setTheme(t)} options={[{ value: "dark", label: "Dark" }, { value: "light", label: "Light" }]} />
        </div>
        <div>
          <div className="text-sm font-medium text-text">Default model for Ask</div>
          <p className="mt-1 text-[13px] leading-5 text-muted">The model that answers your questions. The figures are from Nazar&apos;s own test questions, measured on 7 and 8 October 2026: estimates to compare by, not promises.</p>
          <div className="mt-3 space-y-5" role="radiogroup" aria-label="Default model for Ask">
            <div className="space-y-2">
              <ModelOption id="auto" label="Auto" blurb="Nazar picks for each question." stats={AUTO_STATS} badge="Default" selected={chosen === "auto"} onSelect={setModel} />
              <p className="px-1 text-[12px] leading-5 text-subtle">
                How Auto picks: one model, GPT-6 Luna, answers almost everything, because it passed the most test questions and cost the least. A question that asks for a deep dive or a full report goes to GPT-6 Sol, which in those tests was more careful with facts over a long answer. Auto does not switch between the other models below.
              </p>
            </div>
            {open.length > 0 && (
              <Group title="Open-weight models" note="Their weights are public, so they can be run on a server of your own, and then a question goes to no AI company. Until this deployment has such a server they run on hosts reached through OpenRouter, so a question still leaves Nazar. The topic check on each question uses a separate small model.">
                {open.map(option)}
              </Group>
            )}
            {closed.length > 0 && (
              <Group title="Closed models" note="Run only by the companies that make them. A question goes to that company through OpenRouter.">
                {closed.map(option)}
              </Group>
            )}
          </div>
          <p className="t-caption mt-3">Your choice is remembered on this device and used for every question from then on.</p>
        </div>
      </div>
    </Card>
  );
}

function Group({ title, note, children }: { title: string; note: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="t-overline">{title}</div>
      <p className="mt-1 text-[12px] leading-5 text-subtle">{note}</p>
      <div className="mt-2 space-y-2">{children}</div>
    </div>
  );
}

const cost = (usd: number) => (usd < 1 ? `$${usd.toFixed(2)}` : `$${usd.toLocaleString("en-US", { maximumFractionDigits: 1 })}`);

function ModelOption({ id, label, blurb, stats, badge, selected, onSelect }: { id: string; label: string; blurb: string; stats: ModelStats | null; badge?: string; selected: boolean; onSelect: (id: string) => void }) {
  return (
    <button type="button" role="radio" aria-checked={selected} onClick={() => onSelect(id)} className={cn("block w-full rounded-[14px] border p-3.5 text-left transition-colors", selected ? "border-accent bg-accent-soft" : "border-line hover:bg-surface-2")}>
      <span className="flex items-start gap-3">
        <span aria-hidden className={cn("mt-1 grid h-4 w-4 shrink-0 place-items-center rounded-full border", selected ? "border-accent" : "border-line")}>
          {selected && <span className="h-2 w-2 rounded-full bg-accent" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-text">{label}</span>
            {badge && <Chip tone="accent">{badge}</Chip>}
          </span>
          <span className="mt-0.5 block text-[13px] leading-5 text-muted">{stats?.note ?? blurb}</span>
          {stats && (
            <span className="num mt-2.5 grid grid-cols-3 gap-2 text-[12px]">
              <Stat label="Test questions passed" value={stats.passed != null ? `${stats.passed} of ${stats.outOf}` : "Not tested"} />
              <Stat label="Time to first word" value={stats.firstWordSeconds != null ? `${stats.firstWordSeconds.toFixed(1)} s` : "Not measured"} />
              <Stat label="Cost, 1,000 answers" value={stats.usdPer1000Answers != null ? `about ${cost(stats.usdPer1000Answers)}` : "Not measured"} />
            </span>
          )}
          {stats && <span className="mt-1.5 block text-[11px] leading-4 text-subtle">Tested on: {stats.testedOn}.</span>}
        </span>
      </span>
    </button>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <span className="block">
      <span className="block text-subtle">{label}</span>
      <span className="block font-medium text-text">{value}</span>
    </span>
  );
}
