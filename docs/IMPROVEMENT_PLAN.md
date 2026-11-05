# Nazar improvement plan

A step-by-step plan for an agent to follow. It comes from a product review of the live demo
(nazar-watch.vercel.app) and the code on 5 Nov 2026. Do the phases in order: Phase 1 fixes wrong
numbers on money and tax screens, and later phases build on its data model.

## How to work through this plan

- **One step at a time.** Each step is sized to be one reviewable change. Finish it, check it, commit
  it, then move on. Do not start a step whose "Depends on" step is not done.
- **Stop at every `DECISION` gate** and ask the owner. Do not guess the answer. Steps that depend on
  a gate wait for it; others can continue.
- **After every step run:** `npm run typecheck`, `npm run lint`, `npm test`. At the end of each phase
  also run `npm run test:e2e`. Report failures with their output; never mark a step done while a
  check fails.
- **Every bug fix gets a test** that fails before the fix and passes after it.
- **Schema changes:** edit `src/lib/db/schema.ts`, then `npm run db:generate` to create the migration
  in `drizzle/`. Never hand-edit an applied migration. Existing data must keep working: write a
  backfill in the migration where a new column needs one.
- **The no-advice rule is absolute.** New user-facing text must pass `tests/unit/no-advice.test.ts`
  and must never say what to buy, sell or hold. Describe; never direct.
- **Match the house voice:** short, plain sentences, rupees in Indian format (`inr`, `inrCompact`
  from `src/lib/format.ts`), signs and arrows on every gain and loss, never colour alone.
- **Keep the README true.** When a step changes a behaviour the README describes, update that
  paragraph in the same commit.
- **Git:** work on a branch per phase (`improve/phase-1-money-correctness`, …), one commit per step
  with a message saying what changed and why. Push and open pull requests only when the owner asks.

---

## Phase 1: correct numbers on money and tax screens

### 1.1 Record a sale as a sale, not as an edit

**Problem.** "Sold some" in `src/components/portfolio/holding-sheet.tsx` (around line 118) sends
`PATCH /api/holdings/:id { quantity }`. That calls `updateHolding` in `src/lib/repo/portfolios.ts`,
which calls `resyncLots` in `src/lib/repo/lots.ts`, which **deletes every lot** and writes one lot
dated with the holding's oldest date. As a result:
- every SIP instalment and separate purchase is lost, so XIRR and the short/long-term split go wrong;
- undoing a SIP afterwards removes nothing, because the lots tagged with `sipId` are gone;
- the sale's price and date are never stored, so realised gains cannot be shown.

**Do this.**
1. Add a `holding_sales` table: `id`, `holdingId` (FK, cascade), `portfolioId`, `userId` (for
   lookups after a holding is deleted, see below), `symbol`, `name`, `assetClass`, `units`, `price`,
   `date`, `cost` (what the consumed units cost), `createdAt`. Also a `sale_lots` table, or a jsonb
   column on the sale, recording which lots it consumed and how many units from each, with each
   lot's date and price. This is what the tax buckets need.
2. A selling holding must not take its sale history with it. When the last units are sold, keep the
   holding row with `quantity = 0` and hide zero-quantity holdings from every holdings list, chart,
   allocation and count. Alternatively, have the sale rows not cascade on holding delete. Pick one
   and apply it everywhere. Search for every query on `schema.holdings` to find the lists.
3. New repo function `recordSale(userId, holdingId, { units, price, date })`:
   - validate `units <= quantity`, `price > 0`, `date` not in the future and not before the first lot;
   - use the existing `consume()` in `src/lib/portfolio/lots.ts` (oldest first, as Indian tax rules
     expect) to pick the lots;
   - decrement each consumed lot's `remaining` (never delete lots);
   - insert the sale row(s);
   - update the holding's `quantity`, and set `avgPrice` from `summarise()` of the remaining lots;
   - do it all in one transaction.
4. New route `POST /api/holdings/:id/sales`. Check ownership through `requireHolding`, as every
   other holding route does.
