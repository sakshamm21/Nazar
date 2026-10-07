import { expect, test, type Page } from "@playwright/test";
import path from "node:path";

/**
 * Signs in with the demo button, exactly like a visitor would (or, given an email, as one of the
 * other test accounts through the form). The accounts are shared and put back every night.
 */
async function startDemo(page: Page, email?: string) {
  await page.goto("/signin");
  if (email) {
    await page.getByLabel("Email").fill(email);
    await page.getByRole("textbox", { name: "Password" }).fill("nazar123");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
  } else await page.getByRole("button", { name: "Try the demo" }).click();
  await page.waitForURL(/\/home/);
}

test.describe("Landing and sign-in", () => {
  test("pitch, the four screens, and one tap into the demo", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /See what your money did\.\s*Understand why\./ })).toBeVisible();
    for (const t of ["At a glance", "Charts you can drag", "Analysis that explains", "Ask, in your own words"]) await expect(page.getByRole("heading", { name: t })).toBeVisible();
    await expect(page.getByText(/No tips, no predictions/)).toBeVisible();
    await page.getByRole("button", { name: "Try the demo" }).click();
    await page.waitForURL(/\/home/);
  });

  test("sign-in is one demo button and the form", async ({ page }) => {
    await page.goto("/signin");
    await expect(page.getByRole("button", { name: "Try the demo" })).toBeVisible();
    await expect(page.getByText(/the investor|the saver|brand new/)).toHaveCount(0);
  });

  test("the app is closed to signed-out visitors", async ({ page }) => {
    for (const p of ["/home", "/portfolio", "/analysis", "/settings"]) {
      await page.goto(p);
      await page.waitForURL(/\/signin/);
    }
  });
});

