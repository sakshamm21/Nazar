import { expect, test, type Page } from "@playwright/test";
import path from "node:path";

/**
 * Signs in with the demo button, exactly like a visitor would (or, given an email, as one of the
 * other test accounts through the form). The account is shared, so
 * each test first clears any simulated day a previous test left behind. (Whether the tour has been
 * seen is remembered per browser, and every test starts with a fresh one.)
 */
async function startDemo(page: Page, email?: string) {
  await page.goto("/signin");
  if (email) {
    await page.getByLabel("Email").fill(email);
    await page.getByRole("textbox", { name: "Password" }).fill("nazar123");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
  } else await page.getByRole("button", { name: "Try the demo" }).click();
  await page.waitForURL(/\/home/);
  if (await page.getByText(/Simulated bad day/).count()) {
    await page.request.post("/api/demo/reset");
    await page.reload();
  }
}

/** A new demo always opens the tour once the page has settled (later on a slow network); close it. */
async function skipTour(page: Page) {
  const skip = page.getByRole("button", { name: "Skip tour" });
  const shown = await skip.waitFor({ timeout: 15_000 }).then(() => true, () => false);
  if (shown) {
    await skip.click();
    await expect(skip).toHaveCount(0);
  }
}

test.describe("Landing", () => {
  test("pitch, three things it does, and one tap into the demo", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /Your money,\s*watched/ })).toBeVisible();
    await expect(page.getByRole("link", { name: "Sign in", exact: true }).first()).toBeVisible();
    for (const t of ["See it move", "Know why", "Hear only what matters"]) await expect(page.getByRole("heading", { name: t })).toBeVisible();
    await expect(page.getByText(/No tips, no predictions/)).toBeVisible();
    await page.getByRole("button", { name: "Try the demo" }).click();
    await page.waitForURL(/\/home/);
  });
});

