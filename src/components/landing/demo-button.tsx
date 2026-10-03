"use client";
import { ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { trackClient } from "@/lib/events-client";
import { apiCall } from "@/lib/api-client";

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
          trackClient("landing_cta", { cta: "demo" });
          const j = await apiCall<{ redirect?: string }>("/api/demo/start", "POST", {}, "Couldn't start the demo.");
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
