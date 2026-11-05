"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Card, CardHeader } from "@/components/ui/card";
import { Field, Select } from "@/components/ui/field";
import { apiCall } from "@/lib/api-client";
import { SLABS } from "@/lib/portfolio/capital-gains";

/**
 * The income-tax slab, used only to put a rupee figure on gains taxed at the slab rate (US stocks
 * and gold held a short while, debt funds). Optional: without it those gains are shown without one.
 */
export function TaxCard({ slabPct }: { slabPct: number | null }) {
  const router = useRouter();
  const [value, setValue] = useState(slabPct == null ? "" : String(slabPct));
  const [busy, setBusy] = useState(false);
  const save = async (v: string) => {
    setValue(v);
    setBusy(true);
    try {
      await apiCall("/api/settings", "PATCH", { prefs: { taxSlabPct: v === "" ? null : Number(v) } });
      toast(v === "" ? "Slab cleared" : `Slab set to ${v}%`);
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card id="tax" className="scroll-mt-24 p-5 sm:p-6">
      <CardHeader overline="Tax" title="Your income-tax slab" />
      <p className="mt-2 text-[13px] leading-5 text-muted">
        Some gains are taxed at the rate on the rest of your income: US stocks and gold held a short while, and debt funds. Give your slab and Analysis puts a rupee figure on
        them. It stays in your account and is used for nothing else.
      </p>
      <div className="mt-3 max-w-xs">
        <Field label="Highest slab your income reaches" htmlFor="slab">
          <Select id="slab" value={value} disabled={busy} onChange={(e) => save(e.target.value)}>
            <option value="">Not set</option>
            {SLABS.map((s) => (
              <option key={s} value={s}>
                {s}%
              </option>
            ))}
          </Select>
        </Field>
      </div>
    </Card>
  );
}
