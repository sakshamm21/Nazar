/**
 * Which portfolio a question names, or null for all of them. "My portfolio", "my holdings" and the
 * like mean everything, even when one portfolio happens to be called "My portfolio": the app opens on
 * all of them, and an answer about one would disagree with every other screen. An exact name wins
 * over a partial one, so "Dividend" finds "Dividend basket" but never the wrong portfolio first.
 */
export function matchPortfolio<P extends { name: string }>(pfs: P[], asked?: string | null): P | null {
  const q = asked?.trim().toLowerCase().replace(/\s+/g, " ");
  if (!q || pfs.length < 2) return null;
  if (/^(my |all |the |all my |all of my )?(portfolios?|holdings|investments|money|everything|all)$/.test(q)) return null;
  const name = (p: P) => p.name.trim().toLowerCase();
  const bare = q.replace(/^(my|the|our) /, "").replace(/ portfolio$/, "");
  return pfs.find((p) => name(p) === q) ?? pfs.find((p) => name(p) === bare) ?? pfs.find((p) => name(p).includes(bare)) ?? null;
}