test.describe("Home", () => {
  test("is the glance: value, today's line, the map, and the way out", async ({ page }) => {
    await startDemo(page);
    await expect(page.getByRole("heading", { name: /Good (morning|afternoon|evening), Aarav/ })).toBeVisible();
    await expect(page.getByText(/Nazar is watching/)).toBeVisible();
    await expect(page.getByText(/You're (down|up)|A quiet day/)).toBeVisible();
    await expect(page.getByRole("heading", { name: "What is up, what is down" })).toBeVisible();
    // Nothing covers Home on arrival, and there are no alerts or family sections any more.
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByText(/Simulate a bad day|What needs your attention|Shared with family/)).toHaveCount(0);
    // Signing out is in view without opening anything.
    await expect(page.getByRole("button", { name: "Sign out" }).first()).toBeVisible();
    // The heatmap answers a tap with the numbers.
    await page.getByRole("link", { name: /^HDFC Bank:/ }).click();
    await expect(page.getByText(/% of this portfolio/)).toBeVisible();
    await page.getByRole("link", { name: /^Analysis/ }).last().click();
    await page.waitForURL(/\/analysis/);
  });

  test("sign out from the sidebar", async ({ page }) => {
    await startDemo(page);
    await page.getByRole("button", { name: "Sign out" }).first().click();
    await page.waitForURL((u) => u.pathname === "/");
    await page.goto("/home");
    await page.waitForURL(/\/signin/);
  });
});

test.describe("Portfolio", () => {
  test("Overview: the chart, the ring and the holdings table respond", async ({ page }) => {
    await startDemo(page);
    await page.goto("/portfolio");
    await expect(page.getByRole("tab", { name: "Overview" })).toHaveAttribute("aria-selected", "true");
    const chart = page.getByRole("img", { name: /^Portfolio value/ });
    await expect(chart).toBeVisible();
    await page.getByRole("radio", { name: "1M", exact: true }).click();
    await expect(chart).toHaveAttribute("aria-label", /past month/);
    await page.getByRole("button", { name: "vs Nifty" }).click();
    await expect(page.getByText(/· Nifty [+−]/).first()).toBeVisible();
    await page.getByRole("button", { name: /^Stocks/ }).click();
    await expect(page.getByText(/^\d+ holdings?: /)).toBeVisible();
    await expect(page.getByRole("heading", { name: "Biggest movers" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Health and hidden risk" })).toBeVisible();
    const sort = page.getByRole("radiogroup", { name: "Sort holdings by" });
    await sort.getByRole("radio", { name: /^Today/ }).click();
    await expect(sort.getByRole("radio", { name: /^Today/ })).toHaveAttribute("aria-checked", "true");
  });

  test("Manage: every asset class, all priced", async ({ page }) => {
    await startDemo(page, "riya@nazar.dev");
    await page.goto("/portfolio?tab=manage");
    await expect(page.getByRole("tab", { name: "Manage" })).toHaveAttribute("aria-selected", "true");
    for (const group of ["Mutual funds", "ETFs", "Gold & silver", "Retirement", "Fixed income", "Stocks", "US stocks", "Crypto"]) await expect(page.getByRole("heading", { name: new RegExp(`^${group}\\s*\\d+$`) })).toBeVisible();
    await expect(page.getByText("price on its way")).toHaveCount(0);
  });

  test("Manage: create, rename and delete a portfolio", async ({ page }) => {
    // Done on the second investor so the main demo keeps its two portfolios for everyone else.
    await startDemo(page, "tester1@nazar.dev");
    await page.goto("/portfolio?tab=manage");
    const list = page.getByRole("region", { name: "Your portfolios" });
    const stale = list.getByRole("button", { name: /^Delete (Side bets|Long shots)$/ });
    while (await stale.count()) {
      await stale.first().click();
      await page.getByRole("dialog").getByRole("button", { name: "Delete portfolio" }).click();
      await expect(page.getByRole("dialog")).toHaveCount(0);
    }
    await list.getByRole("button", { name: "New portfolio" }).click();
    await list.getByLabel("New portfolio name").fill("Side bets");
    await list.getByRole("button", { name: "Create" }).click();
    await expect(page.getByText("Portfolio created. Add what it holds below.")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Build your portfolio" })).toBeVisible();
    await list.getByRole("button", { name: "Rename Side bets" }).click();
    await list.getByLabel("Portfolio name").fill("Long shots");
    await list.getByRole("button", { name: "Save name" }).click();
    await expect(list.getByRole("button", { name: "Rename Long shots" })).toBeVisible();
    await list.getByRole("button", { name: "Delete Long shots" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("It is empty, so nothing else is lost.")).toBeVisible();
    await dialog.getByRole("button", { name: "Delete portfolio" }).click();
    await expect(page.getByText("Long shots deleted.")).toBeVisible();
    await expect(list.getByRole("button", { name: "Rename Long shots" })).toHaveCount(0);
  });

  test("Manage: add across asset classes, then remove", async ({ page }) => {
    await startDemo(page);
    await page.goto("/portfolio?tab=manage");
    await expect(page.getByRole("heading", { name: /^Fixed income/ })).toBeVisible(); // the demo's deposit
    await page.getByRole("button", { name: "Add assets" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Search").fill("parag parikh flexi");
    await expect(dialog.getByRole("option", { name: /Parag Parikh Flexi Cap Fund - Direct - Growth/ })).toBeVisible();
    await dialog.getByRole("tab", { name: "Deposits, PF & more" }).click();
    await dialog.getByRole("button", { name: /Cash and savings/ }).click();
    await dialog.getByLabel("Name").fill("Emergency fund");
    await dialog.getByLabel("Amount (₹)").fill("150000");
    await dialog.getByRole("button", { name: "Add to portfolio" }).click();
    await expect(page.getByText("Emergency fund").first()).toBeVisible();
    await page.getByRole("button", { name: "Remove Emergency fund" }).click();
    await expect(page.getByText("Emergency fund removed")).toBeVisible();
  });

  test("a brand-new account adds its first stock straight from Home", async ({ page }) => {
    await startDemo(page, "new@nazar.dev");
    // Start from nothing, as a new visitor would (the account is shared, so clear earlier runs).
    const { portfolios } = await (await page.request.get("/api/portfolios")).json();
    for (const p of portfolios ?? []) await page.request.delete(`/api/portfolios/${p.id}`);
    await page.goto("/home");
    await page.getByRole("link", { name: "Add what you own" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toHaveCount(1);
    await dialog.getByRole("tab", { name: "Stocks", exact: true }).click();
    await dialog.getByLabel("Search").fill("hdfc bank");
    await dialog.getByRole("option", { name: /^HDFC Bank/ }).first().click();
    // A quantity is enough: the price falls back to today's.
    await dialog.getByLabel("Shares").fill("5");
    await dialog.getByRole("button", { name: "Add to portfolio" }).click();
    await expect(page.getByText(/added\. Nazar is watching it now/)).toBeVisible();
    await page.goto("/portfolio?tab=manage");
    await expect(page.getByRole("heading", { name: /^Stocks\s*1$/ })).toBeVisible();
    await expect(page.getByText(/5 shares ×/)).toBeVisible();
  });

  test("sign up with a code, then import a Zerodha file", async ({ page }) => {
    const email = `e2e-${Date.now()}@example.com`;
    await page.goto("/signup");
    await page.getByLabel("Your name").fill("Riya");
    await page.getByLabel("Email").fill(email);
    await page.getByRole("textbox", { name: "Password" }).fill("correct horse battery");
    await page.getByRole("button", { name: "Create account" }).click();
    await page.waitForURL(/\/verify/);
    const code = new URL(page.url()).searchParams.get("code");
    test.skip(!code, "Email is configured, so the code went to an inbox.");
    await page.getByLabel("6-digit code").fill(code!);
    await page.getByRole("button", { name: "Verify and continue" }).click();
    await page.waitForURL(/\/home/);
    await expect(page.getByText(/Let's set up your first portfolio|Add what you own and Nazar starts watching/)).toBeVisible();
    await page.goto("/portfolio/import");
    await page.locator('input[type="file"]').setInputFiles(path.join(__dirname, "..", "fixtures", "zerodha-console.csv"));
    await expect(page.getByText(/Detected: Zerodha Console holdings/)).toBeVisible();
    await expect(page.getByText(/rows ready/)).toBeVisible();
    await page.getByRole("button", { name: /^Import \d+ from Zerodha/ }).click();
    await page.waitForURL(/\/home/);
    await page.goto("/portfolio?tab=manage");
    await expect(page.getByText("Infosys").filter({ visible: true }).first()).toBeVisible();
  });
});

test.describe("Analysis", () => {
  test.beforeEach(async ({ page }) => {
    await startDemo(page);
  });

  test("says what moved, why and how, for any period, then returns, risk and health", async ({ page }) => {
    await page.goto("/analysis");
    await expect(page.getByRole("heading", { name: /^(Up|Down) ₹[\d,]+ over the last month$|^Barely moved/ })).toBeVisible();
    await expect(page.getByText(/of your \d+ holdings rose and \d+ fell/)).toBeVisible();
    await expect(page.getByText("Specific to what you own")).toBeVisible();
    await expect(page.getByText(/than the Nifty by [\d.]+ points|in step with the Nifty/)).toBeVisible();
    await page.getByRole("radio", { name: "1W" }).click();
    await expect(page.getByRole("heading", { name: /over the last week$|^Barely moved/ })).toBeVisible();
    for (const h of ["Where the gains and losses are", "What could hurt, and how concentrated you are", "How sound your holdings are"]) await expect(page.getByRole("heading", { name: h })).toBeVisible();
    await expect(page.getByText("If the Nifty fell 10%")).toBeVisible();
    // Nothing about alerts is left on the page.
    await expect(page.getByRole("main").getByText(/\balerts?\b/i)).toHaveCount(0);
  });

  test("old alert links land on the analysis", async ({ page }) => {
    await page.goto("/alerts");
    await page.waitForURL(/\/analysis/);
    await expect(page.getByRole("heading", { name: "Analysis", exact: true })).toBeVisible();
  });

  test("stress test slider and hidden clusters", async ({ page }) => {
    await page.goto("/risk");
    await expect(page.getByText("If the Nifty 50 fell")).toBeVisible();
    const slider = page.getByRole("slider", { name: /Nifty fall/ });
    await slider.fill("20");
    await expect(page.getByText("20%", { exact: true })).toBeVisible();
    await expect(page.getByText(/You own \d+ market-priced holdings, but/)).toBeVisible();
    await expect(page.getByText("Moves together").first()).toBeVisible();
  });

  test("results card on the stock page", async ({ page }) => {
    await page.goto("/stock/INFY.NS");
    await expect(page.getByText(/results, explained/)).toBeVisible();
    await expect(page.getByText("What improved").first()).toBeVisible();
    await expect(page.getByText("What got worse").first()).toBeVisible();
  });
});

test.describe("Ask and You", () => {
  test("Ask opens on a question to start from, built from the account's own holdings", async ({ page }) => {
    await startDemo(page);
    await page.goto("/ask");
    await expect(page.getByRole("heading", { name: /Ask anything about\s*your money/ })).toBeVisible();
    // The history list can hold conversations with this title; the suggestion is the last such button.
    await expect(page.getByRole("button", { name: "Why is my portfolio down this month?", exact: true }).last()).toBeVisible();
    await page.getByRole("tab", { name: "One company" }).click();
    await expect(page.getByRole("button", { name: /^Explain .+'s latest results in simple words$/ })).toBeVisible();
    await expect(page.getByLabel("Your question")).toBeVisible();
    await expect(page.getByRole("button", { name: "New conversation" })).toBeVisible();
  });

  test("the profile shows who you are, with sign out first", async ({ page }) => {
    await startDemo(page);
    await page.goto("/settings");
    await expect(page.getByRole("heading", { name: /Hey,\s*Aarav/ })).toBeVisible();
    await expect(page.getByText("Shared demo account", { exact: true })).toBeVisible();
    await expect(page.getByRole("main").getByRole("button", { name: "Sign out" })).toBeVisible();
    await expect(page.getByText(/sensitivity|Price alerts|email digest/i)).toHaveCount(0);
  });
});

test.describe("Goals", () => {
  /**
   * The shared demo account is put back by the nightly job, not between test runs, so a goal left
   * behind by a failed run would still be here. Clear anything with this test's name first, so the
   * test means the same thing however many times it has been run.
   */
  async function clearTestGoals(page: Page) {
    await page.goto("/settings");
    const remove = page.getByRole("button", { name: "Remove E2E goal" });
    for (let i = 0; i < 9 && (await remove.count()) > 0; i++) {
      const left = (await remove.count()) - 1;
      await remove.first().click();
      await page.getByRole("button", { name: "Remove", exact: true }).click();
      await expect(remove).toHaveCount(left);
    }
    await expect(remove).toHaveCount(0);
  }

  test("a goal shows what it needs from here, and updates as progress is recorded", async ({ page }) => {
    await startDemo(page, "new@nazar.dev");
    await clearTestGoals(page);

    // Add: an amount and the day it is needed, and the arithmetic appears.
    await page.getByRole("button", { name: "Add" }).click();
    await page.getByLabel("Name").fill("E2E goal");
    await page.getByLabel("Amount needed (₹)").fill("2500000");
    const [y, m, d] = new Date(Date.now() + 5.5 * 3600_000 + 24 * 365 * 1000 * 3).toISOString().slice(0, 10).split("-");
    await page.getByLabel("Needed by").fill(`${y}-${m}-${d}`);
    await page.getByLabel("Already saved (₹)").fill("150000");
    await page.getByLabel("Added each month (₹)").fill("20000");
    await page.getByRole("button", { name: "Add goal" }).click();

    await expect(page.getByText("E2E goal")).toBeVisible();
    // The arithmetic appears: what is saved, what a month has to be, and what is still to go.
    await expect(page.getByText("₹1,50,000")).toBeVisible();
    await expect(page.getByText("Needs each month")).toBeVisible();
    await expect(page.getByText("Still to put away")).toBeVisible();
    await expect(page.getByText("₹23,50,000")).toBeVisible();

    // Record progress: the saved figure moves.
    await page.getByRole("button", { name: /Record progress on E2E goal/ }).click();
    await page.getByLabel("Amount saved now (₹)").fill("500000");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText("₹5,00,000")).toBeVisible();

    // Changing the monthly amount alone must not wipe what has been saved.
    await page.getByRole("button", { name: "Edit E2E goal" }).click();
    await page.getByLabel("Added each month (₹)").fill("25000");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("₹5,00,000")).toBeVisible();
    await expect(page.getByRole("button", { name: /Record progress on E2E goal/ })).toBeVisible();

    // Remove it: the account is left as it was found.
    await page.getByRole("button", { name: "Remove E2E goal" }).click();
    await page.getByRole("button", { name: "Remove", exact: true }).click();
    await expect(page.getByRole("button", { name: "Remove E2E goal" })).toHaveCount(0);
  });

  test("the form refuses a goal it cannot work with", async ({ page }) => {
    await startDemo(page, "new@nazar.dev");
    await clearTestGoals(page);
    await page.getByRole("button", { name: "Add" }).click();
    await page.getByLabel("Amount needed (₹)").fill("2500000");
    await page.getByRole("button", { name: "Add goal" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "name" })).toBeVisible();
    // Nothing was created: the sheet stays open and the goal is not added to the list.
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });
});

test.describe("Mobile @mobile", () => {
  test("bottom tabs navigate between the main areas @mobile", async ({ page }) => {
    await startDemo(page);
    const nav = page.getByRole("navigation", { name: "Main" }).last();
    for (const [label, url] of [["Analysis", /\/analysis/], ["Portfolio", /\/portfolio/], ["Ask", /\/ask/], ["You", /\/settings/], ["Home", /\/home/]] as const) {
      await nav.getByRole("link", { name: label }).click();
      await page.waitForURL(url);
    }
    await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
  });
});

test.describe("Ask @openai", () => {
  test.skip(!process.env.OPENAI_API_KEY && !process.env.E2E_OPENAI, "needs an OpenAI key on the server");
  test("answers a portfolio question with getMyPortfolio", async ({ page }) => {
    await startDemo(page);
    await page.goto("/ask");
    // Earlier runs leave conversations with this title in the history list, which comes first in
    // the page; the suggestion on the start screen is the last button with the name.
    await page.getByRole("button", { name: "Why is my portfolio down this month?", exact: true }).last().click();
    await expect(page.getByText(/Reading your portfolio|read-only from Nazar's checkup/).first()).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(/the decision is yours/i)).toBeVisible({ timeout: 90_000 });
  });
});
