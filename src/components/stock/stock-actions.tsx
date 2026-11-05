"use client";
import { Eye, EyeOff, Pencil, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { selectPortfolio } from "@/components/portfolio/portfolio-tabs";
import { Button } from "@/components/ui/button";
import { apiCall } from "@/lib/api-client";

/** Where the add sheet opens with this instrument already picked. */
export const addHref = (h: { symbol: string; name: string; assetClass: string }) => `/portfolio?tab=manage&add=1&symbol=${encodeURIComponent(h.symbol)}&name=${encodeURIComponent(h.name)}&class=${encodeURIComponent(h.assetClass)}`;

/**
 * What can be done from a stock, fund or ETF's own page: add it to a portfolio, watch it, or change
 * the holding already there (bought more, sold some, a SIP).
 */
export function StockActions({ symbol, name, assetClass, watching, held }: { symbol: string; name: string; assetClass: string; watching: boolean; held: { id: string; portfolioId: string; portfolio: string }[] }) {
  const router = useRouter();
  const [watched, setWatched] = useState(watching);
  const [busy, setBusy] = useState(false);
  const toggle = async () => {
    setBusy(true);
    try {
      await apiCall("/api/watching", watched ? "DELETE" : "POST", { symbols: [symbol] });
      setWatched(!watched);
      toast(watched ? `${name} is off your Watching list` : `Watching ${name}`);
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const change = (h: { id: string; portfolioId: string }) => {
    selectPortfolio(h.portfolioId);
    router.push(`/portfolio?tab=manage&edit=${encodeURIComponent(h.id)}`);
  };
  return (
    <>
      {held.length === 0 && (
        <Button onClick={() => router.push(addHref({ symbol, name, assetClass }))}>
          <Plus className="h-4 w-4" /> Add to portfolio
        </Button>
      )}
      {held.map((h) => (
        <Button key={h.id} onClick={() => change(h)}>
          <Pencil className="h-4 w-4" /> {held.length > 1 ? `Change in ${h.portfolio}` : "Bought, sold or SIP"}
        </Button>
      ))}
      {held.length === 0 && (
        <Button variant="secondary" loading={busy} onClick={toggle} aria-pressed={watched}>
          {watched ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />} {watched ? "Watching" : "Watch"}
        </Button>
      )}
    </>
  );
}
