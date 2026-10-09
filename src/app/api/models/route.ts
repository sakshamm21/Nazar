import { MODELS } from "@/lib/ask/models";
import { allowedModelIds } from "@/lib/ask/openai-models";
import { selfHostedModels } from "@/lib/ask/provider";

export const runtime = "nodejs";

/** The Ask models this deployment's OpenAI key can use (for the model picker in Settings). */
export async function GET() {
  const ids = await allowedModelIds();
  const own = selfHostedModels();
  // `selfHosted`: this model's questions go to the deployment's own server, not to a hosting company.
  return Response.json({ models: MODELS.filter((m) => ids.includes(m.id)).map((m) => ({ ...m, selfHosted: own.has(m.id) })) });
}
