"use client";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Card, CardHeader } from "@/components/ui/card";
import { Field, Select } from "@/components/ui/field";
import { Segmented } from "@/components/ui/switch";
import { useHydrated, useStoredPref } from "@/lib/client-store";

/** How Nazar looks, and which model answers in Ask. Both are remembered on this device. */
export function Preferences() {
  const { resolvedTheme, setTheme } = useTheme();
  const hydrated = useHydrated(); // the theme is only known in the browser
  const [model, setModel] = useStoredPref<string>("nazar:model", "auto");
  const [models, setModels] = useState<{ id: string; label: string; blurb: string }[]>([]);
  useEffect(() => {
    fetch("/api/models").then((r) => (r.ok ? r.json() : null)).then((j) => j && setModels(j.models));
  }, []);
  return (
    <Card className="p-5 sm:p-6">
      <CardHeader overline="Preferences" title="Appearance and Ask" />
      <div className="mt-4 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-sm text-text">Theme</span>
          <Segmented label="Theme" value={hydrated && resolvedTheme === "light" ? "light" : "dark"} onChange={(t) => setTheme(t)} options={[{ value: "dark", label: "Dark" }, { value: "light", label: "Light" }]} />
        </div>
        <Field label="AI model for Ask" htmlFor="model" hint="Auto picks the cheapest model that can handle each question.">
          <Select id="model" value={model} onChange={(e) => setModel(e.target.value)}>
            <option value="auto">Auto</option>
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}: {m.blurb}
              </option>
            ))}
          </Select>
        </Field>
      </div>
    </Card>
  );
}
