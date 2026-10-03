# Nazar features

Each feature: what the user sees, how it works, and where the code and tests are. Paths are relative to `src/` unless they start with `tests/`.

## Hero features

### H1 · Smart alerts that explain why, with ₹ impact

**What you see.** "Tata Motors fell 7.0%" followed by *"Likely reason: something specific to Tata Motors. It moved far more than the market (Nifty −1.0%) and its sector (−0.5%). Tata Motors is 28% of your portfolio; its value fell ~₹4,870 today."* Each alert has 👍/👎, a Hindi toggle and a link to the full picture. Important alerts also arrive in one daily email digest.

**How it works.**
- The nightly checkup stores each holding's close, change, beta and health score. The rule engine (`lib/alerts/rules.ts`) checks each portfolio against the user's sensitivity preset (Major / Balanced / Everything):

  | Preset | Stock move | Portfolio move | Concentration |
  |---|---|---|---|
  | Major | 6% | 3% | 30% |
  | Balanced | 4% | 2% | 25% |
  | Everything | 2.5% | 1% | 20% |

- Moves in positions under a materiality floor are ignored, so a 9% move in a ₹2,000 holding stays quiet.
- **Likely reason** (`lib/alerts/reason.ts`), in order:
  - *whole market* when beta × Nifty explains at least about two-thirds of the move;
  - *sector-wide* when the stock's Nifty sector index moved at least 60% as much;
  - *results* when quarterly results came out in the last two sessions;
  - otherwise *company-specific*.
- Company-specific moves on live data get up to two Google News headlines. They pass a strict filter (`lib/news/google.ts`) that drops market wraps, "stocks to watch" lists, tips and headlines that also appear for other holdings.
- **Other alert types:** whole-portfolio moves (using the H2 line), concentration crossings (with a 30-day cooldown), health-score changes, upcoming results (1–4 days ahead), and price levels you set yourself.
- **Limits:** de-duplicated by `portfolio:type:symbol:date`. At most 5 alerts a day; the rest are grouped into one "smaller moves" digest.

**Tests.** `tests/unit/alerts.test.ts` (rules, reasons, materiality, dedupe, cap, cooldowns), `tests/unit/news.test.ts`, and `tests/integration/pipeline.test.ts` (end to end on a fake market).

### H2 · "Why did my portfolio move today?"

**What you see.** At the top of Home: *"You're down ₹6,220 today (−0.3%). ₹6,391 of that came from Maruti Suzuki. Infosys added ₹7,894."* Tap it for the full breakdown. Each holding's move is split into a **market part** (beta × Nifty) and a **stock-specific part**, worded honestly when the two pull in opposite directions.

**How it works.** `attribution()` in `lib/portfolio/math.ts` sorts holdings by rupee impact and names the fewest that explain at least 60% of the move (at most three). On mixed days it also names the biggest offset. The text is in `lib/alerts/templates.ts`, in English and Hindi.

**Tests.** `tests/unit/portfolio-math.test.ts`.

### H3 · Hidden-risk checks

**What you see.** The Risk page has three checks:
- **Stress test.** A slider from Nifty −5% to −30% shows the estimated ₹ loss, holding by holding.
- **Less diversified than it looks.** *"You own 14 stocks, but over the last year they behaved like about 3.3 independent bets"*, with the groups that move together and a correlation heatmap.
- **Concentration.** Largest holding, top-3 share and largest sector.

On Home, two rings summarise them: financial health outside, diversification inside.

