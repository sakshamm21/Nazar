import { existsSync } from "node:fs";
import path from "node:path";

/** Loads .env.local then .env (Next.js does this for the app; scripts need it too). */
export function loadEnv() {
  for (const f of [".env.local", ".env"]) {
    const p = path.join(process.cwd(), f);
    if (existsSync(p)) process.loadEnvFile(p);
  }
}
