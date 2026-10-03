"use client";
import { ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/** "Try the demo, no sign-up": creates an isolated 24-hour demo account and opens Home with the tour. */
export function DemoButton({ size = "lg", className, label = "Try the demo, no sign-up" }: { size?: "md" | "lg"; className?: string; label?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      size={size}
      className={className}
      loading={busy}
      onClick={async () => {
        setBusy(true);
        try {
          void fetch("/api/events", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: "landing_cta", props: { cta: "demo" } }) }).catch(() => {});
          const res = await fetch("/api/demo/start", { method: "POST" });
          const j = await res.json();
          if (!res.ok) throw new Error(j.error ?? "Couldn't start the demo.");
          router.push(j.redirect ?? "/home"); // a new demo's first visit starts the tour by itself
        } catch (e) {
          toast.error((e as Error).message);
          setBusy(false);
        }
      }}
    >
      {label}
      {!busy && <ArrowRight className="h-4 w-4" />}
    </Button>
  );
}
