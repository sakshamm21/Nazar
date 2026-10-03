/**
 * Screenshots for design review: every listed page at 375px, 768px and 1440px in both themes.
 *   node scripts/screens.mjs [baseUrl] [page,page,...] [widths]
 * Signs in as the tester1@nazar.dev test account (full demo data) so it doesn't use up the
 * per-IP "Try the demo" allowance. Uses the installed Microsoft Edge on Windows, Chromium elsewhere.
 */
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";

const BASE = process.argv[2] ?? "http://localhost:3005";
const PAGES = (process.argv[3] ?? "/home").split(",");
const WIDTHS = (process.argv[4] ?? "375,1440").split(",").map(Number);
const OUT = path.join(process.cwd(), "screenshots", "tmp");
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch(process.platform === "win32" ? { channel: "msedge" } : {});
for (const theme of ["dark", "light"]) {
  for (const width of WIDTHS) {
    const ctx = await browser.newContext({ viewport: { width, height: width < 500 ? 812 : 900 }, deviceScaleFactor: width < 500 ? 2 : 1, colorScheme: theme });
    const page = await ctx.newPage();
    await page.addInitScript((t) => localStorage.setItem("theme", t), theme);
    // Test account with the full demo; mark the tour as done so it doesn't cover the screenshot.
    await page.goto(BASE + "/signin");
    const ok = await page.evaluate(async () => (await fetch("/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "tester1@nazar.dev", password: "nazar123" }) })).ok);
    if (!ok) throw new Error("test account sign-in failed");
    await page.evaluate(() => fetch("/api/tour", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "complete" }) }));
    for (const p of PAGES) {
      await page.goto(BASE + p, { waitUntil: "networkidle" });
      await page.waitForTimeout(900);
      const name = `${p.replace(/[/?=&]+/g, "_").replace(/^_/, "") || "landing"}-${width}-${theme}.png`;
      await page.screenshot({ path: path.join(OUT, name), fullPage: true });
      console.log("saved", name);
    }
    await ctx.close();
  }
}
await browser.close();
