/**
 * Checks on an answer that are plain code: free, instant, and the same result every time.
 * The eval graders use them to score answers, and Ask runs them on every live answer, so the
 * numbers on the insights page mean the same thing as the numbers in an eval report.
 *
 * Pure and client-safe.
 */

/* ------------------------------------------------------------------ */
/* Language                                                             */
/* ------------------------------------------------------------------ */

const HINGLISH = new Set([
  "kya", "kyun", "kyu", "kyon", "hai", "hain", "tha", "thi", "mera", "mere", "meri", "aapka", "aapke", "aapki", "apna", "apni", "kaise", "kaisa", "kitna", "kitne", "kitni", "kaun", "kaunsa",
  "nahi", "nahin", "abhi", "aaj", "kal", "mein", "aur", "sabse", "paisa", "paise", "chahiye", "karna", "gira", "badha", "sasta", "mehnga", "accha", "kuch", "bahut", "lekin", "yeh", "ye", "woh", "isme", "isse", "toh", "bhi", "sirf", "zyada", "kam", "raha", "rahi", "rahe", "gaya", "gayi", "hota", "hoti", "liye", "matlab", "yaani", "agar", "jab", "tak", "se", "ko", "ka", "ki", "ke",
]);

/** The language an answer is written in, by script and by how much of it is Hindi in Latin letters. */
export function answerLang(text: string): "en" | "hi" | "hinglish" {
  const devanagari = (text.match(/[ऀ-ॿ]/g) ?? []).length;
  const latin = (text.match(/[A-Za-z]/g) ?? []).length;
  if (devanagari > latin * 0.4) return "hi";
  const ws = text.toLowerCase().match(/[a-z]+/g) ?? [];
  const hits = ws.filter((w) => HINGLISH.has(w)).length;
  return ws.length && hits / ws.length > 0.12 ? "hinglish" : "en";
}

/* ------------------------------------------------------------------ */
/* Number provenance                                                    */
/* ------------------------------------------------------------------ */

const UNIT: Record<string, number> = { "lakh crore": 1e12, "lakh crores": 1e12, k: 1e3, thousand: 1e3, lakh: 1e5, lakhs: 1e5, lac: 1e5, l: 1e5, crore: 1e7, crores: 1e7, cr: 1e7, million: 1e6, mn: 1e6, m: 1e6, billion: 1e9, bn: 1e9, b: 1e9, trillion: 1e12, tn: 1e12, t: 1e12 };

export type Num = { raw: string; value: number; percent: boolean };

/** Every number in a piece of prose, with lakh / crore / million scaling applied. */
export function numbersIn(text: string): Num[] {
  const out: Num[] = [];
  // Drop things that look like numbers but are not claims: dates, times, tickers with digits, list markers.
  const cleaned = text
    .replace(/\b\d{4}-\d{2}-\d{2}\b/g, " ")
    .replace(/\b\d{1,2}[:.]\d{2}\s*(am|pm|ist)\b/gi, " ")
    .replace(/\b\d{1,2}\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?(\s+\d{4})?\b/gi, " ")
    .replace(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{1,2}(,\s*\d{4})?\b/gi, " ")
    // A financial year written as a span: "2022–23", "FY 2025-26". Before the next rule, which would take "FY2022" and leave "–23".
    .replace(/\b(?:fy\s?)?(?:19|20)\d{2}\s?[-–—/]\s?\d{2}(?:\d{2})?\b/gi, " ")
    .replace(/\b(fy|q[1-4]|cy|h[12])\s?'?\d{2,4}\b/gi, " ")
    // Gold purity, not twenty-four thousand.
    .replace(/\b(14|18|22|24)\s?(?:(k|kt|karat|carat)\b|कैरेट|कैरट)/gi, " ")
    .replace(/^\s*\d+[.)]\s/gm, " ");
  const re = /(?<![A-Za-z\d.])([-−–+]?)\s?(₹|rs\.?\s?|inr\s?|\$|usd\s?)?(\d{1,3}(?:,\d{2,3})+(?:\.\d+)?|\d+(?:\.\d+)?)\s?(%|percent|x\b|×|k\b|thousand|lakh crores?|lakhs?|lacs?|l\b|crores?|cr\b|million|mn\b|m\b|billion|bn\b|b\b|trillion|tn\b)?/gi;
  for (const m of cleaned.matchAll(re)) {
    const digits = m[3].replace(/,/g, "");
    let value = Number(digits);
    if (!Number.isFinite(value)) continue;
    const unit = (m[4] ?? "").toLowerCase();
    const percent = unit === "%" || unit === "percent";
    if (UNIT[unit]) value *= UNIT[unit];
    out.push({ raw: m[0].trim(), value, percent });
  }
  return out;
}

/** Every number anywhere in a JSON value. Strings are searched too: tool results carry prose. */
export function numbersInJson(v: unknown, out: number[] = []): number[] {
  if (typeof v === "number" && Number.isFinite(v)) out.push(v);
  else if (typeof v === "string") for (const n of numbersIn(v)) out.push(n.value);
  else if (Array.isArray(v)) for (const x of v) numbersInJson(x, out);
  else if (v && typeof v === "object") for (const x of Object.values(v)) numbersInJson(x, out);
  return out;
}