5. In the holding sheet, "Sold some" asks for **units, sale price (prefilled with the last close),
   and date (prefilled with today)**. Selling everything goes through the same path and no longer
   calls `onRemove`. "Remove" stays as a separate action meaning "this was entered by mistake", and
   its confirm text says it also deletes the holding's history.
6. Pass the stored sales into XIRR. `cashFlows()` in `lots.ts` already takes a `sales` argument;
   wire it up through `xirrVsNifty` in `src/lib/portfolio/math.ts` and
   `src/lib/views/portfolio.ts` (~line 66).
7. "Correct it" (the edit path) still restates the position. When the holding has more than one lot
   or any SIP lots, show a warning in the sheet first: "Correcting this replaces its N purchases with
   one. To record a sale, use Sold some."

**Done when.** Selling part of a SIP-built holding keeps every remaining instalment lot with its own
date. XIRR counts the money taken out. Undoing the SIP after a partial sale removes the right units.
Integration tests in `tests/integration/lots.test.ts` cover: a partial sale across two lots, a full
sale (the holding disappears from lists, the sale remains), a sale then a SIP undo, and another user
getting 404.

### 1.2 Bucket unsold gains per lot, not per holding

**Problem.** `unrealisedGains()` in `src/lib/portfolio/capital-gains.ts` gets one `bought` date per
holding, taken from `summarise().buyDate` (`lots.ts:37`). That is the **earliest date of all lots,
including sold ones**, so a holding bought 2 years ago and topped up last month counts entirely as
long-term.

**Do this.** Build the positions from each **live lot** (`remaining > 0`), with that lot's
date, units and price. Group them back by holding for display, so one row can show "₹X long-term,
₹Y short-term". Change `views/portfolio.ts` (~line 153) to pass lots instead of holding summaries.
In `summarise()`, take `buyDate` from live lots only. Also replace `new Date().toISOString()` (a UTC
date) with the trade date the view already has, so the bucket does not flip early in the morning in
India.

**Done when.** A unit test with one lot from 400 days ago and one from 30 days ago produces one
long-term part and one short-term part. The capital-gains card shows the split.

**Depends on:** 1.1, which makes sure lots are no longer wiped.

### 1.3 Correct the capital-gains rules

**Problem.** `capital-gains.ts` applies 12.5% to everything that isn't equity, uses 12 months as the
long-term threshold for everything, treats every ETF as equity, and the card says "surcharge and cess
included", which is false. On the demo, Apple, Microsoft and Bitcoin all show at 12.5%.

**`DECISION` gate (ask the owner before coding).** Tax rules change with each budget. Show the owner
the table below and get a yes, or corrections, on (a) the table and (b) how to show slab-rate gains.
Before asking, verify each row against the Income Tax Department or the current Finance Act.

| Kind | Long-term after | Short-term rate | Long-term rate |
|---|---|---|---|
| Listed equity shares, equity mutual funds, equity ETFs, REIT and InvIT units | 12 months | 20% | 12.5% above ₹1.25 L a year (shared exemption) |
| Gold and silver ETFs, listed bonds, Sovereign Gold Bonds sold on the exchange | 12 months | slab | 12.5% |
| Gold and silver mutual funds, physical gold and silver, foreign shares (US stocks), property | 24 months | slab | 12.5% |
| Debt mutual funds bought on or after 1 Apr 2023 | never | slab | slab |
| Crypto (virtual digital assets) | no distinction | 30% | 30%, and losses cannot offset any gain |
| Sovereign Gold Bonds held to maturity, PPF, EPF | tax-free | — | — |

Options for the slab-rate rows: (A) show the gain and write "taxed at your income-tax slab" with
no rupee figure, and leave it out of the total; (B) add an optional "income-tax slab" setting on the
You page and use it. Recommend A first, B later.

**Do this (after the gate).**
1. Replace `GainClass = "equity" | "other"` with a rule table keyed by kind: holding period, short
   rate (number or `"slab"`), long rate, exemption, `canOffset`. Put the source and the date it was
   checked in a comment above the table.
2. `gainClassOf` uses `assetClass`, the AMFI category and, for ETFs, whether the underlying is gold,
   silver or equity. The ETF lists in `src/data/nse-etf.csv` and the category data in the catalog
   should be enough; if not, match names (`/gold|silver/i`).
