import { MODELS } from "@/lib/models";
import { allowedModelIds } from "@/lib/openai-models";
import { databaseUrl } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  const ids = await allowedModelIds();
  return Response.json({
    models: MODELS.filter((m) => ids.includes(m.id)),
    status: {
      openai: Boolean(process.env.OPENAI_API_KEY),
      database: databaseUrl ? "postgres" : process.env.VERCEL ? "pglite-memory" : "pglite-local",
    },
  });
}
