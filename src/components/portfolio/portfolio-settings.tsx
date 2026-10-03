"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { Field, FormAlert, Input, Select } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { apiCall } from "@/lib/api-client";

type P = { id: string; name: string; ownerLabel: string | null; language: "en" | "hi"; alertsEnabled: boolean };
type R = { email: string; confirmed: boolean; unsubscribed: boolean } | null;

/** H6: whose portfolio, which language, and the family member who receives reports and major alerts. */
export function PortfolioSettings({ p, recipient, isDemo, emailConfigured }: { p: P; recipient: R; isDemo: boolean; emailConfigured: boolean }) {
  const router = useRouter();
  const [name, setName] = useState(p.name);
  const [owner, setOwner] = useState(p.ownerLabel ?? "");
  const [language, setLanguage] = useState(p.language);
  const [alerts, setAlerts] = useState(p.alertsEnabled);
  const [email, setEmail] = useState(recipient?.email ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="space-y-5">
      <Card className="p-5 sm:p-6">
        <CardHeader overline="About" title="Portfolio" />
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Name" htmlFor="name">
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Whose portfolio" htmlFor="owner" hint="Leave empty if it's yours.">
            <Input id="owner" value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="e.g. Papa" />
          </Field>
          <Field label="Language for reports and alerts" htmlFor="language">
            <Select id="language" value={language} onChange={(e) => setLanguage(e.target.value as "en" | "hi")}>
              <option value="en">English</option>
              <option value="hi">Simple Hindi (हिंदी)</option>
            </Select>
          </Field>
          <div className="flex items-end justify-between gap-3 rounded-none border border-line bg-surface-2 px-4 py-3">
            <div>
              <div className="text-sm font-medium text-text">Alerts for this portfolio</div>
              <div className="t-caption">Off = nothing is emailed; the inbox still shows them.</div>
            </div>
            <Switch checked={alerts} onChange={setAlerts} label="Alerts for this portfolio" />
          </div>
        </div>
        <Button
          className="mt-5"
          loading={busy}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              await apiCall(`/api/portfolios/${p.id}`, "PATCH", { name, ownerLabel: owner.trim() || null, language, alertsEnabled: alerts });
              toast("Saved");
              router.refresh();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          Save changes
        </Button>
      </Card>

      <Card className="p-5 sm:p-6">
        <CardHeader overline="Family delivery" title="Who else should hear about this portfolio?" />
        <p className="mt-1 text-sm text-muted">
          They get the Sunday weekly report and major alerts by email, in {language === "hi" ? "simple Hindi" : "English"}. They confirm once with a click; every email has a one-click unsubscribe.
        </p>
        {recipient && (
          <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
            <span className="text-text">{recipient.email}</span>
            {recipient.unsubscribed ? <Chip tone="warn">Unsubscribed</Chip> : recipient.confirmed ? <Chip tone="gain">Confirmed</Chip> : <Chip tone="warn">Waiting for confirmation</Chip>}
          </div>
        )}
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <Input aria-label="Family member's email" type="email" inputMode="email" placeholder="papa@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          <Button
            variant="secondary"
            onClick={async () => {
              setError(null);
              try {
                const j = await apiCall(`/api/portfolios/${p.id}/recipient`, "POST", { email });
                toast(j.status === "sent" ? "We emailed them a one-click confirmation." : j.status === "demo" ? "Saved. Test accounts never send email." : j.status === "not_configured" ? "Saved. Email isn't configured on this server, so nothing was sent." : "Saved, but the confirmation email failed. Try again later.");
                router.refresh();
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            {recipient ? "Change" : "Send confirmation"}
          </Button>
          {recipient && (
            <Button
              variant="ghost"
              onClick={async () => {
                await apiCall(`/api/portfolios/${p.id}/recipient`, "DELETE");
                setEmail("");
                router.refresh();
              }}
            >
              Remove
            </Button>
          )}
        </div>
        {!emailConfigured && !isDemo && <p className="t-caption mt-3">Email isn&apos;t configured on this deployment yet, so reports stay in the app for now.</p>}
        <FormAlert message={error} />
      </Card>

      <Card className="p-5 sm:p-6">
        <CardHeader overline="Danger zone" title="Delete this portfolio" />
        <p className="mt-1 text-sm text-muted">Removes its holdings, alerts and reports. This can&apos;t be undone.</p>
        <Button
          variant="danger"
          className="mt-4"
          onClick={async () => {
            if (!confirm(`Delete "${p.name}" and everything in it?`)) return;
            await apiCall(`/api/portfolios/${p.id}`, "DELETE");
            document.cookie = "nazar_pf=; Path=/; Max-Age=0";
            router.push("/portfolio");
            router.refresh();
          }}
        >
          Delete portfolio
        </Button>
      </Card>
    </div>
  );
}
