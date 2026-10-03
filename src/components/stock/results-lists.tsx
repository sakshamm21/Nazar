/** A quarter's results as two short lists: what improved and what got worse. */
export function ResultsLists({ improved, worse, health }: { improved: { en: string; key: string }[]; worse: { en: string; key: string }[]; health?: { en: string } }) {
  return (
    <div className="mt-3 grid gap-3 sm:grid-cols-2">
      <div className="rounded-[14px] bg-gain-soft p-3.5">
        <div className="text-[13px] font-semibold text-gain">What improved</div>
        <ul className="mt-1.5 space-y-1 text-sm text-text">
          {improved.length ? improved.map((p) => <li key={p.key}>▲ {p.en}</li>) : <li className="text-muted">Nothing notable</li>}
        </ul>
      </div>
      <div className="rounded-[14px] bg-loss-soft p-3.5">
        <div className="text-[13px] font-semibold text-loss">What got worse</div>
        <ul className="mt-1.5 space-y-1 text-sm text-text">
          {worse.length ? worse.map((p) => <li key={p.key}>▼ {p.en}</li>) : <li className="text-muted">Nothing notable</li>}
        </ul>
      </div>
      {health?.en && <p className="text-sm text-muted sm:col-span-2">{health.en}</p>}
    </div>
  );
}
