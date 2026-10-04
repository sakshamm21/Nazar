/**
 * "What does this mean?": plain-language explanations for every metric Nazar shows.
 * Short, concrete, no jargon in the explanation itself, and never advice.
 */
export type GlossaryEntry = { term: string; plain: string; example?: string };

export const GLOSSARY: Record<string, GlossaryEntry> = {
  value: { term: "Portfolio value", plain: "What your shares are worth at the last market close: quantity × closing price, added up." },
  dayChange: { term: "Today's change", plain: "How much your portfolio's value moved compared with the previous close." },
  unrealised: { term: "Unrealised P&L", plain: "Profit or loss on paper: today's value minus what you paid. It becomes real only when the shares are sold." },
  "capital-gains": {
    term: "Capital gains buckets",
    plain:
      "India taxes a profit on shares in two buckets: sold within a year at 20%, or held over a year at 12.5%. Gold, property and most other assets pay 12.5% either way. Long-term equity gains up to ₹1.25 lakh a year are exempt. Which bucket a holding lands in depends on the day its units are sold, so these figures only change when something actually sells.",
  },
  xirr: { term: "XIRR", plain: "Your yearly return, taking into account when you put money in. It lets you compare investments made on different dates fairly.", example: "12% XIRR means your money grew as if it earned 12% a year." },
  xirrNifty: { term: "XIRR vs Nifty 50", plain: "What the same rupees, invested on the same days in the Nifty 50 index, would have returned. A simple yardstick for your stock picks." },
  health: { term: "Health score", plain: "A 0–100 score of the company's financial health from its annual statements: profits, cash flow, debt and efficiency (Piotroski F-score and Altman Z). Banks get a simpler lender check instead, because their balance sheets work differently." },
  portfolioHealth: { term: "Portfolio health", plain: "The health scores of your holdings, weighted by how much money is in each. The outer ring." },
  diversification: { term: "Diversification & risk", plain: "How spread out your risk really is: how many independent bets you have, how big your largest position is, and how strongly your portfolio swings with the market. The inner ring. Higher is calmer." },
  beta: { term: "Beta", plain: "How much a stock usually moves when the Nifty moves. Beta 1.2 means it typically moves about 20% more than the market; 0.8 means about 20% less. Nazar calculates it from the last year of prices." },
  stress: { term: "Stress test", plain: "An estimate of what your portfolio might lose if the Nifty fell by the amount you choose, using each holding's beta. Real crashes can be worse, because stocks tend to fall together." },
  effectiveBets: { term: "Independent bets", plain: "How many truly separate bets your portfolio behaves like. Ten stocks that always move together act like one bet; ten unrelated ones act like ten." },
  correlation: { term: "Moving together (correlation)", plain: "How closely two stocks' daily moves follow each other, from −1 (opposite) to 1 (in lockstep). Nazar groups holdings above 0.5." },
  concentration: { term: "Concentration", plain: "How much of your money sits in one stock or one sector. The more concentrated, the more one piece of news can move your whole portfolio." },
  weight: { term: "Weight", plain: "This holding's share of the portfolio's value." },
  trend: { term: "Trend", plain: "Where the price sits against its 200-day average. Above by more than 3% = uptrend; below by more than 3% = downtrend; otherwise sideways." },
  valuation: { term: "Valuation vs peers", plain: "The company's price-to-earnings ratio compared with similar companies Nazar tracks. 'Pricier' means investors pay more for each rupee of its profit than for its peers. It says nothing about what will happen next." },
  pe: { term: "P/E ratio", plain: "Share price divided by yearly profit per share: how many rupees you pay for ₹1 of annual profit.", example: "P/E 25 = ₹25 for every ₹1 of profit." },
  reason: { term: "Likely reason", plain: "Nazar compares the stock's move with the whole market and its sector. If they all moved together, it's probably the market; if only this stock moved, it's probably about the company. It's a likely reason, not a certainty." },
  results: { term: "Quarterly results", plain: "Every three months listed companies report their revenue and profit. Nazar compares them with the previous quarter, the same quarter last year and analysts' estimates." },
  eps: { term: "EPS", plain: "Earnings per share: the company's profit divided by its number of shares." },
  sensitivity: { term: "Alert sensitivity", plain: "How big a change has to be before Nazar tells you. 'Major' is the calmest; 'Everything' tells you about smaller moves too." },
  learned: { term: "Learned thresholds", plain: "When you mark alerts as not useful, Nazar raises the bar for that kind of alert, tells you, and lets you undo it." },
  sector: { term: "Sector", plain: "The industry a company belongs to, like banks, IT or FMCG. Stocks in the same sector often move together." },
};
