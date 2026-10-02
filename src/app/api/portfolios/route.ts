import { z } from "zod";
import { api, json, parseBody, requireUser } from "@/lib/http";
import { createPortfolio, listPortfolios } from "@/lib/repo/portfolios";

export const runtime = "nodejs";

const Create = z.object({
  name: z.string().trim().min(1, "Give the portfolio a name.").max(60),
  ownerLabel: z.string().trim().max(40).optional().nullable(),
  language: z.enum(["en", "hi"]).default("en"),
});

export const GET = api(async (req) => {
  const u = await requireUser(req);
  return json({ portfolios: await listPortfolios(u.id) });
});

export const POST = api(async (req) => {
  const u = await requireUser(req);
  const body = await parseBody(req, Create);
  return json({ portfolio: await createPortfolio(u.id, body) }, { status: 201 });
});
