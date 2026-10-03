# Decisions

Short records of the choices that shaped Nazar v2.0: the context, what was decided, and what it costs. Newest considerations are folded into each record rather than appended.

## D-1 · Nightly snapshots; pages never call Yahoo

**Context.** v1 called Yahoo Finance from every page and tool. Yahoo is unofficial, rate-limited and occasionally returns HTML instead of JSON. A watchdog has to work when Yahoo doesn't.

**Decision.** A nightly pipeline fetches each held symbol once (one batched quote call per 50 symbols, incremental history, one summary call) and stores snapshots in Postgres. The alert engine and every page read only from the database. Only the Ask tab calls Yahoo live, and it is rate-limited.

**Trade-off.** Data is end-of-day, not live, which is what a calm daily watchdog needs anyway. Every snapshot shows its "as of" time, and stale symbols are marked rather than hidden.

## D-2 · A resumable pipeline that fits Vercel Hobby

**Context.** On the free plan, cron jobs run once a day per entry, with up to 59 minutes of jitter, and functions stop at 300 seconds. A few hundred symbols with retries can take longer.

**Decision.** The checkup is a state machine (quotes → collect → alerts → deliver):
- It is stored as a `pipeline_runs` row with a lock, a cursor and a 240-second budget.
- Three weekday cron entries (16:30, 18:30 and 20:30 IST) each continue wherever the previous run stopped.
- All writes are idempotent (unique keys, `on conflict do nothing`), so a re-run never duplicates an alert or an email.
- A circuit breaker stops a run after 5 consecutive transient failures, and alerts still go out on the quotes already collected.

**Trade-off.** More moving parts than a single job. The integration test covers re-runs, holidays and a provider outage.

## D-3 · Templates, not an LLM, for alerts and reports

**Context.** Alerts and reports go to people who may act on them, in English and Hindi, every day. LLM text costs money on every run, varies between runs, and could slip into advice.

**Decision.** Every alert, digest, weekly report and Hindi sentence comes from typed templates (`src/lib/alerts/templates.ts`, `src/lib/reports/weekly.ts`) filled with computed numbers. OpenAI is used only in the Ask tab, under per-user, per-network and daily-$ budgets.

**Trade-off.** Less varied prose; Hindi is simple and fixed rather than fluent. In return there's no per-alert cost, every sentence is reproducible, and every sentence can be tested.

## D-4 · The no-advice rule is enforced in code

**Context.** Nazar is not a SEBI-registered adviser. "Never say buy, sell, hold or target price, in English or Hindi" must hold for every sentence, including future ones.

**Decision.** `findAdvice()` (`src/lib/alerts/guard.ts`) uses English, Hindi and Hinglish patterns on NFC-normalised text. It runs:
1. at runtime on every alert, digest and report before it is saved or sent, with a neutral fallback if anything trips it;
2. in tests over a 90-scenario matrix of the real alert engine, every template, weekly reports in both languages, every email, the glossary, and every string literal and JSX text in `src/app`, `src/components` and `src/lib`.

The disclaimer avoids the forbidden words too ("never tells you what to do with your money").

As a consequence:
- **The analyst-ratings tool was removed from Ask**, along with the `targetMeanPrice` metric (now 42 metrics, not 43). Consensus ratings and target prices are recommendations, even when quoted.
- **"Upside" is now "Model vs price"**, and the "undervalued" screens are gone.
- News headlines that read as tips ("Buy X, target ₹900") are filtered out.

**Trade-off.** The UI scan can flag legitimate words (broker CSV headers like "avg buy price"). Those files are allow-listed explicitly, with a comment.

## D-5 · Rule-based learning (H5), not a model

**Context.** "Alerts that learn" must be explainable and safe, and it must work with the handful of ratings a person actually gives.

**Decision.** `tune()` looks at the last 10 ratings of a type and moves the threshold up a fixed ladder (2.5 → 4 → 5 → 7 → 10% for stock moves) to the step that best separates useful from not-useful alerts. It acts only with enough evidence (at least 3 ratings below the step, useful ≤ 40% of the time) and never lowers a threshold. It waits 14 days between changes and freezes for 30 days after Undo. Every change posts a message with the evidence and an Undo button.

**Trade-off.** It learns slowly and only in one direction, by design. A user who wants more alerts can pick a more sensitive preset in Settings.

## D-6 · "Likely reason" is a transparent classifier

**Context.** Explaining why a stock moved is the core of H1, and a wrong "the whole market fell" hides real company news.