3. Add a 4% cess on top of computed tax. Leave surcharge out, and say so on the card: "Before
   surcharge, which depends on your income."
4. Change the card copy in `src/components/analysis/capital-gains-card.tsx`: delete "surcharge and
   cess included"; add a row per kind; crypto gets its own row with "Losses here cannot be set off."
5. Unit tests in `tests/unit/capital-gains.test.ts`: one per row of the table, plus the 12- vs
   24-month boundary.

**Done when.** On the demo, Apple and Microsoft show as short-term at slab rate, Bitcoin at 30%, Gold
BeES in the gold row, and the Embassy REIT under equity rules.

### 1.4 Handle stock splits and bonus issues

**Problem.** Nothing adjusts quantity or average price when a company splits its shares or issues
bonus shares. Yahoo's prices adjust, so after a 1:2 split the holding shows a fake 50% loss.

**Do this.**
1. In the nightly pipeline (`src/lib/pipeline/collect.ts`), read split events for every held symbol.
   `yahoo-finance2`'s `chart()` returns `events.splits`; bonus issues appear there too as splits.
   Store them in a `corporate_actions` table: symbol, exDate, ratio (numerator/denominator), kind,
   `appliedAt`. Make it idempotent, keyed by (symbol, exDate).
2. For each new action, adjust every holding of that symbol whose lots predate the ex-date: multiply
   `quantity` and each lot's `quantity` and `remaining` by the ratio, and divide `price` and
   `avgPrice` by it. Adjust SIP lots too. Do it in a transaction and set `appliedAt`.
3. Show a note on the holding and in Analysis → Worth knowing: "Infosys split 1:2 on 3 Dec. Your 100
   shares are now 200, at half the price each."
4. Imports: a broker file states quantities after the split, so it needs no adjustment. Make sure an
   import after an action does not get adjusted again (compare lot dates with the ex-date).

**Done when.** An integration test with a fake market split (`tests/integration/fake-market.ts`)
shows value unchanged across the ex-date, quantity doubled, and the adjustment applied only once
across re-runs.

### 1.5 Show "NAV pending" instead of 0.0% for mutual funds

**Problem.** AMFI publishes the day's NAV late in the evening. Until then funds show "0.0% today"
(the UTI Nifty 50 index fund showed 0.0% on a +2.4% Nifty day), which also skews "specific to what
you own".

**Do this.** Where a holding's latest price date is older than the portfolio's trade date (look in
`src/lib/market/portfolio-day.ts`), mark the holding `pending`. Show "NAV pending" in the holdings
table, the heatmap tile and the movers list. Leave pending holdings out of today's attribution and
market split (`performance.ts`, `attribution` in `math.ts`), and add one line: "3 funds have not
published today's NAV yet."

**Done when.** A unit test shows a pending fund excluded from today's change and named in the note.

### 1.6 Make "today" the same number everywhere

**Problem.** For 5 Nov, Analysis → Today says +1.1%, but Analysis → 1M says "Best day: +1.4% on
5 Nov". In `src/lib/portfolio/performance.ts`, the 1-day period starts from `prevClose` (line ~120),
while the daily loop (line ~146) uses the stored history.

**Do this.** For the last day of every period, use the same start value the 1-day period uses. The
simplest way is to replace `values[end - 1]` with the 1D `startValue` when computing the last step's
move in the best/worst day loop. Find out why the stored history for the previous day differs from
`prevClose` (missing closes for some symbols, US time zones) and fix that at the source if it is a
data gap.

**Done when.** A unit test asserts that the 1D change equals the last day's move in the 1W, 1M and
3M periods.

---

## Phase 2: smaller bugs

Each item is a small, separate commit with a test where it can have one.

2.1 **Home header counts the Watching list as holdings.** `src/app/(app)/home/page.tsx:74` passes
`cards.length + watchingCount`. Say "27 holdings · watching 5", or count holdings only.

2.2 **"Last check" time is made up.** `home/page.tsx:65` adds 47 minutes to `asOf`. Store the real
time of the last successful refresh (the refresh-on-open and nightly runs already write snapshots;
add or reuse a timestamp column) and show that.

