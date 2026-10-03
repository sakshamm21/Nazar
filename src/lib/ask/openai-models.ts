import "server-only";
import { MODELS } from "./models";

let cache: { at: number; ids: string[] } | null = null;

/** Models from our catalog that the configured OpenAI key can actually use (cached 10 min). */
async function availableModelIds(): Promise<string[]> {
  const all = MODELS.map((m) => m.id);
  const key = process.env.OPENAI_API_KEY;
  if (!key) return all;
  if (cache && Date.now() - cache.at < 10 * 60_000) return cache.ids;
  try {
    const res = await fetch(`${process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1"}/models`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(String(res.status));
    const json = (await res.json()) as { data: { id: string }[] };
    const have = new Set(json.data.map((d) => d.id));
    const ids = all.filter((id) => have.has(id));
    cache = { at: Date.now(), ids: ids.length ? ids : all };
  } catch {
    cache = { at: Date.now(), ids: all };
  }
  return cache.ids;
}

/**
 * Models users may pick: what the key can access, optionally narrowed by ALLOWED_MODELS
 * (comma-separated ids) — e.g. to keep expensive premium models off a public deployment.
 */
export async function allowedModelIds(): Promise<string[]> {
  const ids = await availableModelIds();
  const allow = (process.env.ALLOWED_MODELS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!allow.length) return ids;
  const narrowed = ids.filter((id) => allow.includes(id));
  return narrowed.length ? narrowed : ids;
}
