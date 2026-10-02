"use client";
import { RotateCcw, Trash2 } from "lucide-react";
import { useTheme } from "next-themes";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { Field, Input, Select } from "@/components/ui/field";
import { InfoTip } from "@/components/ui/info-tip";
import { Segmented, Switch } from "@/components/ui/switch";
import { cn } from "@/lib/cn";

type Change = { id: string; alertType: string; oldValue: number | null; newValue: number | null; muted: boolean; messageEn: string; createdAt: string; undoneAt: string | null; evidence: { below: { useful: number; total: number }; above: { useful: number; total: number } } };
type Target = { id: string; symbol: string; direction: "above" | "below"; target: number; triggeredAt: string | null };

const SENS = [
  { value: "major", label: "Major", body: "Only big moves (6%+) and important events. The calmest." },
  { value: "balanced", label: "Balanced", body: "Moves of 4%+ that matter to your portfolio, results and health changes." },
  { value: "everything", label: "Everything", body: "Smaller moves too (2.5%+), plus reminders before results." },
] as const;

const TYPE: Record<string, string> = { stock_move: "Stock moves", portfolio_move: "Whole-portfolio moves", concentration: "Concentration", results_upcoming: "Upcoming results reminders" };

async function call(url: string, method: string, body?: unknown) {
  const res = await fetch(url, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error ?? "Something went wrong.");
  return j;
}

