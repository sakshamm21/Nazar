import { expect, test, type Page } from "@playwright/test";
import path from "node:path";

/** Starts an isolated 24-hour demo from the landing page, exactly like a visitor would. */
async function startDemo(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: /Try the demo, no sign-up/ }).first().click();
  await page.waitForURL(/\/home/);
}

async function skipTour(page: Page) {
  const skip = page.getByRole("button", { name: "Skip tour" });
  if (await skip.isVisible().catch(() => false)) await skip.click();
}

test.describe("Landing", () => {
  test("pitch, six hero features and the demo button", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /Your stocks,\s*watched/ })).toBeVisible();
    await expect(page.getByText("Nazar watches your stocks every day")).toBeVisible();
    for (const t of ["Alerts that explain why", "Why did I move today?", "Hidden-risk checks", "Results, explained", "Alerts that learn", "Family portfolios, in Hindi"]) await expect(page.getByRole("heading", { name: t })).toBeVisible();
    await expect(page.getByText(/No tips, no predictions, ever/)).toBeVisible();
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
    await expect(page.getByText(/reported results/).first()).toBeVisible();
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
    await page.goto("/alerts");
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
    await expect(page.getByText(/independent bets/)).toBeVisible();
    await expect(page.getByText("Moves together").first()).toBeVisible();
  });

  test("H4: results card on the stock page", async ({ page }) => {
    await page.goto("/stock/INFY.NS");
    await expect(page.getByText(/results, explained/)).toBeVisible();
    await expect(page.getByText("What improved").first()).toBeVisible();
    await expect(page.getByText("What got worse").first()).toBeVisible();
  });

  test("H5: learned threshold with evidence, and Undo", async ({ page }) => {
    await page.goto("/settings");
    await expect(page.getByText(/You found small-move alerts less useful/)).toBeVisible();
    await expect(page.getByText(/Evidence:/).first()).toBeVisible();
    await page.getByRole("button", { name: "Undo" }).first().click();
    await expect(page.getByText("Undone").first()).toBeVisible();
  });

  test("H6: Papa's portfolio and the Hindi weekly report", async ({ page }) => {
    await page.getByRole("link", { name: "हिंदी रिपोर्ट देखें" }).click();
    await expect(page.getByRole("heading", { name: "Sunday report" })).toBeVisible();
    await expect(page.getByText("इस हफ़्ते")).toBeVisible();
    await page.getByRole("radio", { name: "English" }).click();
    await expect(page.getByText("This week")).toBeVisible();
  });

  test("H1: rate an alert", async ({ page }) => {
    await page.goto("/alerts");
    const up = page.getByRole("button", { name: "Useful", exact: true }).first();
    await up.click();
    await expect(up).toHaveAttribute("aria-pressed", "true");
  });
});

test.describe("Accounts", () => {
  test("one-click test account sign-in", async ({ page }) => {
    await page.goto("/signin");
    await page.getByRole("button", { name: "Investor (full demo)" }).click();
    await page.waitForURL(/\/home/);
    await expect(page.getByRole("heading", { name: /Good (morning|afternoon|evening)/ })).toBeVisible();
  });

  test("sign up with a code, then import a Zerodha file", async ({ page }) => {
    const email = `e2e-${Date.now()}@example.com`;
    await page.goto("/signup");
    await page.getByLabel("Your name").fill("Riya");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill("correct horse battery");
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
    await expect(page.getByText("Infosys").first()).toBeVisible();
  });
});

test.describe("Mobile @mobile", () => {
  test("bottom tabs navigate between the main areas @mobile", async ({ page }) => {
    await startDemo(page);
    await skipTour(page);
    const nav = page.getByRole("navigation", { name: "Main" }).last();
    for (const [label, url] of [["Alerts", /\/alerts/], ["Portfolio", /\/portfolio/], ["Settings", /\/settings/], ["Home", /\/home/]] as const) {
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
