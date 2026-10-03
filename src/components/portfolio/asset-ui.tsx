import { Building2, Coins, Home, Landmark, Layers, Package, PieChart, PiggyBank, ScrollText, ShieldCheck, TrendingUp, Wallet, type LucideIcon } from "lucide-react";
import { ASSET_META, GROUP_COLOR, groupOf, type AssetClass, type AssetGroup } from "@/lib/instruments/asset-classes";
import { cn } from "@/lib/cn";

export const ASSET_ICON: Record<AssetClass, LucideIcon> = {
  stock: TrendingUp,
  mf: PieChart,
  etf: Layers,
  reit: Building2,
  gold: Coins,
  fd: Landmark,
  bond: ScrollText,
  ppf: PiggyBank,
  epf: PiggyBank,
  nps: ShieldCheck,
  property: Home,
  cash: Wallet,
  other: Package,
};

/** The round icon that marks an asset's class, tinted with its group colour. */
export function AssetIcon({ assetClass, size = "md", className }: { assetClass: AssetClass; size?: "sm" | "md"; className?: string }) {
  const Icon = ASSET_ICON[assetClass];
  const color = GROUP_COLOR[groupOf(assetClass)];
  return (
    <span aria-hidden className={cn("grid shrink-0 place-items-center rounded-[12px]", size === "sm" ? "h-8 w-8" : "h-10 w-10", className)} style={{ color, background: `color-mix(in srgb, ${color} 14%, transparent)` }}>
      <Icon className={size === "sm" ? "h-4 w-4" : "h-5 w-5"} />
    </span>
  );
}

export function ClassBadge({ assetClass }: { assetClass: AssetClass }) {
  return <span className="rounded-full border border-line px-2 py-0.5 text-[11px] font-medium text-muted whitespace-nowrap">{ASSET_META[assetClass].label}</span>;
}

export type Slice = { group: AssetGroup; value: number; weight: number; count: number };

/** One stacked bar of the portfolio by asset group, with a legend that reads without colour. */
export function AllocationBar({ slices, format }: { slices: Slice[]; format: (n: number) => string }) {
  if (!slices.length) return null;
  return (
    <div>
      <div className="flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full" role="img" aria-label={`Allocation: ${slices.map((s) => `${s.group} ${Math.round(s.weight * 100)}%`).join(", ")}`}>
        {slices.map((s) => (
          <div key={s.group} className="h-full first:rounded-l-full last:rounded-r-full" style={{ width: `${Math.max(1.5, s.weight * 100)}%`, background: GROUP_COLOR[s.group] }} />
        ))}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
        {slices.map((s) => (
          <li key={s.group} className="flex items-center gap-2 text-[13px]">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: GROUP_COLOR[s.group] }} aria-hidden />
            <span className="text-text">{s.group}</span>
            <span className="num text-muted">
              {Math.round(s.weight * 100)}% · {format(s.value)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
