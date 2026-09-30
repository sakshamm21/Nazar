/** Client-side product event (see CLIENT_EVENTS in lib/analytics.ts). Never throws, never blocks UI. */
export function trackClient(type: string, props: Record<string, string | number | boolean | null> = {}, chatId?: string) {
  try {
    void fetch("/api/events", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type, props, chatId }), keepalive: true }).catch(() => {});
  } catch {}
}
