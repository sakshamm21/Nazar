import { MODELS } from "@/lib/ask/models";
import { allowedModelIds } from "@/lib/ask/openai-models";

export const runtime = "nodejs";

/** The Ask models this deployment's OpenAI key can use (for the model picker in Settings). */
export async function GET() {
  const ids = await allowedModelIds();
  return Response.json({ models: MODELS.filter((m) => ids.includes(m.id)) });
}