/** Numbers that need no source: small counts, round percentages people use in speech, standard windows. */
const FREE = new Set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 14, 15, 18, 20, 22, 24, 25, 26, 30, 50, 52, 100, 200, 365, 1000]);

const close = (a: number, b: number) => {
  if (a === b) return true;
  const tol = Math.max(Math.abs(b) * 0.006, 0.006);
  return Math.abs(a - b) <= tol;
};

/** How a number in a tool result may legitimately appear in prose. */
function forms(n: number): number[] {
  const a = Math.abs(n);
  const out = [a];
  // A fraction shown as a percentage, and a percentage that was already one.
  if (a <= 5) out.push(a * 100);
  // Rounded as people write it.
  for (const d of [0, 1, 2]) out.push(Number(a.toFixed(d)), Number((a * 100).toFixed(d)));
  // Scaled units: 1,23,45,678 written as 1.23 crore or 123.5 lakh.
  for (const u of [1e3, 1e5, 1e6, 1e7, 1e9, 1e12]) if (a >= u) for (const d of [0, 1, 2]) out.push(Number((a / u).toFixed(d)) * u);
  return out;
}

export type Provenance = { total: number; traced: number; untraced: string[] };

/**
 * How many of the numbers in an answer can be traced to something the model was given: a tool
 * result, the question, or an earlier turn. Also accepted: the difference, sum or ratio of two
 * given numbers, since "up from 62 to 71" and "9 points higher" are the same claim.
 */
export function traceNumbers(answer: string, sources: unknown[], context: string[] = []): Provenance {
  const given = new Set<number>();
  /** The numbers exactly as given, with fractions also read as percentages: what arithmetic is done on. */
  const raw = new Set<number>();
  for (const s of sources)
    for (const n of numbersInJson(s)) {
      for (const f of forms(n)) given.add(f);
      raw.add(Math.abs(n));
      if (Math.abs(n) <= 5) raw.add(Math.abs(n) * 100);
    }
  for (const c of context)
    for (const n of numbersIn(c)) {
      given.add(Math.abs(n.value));
      raw.add(Math.abs(n.value));
    }
  // A table that states its unit once, "(₹ crore)", then lists bare figures: 1,15,032 there is 1,15,032 crore.
  const stated = answer.match(/\(\s*(?:in\s+)?(?:₹|rs\.?|inr|\$|usd)?\s*(lakh crores?|crores?|cr|lakhs?|millions?|mn|billions?|bn)\s*[);,:]|\bin\s+\*{0,2}(?:₹|rs\.?|inr|\$|usd)\s*(lakh crores?|crores?|cr|lakhs?|millions?|mn|billions?|bn)\b/i);
  const scale = stated ? UNIT[(stated[1] ?? stated[2]).toLowerCase().replace(/millions$/, "million").replace(/billions$/, "billion")] : 0;
  if (scale) for (const n of raw) if (n >= scale) for (const d of [0, 1, 2]) given.add(Number((n / scale).toFixed(d)));
  const base = [...new Set([...given].filter((n) => n > 0))];
  // Pairs grow with the square of the count, and so do coincidences: only the first few hundred are combined.
  const small = [...raw].filter((n) => n > 0).slice(0, 300);
  const exact = (a: number, b: number) => Math.abs(a - b) <= Math.max(Math.abs(b) * 0.002, 0.05);
  /** A product is quoted rounded ("about ₹24.2 lakh"): within half a percent. */
  const near = (a: number, b: number) => Math.abs(a - b) <= Math.abs(b) * 0.005;
  const derived = (v: number, percent: boolean) => {
    for (let i = 0; i < small.length; i++)
      for (let j = i + 1; j < small.length; j++) {
        const a = small[i], b = small[j];
        // Only numbers on the same scale are added or subtracted: a price minus a ratio means nothing.
        const hi = Math.max(a, b), lo = Math.min(a, b);
        // A share of an amount: "the cluster is 51% of the portfolio, about ₹24.2 lakh".
        if (!percent && lo < 1 && hi >= 1000 && near(v, hi * lo)) return true;
        if (!percent && lo > 1 && lo <= 100 && hi >= 1000 && near(v, (hi * lo) / 100)) return true;
        // What is left of a whole: "promoters hold 60.2% and institutions 21.5%; the other 18.3%…".
        if (percent && lo > 1 && hi <= 100 && exact(v, 100 - (a + b))) return true;
        if (hi / lo > 50) continue;
        if (exact(v, hi - lo) || exact(v, a + b) || exact(v, (hi / lo - 1) * 100) || exact(v, (1 - lo / hi) * 100)) return true;
        // "23% lower" for a gap of 22.94%: a percentage worked out from two figures is quoted to the whole number.
        if (percent && Number.isInteger(v) && (Math.round((hi / lo - 1) * 100) === v || Math.round((1 - lo / hi) * 100) === v)) return true;
      }
    return false;
  };
  const nums = numbersIn(answer).filter((n) => !FREE.has(Math.abs(n.value)) && !(Math.abs(n.value) >= 1900 && Math.abs(n.value) <= 2100 && Number.isInteger(n.value) && !/[₹$%,]/.test(n.raw)));
  const untraced: string[] = [];
  for (const n of nums) {
    const v = Math.abs(n.value);
    if (base.some((g) => close(v, g)) || derived(v, n.percent)) continue;
    untraced.push(n.raw);
  }
  return { total: nums.length, traced: nums.length - untraced.length, untraced };
}
