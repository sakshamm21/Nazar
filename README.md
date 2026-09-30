# Stock AI — AI-Powered Equity Research Platform

A full-stack conversational equity-research assistant. Ask about any listed company and an
agentic LLM pulls live market data through **22 research tools** (43 metrics), then streams its
answer back as **generative UI** — interactive price charts, financial-statement bar charts,
comparison tables, analyst-consensus visuals and a DCF model with a sensitivity grid.

**Stack:** Next.js 15 (App Router) · TypeScript · Vercel AI SDK 5 · OpenAI · PostgreSQL + Drizzle ORM ·
NextAuth.js (device-fingerprint auth) · Recharts · Tailwind CSS 4 · Yahoo Finance data.

## Features

| Area | What it does |
|---|---|
| **Agentic tools** | `searchTicker`, `getQuote`, `getPriceHistory`, `getKeyMetrics`, `getFinancialStatements`, `compareStocks`, `getAnalystRatings`, `getEarnings`, `getCompanyProfile`, `getNews`, `getMarketMovers`, `getIndianMarketMovers`, `getMarketOverview`, `getOwnership`, `runDcfValuation`, plus watchlist/alert tools. The model chains and parallelises them (up to 10 steps). |
| **43 metrics** | Valuation (P/E, PEG, EV/EBITDA…), profitability, growth, balance-sheet health, per-share, dividends, risk & ownership — see `src/lib/finance.ts`. |
| **Generative UI** | Each tool call streams to the client as a typed part and renders a live component (skeleton while running → chart/table when done). `src/components/gen/`. |
| **Fingerprint auth** | No sign-up. The browser computes a SHA-256 fingerprint (canvas, WebGL, screen, timezone…); NextAuth's credentials provider maps a salted hash of it to a user. Same device → same history, even after clearing cookies. |
| **PostgreSQL** | Users, chats (full UI message history as JSONB) and per-request token usage/cost. Tables are auto-created on first run. |
| **Indian markets** | Nifty/Sensex/sector index board, Nifty 50 gainers/losers/most-active, ₹ with crore / lakh-crore formatting, NSE-first ticker resolution. |
| **Watchlist** | Sidebar watchlist with live prices; add via ticker box, the ★ on quote cards, or by asking ("add Infosys to my watchlist"). |
| **Price alerts** | "Alert me if Reliance falls below ₹1,100". Checked every minute while the app is open (browser notification + toast) and daily in the background via Vercel Cron. |
| **Share & export** | Public read-only link per chat (`/s/<id>`, noindex, revocable; private watchlist/alert output hidden). Export any chat to PDF via the print dialog. |
| **Accounts** | Fingerprint login stays the default. Optional Google/GitHub sign-in links a device's history to a real account and syncs it across devices. |
| **Guardrails** | A fast classifier blocks off-topic requests (coding, essays, recipes, jailbreaks) before the main model runs; strict scope + advice rules in the system prompt; server-side history (clients can't forge messages); input length cap; per-user/IP rate limits and daily $ budgets. |
| **Analysis models** | Risk & return vs Nifty/S&P (CAGR, volatility, Sharpe, Sortino, beta, alpha, drawdown), correlation matrix, comparable-company valuation, DuPont ROE, financial health (Piotroski F-score + Altman Z), SIP backtest with XIRR, technical indicators (SMA, RSI, MACD). |
| **Excel downloads** | Every result card downloads as Excel; DCF, comps, SIP, risk, correlation and DuPont download as **live models** (blue inputs, formula cells). The header's Excel button exports a whole chat as one workbook. Built client-side with ExcelJS, loaded on demand. |
| **Tools catalog** | "Tools" button lists every capability by category with Excel badges and one-click example questions. |
| **Product analytics** | `/insights` dashboard: North Star (Weekly Active Researchers), activation funnel, returning users, helpful rate, cost per answer, latency, guard block rate, tool/model/mode mix, top tickers. First-party events; raw questions are never stored in analytics. |
| **Answer feedback** | 👍/👎 on every answer, with a reason on 👎; shown by answer style on the dashboard. |
| **Trust & transparency** | "Based on N live data calls" under each answer expands to the exact data calls, source and freshness; quote cards show "as of" time and market state. |
| **Simple / Pro modes** | Beginner-friendly answers that explain jargon, or dense analyst-style answers. |
| **Hindi & Hinglish** | Answers in the language/script the user writes in. |
| **Follow-up suggestions** | Rules-based next questions under each answer: instant and free, grounded in the tickers just discussed. |
| **Cost-performance model selector** | Pick a model with its $/1M-token price, speed and quality — or **Auto**, which routes each question to the cheapest tier that can handle it. Only models your key can access are shown. Per-message and lifetime spend are displayed. |

## Run locally

Requires **Node 22+**.

```bash
npm install
cp .env.example .env.local      # then paste your OPENAI_API_KEY
npm run dev                     # http://localhost:3000
```

No database setup needed: without `DATABASE_URL` the app uses **PGlite** (real Postgres compiled to
WASM) stored in `./.data/`. To use a real Postgres instead, set `DATABASE_URL` (e.g. a free
[Neon](https://neon.tech) database) — tables are created automatically.

## Deploy (GitHub + Vercel)

With `git`, `gh` and `vercel` CLIs installed and logged in:

```powershell
# Windows
powershell -ExecutionPolicy Bypass -File scripts\deploy.ps1          # add -Public for a public repo
```
```bash
# macOS / Linux
bash scripts/deploy.sh
```

The script commits, creates a private GitHub repo and pushes, links a Vercel project, copies
`OPENAI_API_KEY`, `NEXTAUTH_SECRET` (auto-generated if missing) and `DATABASE_URL` from `.env.local`
into Vercel, connects the repo for auto-deploys and ships to production.

**For persistent history on Vercel, add a Postgres database** (Vercel dashboard → Storage → Neon,
which injects `DATABASE_URL`/`POSTGRES_URL`) and redeploy. Without it the app still works but uses a
temporary in-memory database.

Manual alternative: import the repo at vercel.com/new and set the env vars from `.env.example`.

## Configuration

Everything beyond `OPENAI_API_KEY` is optional. See `.env.example` for Google/GitHub sign-in, rate limits and
budgets (`RATE_LIMIT_PER_DAY`, `GLOBAL_DAILY_BUDGET_USD`, …), `ALLOWED_MODELS` to keep expensive models off a
public deployment, and `GUARD_MODEL` for the scope classifier.

## Evaluating the guardrail

```bash
npm run dev            # terminal 1
npm run eval:guard     # terminal 2: 50 labelled prompts → precision / recall / false-block rate
```

## Project layout

```
src/
  app/api/chat/route.ts        streaming agent endpoint (streamText + tools + persistence)
  app/api/chats/…              chat history CRUD
  app/api/models/route.ts      model catalog filtered to your OpenAI key
  app/api/auth/[...nextauth]   NextAuth (fingerprint credentials provider)
  app/s/[shareId]              public read-only shared chat
  app/api/watchlist, alerts    watchlist + price-alert CRUD; alerts/check polled by the app; cron/alerts for Vercel Cron
  app/api/account              who am I, sign-in providers, questions left today
  lib/tools.ts                 AI tools: 15 market tools + 6 watchlist/alert tools
  lib/analysis-tools.ts        7 quant models (risk, correlation, comps, DuPont, health score, SIP, technicals)
  lib/excel.ts                 Excel model builder (formulas, inputs styled blue)
  lib/tool-catalog.ts          the user-facing Tools catalog
  lib/guard.ts                 scope classifier + refusal copy
  lib/limits.ts                rate limits and daily budgets
  lib/finance.ts               Yahoo Finance data layer + 43-metric catalog
  lib/models.ts                model prices, tiers and Auto routing
  lib/db/                      Drizzle schema + Postgres/PGlite connection
  lib/fingerprint.ts           browser fingerprinting
  components/gen/              generative-UI components (charts, tables, DCF)
```

## Notes

- Market data comes from Yahoo Finance's unofficial API (via `yahoo-finance2`) and may be delayed
  or occasionally rate-limited from cloud IPs.
- Edit model IDs/prices in `src/lib/models.ts` as OpenAI's lineup changes.
- Fingerprint auth is convenience-grade identity, not strong authentication — identical devices can
  collide. Swap in any NextAuth provider if you need real accounts.
- Nothing here is investment advice.