**Decision.** Rules, in order:
1. *Market*, when beta × Nifty explains at least about two-thirds of the move.
2. *Sector*, when the sector index moved at least 60% as much.
3. *Results*, within two sessions of results.
4. Otherwise *company-specific*.

The text always says "likely" and shows the numbers it compared. The two-thirds threshold replaced an earlier one-half after the demo's "global slide" labelled an 8.3% company-specific fall as market-wide. A regression test pins that case.

## D-7 · Email: a daily digest through Brevo's free API; no Telegram, no push

**Context.** Zero paid services and minimal outside integrations. Brevo's free tier allows 300 emails a day.

**Decision.** The in-app inbox always has everything. Email is one digest per recipient per day, sent through Brevo's HTTP API with the same module pattern as Syncronify: it never throws, and logs a preview when it isn't configured. A global cap (250/day) leaves headroom for sign-up codes. Deliveries are recorded per (item, address), so retries never double-send. Family recipients must confirm by email before anything is sent to them. Telegram, WhatsApp and web push were left out: each is another integration to set up and maintain.

## D-8 · Postgres + Drizzle (Neon in production, PGlite locally)

**Context.** Syncronify uses MongoDB. Nazar's data is relational and time-series (portfolios → holdings → daily snapshots → alerts → feedback), and v1 already ran on Neon with Drizzle.

**Decision.**
- **Postgres with generated Drizzle migrations**, applied at build time.
- **Production:** the Neon HTTP driver, so no sockets hang between serverless invocations.
- **Locally:** PGlite (Postgres compiled to WASM) in `.data/nazar`, migrated and seeded on first run, so `npm run dev` needs no setup or network.
- **Tests:** the same migrations on in-memory PGlite, so integration tests exercise real SQL.
- **Separate database:** Nazar uses `NAZAR_DATABASE_URL`, its own database. The migrator refuses to run against a database that has v1's tables.

## D-9 · Email + password + code; fingerprint login and Google sign-in removed

**Context.** v1 identified users by a browser fingerprint. That can't support family recipients, email digests or account recovery, and it raises privacy concerns.

**Decision.** Syncronify's flow: email and password (bcrypt), a 6-digit code by email, reset by link, and a signed JWT in an httpOnly, SameSite=Lax cookie. One `authSecret()` serves sessions, signed email links (domain-separated) and IP hashing; production refuses to start without a real secret. Google sign-in was skipped on request: it is another integration with its own console and callback URLs. Reviewers get one-click test accounts instead.

## D-10 · An honest demo

**Context.** The demo has to work with Yahoo down, look like a real portfolio, and not invent anything.

**Decision.**
- Real NSE prices and quarterly results are captured into a committed fixture, then date-shifted so the latest session is the last weekday before today.
- The template account's 60 sessions of alerts come from replaying the real alert engine over those prices. Ratings are deterministic and teach H5 its 5% step.
- Visitors get a private, 24-hour copy, made by SQL `INSERT … SELECT` with md5-derived ids (fast over Neon's HTTP driver).
- Simulations write a private `sim:<user>` market for the next session and run the real engine on it. Everything they produce is labelled *Simulation* and removed on reset.
- Demo accounts never send email and never enter the live checkup.

## D-11 · One Next.js app, not a separate API

**Context.** Syncronify runs Express separately from its frontend.

**Decision.** Route handlers inside Next.js. Ask streams through the AI SDK inside Next, cron jobs are route handlers, and one app means one deployment (two Vercel projects in total, with the legacy app), not four.

## D-12 · Beta computed from stored prices

**Context.** Yahoo's `beta` field for NSE stocks is often missing or measured against the wrong index.

**Decision.** Beta and volatility are computed nightly from one year of stored daily closes against the Nifty 50, then Blume-adjusted for the stress test. Yahoo's beta is ignored for `.NS`/`.BO` symbols.

## D-13 · Things deliberately not built

| Not built | Why |
|---|---|
| Analyst ratings and target prices | Recommendations by another name (D-4) |
| Dividend alerts | Yahoo's NSE dividend dates are unreliable |
| Live intraday prices on pages | A daily watchdog, not a trading screen (D-1) |
| Screenshot import (vision) | P2 and paid per image; broker files cover the main brokers |
| Telegram / WhatsApp / push | Outside integrations (D-7) |
| Google sign-in | Skipped on request (D-9) |

## D-14 · Vitest and Playwright

**Decision.** Vitest for unit and integration tests: path aliases, mocking and fake timers with little setup. Playwright drives the installed Microsoft Edge on Windows, so there's no browser download. Both run with one command on Windows, macOS and Linux.
