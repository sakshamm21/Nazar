import { cn } from "@/lib/cn";

/** "Nazar is watching · 14 stocks · last check 4:47 PM", with a slowly breathing ring. */
export function WatchingStatus({ stocks, lastCheck, stale, className }: { stocks: number; lastCheck: string | null; stale?: boolean; className?: string }) {
  return (
    <div className={cn("inline-flex items-center gap-2 text-[13px] text-muted", className)} data-tour="watching">
      <span className="relative inline-grid h-4 w-4 place-items-center">
        <span className={cn("nz-breathe absolute inset-0 rounded-full border-[1.5px]", stale ? "border-warn" : "border-accent")} />
        <span className={cn("h-1.5 w-1.5 rounded-full", stale ? "bg-warn" : "bg-accent")} />
      </span>
      <span>
        Nazar is watching · <span className="num">{stocks}</span> {stocks === 1 ? "stock" : "stocks"}
        {lastCheck && (
          <>
            {" "}· last check <span className="num">{lastCheck}</span>
          </>
        )}
      </span>
    </div>
  );
}
