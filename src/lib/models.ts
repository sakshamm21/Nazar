/**
 * Cost–performance model catalog.
 * Prices are USD per 1M tokens (standard tier). Edit freely — the /api/models
 * endpoint filters this list down to the models your OpenAI key can actually use.
 */
export type ModelTier = "economy" | "balanced" | "premium";

export interface ModelInfo {
  id: string;
  label: string;
  tier: ModelTier;
  inputCost: number; // $ / 1M input tokens
  outputCost: number; // $ / 1M output tokens
  speed: 1 | 2 | 3 | 4 | 5;
  quality: 1 | 2 | 3 | 4 | 5;
  blurb: string;
}

export const MODELS: ModelInfo[] = [
  { id: "gpt-6-luna", label: "GPT-6 Luna", tier: "economy", inputCost: 0.1, outputCost: 0.5, speed: 5, quality: 3, blurb: "Fastest & cheapest. Quotes, lookups." },
  { id: "gpt-6-sol", label: "GPT-6 Sol", tier: "balanced", inputCost: 2, outputCost: 10, speed: 4, quality: 4, blurb: "Strong agentic tool use." },
  { id: "gpt-6-astra", label: "GPT-6 Astra", tier: "premium", inputCost: 10, outputCost: 50, speed: 2, quality: 5, blurb: "Deepest analysis." },
  { id: "gpt-5.4-nano", label: "GPT-5.4 nano", tier: "economy", inputCost: 0.2, outputCost: 1.25, speed: 5, quality: 2, blurb: "Ultra-cheap." },
  { id: "gpt-5.4-mini", label: "GPT-5.4 mini", tier: "balanced", inputCost: 0.75, outputCost: 4.5, speed: 4, quality: 3, blurb: "Good all-rounder." },
  { id: "gpt-5.4", label: "GPT-5.4", tier: "premium", inputCost: 2.5, outputCost: 15, speed: 3, quality: 4, blurb: "Capable reasoning." },
  { id: "gpt-4.1-mini", label: "GPT-4.1 mini", tier: "economy", inputCost: 0.4, outputCost: 1.6, speed: 5, quality: 2, blurb: "Legacy, no reasoning, very fast." },
  { id: "gpt-4o-mini", label: "GPT-4o mini", tier: "economy", inputCost: 0.15, outputCost: 0.6, speed: 5, quality: 2, blurb: "Legacy fallback." },
];

export const AUTO_MODEL = "auto";

export function getModel(id: string): ModelInfo | undefined {
  return MODELS.find((m) => m.id === id);
}

export function estimateCost(modelId: string, inputTokens = 0, outputTokens = 0): number {
  const m = getModel(modelId);
  if (!m) return 0;
  return (inputTokens * m.inputCost + outputTokens * m.outputCost) / 1_000_000;
}

/**
 * "Auto" routing: pick the cheapest model that is likely good enough for the query.
 * Lookups & definitions → economy; analysis, comparisons, valuation → balanced;
 * premium ONLY when the user explicitly asks for depth. (v1 sent any question containing
 * "valuation" to premium: $0.22 and 22s for a routine "analyze X" — see the product deck.)
 */
export function routeModel(prompt: string, available: string[]): string {
  const p = prompt.toLowerCase();
  const tickers = (prompt.match(/\b[A-Z]{2,}(\.[A-Z]{1,2})?\b/g) ?? []).length;
  let tier: ModelTier = "economy";
  if (/(analy[sz]e|analysis|compare|vs\.?|versus|peer|valuation|dcf|intrinsic|earnings|financials|statement|outlook|risk|bull|bear|why)/.test(p) || tickers >= 2 || prompt.length > 200) tier = "balanced";
  if (/(deep dive|full report|investment (thesis|case|memo)|in[- ]depth|detailed report)/.test(p)) tier = "premium";

  const order: ModelTier[] = tier === "premium" ? ["premium", "balanced", "economy"] : tier === "balanced" ? ["balanced", "economy", "premium"] : ["economy", "balanced", "premium"];
  for (const t of order) {
    const pick = MODELS.find((m) => m.tier === t && available.includes(m.id));
    if (pick) return pick.id;
  }
  return available[0] ?? MODELS[0].id;
}
