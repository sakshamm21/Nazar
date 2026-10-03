/** Loading = rings expanding like an iris (docs/DESIGN.md §1). Never a spinner. */
export function IrisLoader({ size = 28, label = "Loading" }: { size?: number; label?: string }) {
  return (
    <span role="status" aria-label={label} className="nz-iris relative inline-block shrink-0" style={{ width: size, height: size }}>
      {[0, 1, 2].map((i) => (
        <span key={i} className="absolute inset-0 rounded-full border-2" style={{ borderColor: i === 1 ? "var(--ice)" : "var(--accent)" }} />
      ))}
      <span className="absolute rounded-full bg-accent" style={{ inset: size * 0.38 }} />
    </span>
  );
}