test.describe("Demo: guided tour and Simulate a bad day", () => {
  test("first visit runs the 7-step tour and ends on Simulate", async ({ page }) => {
    await startDemo(page);
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Step 1 of 7")).toBeVisible();
    await expect(dialog.getByRole("heading", { name: "Why did my portfolio move today?" })).toBeVisible();
    for (let i = 2; i <= 7; i++) {
      await dialog.getByRole("button", { name: "Next" }).click();
      await expect(dialog.getByText(`Step ${i} of 7`)).toBeVisible();
    }
    await expect(dialog.getByRole("heading", { name: "Now, try a bad day" })).toBeVisible();
    await dialog.getByRole("button", { name: "Got it" }).click();
    await expect(page.getByText("Step 1 of 7")).toHaveCount(0);
    // It doesn't come back on reload once completed.
    await page.reload();
    await expect(page.getByText(/Step \d of 7/)).toHaveCount(0);
  });

  test("Home shows every hero feature within one tap", async ({ page }) => {
    await startDemo(page);
    await skipTour(page);
    await expect(page.locator('[data-tour="h2"]')).toContainText(/You're (down|up)|A quiet day/);
    await expect(page.getByRole("heading", { name: "What needs your attention" })).toBeVisible();
    await expect(page.getByText("Nazar adjusted your alerts")).toBeVisible();
    await expect(page.getByRole("heading", { name: "What you own" })).toBeVisible(); // allocation across asset types
    await expect(page.getByText("Health and hidden risk")).toBeVisible();
    await expect(page.getByRole("tab", { name: /Papa's/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Simulate a bad day in the market" })).toBeVisible();
    await expect(page.getByText(/Nazar is watching/)).toBeVisible();
  });

  test("Simulate a bad day fires real alerts, then Back to normal clears them", async ({ page }) => {
    await startDemo(page);
    await skipTour(page);
    await page.getByRole("button", { name: "Simulate a bad day" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Run the simulation" }).click();
    await expect(page.getByText(/alerts? just arrived/)).toBeVisible();
    await expect(page.getByText(/Simulated bad day/)).toBeVisible();
    await page.goto("/alerts?tab=alerts");
    await expect(page.getByText("Simulation").first()).toBeVisible();
    await expect(page.getByText(/Likely reason:/).first()).toBeVisible();
    await page.getByRole("button", { name: "Back to normal" }).click();
    await expect(page.getByText(/Simulated bad day/)).toHaveCount(0);
  });
});

test.describe("Hero features", () => {
  test.beforeEach(async ({ page }) => {
    await startDemo(page);
    await skipTour(page);
  });

  test("H2: why did my portfolio move today", async ({ page }) => {
    await page.locator('[data-tour="h2"]').click();
    await expect(page.getByRole("heading", { name: "Why did my portfolio move today?" })).toBeVisible();
    await expect(page.getByText("What moved it")).toBeVisible();
    await expect(page.getByText(/market part/).first()).toBeVisible();
  });

  test("H3: stress test slider and hidden clusters", async ({ page }) => {
    await page.goto("/risk");
    await expect(page.getByText("If the Nifty 50 fell")).toBeVisible();
    const slider = page.getByRole("slider", { name: /Nifty fall/ });
    await slider.fill("20");
    await expect(page.getByText("20%", { exact: true })).toBeVisible();
    await expect(page.getByText(/You own \d+ market-priced holdings, but/)).toBeVisible();
    await expect(page.getByText("Moves together").first()).toBeVisible();
  });

  test("H4: results card on the stock page", async ({ page }) => {
    await page.goto("/stock/INFY.NS");
    await expect(page.getByText(/results, explained/)).toBeVisible();
    await expect(page.getByText("What improved").first()).toBeVisible();
    await expect(page.getByText("What got worse").first()).toBeVisible();
  });

  test("H5: learned threshold with evidence, and Undo", async ({ page }) => {
    // Undo changes the account for everyone until tonight, so it is done on the second investor.
    await page.request.post("/api/auth/logout");
    await startDemo(page, "tester1@nazar.dev");
    await page.goto("/settings");
    await expect(page.getByText(/You found small-move alerts less useful/)).toBeVisible();
    await expect(page.getByText(/Evidence:/).first()).toBeVisible();
    const undo = page.getByRole("button", { name: "Undo" }).first();
    if (await undo.isVisible()) await undo.click(); // an earlier run today may already have undone it
    await expect(page.getByText("Undone").first()).toBeVisible();
  });

  test("H6: Papa's portfolio and the Hindi weekly report", async ({ page }) => {
    await page.getByRole("link", { name: "हिंदी रिपोर्ट देखें" }).click();
    await expect(page.getByRole("heading", { name: "Sunday report" })).toBeVisible();
    await expect(page.getByText("इस हफ़्ते")).toBeVisible();
    await page.getByRole("radio", { name: "English" }).click();
    await expect(page.getByText("This week")).toBeVisible();
  });

  test("the analyzer says what moved, why and how, for any period", async ({ page }) => {
    await page.goto("/alerts");
    await expect(page.getByRole("tab", { name: "Analysis" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("heading", { name: /^(Up|Down) ₹[\d,]+ over the last month$|^Barely moved/ })).toBeVisible();
    await expect(page.getByText(/of your \d+ holdings rose and \d+ fell/)).toBeVisible();
    await expect(page.getByText("Specific to what you own")).toBeVisible();
    await expect(page.getByText(/than the Nifty by [\d.]+ points|in step with the Nifty/)).toBeVisible();
    await page.getByRole("radio", { name: "1W" }).click();
    await expect(page.getByRole("heading", { name: /over the last week$|^Barely moved/ })).toBeVisible();
    await page.getByRole("button", { name: /Open alerts/ }).click();
    await expect(page.getByRole("tab", { name: /^Alerts/ })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("article").first()).toBeVisible();
  });

  test("Home's chart follows the range you pick", async ({ page }) => {
    await skipTour(page);
    const chart = page.getByRole("img", { name: /^Portfolio value/ });
    await expect(chart).toBeVisible();
    await page.getByRole("radio", { name: "1M", exact: true }).click();
    await expect(page.getByText("past month")).toBeVisible();
    await expect(chart).toHaveAttribute("aria-label", /past month/);
    await page.getByRole("button", { name: "vs Nifty" }).click();
    await expect(page.getByText(/· Nifty [+−]/).first()).toBeVisible();
    // The allocation ring answers a tap.
    await page.getByRole("button", { name: /^Stocks/ }).click();
    await expect(page.getByText(/^\d+ holdings?: /)).toBeVisible();
  });

  test("H1: rate an alert", async ({ page }) => {
    await page.goto("/alerts?tab=alerts");
    // Pick an alert nobody has rated yet (the demo's older alerts carry replayed ratings).
    const unrated = page.getByRole("article").filter({ has: page.locator('button[aria-label="Useful"][aria-pressed="false"]') }).first();
    const title = (await unrated.getAttribute("aria-label"))!;
    const card = page.getByRole("article", { name: title, exact: true }).first();
    const saved = page.waitForResponse((r) => r.url().includes("/feedback") && r.ok());
    await card.getByRole("button", { name: "Useful", exact: true }).click();
    await saved;
    await expect(card.getByRole("button", { name: "Useful", exact: true })).toHaveAttribute("aria-pressed", "true");
    await page.reload();
    await expect(page.getByRole("article", { name: title, exact: true }).first().getByRole("button", { name: "Useful", exact: true })).toHaveAttribute("aria-pressed", "true");
  });
});

test.describe("Accounts", () => {
  test("the demo button, the investor's profile, and the saver's mix of assets", async ({ page }) => {
    await page.goto("/signin");
    // One demo button and the form: no list of accounts to choose from.
    await expect(page.getByText(/the investor|the saver|brand new/)).toHaveCount(0);
    await page.getByRole("button", { name: "Try the demo" }).click();
    await page.waitForURL(/\/home/);
    await expect(page.getByRole("heading", { name: /Good (morning|afternoon|evening)/ })).toBeVisible();
    await page.goto("/settings");
    await expect(page.getByRole("heading", { name: /Hey,\s*Aarav/ })).toBeVisible();
    await expect(page.getByText("Shared test account", { exact: true })).toBeVisible();

    // The saver: funds, ETFs, gold and deposits, all valued.
    await page.getByRole("button", { name: "Sign out" }).click();
    await startDemo(page, "riya@nazar.dev");
    await page.goto("/portfolio");
    for (const group of ["Mutual funds", "ETFs", "Gold & silver", "Retirement", "Fixed income", "Stocks", "US stocks", "Crypto"]) await expect(page.getByRole("heading", { name: new RegExp(`^${group}\\s*\\d+$`) })).toBeVisible();
    await expect(page.getByText("price on its way")).toHaveCount(0);
  });

  test("Ask opens with a guided start built from the account's own holdings", async ({ page }) => {
    await startDemo(page);
    await skipTour(page);
    await page.goto("/ask");
    await expect(page.getByRole("heading", { name: /Ask anything about\s*your money/ })).toBeVisible();
    await expect(page.getByText("Nazar fetches live data")).toBeVisible();
    await expect(page.getByRole("button", { name: "Why is my portfolio down this month?" })).toBeVisible();
    await page.getByRole("tab", { name: "One company" }).click();
    await expect(page.getByRole("button", { name: /^Explain .+'s latest results in simple words$/ })).toBeVisible();
    await expect(page.getByLabel("Your question")).toBeVisible();
  });

  test("the app is closed to signed-out visitors", async ({ page }) => {
    for (const p of ["/home", "/portfolio", "/alerts", "/settings"]) {
      await page.goto(p);
      await page.waitForURL(/\/signin/);
    }
  });

  test("build a portfolio across asset classes", async ({ page }) => {
    await startDemo(page);
    await page.goto("/portfolio");
    await expect(page.getByRole("heading", { name: "Fixed income" })).toBeVisible(); // the test account's deposit
    await page.getByRole("button", { name: "Add assets" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Search").fill("parag parikh flexi");
    await expect(dialog.getByRole("option", { name: /Parag Parikh Flexi Cap Fund - Direct - Growth/ })).toBeVisible();
    await dialog.getByRole("tab", { name: "Deposits, PF & more" }).click();
    await dialog.getByRole("button", { name: /Cash and savings/ }).click();
    await dialog.getByLabel("Name").fill("Emergency fund");
    await dialog.getByLabel("Amount (₹)").fill("150000");
    await dialog.getByRole("button", { name: "Add to portfolio" }).click();
    await expect(page.getByText("Emergency fund")).toBeVisible();
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
    await expect(page.getByText(/Let's set up your first portfolio|Add your holdings/)).toBeVisible();
    await page.goto("/portfolio/import");
    await page.locator('input[type="file"]').setInputFiles(path.join(__dirname, "..", "fixtures", "zerodha-console.csv"));
    await expect(page.getByText(/Detected: Zerodha Console holdings/)).toBeVisible();
    await expect(page.getByText(/rows ready/)).toBeVisible();
    await page.getByRole("button", { name: /^Import \d+ from Zerodha/ }).click();
    await page.waitForURL(/\/home/);
    await page.goto("/portfolio");
    await expect(page.getByText("Infosys").filter({ visible: true }).first()).toBeVisible();
  });
});

test.describe("Mobile @mobile", () => {
  test("bottom tabs navigate between the main areas @mobile", async ({ page }) => {
    await startDemo(page);
    await skipTour(page);
    const nav = page.getByRole("navigation", { name: "Main" }).last();
    for (const [label, url] of [["Alerts", /\/alerts/], ["Portfolio", /\/portfolio/], ["You", /\/settings/], ["Home", /\/home/]] as const) {
      await nav.getByRole("link", { name: label }).click();
      await page.waitForURL(url);
    }
  });

  test("the tour fits a phone screen @mobile", async ({ page }) => {
    await startDemo(page);
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Step 1 of 7")).toBeVisible();
    const box = await dialog.locator("div.absolute").last().boundingBox();
    expect(box && box.x >= 0 && box.x + box.width <= 375).toBeTruthy();
  });
});

test.describe("Ask @openai", () => {
  test.skip(!process.env.OPENAI_API_KEY && !process.env.E2E_OPENAI, "needs an OpenAI key on the server");
  test("answers a portfolio question with getMyPortfolio", async ({ page }) => {
    await startDemo(page);
    await skipTour(page);
    await page.goto("/ask");
    await page.getByRole("button", { name: "Why is my portfolio down this month?" }).click();
    await expect(page.getByText(/Reading your portfolio|read-only from Nazar's checkup/).first()).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(/the decision is yours/i)).toBeVisible({ timeout: 90_000 });
  });
});
