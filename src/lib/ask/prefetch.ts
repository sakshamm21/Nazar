/**
 * Which of the user's own data a question is plainly going to need, decided before any model runs.
 *
 * Without this, a question like "why is my portfolio down this month?" costs two model calls: one
 * for the model to say "read the portfolio", and one to answer once it has. The first is spent
 * discovering something the wording already says. So the data is read up front, alongside the scope
 * check, and handed to the model as if it had asked for it.
 *
 * Deliberately cautious: it acts only on wording that is unmistakable, in English, Hindi and
 * Hinglish. A miss costs nothing, because the model still has every tool and asks as before. A wrong
 * guess costs one database read and some context, never a wrong answer.
 *
 * Pure: the caller passes in the user's portfolio names.
 */
export type Prefetch = { tool: "getMyPortfolio"; input: { portfolio?: string } } | { tool: "getPortfolioPerformance"; input: { period: "1W" | "1M" | "3M" | "6M" | "1Y"; portfolio?: string } };

/** "my", "mine", and their Hindi forms in both scripts. */
const MINE = /\b(my|mine|mera|mere|meri|apna|apne|apni|humara|hamara)\b|मेरा|मेरे|मेरी|अपना|अपने|अपनी|हमारा/i;
/** What the "my" has to be about: the portfolio as a whole, not one company or one feature. */
const PORTFOLIO = /\b(portfolio|holdings?|investments?|stocks|shares|money|paisa|paise|nivesh)\b|पोर्टफोलियो|निवेश|शेयर|पैसा|पैसे/i;
/** "Why am I down", "how am I doing": about the portfolio without naming it. */
const AM_I = /\b(am i|i am|i'm|i’m)\s+(up|down|doing|diversified|concentrated|exposed)\b|\bhow (diversified|concentrated|exposed) am i\b|\b(have i|i have|i've|i’ve)\s+(done|performed)\b/i;
/**
 * "Since I invested", "all-time": the whole life of the portfolio, which no period covers. The
 * snapshot has that figure (the return since the first purchase, against the Nifty's over the same
 * days), so these read the snapshot even when a word like "year" is also in the question.
 */
const SINCE_START = /\bsince (i|we) (first )?(invested|started|began|bought)\b|\ball[- ]time\b|\b(shuru|shuruaat) se\b|\bjab se\b|शुरू से|शुरुआत से|जब से/i;
/** Questions another tool answers, or that are about the app and not the money. */
const ELSEWHERE = /\b(goals?|watch(ing|list)?|long[- ]term|short[- ]term|capital gains?|tax|ltcg|stcg|import|upload|add|remove|delete|alert|share link|excel|download|what if|if the (nifty|market|sensex)|crash(es|ed)?|fell|falls|agar (nifty|market))\b|लक्ष्य|टैक्स|अगर (निफ्टी|बाज़ार|बाजार)/i;

const PERIODS: [Prefetch & { tool: "getPortfolioPerformance" } extends { input: { period: infer P } } ? P : never, RegExp][] = [
  ["3M", /\b(3|three|teen)\s*(months?|mahine|mahino)\b|\bquarter\b|तीन महीने|तिमाही/i],
  ["6M", /\b(6|six|chhe|cheh)\s*(months?|mahine|mahino)\b|\bhalf[- ]year\b|छह महीने/i],
  ["1Y", /\b(year|yearly|annual|12 months?|saal|sal)\b|साल|वर्ष/i],
  ["1M", /\b(month|monthly|mahine|mahina|mahino)\b|महीने|महीना|माह/i],
  ["1W", /\b(week|weekly|hafte|hafta|7 days)\b|हफ्ते|हफ़्ते|सप्ताह/i],
];

export function planPrefetch(text: string, portfolioNames: string[] = []): Prefetch | null {
  if (ELSEWHERE.test(text)) return null;
  if (!(AM_I.test(text) || (MINE.test(text) && PORTFOLIO.test(text)))) return null;
  // A portfolio named in the question, when the user has more than one.
  const lower = text.toLowerCase();
  const named = portfolioNames.length > 1 ? portfolioNames.find((n) => n.trim().length >= 3 && lower.includes(n.trim().toLowerCase())) : undefined;
  const portfolio = named ? { portfolio: named } : {};
  const period = SINCE_START.test(text) ? undefined : PERIODS.find(([, re]) => re.test(text))?.[0];
  return period ? { tool: "getPortfolioPerformance", input: { period, ...portfolio } } : { tool: "getMyPortfolio", input: portfolio };
}
