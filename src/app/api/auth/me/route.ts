import { publicUser } from "@/lib/auth/service";
import { api, json, requireUser } from "@/lib/http";

export const runtime = "nodejs";

export const GET = api(async (req) => json({ user: publicUser(await requireUser(req)) }));
