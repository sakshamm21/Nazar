import { api, json, requireUser } from "@/lib/http";
import { refreshFor } from "@/lib/pipeline/refresh";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Called when the app is opened: brings this user's prices up to date if they are more than a few minutes old. */
export const POST = api(async (req) => json(await refreshFor(await requireUser(req))));
