"use client";
import { useState } from "react";
import { toast } from "sonner";
import { Card, CardHeader } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { apiCall } from "@/lib/api-client";
import { PushToggle } from "./push-toggle";

/** Updates Nazar can send, all off until switched on: a weekly email, and notifications on this device. */
export function UpdatesCard({ weeklyEmail, canEmail, pushKey }: { weeklyEmail: boolean; canEmail: boolean; pushKey: string | null }) {
  const [on, setOn] = useState(weeklyEmail);
  return (
    <Card className="p-5 sm:p-6">
      <CardHeader overline="Updates" title="Hear from Nazar, if you want to" />
      <div className="mt-4 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-sm font-medium text-text">Weekly email</div>
            <p className="mt-0.5 text-[13px] leading-5 text-muted">{canEmail ? "Every Saturday: what your portfolio did that week, and why. Facts only, never a tip." : "Available once your email address is confirmed (not on a demo)."}</p>
          </div>
          <Switch
            label="Weekly email"
            checked={on}
            disabled={!canEmail}
            onChange={async (v) => {
              setOn(v);
              try {
                await apiCall("/api/settings", "PATCH", { prefs: { weeklyEmail: v } });
                toast(v ? "Weekly email on: the first comes on Saturday" : "Weekly email off");
              } catch (e) {
                setOn(!v);
                toast.error((e as Error).message);
              }
            }}
          />
        </div>
        {pushKey && <PushToggle publicKey={pushKey} />}
      </div>
    </Card>
  );
}
