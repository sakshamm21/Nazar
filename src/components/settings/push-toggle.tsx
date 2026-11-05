"use client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { apiCall } from "@/lib/api-client";

const toKey = (b64: string) => {
  const s = atob((b64 + "=".repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
};

/** Notifications on this device: results days for what you hold, and SIP instalments. */
export function PushToggle({ publicKey }: { publicKey: string }) {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const ok = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    if (!ok) return void Promise.resolve().then(() => setSupported(false));
    navigator.serviceWorker
      .getRegistration("/sw.js")
      .then((r) => r?.pushManager.getSubscription())
      .then((s) => {
        setSupported(true);
        setOn(!!s);
      })
      .catch(() => setSupported(false));
  }, []);
  const change = async (v: boolean) => {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.register("/sw.js");
      if (v) {
        if ((await Notification.requestPermission()) !== "granted") throw new Error("Notifications are blocked for this site in your browser's settings.");
        const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(publicKey) });
        await apiCall("/api/push", "POST", sub.toJSON());
        toast("Notifications on for this device");
      } else {
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          await apiCall("/api/push", "DELETE", { endpoint: sub.endpoint });
          await sub.unsubscribe();
        }
        toast("Notifications off for this device");
      }
      setOn(v);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <div className="text-sm font-medium text-text">Notifications on this device</div>
        <p className="mt-0.5 text-[13px] leading-5 text-muted">{supported === false ? "This browser can't show them. On a phone, add Nazar to your home screen first." : "When a company in your portfolio reports results, and when a SIP instalment is added."}</p>
      </div>
      <Switch label="Notifications on this device" checked={on} disabled={!supported || busy} onChange={change} />
    </div>
  );
}
