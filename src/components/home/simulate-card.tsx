"use client";
import { CloudLightning } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button, buttonClass } from "@/components/ui/button";
import { Field, FormAlert, Input } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { cn } from "@/lib/cn";
import { apiCall } from "@/lib/api-client";

const SCENARIOS = [
  { id: "global-selloff", title: "Global slide", body: "The Nifty falls 3.2%; IT and autos are hit hardest, and one of your stocks has bad news of its own." },
  { id: "rate-shock", title: "Rate shock", body: "A surprise rate hike: banks and lenders fall about 4%." },
  { id: "company-shock", title: "One company's bad day", body: "A quiet market, but one of your biggest holdings falls 8%." },
];

/** DEMO: "Simulate a bad day in the market" — runs the real alert engine on a generated session. */
export function SimulateCard({ active }: { active: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [scenario, setScenario] = useState("global-selloff");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      const j = await apiCall("/api/demo/simulate", "POST", { scenario, email: email.trim() || undefined }, "Couldn't run the simulation.");
      setOpen(false);
      toast(`${j.alerts} ${j.alerts === 1 ? "alert" : "alerts"} just arrived`, {
        description: j.emailed === "sent" ? `A copy is on its way to ${email.trim()}.` : j.emailed === "not_configured" ? "Email isn't configured on this deployment, so they're in your inbox only." : "Open Alerts to see what happened and why.",
        action: { label: "Open Alerts", onClick: () => router.push("/alerts") },
      });
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Card className="relative overflow-hidden p-5 sm:p-6" data-tour="simulate">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-none bg-accent-soft text-accent">
            <CloudLightning className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <div className="t-overline">Demo</div>
            <h2 className="t-title-2 text-text">Simulate a bad day in the market</h2>
            <p className="mt-1 text-sm text-muted">See exactly what Nazar would send you: the real alert engine runs on a generated session for this demo portfolio.</p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={() => setOpen(true)} className="flex-1 sm:flex-none">{active ? "Simulate another day" : "Simulate a bad day"}</Button>
          {active && (
            <Link href="/alerts" className={buttonClass("secondary", "md", "flex-1 sm:flex-none")}>
              See the alerts
            </Link>
          )}
        </div>
      </Card>
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="Simulate a bad day"
        description="Pick what happens. Nothing here touches real data; it's only in your demo."
        footer={
          <Button onClick={run} loading={busy} className="w-full">
            Run the simulation
          </Button>
        }
      >
        <fieldset className="space-y-2">
          <legend className="sr-only">Scenario</legend>
          {SCENARIOS.map((s) => (
            <label key={s.id} className={cn("flex cursor-pointer gap-3 rounded-none border p-3.5 transition-colors", scenario === s.id ? "border-accent bg-accent-soft" : "border-line hover:bg-surface-2")}>
              <input type="radio" name="scenario" value={s.id} checked={scenario === s.id} onChange={() => setScenario(s.id)} className="mt-1 accent-[var(--accent)]" />
              <span>
                <span className="block font-medium text-text">{s.title}</span>
                <span className="block text-sm text-muted">{s.body}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <div className="mt-5">
          <Field label="Also email me the alerts (optional)" htmlFor="sim-email" hint="Your own address only. We send it once and never store it for anything else.">
            <Input id="sim-email" type="email" inputMode="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
        </div>
        <div className="mt-4">
          <FormAlert message={error} />
        </div>
      </Sheet>
    </>
  );
}
