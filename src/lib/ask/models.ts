/**
 * Cost–performance model catalog. Client-safe.
 *
 * Ask runs through OpenRouter when OPENROUTER_API_KEY is set, and directly on OpenAI otherwise.
 * Both sets of models are listed here so a stored answer can always name the model that wrote it;
 * which set is offered is decided on the server (see openai-models.ts).
 *
 * Prices are USD per 1M tokens. OpenRouter's were read from its public model list on 2026-10-07.
 *
 * A model earns its place here by its score on `npm run eval:agent`, not by its reputation.
 * Scores are cases passed out of 93 with the code graders, on 2026-10-08, after the portfolio
 * tools were added (models marked * were scored a day earlier, before six of those cases could pass):
 *
 *   openai/gpt-6-luna               92   cheapest of all; three runs
 *   z-ai/glm-5.3-flash              90   open weights; 4x Luna's cost; slowest to its first word
 *   deepseek/deepseek-v4-pro-0813   89   open weights; 8x Luna's cost
 *   deepseek/deepseek-v4.1-flash    81*  open weights; fastest to its first word
 *   google/gemini-3.5-flash-lite    79*
 *   xiaomi/mimo-v2.6-flash          78*  open weights
 *   google/gemini-3.8-flash         77   answers too long for Simple mode
 *   nvidia/nemotron-3.5-lightning   63*  open weights
 *   qwen/qwen3.8-flash              60*  open weights
 *   inclusionai/ling-3.0-flash-fin  55*  the finance-tuned one
 *
 * So Luna answers by default. The three best open-weight models are offered in the picker but
 * Auto does not choose them (`auto: false`), unless ASK_AUTO_MODEL names one.
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
  /** The weights are published, so the model can be run by anyone, not only its maker. */
  openWeights?: true;
  /** False for a model the user may pick but Auto never does. */
  auto?: false;
  /**
   * How hard a reasoning model thinks before answering. Set where an eval showed that thinking
   * less costs nothing: Luna at "minimal" passed the same 92 of 93 cases over three runs and
   * reached its first word in 4.6 s instead of 7.0 s.
   */
  reasoningEffort?: "minimal" | "low" | "medium" | "high";
}

export const MODELS: ModelInfo[] = [
  // ── OpenRouter ──────────────────────────────────────────────
  { id: "openai/gpt-6-luna", label: "GPT-6 Luna", via: "openrouter", tier: "economy", inputCost: 0.1, cachedInputCost: 0.01, outputCost: 0.5, speed: 5, quality: 3, blurb: "The default: best on Nazar's own tests, and the cheapest.", reasoningEffort: "minimal" },
  { id: "z-ai/glm-5.3-flash", label: "GLM 5.3 Flash", via: "openrouter", tier: "economy", inputCost: 0.15, cachedInputCost: 0.03, outputCost: 0.5, speed: 3, quality: 3, blurb: "Open weights. Closest to the default on Nazar's own tests.", openWeights: true, auto: false },
  { id: "deepseek/deepseek-v4-pro-0813", label: "DeepSeek V4 Pro", via: "openrouter", tier: "balanced", inputCost: 0.66, cachedInputCost: 0.022, outputCost: 1.98, speed: 3, quality: 3, blurb: "Open weights. A larger model, for longer analysis.", openWeights: true, auto: false },
  { id: "deepseek/deepseek-v4.1-flash", label: "DeepSeek V4.1 Flash", via: "openrouter", tier: "economy", inputCost: 0.3, cachedInputCost: 0.006, outputCost: 1.2, speed: 5, quality: 2, blurb: "Open weights. The quickest to start answering.", openWeights: true, auto: false },
  { id: "openai/gpt-6-sol", label: "GPT-6 Sol", via: "openrouter", tier: "premium", inputCost: 2, cachedInputCost: 0.2, outputCost: 10, speed: 3, quality: 5, blurb: "Deepest analysis." },
  { id: "anthropic/claude-sonnet-5.5", label: "Claude Sonnet 5.5", via: "openrouter", tier: "premium", inputCost: 2, cachedInputCost: 0.2, outputCost: 10, speed: 2, quality: 5, blurb: "Long-form analysis. Writes more than Simple mode asks for.", auto: false },
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
export function routeModel(prompt: string, available: string[], preferred?: string): string {
  const p = prompt.toLowerCase();
  const tickers = (prompt.match(/\b[A-Z]{2,}(\.[A-Z]{1,2})?\b/g) ?? []).length;
  let tier: ModelTier = "economy";
  if (/(analy[sz]e|analysis|compare|vs\.?|versus|peer|valuation|dcf|intrinsic|earnings|financials|statement|outlook|risk|bull|bear|why)/.test(p) || tickers >= 2 || prompt.length > 200) tier = "balanced";
  if (/(deep dive|full report|investment (thesis|case|memo)|in[- ]depth|detailed report)/.test(p)) tier = "premium";

  // The deployment can name the model Auto should use for everything short of a deep dive
  // (ASK_AUTO_MODEL), for example an open-weight one. It is ignored if the provider cannot serve it.
  if (tier !== "premium" && preferred && available.includes(preferred)) return preferred;
  const order: ModelTier[] = tier === "premium" ? ["premium", "balanced", "economy"] : tier === "balanced" ? ["balanced", "economy", "premium"] : ["economy", "balanced", "premium"];
  for (const t of order) {
    const pick = MODELS.find((m) => m.tier === t && m.auto !== false && available.includes(m.id));
    if (pick) return pick.id;
  }
  return available[0] ?? MODELS[0].id;
}
