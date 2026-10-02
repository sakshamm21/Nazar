"use client";
import { useState } from "react";
import { AlertCard, type AlertDTO } from "@/components/alerts/alert-card";
import { PriceChart } from "@/components/charts/price-chart";
import { Sparkline } from "@/components/charts/sparkline";
import { IrisLoader } from "@/components/rings/iris";
import { NazarMark, Wordmark } from "@/components/rings/nazar-mark";
import { QuietRings } from "@/components/rings/quiet-rings";
import { RingGauge } from "@/components/rings/ring-gauge";
import { WatchingStatus } from "@/components/rings/watching";
import { AnimatedNumber } from "@/components/ui/animated-number";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { Delta } from "@/components/ui/delta";
import { Field, FormAlert, Input, Select } from "@/components/ui/field";
import { InfoTip } from "@/components/ui/info-tip";
import { SeverityIcon } from "@/components/ui/severity";
import { Sheet } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Segmented, Switch } from "@/components/ui/switch";
import { inr } from "@/lib/format";

const TOKENS = ["bg", "surface-1", "surface-2", "surface-3", "line", "line-strong", "text", "muted", "subtle", "accent", "accent-ink", "ice", "gain", "loss", "warn"];
const series = Array.from({ length: 60 }, (_, i) => ({ date: new Date(Date.UTC(2026, 6, 1 + i)).toISOString().slice(0, 10), value: 1500 + Math.sin(i / 6) * 60 + i * 3 + (i % 7) * 4 }));
const sample: AlertDTO = {
  id: "sample",
  type: "stock_move",
  symbol: "TMPV.NS",
  severity: "critical",
  tradeDate: "2026-10-02",
  titleEn: "Tata Motors fell 7.0%",
  bodyEn: "Likely reason: something specific to Tata Motors. It moved far more than the market (Nifty −0.4%). Tata Motors is 22% of your portfolio; its value fell ~₹8,400 today.",
  titleHi: "Tata Motors 7.0% गिरा",
  bodyHi: "संभावित वजह: Tata Motors से जुड़ी कोई बात। Tata Motors आपके पोर्टफोलियो का 22% हिस्सा है; आज इसकी वैल्यू लगभग ₹8,400 कम हुई।",
  data: { reason: { kind: "company" }, impactInr: -8400 },
  isSimulated: false,
  readAt: null,
  rating: null,
  portfolio: { id: "p", label: "Papa's", language: "hi" },
};

export function StyleGuide() {
  const [value, setValue] = useState(1864210);
  return (
    <div className="grid lg:grid-cols-2">
      {(["dark", "light"] as const).map((t) => (
        <div key={t} data-theme={t} className="bg-bg p-5 text-text sm:p-8">
          <div className="t-overline">{t} theme</div>
          <Section title="Brand">
            <div className="flex items-center gap-5">
              <Wordmark />
              <NazarMark size={40} />
              <IrisLoader size={32} />
            </div>
            <WatchingStatus stocks={14} lastCheck="4:47 PM" className="mt-4" />
          </Section>

          <Section title="Colour tokens">
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
              {TOKENS.map((k) => (
                <div key={k} className="text-[11px]">
                  <div className="h-12 rounded-[12px] border border-line" style={{ background: `var(--${k})` }} />
                  <div className="mt-1 font-mono text-muted">--{k}</div>
                </div>
              ))}
            </div>
          </Section>

          <Section title="Type scale">
            <div className="t-display">
              <AnimatedNumber value={value} format={(n) => inr(n)} />
            </div>
            <Button size="sm" variant="ghost" className="-ml-3" onClick={() => setValue((v) => v + Math.round((Math.random() - 0.45) * 40000))}>
              Roll the number
            </Button>
            <div className="t-title-1 mt-2">Title 1 · Hidden risks</div>
            <div className="t-title-2">Title 2 · What needs your attention</div>
            <p className="mt-1 text-[15px]">Body · Nazar watches your stocks every day and messages you only when something important happens.</p>
            <p className="text-sm text-muted">Small · secondary text in muted.</p>
            <p className="t-caption">Caption · as of Fri, 2 Oct close</p>
            <p className="t-overline mt-1">Overline · Portfolio health</p>
            <p className="font-mono text-sm">INFY.NS · IBM Plex Mono</p>
            <p lang="hi" className="hi mt-1">हिंदी: इस हफ़्ते आपका पोर्टफोलियो 1.8% बढ़ा।</p>
          </Section>

          <Section title="Numbers and change">
            <div className="flex flex-wrap items-center gap-4">
              <Delta amount={-8012} pct={-0.0143} />
              <Delta amount={12400} pct={0.018} />
              <Delta pct={0} />
              <Sparkline values={series.map((s) => s.value)} />
            </div>
          </Section>

          <Section title="Rings">
            <div className="flex flex-wrap items-center gap-6">
              <RingGauge outer={82} inner={64} size={132} label="health" />
              <div className="flex items-center gap-3">
                <SeverityIcon severity="critical" size={18} /> Major
                <SeverityIcon severity="important" size={18} /> Worth knowing
                <SeverityIcon severity="info" size={18} /> Info
              </div>
            </div>
            <QuietRings compact title="All quiet today." body="Nothing needs your attention." />
          </Section>

          <Section title="Controls">
            <div className="flex flex-wrap gap-2">
              <Button>Primary</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="danger">Danger</Button>
              <Button loading>Loading</Button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Chip>Neutral</Chip>
              <Chip tone="accent">Accent</Chip>
              <Chip tone="gain">Gain</Chip>
              <Chip tone="loss">Loss</Chip>
              <Chip tone="warn">Warn</Chip>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Field label="Email" htmlFor={`e-${t}`}>
                <Input id={`e-${t}`} placeholder="you@example.com" />
              </Field>
              <Field label="Language" htmlFor={`l-${t}`}>
                <Select id={`l-${t}`}>
                  <option>Simple Hindi</option>
                  <option>English</option>
                </Select>
              </Field>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-4">
              <Segmented label="Sample" value="balanced" onChange={() => {}} options={[{ value: "major", label: "Major" }, { value: "balanced", label: "Balanced" }, { value: "everything", label: "Everything" }]} size="sm" />
              <Switch checked onChange={() => {}} label="Sample switch" />
              <span className="flex items-center gap-1 text-sm text-muted">
                Beta <InfoTip k="beta" />
              </span>
            </div>
            <div className="mt-3">
              <FormAlert message="That code is not valid. 4 attempts left." />
            </div>
            <SheetDemo />
          </Section>

          <Section title="Cards, charts, skeletons">
            <Card className="p-5">
              <CardHeader overline="Card" title="Price, 60 days" />
              <PriceChart points={series} height={160} />
            </Card>
            <Card className="mt-3 p-5">
              <AlertCard a={sample} />
            </Card>
            <div className="mt-3 space-y-2">
              <Skeleton className="h-6 w-1/2" />
              <Skeleton className="h-24 w-full" />
            </div>
          </Section>
        </div>
      ))}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="t-title-2 mb-3 text-text">{title}</h2>
      {children}
    </section>
  );
}

function SheetDemo() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="secondary" size="sm" className="mt-3" onClick={() => setOpen(true)}>
        Open a sheet
      </Button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Bottom sheet" description="Slides up on mobile, centred on desktop.">
        <p className="text-sm text-muted">Focus is trapped here; Esc closes it.</p>
      </Sheet>
    </>
  );
}
