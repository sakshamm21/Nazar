import "server-only";
import { MODELS } from "./models";
import { OPENROUTER_URL, activeProvider, selfHostedModels } from "./provider";

let cache: { at: number; key: string; ids: string[] } | null = null;

/**
 * Models from our catalog that the active provider can actually serve (cached 10 min).
 * OpenRouter's list is public; OpenAI's depends on the key. If the list cannot be fetched, the
 * whole catalog for that provider is assumed, and a model that is not there fails at the call.
 */
async function availableModelIds(): Promise<string[]> {
  const via = activeProvider();
  const all = MODELS.filter((m) => m.via === via).map((m) => m.id);
  const key = via === "openrouter" ? process.env.OPENROUTER_API_KEY : process.env.OPENAI_API_KEY;
  if (!key) return all;
  const cacheKey = `${via}:${key.slice(-6)}`;
  if (cache && cache.key === cacheKey && Date.now() - cache.at < 10 * 60_000) return cache.ids;
  try {
    const base = via === "openrouter" ? OPENROUTER_URL : (process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1");
    const res = await fetch(`${base}/models`, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(String(res.status));
    const json = (await res.json()) as { data: { id: string }[] };
    const have = new Set(json.data.map((d) => d.id));
    const ids = all.filter((id) => have.has(id));
    cache = { at: Date.now(), key: cacheKey, ids: ids.length ? ids : all };
  } catch {
    cache = { at: Date.now(), key: cacheKey, ids: all };
  }
  return cache.ids;
}

/**
 * Models users may pick: what the provider can serve, optionally narrowed by ALLOWED_MODELS
 * (comma-separated ids) — e.g. to keep expensive premium models off a public deployment.
 */
export async function allowedModelIds(): Promise<string[]> {
  // What the deployment's own server runs is on offer whether or not the hosted provider lists it.
  const own = [...selfHostedModels().keys()].filter((id) => MODELS.some((m) => m.id === id));
  const ids = [...new Set([...(await availableModelIds()), ...own])];
  const allow = (process.env.ALLOWED_MODELS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!allow.length) return ids;
  const narrowed = ids.filter((id) => allow.includes(id));
  return narrowed.length ? narrowed : ids;
}
