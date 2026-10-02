/** Dev helper: prints browser console errors and page errors for pages in a fresh demo session.
 *   node scripts/console-check.mjs /ask,/home */
import { chromium } from "@playwright/test";
const pages = (process.argv[2] ?? "/home").split(",");
const base = process.argv[3] ?? "http://localhost:3005";
const browser = await chromium.launch(process.platform === "win32" ? { channel: "msedge" } : {});
const page = await (await browser.newContext()).newPage();
page.on("console", (m) => m.type() === "error" && console.log(`[console] ${m.text().slice(0, 600)}`));
page.on("pageerror", (e) => console.log(`[pageerror] ${String(e).slice(0, 600)}`));
await page.goto(base + "/");
await page.evaluate(async () => { await fetch("/api/demo/start", { method: "POST" }); await fetch("/api/tour", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "complete" }) }); });
for (const p of pages) {
  console.log(`--- ${p}`);
  await page.goto(base + p, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
}
await browser.close();