**How it works.** All in `lib/portfolio/math.ts`:
- **Stress test:** Blume-adjusted beta (0.67β + 0.33, clamped 0–2.5) × value × the fall. Beta is computed from stored daily closes, because Yahoo's NSE beta field is unreliable.
- **Clusters:** average-linkage correlation clusters at ρ ≥ 0.5.
- **Effective bets:** 1 / wᵀCw, with weights summing to 1 (equals the number of holdings when they're independent and equal-weighted, and 1 when they move identically).
- **Diversification ring:** combines effective bets, the largest weight and portfolio beta.

**Tests.** `tests/unit/portfolio-math.test.ts` and `tests/unit/analytics.test.ts`.

### H4 · Results-day explainer

**What you see.** *"Infosys reported Apr–Jun 2026 results"* with **What improved** and **What got worse** in plain words:
- revenue and profit against last quarter and a year ago;
- EPS against analysts' estimate;
- the profit margin.

It also gives the health score, honestly: *"unchanged; it updates with full-year results"*. Quarters are named the Indian way (Apr–Jun = Q1 FY27).

**How it works.** The nightly collect step spots a quarter-end it hasn't seen before and records a `results_events` row. It never fires on a stock's first fetch, so new users don't get old news. `resultsPoints()` and `resultsText()` in `lib/alerts/templates.ts` build the explanation; growth from a loss is skipped because it isn't a meaningful percentage. Banks and NBFCs use a lender check instead of Piotroski/Altman (`lib/analytics/models.ts`).

**Tests.** `tests/unit/alerts.test.ts` (H4 block) and `tests/integration/pipeline.test.ts` (detection on day 2).

### H5 · Alerts that learn

**What you see.** After enough 👎 on small moves: *"Nazar adjusted your alerts. You found small-move alerts less useful, so I'll only alert you for moves above 5%."* The message shows the evidence (e.g. 1 of 6 smaller alerts rated useful, 2 of 2 bigger ones) and has an **Undo** button.

**How it works.** `tune()` in `lib/alerts/tuner.ts` is rule-based on purpose (see DECISIONS.md D-5):
- It reads the last 10 ratings of a type and tries each higher step on a ladder (stock moves: 2.5 → 4 → 5 → 7 → 10%).
- It raises the threshold to the step that best separates useful from not-useful alerts, but only if alerts below it were useful ≤ 40% of the time (at least 3 ratings) and alerts above it ≥ 60%.
- It never lowers a threshold, waits 14 days between changes and pauses for 30 days after Undo.
- Upcoming-results reminders rated useful ≤ 25% of the time get muted instead; they stay in the weekly report.

**Tests.** `tests/unit/alerts.test.ts` (H5 block), `tests/integration/authorization.test.ts` (Undo pauses tuning) and `tests/integration/demo.test.ts` (the demo learns 5% from its replayed ratings).

### H6 · Family portfolios with Hindi reports

**What you see.**
- Add "Papa's portfolio", choose Hindi, and enter Papa's email.
- After a one-click confirmation, he gets a short **Sunday report** in simple Hindi and the important alerts, without needing an account. The report covers the week vs the Nifty, what moved it, what changed and what's coming.
- Every report in the app has an English/हिंदी switch.

**How it works.**
- `route()` in `lib/alerts/routing.ts` decides who gets what:
  - the owner's inbox always gets everything;
  - the owner's email follows their digest and quiet-mode settings;
  - family members get only important or critical alerts and reports, in the portfolio's language, and only after confirming.
- Demo accounts and simulations never email anyone.
- Weekly reports: `lib/reports/weekly.ts` (structured data → EN + HI) and `lib/reports/generate.ts`.
- Email delivery is idempotent per item and recipient (`deliveries` table), under a daily cap that stays inside Brevo's free tier.

**Tests.** `tests/unit/alerts.test.ts` (H6 block) and `tests/unit/no-advice.test.ts` (reports and emails in both languages).

## The demo

| Feature | How |
|---|---|
| **Try the demo, no sign-up** | Creates an isolated 24-hour account by copying a template account with SQL `INSERT … SELECT` (fresh ids derived with md5, so references stay consistent). Limited to 15 per network per day. |
| **Real data, offline** | `data/demo-fixture.json` holds real NSE prices and quarterly results for 19 stocks, the Nifty 50 and 9 sector indices, date-shifted so the latest session is the last weekday before today. Works with Yahoo down; the integration test blocks the network. |
| **Honest history** | The template's 60 sessions of alerts come from replaying the real engine over the fixture, with deterministic ratings that teach H5 its 5% step. |
| **Simulate a bad day** | Three scenarios: global slide, rate shock, single-company shock. They write a private `sim:<user>` market for the next session and run the real alert engine on it. Alerts are labelled *Simulation*; **Back to normal** removes every trace (`lib/demo/simulate.ts`). |
| **Guided tour** | Seven steps, spotlighting the real elements on Home and ending on Simulate. Shown once, replayable from Settings. |

## Everything else

| Area | Details |
|---|---|
| **Accounts** | Email and password; 6-digit code by email (codes shown on screen when email can't be delivered: always in development, in production only if `EXPOSE_VERIFICATION_CODES=true`); password reset by link; JWT in an httpOnly cookie; delete-my-account. One-click test accounts on the sign-in page. |
| **Portfolios** | Up to 6 portfolios (yours plus family) with up to 100 holdings each, edited inline. Import from Zerodha Console, Zerodha Kite, Groww and Upstox (CSV/XLSX) with a preview before saving. A "Watching" list for stocks you don't own. Price levels you choose ("tell me if Infosys goes below ₹1,400"). |
| **Stock page** | Price chart, health score with its parts, technical trend, results card, peer valuation ("model vs price", never a target), and Excel model downloads. |
| **Ask** | The v1 research agent as one tab: 28 tools over live data (21 research tools and 7 analysis models), 42 metrics, generative-UI charts and tables, plus a read-only `getMyPortfolio` tool. Simple/Pro answer styles, Hindi and Hinglish, Excel/PDF export, share links. Kept on topic by a classifier (`npm run eval:guard`), under advice rules in the prompt, and with per-user, per-network and daily-$ budgets. |
| **Metric tooltips** | Every number has a "What does this mean?" explanation in plain words (`lib/glossary.ts`). |
| **Insights** | `/insights` (admins only). North Star: weekly users who rated an alert useful. Also alert quality by type, H5 tuning and undo rate, the activation funnel, delivery, pipeline health and Ask cost. |
| **Design** | Dark ink-navy by default, porcelain light theme, cobalt accent, rings as the motif. Sora / Inter / IBM Plex Mono / Noto Sans Devanagari. Mobile-first with bottom tabs. The live style guide is at `/design`; the spec is in DESIGN.md. |
| **Operations** | Nightly checkup at 16:30, 18:30 and 20:30 IST on weekdays, resuming wherever the previous run stopped. Weekly reports at 08:00 IST on Sundays. Maintenance at 02:30 IST deletes expired demos and refreshes the demo market. All `/api/cron/*` routes require `CRON_SECRET`. |
