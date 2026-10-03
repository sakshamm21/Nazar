"use client";
import { ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { apiCall } from "@/lib/api-client";

/** One tap into the demo account: a full portfolio on live prices, nothing to type. */
export function DemoButton({ email, password, label = "Try the demo", className }: { email: string; password: string; label?: string; className?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      type="button"
      size="lg"
      loading={busy}
      className={className}
      onClick={async () => {
        setBusy(true);
        try {
          await apiCall("/api/auth/login", "POST", { email, password });
          router.push("/home");
          router.refresh();
        } catch (e) {
          toast.error((e as Error).message);
          setBusy(false);
        }
      }}
    >
      {label} <ArrowRight className="h-4 w-4" />
    </Button>
  );
}
