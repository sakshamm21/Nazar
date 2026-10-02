"use client";
import { useMemo, useState } from "react";
import { PriceChart } from "@/components/charts/price-chart";
import { Delta } from "@/components/ui/delta";
import { Segmented } from "@/components/ui/switch";

const RANGES = { "1M": 22, "3M": 66, "6M": 130, "1Y": 252 } as const;

export function StockChart({ points }: { points: { date: string; value: number; compare?: number | null }[] }) {
  const [range, setRange] = useState<keyof typeof RANGES>("3M");
  const shown = useMemo(() => points.slice(-RANGES[range] - 1), [points, range]);
  const change = shown.length > 1 ? shown.at(-1)!.value / shown[0].value - 1 : null;
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm text-muted">
          {range}: <Delta pct={change} size="sm" />
        </span>
        <Segmented label="Chart range" value={range} onChange={setRange} options={Object.keys(RANGES).map((k) => ({ value: k as keyof typeof RANGES, label: k }))} size="sm" />
      </div>
      <div className="mt-3">
        <PriceChart points={shown} height={240} />
      </div>
    </div>
  );
}
