/**
 * Plain sentences about a portfolio and a company's results: today's move and what explains it,
 * what changed in a quarter, how the health score moved. English and Hindi.
 */
import type { QuarterRow } from "@/lib/db/schema";
import { absPct, inrWhole as inr, signedPct } from "@/lib/format";
import type { Attribution } from "@/lib/portfolio/math";

export type Lang = "en" | "hi";
export type Bi = { en: string; hi: string };

const list = (names: string[], lang: Lang) => {
  if (names.length <= 1) return names.join("");
  const and = lang === "hi" ? " और " : " and ";
  return `${names.slice(0, -1).join(", ")}${and}${names.at(-1)}`;
};

export function attributionLine(a: Attribution): Bi {
  const subj = { en: "You're", hi: "आपका पोर्टफोलियो" };
  if (a.kind === "none") return { en: "Add holdings to see what moves your portfolio each day.", hi: "रोज़ के बदलाव देखने के लिए अपने निवेश जोड़ें।" };
  if (a.kind === "flat") return { en: "A quiet day: your portfolio barely moved.", hi: "शांत दिन: आज आपके पोर्टफोलियो में लगभग कोई बदलाव नहीं हुआ।" };
  const down = a.kind === "down";
  const names = a.drivers.map((d) => d.name);
  let en = `${subj.en} ${down ? "down" : "up"} ${inr(Math.abs(a.total))} today (${signedPct(a.totalPct)}).`;
  let hi = `${subj.hi} आज ${inr(Math.abs(a.total))} ${down ? "नीचे" : "ऊपर"} है (${signedPct(a.totalPct)})।`;
  if (a.drivers.length) {
    en += ` ${inr(Math.abs(a.driversSum))} of that came from ${list(names, "en")}.`;
    hi += ` इसमें से ${inr(Math.abs(a.driversSum))} ${list(names, "hi")} की वजह से था।`;
  }
  if (a.offset) {
    en += ` ${a.offset.name} ${a.offset.amount > 0 ? "added" : "took away"} ${inr(Math.abs(a.offset.amount))}.`;
    hi += ` ${a.offset.name} ने ${inr(Math.abs(a.offset.amount))} ${a.offset.amount > 0 ? "जोड़े" : "घटाए"}।`;
  }
  return { en, hi };
}

export function marketSplitLine(a: Attribution): Bi | null {
  if (a.kind !== "down" && a.kind !== "up") return null;
  const m = Math.round(a.marketPart), sp = Math.round(a.specificPart);
  // Both parts pushed the same way: split the move.
  if (Math.sign(m) === Math.sign(sp) || m === 0 || sp === 0) {
    const dir = a.kind === "down" ? { en: "fall", hi: "गिरावट" } : { en: "rise", hi: "बढ़त" };
    return {
      en: `${inr(Math.abs(m))} of today's ${dir.en} was the market moving; ${inr(Math.abs(sp))} was specific to what you own.`,
      hi: `आज की ${dir.hi} में ${inr(Math.abs(m))} बाज़ार की वजह से था; ${inr(Math.abs(sp))} आपके निवेश से जुड़ा था।`,
    };
  }
  // The parts pulled in opposite directions: say what the market alone would have done.
  const better = sp > 0;
  return {
    en: `The market alone would have ${m < 0 ? "cost you" : "added"} ${inr(Math.abs(m))} today; what you own did ${inr(Math.abs(sp))} ${better ? "better" : "worse"} than that.`,
    hi: `सिर्फ़ बाज़ार की वजह से आज ${inr(Math.abs(m))} ${m < 0 ? "घटते" : "बढ़ते"}; आपके निवेश ने उससे ${inr(Math.abs(sp))} ${better ? "बेहतर" : "कमज़ोर"} किया।`,
  };
}

export type ResultsPoint = { key: string; good: boolean; en: string; hi: string };

/** Growth from a positive base; a swing from a loss isn't a meaningful percentage, so it's skipped. */
const change = (a: number | null | undefined, b: number | null | undefined) => (a != null && b != null && b > 0 ? a / b - 1 : null);

