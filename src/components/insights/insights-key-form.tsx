"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, FormAlert, Input } from "@/components/ui/field";

/**
 * The way in for someone who is not an admin account. The key is posted to /api/insights/key and
 * kept in an httpOnly cookie, rather than passed as /insights?key=… which would put the secret in
 * browser history, Referer headers and server logs.
 */
export function InsightsKeyForm() {
  const router = useRouter();
  const [key, setKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/insights/key", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ key }) });
    setBusy(false);
    if (!res.ok) {
      setError(((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? "That key is not valid.");
      return;
    }
    router.refresh();
  };

  return (
    <Card className="w-full max-w-sm p-5">
          <form onSubmit={submit} className="space-y-4" noValidate>
            <p className="text-sm text-muted">This page is only for Nazar&apos;s admins. Enter the insights key to view it.</p>
            <Field label="Insights key" htmlFor="insights-key">
              <Input id="insights-key" type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} placeholder="Paste the key" />
            </Field>
            <FormAlert message={error} />
            <Button type="submit" className="w-full" loading={busy} disabled={!key.trim()}>
              {busy ? "Checking…" : "View insights"}
            </Button>
          </form>
        </Card>
  );
}