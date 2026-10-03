# Changelog

## 2.0.0 · Nazar (October 2026)

StockAI becomes **Nazar**, a portfolio watchdog. The research chat remains as the Ask tab. v1 is preserved on the `legacy` branch (tag `v1.0.0`) and deployed as its own app with its own database.

### Added
- **H1 smart alerts:** stock and portfolio moves, results, health changes, concentration, upcoming results and your own price levels. Each comes with a likely reason, the ₹ impact on your portfolio, English and Hindi text, company-specific headlines, 👍/👎, a daily cap with a digest, and de-duplication.
- **H2:** "Why did my portfolio move today?" names the fewest holdings that explain the move and splits each into market and stock-specific parts.
- **H3 hidden-risk checks:** a beta stress test from −5% to −30%, correlation clusters and "effective independent bets", concentration and sector mix, and the two-ring summary on Home.
- **H4 results-day explainer:** what improved, what got worse, EPS against estimate, margin, and the health score stated honestly.
- **H5 alerts that learn:** rule-based threshold tuning from your ratings, with the evidence, Undo and a cooldown.
- **H6 family portfolios:** separate portfolios in Hindi or English, a confirmed family recipient, a Sunday weekly report and important alerts by email.
- **Demo:** "Try the demo" with no sign-up (a private 24-hour copy); "Simulate a bad day" with three scenarios; a 7-step guided tour; real NSE data that works offline; one-click test accounts.
- **Portfolios:** imports from Zerodha Console, Zerodha Kite, Groww and Upstox (CSV/XLSX) with NSE symbol resolution; manual holdings; a "Watching" list; up to 6 portfolios.
- **Nightly checkup:** a resumable pipeline on Vercel Cron, with snapshots, beta from stored prices, results detection, retries, a rate limiter and a circuit breaker.
- **Email through Brevo's free tier:** sign-up codes, password resets, daily digests, weekly reports, signed one-click links (rate, confirm, unsubscribe) and a daily cap.
- **Ask:** a read-only `getMyPortfolio` tool, so answers can use your holdings.
- **Design:** a new design system (DESIGN.md) with dark and light themes, rings as the motif, Hindi typography and a mobile-first layout with bottom tabs. The live style guide is at `/design`.
- **Tests:** 203 Vitest unit and integration tests, 15 Playwright end-to-end flows, a WCAG contrast test and a no-advice test.
- **`/insights` v2:** the North Star is weekly users who rated an alert useful; also alert quality, H5 tuning, the activation funnel, delivery and pipeline health.

### Changed
- **Upgraded** to Next.js 16 and React 19, with Drizzle migrations (replacing create-on-boot) and pino logging.
- **Local development** now uses PGlite with seeded demo data and needs no network.
- **Analytics** were extracted into pure, tested modules; the AI tools are now thin wrappers.
- **Wording:** "Upside" became "Model vs price"; the disclaimer is in the footer, onboarding, emails and reports.

### Removed
- Device-fingerprint login and NextAuth; Google and GitHub sign-in.
- The analyst-ratings tool and the `targetMeanPrice` metric (now 42 metrics), and the "undervalued" screens. Nazar never gives buy/sell/hold views or target prices.
- v1's minute-by-minute in-browser alert polling, replaced by the nightly checkup.

## 1.0.0 · StockAI (October 2026)

An AI equity-research assistant: an agent with live-data research tools and 43 metrics, generative-UI charts and tables, a DCF model, seven analysis models (risk and return, correlation, comparable valuation, DuPont, Piotroski/Altman health, SIP backtest, technical indicators), Excel model downloads, a watchlist and price alerts, share links, Simple and Pro answer styles, Hindi and Hinglish, a cost-aware model selector, an on-topic classifier, and product analytics.
