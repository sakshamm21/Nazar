"use client";
import { FileSpreadsheet } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { trackClient } from "@/lib/events-client";

/** Downloads the stock's risk & return model (live formulas) and health checks as one workbook. */
export function ExcelDownload({ parts, title }: { parts: { toolName: string; data: unknown }[]; title: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="secondary"
      loading={busy}
      onClick={async () => {
        setBusy(true);
        try {
          trackClient("excel_download", { scope: "stock" });
          const { downloadChatExcel } = await import("@/lib/excel");
          await downloadChatExcel(parts as { toolName: string; data: any }[], title);
        } finally {
          setBusy(false);
        }
      }}
    >
      {!busy && <FileSpreadsheet className="h-4 w-4" />} Excel model
    </Button>
  );
}
