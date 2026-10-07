/**
 * Cost–performance model catalog. Client-safe.
 *
 * Ask runs through OpenRouter when OPENROUTER_API_KEY is set, and directly on OpenAI otherwise.
 * Both sets of models are listed here so a stored answer can always name the model that wrote it;
 * which set is offered is decided on the server (see openai-models.ts).
 *
 * Prices are USD per 1M tokens. OpenRouter's were read from its public model list on 2026-10-07.
 * Which model sits in which tier is a starting point, not a finding: `npm run eval:agent` scores
 * any model on Nazar's own questions, and the tiers should follow those scores.
 */
export type ModelTier = "economy" | "balanced" | "premium";
export type ModelVia = "openrouter" | "openai";

export interface ModelInfo {
  id: string;
  label: string;
  via: ModelVia;
  tier: ModelTier;
  inputCost: number; // $ / 1M input tokens
  /** $ / 1M input tokens the provider served from its prompt cache. Falls back to inputCost. */
  cachedInputCost?: number;
  outputCost: number; // $ / 1M output tokens
  speed: 1 | 2 | 3 | 4 | 5;
  quality: 1 | 2 | 3 | 4 | 5;
  blurb: string;
}

export const MODELS: ModelInfo[] = [
  // ── OpenRouter ──────────────────────────────────────────────
  { id: "openai/gpt-6-luna", label: "GPT-6 Luna", via: "openrouter", tier: "economy", inputCost: 0.1, cachedInputCost: 0.01, outputCost: 0.5, speed: 5, quality: 3, blurb: "Fastest & cheapest. Quotes, lookups." },
  { id: "google/gemini-3.8-flash", label: "Gemini 3.8 Flash", via: "openrouter", tier: "balanced", inputCost: 0.75, cachedInputCost: 0.075, outputCost: 3.75, speed: 4, quality: 4, blurb: "Analysis at under half the price of the larger models." },
  { id: "openai/gpt-6-sol", label: "GPT-6 Sol", via: "openrouter", tier: "premium", inputCost: 2, cachedInputCost: 0.2, outputCost: 10, speed: 3, quality: 5, blurb: "Deepest analysis." },
  { id: "anthropic/claude-sonnet-5.5", label: "Claude Sonnet 5.5", via: "openrouter", tier: "premium", inputCost: 2, cachedInputCost: 0.2, outputCost: 10, speed: 3, quality: 5, blurb: "Careful long-form analysis." },
  { id: "openai/gpt-4.1-mini", label: "GPT-4.1 mini", via: "openrouter", tier: "economy", inputCost: 0.4, cachedInputCost: 0.1, outputCost: 1.6, speed: 5, quality: 2, blurb: "No reasoning, very fast. Used by the topic filter." },
  // ── OpenAI direct (used only when no OpenRouter key is set) ──
  { id: "gpt-6-luna", label: "GPT-6 Luna", via: "openai", tier: "economy", inputCost: 0.1, cachedInputCost: 0.01, outputCost: 0.5, speed: 5, quality: 3, blurb: "Fastest & cheapest. Quotes, lookups." },
  { id: "gpt-6-sol", label: "GPT-6 Sol", via: "openai", tier: "balanced", inputCost: 2, cachedInputCost: 0.2, outputCost: 10, speed: 4, quality: 4, blurb: "Strong agentic tool use." },
  { id: "gpt-6-astra", label: "GPT-6 Astra", via: "openai", tier: "premium", inputCost: 10, cachedInputCost: 1, outputCost: 50, speed: 2, quality: 5, blurb: "Deepest analysis." },
  { id: "gpt-5.4-nano", label: "GPT-5.4 nano", via: "openai", tier: "economy", inputCost: 0.2, outputCost: 1.25, speed: 5, quality: 2, blurb: "Ultra-cheap." },
  { id: "gpt-5.4-mini", label: "GPT-5.4 mini", via: "openai", tier: "balanced", inputCost: 0.75, outputCost: 4.5, speed: 4, quality: 3, blurb: "Good all-rounder." },
  { id: "gpt-5.4", label: "GPT-5.4", via: "openai", tier: "premium", inputCost: 2.5, outputCost: 15, speed: 3, quality: 4, blurb: "Capable reasoning." },
  { id: "gpt-4.1-mini", label: "GPT-4.1 mini", via: "openai", tier: "economy", inputCost: 0.4, cachedInputCost: 0.1, outputCost: 1.6, speed: 5, quality: 2, blurb: "Legacy, no reasoning, very fast." },
  { id: "gpt-4o-mini", label: "GPT-4o mini", via: "openai", tier: "economy", inputCost: 0.15, outputCost: 0.6, speed: 5, quality: 2, blurb: "Legacy fallback." },
];

export const AUTO_MODEL = "auto";

export function getModel(id: string): ModelInfo | undefined {
  return MODELS.find((m) => m.id === id);
}

/**
 * What a call cost. `cachedInputTokens` is the part of `inputTokens` the provider served from its
 * prompt cache, which is billed at a fraction of the price; leaving it out prices every input
 * token in full, which overstates an agent run that re-sends the same prompt on every step.
 */
export function estimateCost(modelId: string, inputTokens = 0, outputTokens = 0, cachedInputTokens = 0): number {
  const m = getModel(modelId);
  if (!m) return 0;
  const cached = Math.min(Math.max(cachedInputTokens, 0), inputTokens);
  return ((inputTokens - cached) * m.inputCost + cached * (m.cachedInputCost ?? m.inputCost) + outputTokens * m.outputCost) / 1_000_000;
}

/**
 * "Auto" routing: pick the cheapest model that is likely good enough for the query.
 * Lookups & definitions → economy; analysis, comparisons, valuation → balanced;
 * premium only when the user explicitly asks for depth.
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