export function resultsPoints(cur: QuarterRow, prev: QuarterRow | null, yearAgo: QuarterRow | null): ResultsPoint[] {
  const pts: ResultsPoint[] = [];
  const push = (key: string, x: number | null, what: Bi, vs: Bi) => {
    if (x == null || !Number.isFinite(x) || Math.abs(x) < 0.001) return;
    const good = x > 0;
    pts.push({ key, good, en: `${what.en} ${good ? "grew" : "fell"} ${absPct(x)} ${vs.en}`, hi: `${what.hi} ${vs.hi} ${absPct(x)} ${good ? "बढ़ा" : "घटा"}` });
  };
  const rev: Bi = { en: "Revenue", hi: "रेवेन्यू (बिक्री)" }, prof: Bi = { en: "Profit", hi: "मुनाफ़ा" };
  const qoq: Bi = { en: "from last quarter", hi: "पिछली तिमाही से" }, yoy: Bi = { en: "from a year ago", hi: "पिछले साल की इसी तिमाही से" };
  if (yearAgo) {
    push("rev_yoy", change(cur.revenue, yearAgo.revenue), rev, yoy);
    push("profit_yoy", change(cur.earnings, yearAgo.earnings), prof, yoy);
  }
  if (prev) {
    push("rev_qoq", change(cur.revenue, prev.revenue), rev, qoq);
    push("profit_qoq", change(cur.earnings, prev.earnings), prof, qoq);
  }
  if (cur.epsActual != null && cur.epsEstimate != null && cur.epsEstimate !== 0) {
    const s = (cur.epsActual - cur.epsEstimate) / Math.abs(cur.epsEstimate);
    if (Math.abs(s) >= 0.005)
      pts.push({
        key: "eps_vs_est",
        good: s > 0,
        en: `Earnings per share came in ${absPct(s)} ${s > 0 ? "above" : "below"} what analysts expected`,
        hi: `प्रति शेयर कमाई (EPS) विश्लेषकों के अनुमान से ${absPct(s)} ${s > 0 ? "ज़्यादा" : "कम"} रही`,
      });
  }
  const margin = (q: QuarterRow | null) => (q?.revenue && q.earnings != null ? q.earnings / q.revenue : null);
  const m1 = margin(cur), m0 = margin(prev);
  if (m1 != null && m0 != null && Math.abs(m1 - m0) >= 0.002)
    pts.push({
      key: "margin",
      good: m1 > m0,
      en: `Profit margin ${m1 > m0 ? "widened" : "narrowed"} from ${absPct(m0)} to ${absPct(m1)}`,
      hi: `मुनाफ़े का मार्जिन ${absPct(m0)} से ${m1 > m0 ? "बढ़कर" : "घटकर"} ${absPct(m1)} हुआ`,
    });
  return pts;
}

export function healthLine(a: { healthBefore: number | null; healthAfter: number | null; annualHealthUpdated: boolean }): Bi {
  if (a.annualHealthUpdated && a.healthBefore != null && a.healthAfter != null && a.healthBefore !== a.healthAfter)
    return {
      en: `Health score ${a.healthAfter > a.healthBefore ? "improved" : "slipped"} from ${a.healthBefore} to ${a.healthAfter} (out of 100).`,
      hi: `हेल्थ स्कोर ${a.healthBefore} से ${a.healthAfter > a.healthBefore ? "बढ़कर" : "घटकर"} ${a.healthAfter} हुआ (100 में से)।`,
    };
  if (a.healthAfter != null)
    return {
      en: `Health score ${a.healthAfter}/100, unchanged; it updates with full-year results.`,
      hi: `हेल्थ स्कोर ${a.healthAfter}/100, कोई बदलाव नहीं; यह सालाना नतीजों के साथ अपडेट होता है।`,
    };
  return { en: "", hi: "" };
}

/** "2026-06-30" → { en: "Apr–Jun 2026 quarter", hi: "अप्रैल–जून 2026 तिमाही" } (Q1 FY27 in Indian terms). */
export function quarterName(end: string): Bi {
  const [y, m] = end.split("-").map(Number);
  const en = ["Jan–Mar", "Apr–Jun", "Jul–Sep", "Oct–Dec"][Math.floor((m - 1) / 3)];
  const hi = ["जनवरी–मार्च", "अप्रैल–जून", "जुलाई–सितंबर", "अक्टूबर–दिसंबर"][Math.floor((m - 1) / 3)];
  return { en: `${en} ${y}`, hi: `${hi} ${y}` };
}

/* ------------------------------------------------------------------ */
/* Other alert types                                                    */
/* ------------------------------------------------------------------ */

