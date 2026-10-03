"use client";
import { useState } from "react";
import { InfoTip } from "@/components/ui/info-tip";
import { adjustedBeta } from "@/lib/portfolio/math";
import { absPct, inr, inrCompact } from "@/lib/format";
import { trackClient } from "@/lib/events-client";

type H = { symbol: string; name: string; value: number; beta: number | null };

/** H3a: drag the Nifty fall from −5% to −30% and see the estimated ₹ loss, holding by holding. */
export function StressSlider({ holdings }: { holdings: H[] }) {
  const [shock, setShock] = useState(10);
  const total = holdings.reduce((a, h) => a + h.value, 0);
  // The React compiler memoizes this; it is cheap anyway (≤ 100 holdings).
  const rows = holdings
    .map((h) => ({ ...h, b: adjustedBeta(h.beta), loss: -h.value * adjustedBeta(h.beta) * (shock / 100) }))
    .sort((a, b) => a.loss - b.loss);
  const loss = rows.reduce((a, r) => a + r.loss, 0);
  const pBeta = total ? rows.reduce((a, r) => a + r.value * r.b, 0) / total : 1;
  const unknown = holdings.filter((h) => h.beta == null).length;
  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-sm text-muted">If the Nifty 50 fell</div>
          <div className="num font-[family-name:var(--font-display)] text-[40px] font-semibold leading-none tracking-[-0.02em] text-text">{shock}%</div>
        </div>
        <div className="text-right">
          <div className="text-sm text-muted">your portfolio might lose about</div>
          <div className="num font-[family-name:var(--font-display)] text-[32px] font-semibold leading-none tracking-[-0.02em] text-loss">−{inrCompact(Math.abs(loss))}</div>
          <div className="num mt-1 text-sm text-subtle">
            {absPct(loss / (total || 1))} of {inrCompact(total)}
          </div>
        </div>
      </div>
      <label htmlFor="shock" className="sr-only">
        Nifty fall, percent
      </label>
      <input
        id="shock"
        type="range"
        min={5}
        max={30}
        step={1}
        value={shock}
        onChange={(e) => setShock(Number(e.target.value))}
        onPointerUp={() => trackClient("stress_slider", { shock })}
        className="mt-5 h-2 w-full cursor-pointer appearance-none rounded-full bg-surface-3 accent-[var(--accent)]"
        aria-valuetext={`Nifty down ${shock} percent; estimated loss ${inr(Math.abs(loss))}`}
      />
      <div className="mt-1 flex justify-between text-[12px] text-subtle">
        <span>−5% a bad week</span>
        <span>−10% a correction</span>
        <span>−20%+ a bear market</span>
      </div>
      <p className="mt-4 flex items-center gap-1 text-sm text-muted">
        Your portfolio usually moves about <b className="num font-medium text-text">{pBeta.toFixed(2)}×</b> the Nifty. <InfoTip k="stress" />
      </p>
      <ul className="mt-4 divide-y divide-line">
        {rows.map((r) => (
          <li key={r.symbol} className="flex items-baseline justify-between gap-3 py-2 text-sm">
            <span className="min-w-0 truncate text-text">
              {r.name} <span className="num text-subtle">β {r.b.toFixed(2)}{r.beta == null ? "*" : ""}</span>
            </span>
            <span className="num text-loss">−{inr(Math.abs(r.loss))}</span>
          </li>
        ))}
      </ul>
      <p className="t-caption mt-3">
        Estimate using each holding&apos;s 1-year beta (Blume-adjusted). In real crashes stocks tend to fall together, so losses can be larger. {unknown ? `* ${unknown} holding${unknown > 1 ? "s have" : " has"} too little history; beta 1 assumed.` : ""}
      </p>
    </div>
  );
}
