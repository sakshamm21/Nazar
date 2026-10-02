/** Dev helper: one viewport screenshot of a page in a fresh demo session.
 *   node scripts/shot.mjs /alerts out.png [width] [height] [dark|light] [scrollPx] */
import { chromium } from "@playwright/test";
const [,, url, out, width = "1440", height = "900", theme = "dark", scroll = "0"] = process.argv;
const browser = await chromium.launch({ channel: "msedge" });
const ctx = await browser.newContext({ viewport: { width: +width, height: +height }, deviceScaleFactor: +width < 500 ? 2 : 1 });
const page = await ctx.newPage();
await page.addInitScript((t) => localStorage.setItem("theme", t), theme);
await page.goto("http://localhost:3005/");
await page.evaluate(async () => { await fetch("/api/demo/start", { method: "POST" }); await fetch("/api/tour", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "complete" }) }); });
await page.goto("http://localhost:3005" + url, { waitUntil: "networkidle" });
await page.waitForTimeout(800);
if (+scroll) { await page.mouse.wheel(0, +scroll); await page.waitForTimeout(500); }
await page.screenshot({ path: out });
await browser.close();
