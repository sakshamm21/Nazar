import "server-only";
import type { AlertDTO } from "@/components/alerts/alert-card";
import { listAlerts, type AlertRow } from "@/lib/repo/alerts";
import { listPortfolios } from "@/lib/repo/portfolios";

/** Alerts as serialisable DTOs with their portfolio label. */
export async function alertsFor(userId: string, opts: { limit?: number; portfolioId?: string | null } = {}) {
  const [rows, pfs] = await Promise.all([listAlerts(userId, { limit: opts.limit ?? 150, portfolioId: opts.portfolioId }), listPortfolios(userId)]);
  const label = (p: (typeof pfs)[number]) => (p.ownerLabel ? `${p.ownerLabel}'s` : p.name);
  const dto = (a: AlertRow & { rating: "up" | "down" | null }): AlertDTO => {
    const p = pfs.find((x) => x.id === a.portfolioId);
    return {
      id: a.id,
      type: a.type,
      symbol: a.symbol,
      severity: a.severity,
      tradeDate: a.tradeDate,
      titleEn: a.titleEn,
      bodyEn: a.bodyEn,
      titleHi: a.titleHi,
      bodyHi: a.bodyHi,
      data: a.data as Record<string, unknown>,
      isSimulated: a.isSimulated,
      readAt: a.readAt?.toISOString() ?? null,
      rating: a.rating,
      portfolio: p ? { id: p.id, label: label(p), language: p.language } : null,
    };
  };
  return { alerts: rows.map(dto), portfolios: pfs.map((p) => ({ id: p.id, label: label(p) })), dto };
}
