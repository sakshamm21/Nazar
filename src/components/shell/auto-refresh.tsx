"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** How often an open tab asks again; the server refreshes at most once every 15 minutes per user. */
const ASK_EVERY_MS = 5 * 60_000;

/**
 * Keeps the portfolio current without the user doing anything: when the app is opened, and every
 * few minutes while it stays open and visible, it asks the server to bring prices up to date and
 * re-renders the page if anything changed.
 */
export function AutoRefresh() {
  const router = useRouter();
  useEffect(() => {
    let stopped = false;
    const ask = async () => {
      if (document.visibilityState !== "visible") return;
      const j = await fetch("/api/refresh", { method: "POST" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
      if (!stopped && j?.updated) router.refresh();
    };
    void ask();
    const timer = setInterval(ask, ASK_EVERY_MS);
    document.addEventListener("visibilitychange", ask);
    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", ask);
    };
  }, [router]);
  return null;
}
