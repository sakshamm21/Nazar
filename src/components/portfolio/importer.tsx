"use client";
import { CheckCircle2, CircleAlert, FileSpreadsheet, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { IrisLoader } from "@/components/rings/iris";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { FormAlert, Select } from "@/components/ui/field";
import { inr } from "@/lib/format";

type Resolution = { status: "matched"; symbol: string; name: string; isin: string | null; via: string } | { status: "ambiguous"; candidates: { symbol: string; name: string }[] } | { status: "unmatched"; reason: string };
type Row = { line: number; rawName: string; symbol: string | null; isin: string | null; quantity: number; avgPrice: number; buyDate: string | null; resolution: Resolution };

const VIA: Record<string, string> = { isin: "ISIN", symbol: "Symbol", alias: "Renamed ticker", name: "Name", partial: "Name", search: "Search" };
const BROKER: Record<string, string> = { zerodha: "Zerodha", groww: "Groww", upstox: "Upstox", generic: "spreadsheet" };

export function Importer({ portfolios, defaultId }: { portfolios: { id: string; label: string }[]; defaultId: string | null }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [target, setTarget] = useState(defaultId ?? portfolios[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ broker: string; format: string; rows: Row[]; skipped: { line: number; reason: string }[] } | null>(null);
  const [choice, setChoice] = useState<Record<number, string>>({});
  const [drag, setDrag] = useState(false);

  const upload = async (file: File) => {
    setBusy(true);
    setError(null);
    setPreview(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/portfolios/${target}/import`, { method: "POST", body: fd });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Couldn't read that file.");
      setPreview(j);
      const init: Record<number, string> = {};
      for (const r of j.rows as Row[]) init[r.line] = r.resolution.status === "matched" ? r.resolution.symbol : r.resolution.status === "ambiguous" ? r.resolution.candidates[0].symbol : "";
      setChoice(init);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    if (!preview) return;
    const holdings = preview.rows
      .filter((r) => choice[r.line])
      .map((r) => ({ symbol: choice[r.line], quantity: r.quantity, avgPrice: r.avgPrice, buyDate: r.buyDate, isin: r.resolution.status === "matched" ? r.resolution.isin : r.isin, rawName: r.rawName, source: preview.broker as "zerodha" }));
    if (!holdings.length) return setError("Nothing to import: every row is skipped.");
    setBusy(true);
    try {
      const res = await fetch(`/api/portfolios/${target}/holdings`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ holdings }) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Couldn't save.");
      document.cookie = `nazar_pf=${target}; Path=/; Max-Age=${60 * 60 * 24 * 180}; SameSite=Lax`;
      toast(`${holdings.length} holdings imported. Nazar is taking a first look now.`);
      router.push("/home");
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  const matched = preview?.rows.filter((r) => choice[r.line]).length ?? 0;
  return (
    <div className="space-y-5">
      {portfolios.length > 1 && (
        <div className="max-w-xs">
          <label htmlFor="target" className="mb-1.5 block text-[13px] font-medium text-muted">
            Import into
          </label>
          <Select id="target" value={target} onChange={(e) => setTarget(e.target.value)}>
            {portfolios.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </Select>
        </div>
      )}

      {!preview && (
        <Card
          className={`grid place-items-center border-dashed p-10 text-center transition-colors ${drag ? "border-accent bg-accent-soft" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            const f = e.dataTransfer.files[0];
            if (f) void upload(f);
          }}
        >
          {busy ? (
            <div className="flex flex-col items-center gap-3 text-sm text-muted">
              <IrisLoader size={36} label="Reading your file" /> Reading your file and matching NSE tickers…
            </div>
          ) : (
            <>
              <span className="grid h-12 w-12 place-items-center rounded-[14px] bg-accent-soft text-accent">
                <FileSpreadsheet className="h-6 w-6" />
              </span>
              <h2 className="t-title-2 mt-4 text-text">Drop your holdings file here</h2>
              <p className="mt-1 max-w-md text-sm text-muted">CSV or XLSX from Zerodha (Console or Kite), Groww or Upstox, or any sheet with name, quantity and average price. Nothing is saved until you confirm.</p>
              <input ref={input} type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="sr-only" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
              <Button className="mt-5" onClick={() => input.current?.click()}>
                <Upload className="h-4 w-4" /> Choose a file
              </Button>
            </>
          )}
        </Card>
      )}

      <FormAlert message={error} />

      {preview && (
        <Card className="p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="t-overline">Detected: {preview.format}</div>
              <h2 className="t-title-2 mt-0.5 text-text">
                {matched} of {preview.rows.length} rows ready
              </h2>
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setPreview(null)}>
                Choose another file
              </Button>
              <Button loading={busy} onClick={confirm}>
                Import {matched} from {BROKER[preview.broker]}
              </Button>
            </div>
          </div>
          <ul className="mt-5 divide-y divide-line">
            {preview.rows.map((r) => {
              const res = r.resolution;
              return (
                <li key={r.line} className="flex flex-wrap items-center gap-3 py-3">
                  {res.status === "matched" ? <CheckCircle2 className="h-5 w-5 shrink-0 text-gain" aria-label="Matched" /> : <CircleAlert className="h-5 w-5 shrink-0 text-warn" aria-label="Needs attention" />}
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium text-text">{r.rawName}</div>
                    <div className="num text-[12px] text-subtle">
                      {r.quantity} × {inr(r.avgPrice, { decimals: 2 })}
                      {r.buyDate ? ` · ${r.buyDate}` : ""}
                    </div>
                  </div>
                  {res.status === "matched" ? (
                    <span className="flex items-center gap-2">
                      <span className="font-mono text-[13px] text-text">{res.symbol.replace(/\.NS$/, "")}</span>
                      <Chip>{VIA[res.via]}</Chip>
                    </span>
                  ) : (
                    <Select aria-label={`Match for ${r.rawName}`} className="h-9 w-56 text-sm" value={choice[r.line] ?? ""} onChange={(e) => setChoice({ ...choice, [r.line]: e.target.value })}>
                      {res.status === "ambiguous" && res.candidates.map((c) => <option key={c.symbol} value={c.symbol}>{`${c.symbol.replace(/\.NS$/, "")} · ${c.name}`}</option>)}
                      <option value="">{res.status === "unmatched" ? "Not found: skip this row" : "Skip this row"}</option>
                    </Select>
                  )}
                </li>
              );
            })}
          </ul>
          {preview.skipped.length > 0 && <p className="t-caption mt-3">Skipped {preview.skipped.length} rows without a quantity or price ({preview.skipped.map((s) => s.reason).slice(0, 3).join("; ")}).</p>}
        </Card>
      )}
    </div>
  );
}