export function SettingsView(props: {
  user: { name: string; email: string; isDemo: boolean; isTestAccount: boolean; emailVerified: boolean };
  settings: { sensitivity: "major" | "balanced" | "everything"; quietMode: boolean; emailDigest: boolean };
  effective: { stockMove: number; portfolioMove: number; concentration: number };
  changes: Change[];
  targets: Target[];
  emailConfigured: boolean;
}) {
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const [s, setS] = useState(props.settings);
  const [model, setModel] = useState("auto");
  const [models, setModels] = useState<{ id: string; label: string; blurb: string }[]>([]);
  useEffect(() => {
    try {
      setModel(localStorage.getItem("nazar:model") ?? "auto");
    } catch {}
    fetch("/api/models").then((r) => (r.ok ? r.json() : null)).then((j) => j && setModels(j.models));
  }, []);
  const save = async (patch: Partial<typeof s>) => {
    const next = { ...s, ...patch };
    setS(next);
    try {
      await call("/api/settings", "PATCH", patch);
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
      setS(s);
    }
  };
  const demo = props.user.isDemo;

  return (
    <div className="space-y-5">
      <Card className="p-5 sm:p-6">
        <CardHeader overline="Alerts" title="How much should Nazar tell you?" right={<InfoTip k="sensitivity" />} />
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          {SENS.map((o) => (
            <button key={o.value} onClick={() => save({ sensitivity: o.value })} aria-pressed={s.sensitivity === o.value} className={cn("rounded-[16px] border p-4 text-left transition-colors", s.sensitivity === o.value ? "border-accent bg-accent-soft" : "border-line hover:bg-surface-2")}>
              <span className="block font-medium text-text">{o.label}</span>
              <span className="mt-1 block text-sm text-muted">{o.body}</span>
            </button>
          ))}
        </div>
        <p className="t-caption mt-3">
          Right now: stock moves of {props.effective.stockMove}%+, whole-portfolio moves of {props.effective.portfolioMove}%+, any stock above {props.effective.concentration}% of a portfolio. Results are always explained.
        </p>
        <div className="mt-5 space-y-3">
          <SwitchRow label="Daily email digest" body={demo ? "Demo accounts never send email." : !props.emailConfigured ? "Email isn't configured on this deployment yet; alerts stay in the inbox." : props.user.emailVerified ? `One calm email a day at most, to ${props.user.email}.` : "Verify your email to receive digests."} checked={s.emailDigest && !demo} disabled={demo} onChange={(v) => save({ emailDigest: v })} />
          <SwitchRow label="Quiet mode" body="Only major (critical) alerts reach your email. Everything still appears in the inbox." checked={s.quietMode} onChange={(v) => save({ quietMode: v })} />
        </div>
      </Card>

      <Card className="scroll-mt-24 p-5 sm:p-6" id="learned">
        <CardHeader overline="Alerts that learn" title="What Nazar has learned from your ratings" right={<InfoTip k="learned" />} />
        {props.changes.length === 0 ? (
          <p className="mt-3 text-sm text-muted">Nothing yet. Rate alerts with 👍 or 👎; when a kind of alert isn&apos;t useful to you, Nazar raises the bar, tells you, and you can undo it here.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {props.changes.map((c) => (
              <li key={c.id} className="rounded-[16px] border border-line bg-surface-2 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-text">{TYPE[c.alertType] ?? c.alertType}</span>
                  {c.muted ? <Chip tone="accent">Muted</Chip> : <Chip tone="accent">{c.oldValue}% → {c.newValue}%</Chip>}
                  {c.undoneAt && <Chip>Undone</Chip>}
                  <span className="t-caption ml-auto">{new Date(c.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span>
                </div>
                <p className="mt-2 text-sm text-text">“{c.messageEn}”</p>
                <p className="t-caption mt-1.5">
                  Evidence: {c.evidence.below.total - c.evidence.below.useful} of your last {c.evidence.below.total} {c.muted ? "reminders" : `alerts below ${c.newValue}%`} were marked not useful
                  {c.evidence.above.total ? `; ${c.evidence.above.useful} of ${c.evidence.above.total} bigger ones were useful` : ""}.
                </p>
                {!c.undoneAt && (
                  <Button
                    variant="secondary"
                    size="sm"
                    className="mt-3"
                    onClick={async () => {
                      await call(`/api/thresholds/${c.id}/undo`, "POST");
                      toast("Undone. Nazar won't adjust this kind of alert for 30 days.");
                      router.refresh();
                    }}
                  >
                    <RotateCcw className="h-4 w-4" /> Undo
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <PriceTargets targets={props.targets} />

      <Card className="p-5 sm:p-6">
        <CardHeader overline="Appearance and Ask" title="Preferences" />
        <div className="mt-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm text-text">Theme</span>
            <Segmented
              label="Theme"
              value={resolvedTheme === "light" ? "light" : "dark"}
              onChange={(t) => {
                setTheme(t);
                void fetch("/api/events", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: "theme_change", props: { theme: t } }) }).catch(() => {});
              }}
              options={[
                { value: "dark", label: "Dark" },
                { value: "light", label: "Light" },
              ]}
              size="sm"
            />
          </div>
          <Field label="AI model for Ask" htmlFor="model" hint="Auto picks the cheapest model that can handle each question. Only used in the Ask tab.">
            <Select
              id="model"
              value={model}
              onChange={(e) => {
                setModel(e.target.value);
                try {
                  localStorage.setItem("nazar:model", e.target.value);
                } catch {}
              }}
            >
              <option value="auto">Auto (recommended)</option>
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}: {m.blurb}
                </option>
              ))}
            </Select>
          </Field>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm text-text">Guided tour of Nazar</span>
            <Button
              variant="secondary"
              size="sm"
              onClick={async () => {
                await call("/api/tour", "POST", { action: "restart" });
                router.push("/home?tour=1");
              }}
            >
              Restart the tour
            </Button>
          </div>
        </div>
      </Card>

      <Card className="p-5 sm:p-6">
        <CardHeader overline="Account" title={props.user.isDemo && !props.user.isTestAccount ? "Demo account" : props.user.name} />
        {!(props.user.isDemo && !props.user.isTestAccount) && <p className="mt-1 text-sm text-muted">{props.user.email}</p>}
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            variant="secondary"
            onClick={async () => {
              await call("/api/auth/logout", "POST");
              router.push("/");
              router.refresh();
            }}
          >
            Sign out
          </Button>
          {!props.user.isTestAccount && (
            <Button
              variant="danger"
              onClick={async () => {
                if (!confirm("Delete your account and all your portfolios, alerts and chats? This can't be undone.")) return;
                await call("/api/account", "DELETE");
                router.push("/");
                router.refresh();
              }}
            >
              <Trash2 className="h-4 w-4" /> Delete account
            </Button>
          )}
        </div>
        <p className="t-caption mt-5">We watch and explain; you decide. Nazar is not a SEBI-registered investment adviser and never tells you to buy, sell or hold.</p>
      </Card>
    </div>
  );
}

function SwitchRow({ label, body, checked, onChange, disabled }: { label: string; body: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-[14px] border border-line bg-surface-2 px-4 py-3">
      <div>
        <div className="text-sm font-medium text-text">{label}</div>
        <div className="t-caption mt-0.5">{body}</div>
      </div>
      <Switch checked={checked} onChange={onChange} label={label} disabled={disabled} />
    </div>
  );
}

function PriceTargets({ targets }: { targets: Target[] }) {
  const router = useRouter();
  const [symbol, setSymbol] = useState("");
  const [direction, setDirection] = useState<"above" | "below">("below");
  const [target, setTarget] = useState("");
  return (
    <Card className="p-5 sm:p-6">
      <CardHeader overline="Your own levels" title="Price alerts" />
      <p className="mt-1 text-sm text-muted">Pick a level and Nazar tells you when a stock closes beyond it. You choose the level; Nazar never suggests one.</p>
      <form
        className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-[1fr_10rem_8rem_auto]"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await call("/api/targets", "POST", { symbol: /\./.test(symbol) ? symbol : `${symbol.trim().toUpperCase()}.NS`, direction, target: Number(target) });
            setSymbol("");
            setTarget("");
            router.refresh();
          } catch (err) {
            toast.error((err as Error).message);
          }
        }}
      >
        <Input aria-label="NSE symbol" placeholder="NSE symbol, e.g. INFY" value={symbol} onChange={(e) => setSymbol(e.target.value)} className="col-span-2 font-mono sm:col-span-1" required />
        <Select aria-label="Direction" value={direction} onChange={(e) => setDirection(e.target.value as "above" | "below")} >
          <option value="below">closes below</option>
          <option value="above">closes above</option>
        </Select>
        <Input aria-label="Price in rupees" inputMode="decimal" placeholder="₹ price" value={target} onChange={(e) => setTarget(e.target.value)} required />
        <Button type="submit" variant="secondary" className="col-span-2 sm:col-span-1">
          Add
        </Button>
      </form>
      {targets.length > 0 && (
        <ul className="mt-4 divide-y divide-line text-sm">
          {targets.map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-3 py-2.5">
              <span className="text-text">
                <span className="font-mono">{t.symbol.replace(/\.NS$/, "")}</span> closes {t.direction} ₹{t.target.toLocaleString("en-IN")}
                {t.triggeredAt && <Chip tone="accent" className="ml-2">Reached</Chip>}
              </span>
              <button
                aria-label="Delete price alert"
                className="rounded-full p-2 text-subtle hover:bg-surface-2 hover:text-text"
                onClick={async () => {
                  await call("/api/targets", "DELETE", { ids: [t.id] });
                  router.refresh();
                }}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
