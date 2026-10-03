# Test accounts

For reviewers and testers. Each account also has a one-click button on the sign-in page.

**Password for all of them: `nazar123`**

| Email | What it is | Use it to |
|---|---|---|
| `demo@nazar.dev` | **Investor (full demo).** Aarav's two portfolios: "My portfolio" (14 stocks, five of them banks and financials) and "Papa's portfolio" (6 stocks, Hindi reports). Includes 60 sessions of alert history, a learned threshold and two weekly reports. | See every hero feature at once; run **Simulate a bad day** |
| `tester1@nazar.dev` | A second full demo, identical to the first | Test without affecting someone else's demo session |
| `new@nazar.dev` | **New user.** A real, empty account on live market data, with email off | Try onboarding: import a broker file, add stocks, create a family portfolio |
| `tester2@nazar.dev` | A second empty account | Same as above |

## Things to know

- **The full demo accounts read the demo market:** real NSE prices, date-shifted so the latest session is the last weekday. They never send email and never enter the live nightly checkup.
- **Test accounts are shared.** Anyone can sign in and change them. They are reset to a clean state whenever the demo data is rebuilt, nightly in production and with `npm run demo:reset` locally.
- **Try the demo** on the landing page is the private alternative. It creates your own 24-hour copy of the full demo, with no sign-in. It is limited to 15 per network per day.
- **Empty accounts use live data,** so newly added stocks get a first look straight away and then join tonight's checkup. Their email is fake, so digests are switched off; turn them on in Settings with a real account instead.
- **Ask** works in every account, with tighter daily limits on demo accounts (5 questions).
- **Locally,** the same accounts exist after `npm run dev`.

To hide the one-click buttons on a deployment, set `NEXT_PUBLIC_SHOW_DEMO_ACCOUNTS=false`.