2.3 **The shared demo's Ask spending cap is shared by everyone.** In `src/lib/limits.ts:101`,
`spend(true)` sums by `userId` only. For test accounts, key spending by `userId + ip` as the question
count already is, by recording the ip hash on the `usage` row (a column plus a migration).
Note: this goes away if step 5.1 gives each visitor their own copy.

2.4 **Open redirect after sign-in.** `src/components/auth/forms.tsx:38` pushes any `next` value.
Accept `next` only if it starts with `/` and not `//`; otherwise use `/home`. Check other uses of
`next` in the auth pages too.

2.5 **Ask's first suggested question is hard-coded.** `src/components/ask/ask-start.tsx:27` always
offers "Why is my portfolio down this month?". Choose "up" or "down" from the month's change the
page already has; when the month is flat, use "What did my portfolio do this month?".

2.6 **Stock page back link.** `src/app/(app)/stock/[symbol]/page.tsx:116` links to `/portfolio` but
says "Home". Say "Portfolio", or go back to the page the user came from.

2.7 **"▼ −0.0%".** In `Delta` (`src/components/ui/delta.tsx`) and `signedPct` (`src/lib/format.ts`),
choose the sign, arrow and colour from the value rounded to the displayed decimals.

2.8 **"Almost all of it is the market"** appears even when the market part is bigger than the whole
move. The template is in `src/lib/portfolio/performance.ts` (~line 206); add cases: market
part above 100% of the move ("The market alone would have added more; what you own held it back by
₹X"), the market opposite to the move, and roughly half and half.

2.9 **Health check passes on no change.** "Long-term debt ratio fell, 3.9% → 3.9%" passes because of
`<=` in `piotroskiAltman` (`src/lib/analytics/models.ts`). Either rename the test "Long-term debt
ratio did not rise", which matches Piotroski's definition, or use `<`. Prefer the rename.

2.10 **SIP backdating gaps.** `instalmentsDue` in `src/lib/portfolio/sip.ts` silently skips months
with no price within 10 days. Return the skipped months. The SIP toast and sheet then say "Added 18
instalments; 6 months had no price and were left out." Also, when the holding came from a broker
import (`source !== "manual"`) and a start date in the past is chosen, warn before saving: "Your
broker file already counts the units these instalments bought. Adding them here would count them
twice."

---

## Phase 3: the core product

### 3.1 An "All portfolios" view

**Why.** The promise is "everything you own, in one place", but Home, Portfolio and Analysis show
one portfolio at a time. The demo's total of ₹77.2 L appears only on the You page.

**Do this.**
1. Add an "All" choice to `PortfolioTabs` (`src/components/portfolio/portfolio-tabs.tsx`), shown
   only when there are two or more portfolios, and make it the default for those users. The
   `nazar_pf` cookie (`src/lib/current-user.ts`) gets the value `all`.
2. In `src/lib/views/portfolio.ts`, build the view from the holdings of every portfolio. Where the
   same symbol is in two portfolios, merge them: add up quantities, keep every lot, and weight the
   average price.
3. Home, Portfolio → Overview and Analysis work on "All". Portfolio → Manage needs one portfolio:
   when "All" is selected, Manage shows the portfolio cards and asks the user to open one.
4. Ask's `getMyPortfolio`-style tools (`src/lib/ask/tools.ts`) default to all portfolios, with an
   optional portfolio name argument.

**Done when.** The demo account opens on "All" showing ₹77.2 L, and the e2e test covers switching
between All and one portfolio.

### 3.2 Realised gains, income and a tax-year report

**Depends on:** 1.1, 1.3.

1. **Since you invested** (Analysis) gains a "Realised" part: profit from sales this financial year
   and in total, from `holding_sales`.
2. **Dividends and interest.** Add an `income` table (holding, date, amount, kind: dividend,
   interest, other). Users enter income by hand from the holding sheet ("Got a dividend"). Later,
   prefill dividend suggestions from Yahoo's `events.dividends` × units held on the record date, for
   the user to confirm. Never record income automatically without the user confirming. Total
   return = unrealised + realised + income.
3. **Capital gains for a financial year.** A screen (Analysis → Taxes, or `/analysis/taxes`) with a
   financial-year picker (April to March) listing each sale with its lots, buckets and tax, and an
   Excel download that reuses `src/lib/excel.ts`. Keep the "calculation, not advice; check with
   your tax filer" note.
4. **Purchase and sale history per holding.** The holding sheet gets a "History" tab: each lot (date,
   units, price, SIP or not) and each sale. Each lot can be edited or deleted on its own, so
   "Correct it" is no longer the only way to fix one wrong purchase.

### 3.3 A fair benchmark

**Why.** The whole portfolio, including 22% PPF/EPF and 7% FD, is compared with the Nifty, so in any
rising market it looks "worse than the Nifty".

**`DECISION` gate.** Offer the owner: (A) compare only the market-linked part (stocks, equity funds,
ETFs) with the Nifty and say so in the label; (B) a blended benchmark weighted by the portfolio's mix
(Nifty for equity, a gold price for gold, a fixed rate for deposits); (C) let the user choose an
index (Nifty 50, Nifty 500, Nifty Midcap 150). Recommend A now, with C as an option later.

**Do this (for A).** In `performance.ts` and `xirrVsNifty`, compute the "You vs Nifty" figure over
the market-linked holdings only, and label it "Your stocks and funds vs the Nifty". Keep the
whole-portfolio change as the headline number.

### 3.4 Make the Home heatmap about what moved

In `src/components/charts/heatmap.tsx` and the Home page, leave out holdings with no daily price
(PPF, EPF, FDs, property, cash) from the "Today" view, and add one line under it: "Not shown: ₹14.4 L
in deposits and provident funds, which do not move day to day." Keep them in "Since you invested".

---

## Phase 4: navigation and where the buttons are

4.1 **A persistent "+ Add" button.** Desktop: in the page header of Home, Portfolio and Analysis
(or at the top of the sidebar). Mobile: in the top bar of `src/components/shell/app-shell.tsx`,
replacing the sign-out icon. It opens the same add flow as `/portfolio?add=1`.

4.2 **Move sign-out off the mobile top bar.** It is easy to tap by mistake. It already exists on the
You page; keep it there only.

4.3 **Global search.** A search field in the desktop sidebar and a search icon in the mobile top bar,
plus Cmd/Ctrl-K. It reuses `/api/search` and opens the stock or fund page. Each result also has a
quick "Add" and "Watch".

4.4 **Actions on the stock page.** `src/app/(app)/stock/[symbol]/page.tsx`:
- not held: **Add to portfolio** (opens the add sheet prefilled) and **Watch / Watching**;
- held: **Bought more**, **Sold some** and **SIP**, opening the existing holding sheet.
- The "Nazar hasn't checked this yet" card gets the same two buttons.

Funds, ETFs and other priced assets get the same page, if they don't already; check which asset
classes `/stock/[symbol]` supports.

4.5 **Manage tab cleanup.** Remove the duplicate portfolio switcher: keep the chips at the top, and
make the "Your portfolios" cards a compact list with rename, delete and new. Fix the heading "What My
portfolio holds" → "What's in My portfolio". Make sure the "Find a holding" placeholder fits on a
375px screen.

4.6 **Give Watching a home.** A "Watching" section on Home (name, price, today's move, a sparkline,
results coming up), linked to a Watching list page or tab where items can be added and removed.
Today it is buried in Manage.

---

## Phase 5: the first visit

5.1 **A private copy of the demo for each visitor.** **`DECISION` gate:** confirm with the owner;
this changes the demo model. "Try the demo" creates a short-lived copy of the investor persona
(`src/lib/demo/seed.ts` already builds copies for tester accounts) marked `isDemo` with
`demoExpiresAt` 24 hours away (those columns already exist). The nightly maintenance cron deletes
expired copies. Aim for under 3 seconds: copy rows in SQL from a template account; never fetch
market data at click time. Remember 2.3 becomes unnecessary.

5.2 **A demo banner.** In the app shell, for demo and test accounts: "You're exploring a demo.
Changes reset after 24 hours. Create your account to keep your own portfolio." with a sign-up button.

5.3 **Show every feature in the demo.** Seed the investor persona with two goals (one on track, one
behind), one active SIP with a few instalments, one recorded sale (after 1.1) and one dividend
(after 3.2).

5.4 **A start-up checklist for new accounts.** On Home, until done: add or import holdings → see your
first analysis → set a goal → ask a question. Each item ticks itself from real data; the card can be
dismissed. On the empty state, put **Import from Zerodha, Groww, Upstox or CAMS** first, with "Add by
hand" second, since most people with existing investments have a broker file.

---

## Phase 6: the You page

6.1 **A simpler Ask model choice.** Replace the list of models with eval figures in
`src/components/settings/preferences.tsx` with two choices: **Quick** (the default model) and
**Thorough** (the deep-dive model). Put the full comparison behind an "How we chose these models"
link that opens it on its own page or a sheet. Keep the open-weight options there for people who
care.

6.2 **Save preferences to the account.** The model choice is "remembered on this device". Store it,
and the theme, on the user (`users` table or a `user_settings` table) so it follows the person to
another device.

6.3 **Export my data.** A button that downloads one Excel workbook: holdings, every lot, sales,
income, SIPs and goals. Reuse ExcelJS.

6.4 **A default portfolio**, used when the app opens (or "All", after 3.1).

---

## Phase 7: trust and finish

7.1 **Privacy policy, terms of use and a contact page**, linked from the landing footer, the sign-up
form and the You page. Say plainly what is stored, which outside services see what (Yahoo for
symbols, OpenRouter for Ask questions, Brevo for email), how to delete the account, and that Nazar is
not a SEBI-registered adviser. **`DECISION` gate:** the owner writes or approves the legal text; the
agent drafts it and leaves it marked as a draft.

7.2 **Link previews.** Add Open Graph and Twitter metadata and a share image in
`src/app/layout.tsx`, and a per-conversation preview for shared Ask links (`/s/[shareId]`).

7.3 **Price freshness on each holding.** A small "price from 3 days ago" badge where a holding's
price is stale (the view already counts `staleCount`), plus "NAV pending" from 1.5.

7.4 **Explain the health score.** Banks show "Lender check 3 of 4", not "health 100", and the
holdings table shows lenders' scores with a distinct label so they aren't compared with the 9-check
score. An info tip says what each score measures.

7.5 **A feedback link** on the You page and in the footer (the `/api/feedback` route exists for Ask;
reuse or extend it for general feedback).

---

## Phase 8: Ask

8.1 **"Ask about this" in more places:** holding rows, heatmap tiles, the movers list and each
"Worth knowing" note. Each opens Ask with a prefilled question, like the stock page's Ask button.

8.2 **Show the demo's question allowance before the first question**, not only after it runs out.
The count is already on the start screen; when it reaches 1, add "Create an account for 40 a day"
(read the number from `LIMITS.perDay` in `src/lib/limits.ts`; don't hard-code it).

8.3 **Suggested questions follow the portfolio.** Extend `startersFor` in `src/lib/ask/starters.ts`
with: a goal that is behind, a SIP instalment just added, a holding that moved more than 5% this
week, and the realised gains this year (after 3.2).

---

## Phase 9: reasons to come back (only if the owner agrees)

**`DECISION` gate.** The README says alerts and email digests were removed on purpose. Ask the owner
whether to bring back factual, opt-in updates. Do not start this phase without a yes.

If yes:
1. **"Since you last looked"** on Home: results reported by companies you hold, SIP instalments
   added, the biggest moves, and goal changes since the last visit (`users.lastSeenAt` exists).
2. **A weekly email, off by default:** "What your money did this week", built from the same tested
   sentence templates as Analysis, so it passes the no-advice test. Settings control it, and every
   email has an unsubscribe link.
3. **Installable app and web push:** a web app manifest and icons, then opt-in push for results days
   and SIP instalments. Push comes after the email works.

---

## Out of scope for now

Live intraday prices, analyst ratings and target prices, and anything that suggests a trade: these
were left out on purpose and stay out.
