/**
 * All user-facing words for alerts, the H2 line, results cards, learned thresholds and reports,
 * in English and simple Hindi. Templates only — no LLM — so the same input always gives the same
 * text, it costs nothing, and the no-advice test can render and check every one of them.
 *
 * Voice: calm, direct, slightly warm. Facts and context, never instructions.
 */
import type { QuarterRow } from "@/lib/db/schema";
import { absPct, dayLabel, inr, inrApprox, signedPct } from "@/lib/format";
import type { Attribution } from "@/lib/portfolio/math";
import type { ReasonKind } from "./reason";

export type Lang = "en" | "hi";
export type Bi = { en: string; hi: string };

/** "your portfolio" / "Papa's portfolio" in English; Hindi always speaks to the reader ("आपका"). */
export const pfRef = (ownerLabel: string | null | undefined): Bi => ({
  en: ownerLabel ? `${ownerLabel}'s portfolio` : "your portfolio",
  hi: "आपके पोर्टफोलियो",
});
const PfRefCap = (ownerLabel: string | null | undefined) => (ownerLabel ? `${ownerLabel}'s portfolio` : "Your portfolio");

const fellRose = (x: number): Bi => (x < 0 ? { en: "fell", hi: "गिरा" } : { en: "rose", hi: "चढ़ा" });

/* ------------------------------------------------------------------ */
/* H1: big stock move                                                   */
/* ------------------------------------------------------------------ */

export function stockMoveText(a: {
  name: string;
  changePct: number;
  weight: number;
  impact: number;
  ownerLabel?: string | null;
  reason: ReasonKind;
  niftyPct: number | null;
  sectorPct: number | null;
  sectorName: string | null;
  sectorNameHi: string | null;
  sectorIndexName: string | null;
}) {
  const v = fellRose(a.changePct);
  const move = absPct(a.changePct);
  const ref = pfRef(a.ownerLabel);
  const valueVerb = a.impact < 0 ? { en: "fell", hi: "कम हुई" } : { en: "rose", hi: "बढ़ी" };
  const title: Bi = { en: `${a.name} ${v.en} ${move}`, hi: `${a.name} ${move} ${v.hi}` };
  const why = reasonText(a);
  const impact: Bi = {
    en: `${a.name} is ${absPct(a.weight, 0)} of ${ref.en}; its value ${valueVerb.en} ~${inrApprox(a.impact)} today.`,
    hi: `${a.name} ${ref.hi} का ${absPct(a.weight, 0)} हिस्सा है; आज इसकी वैल्यू लगभग ${inrApprox(a.impact)} ${valueVerb.hi}।`,
  };
  return { title, body: { en: `${why.en} ${impact.en}`, hi: `${why.hi} ${impact.hi}` }, why, impact };
}

export function reasonText(a: { name: string; changePct: number; reason: ReasonKind; niftyPct: number | null; sectorPct: number | null; sectorName: string | null; sectorNameHi: string | null; sectorIndexName: string | null }): Bi {
  const down = a.changePct < 0;
  switch (a.reason) {
    case "market":
      return {
        en: `Likely reason: the whole market ${down ? "fell" : "rose"} today (Nifty ${signedPct(a.niftyPct)}), and ${a.name} moved about as much as it usually does on days like this.`,
        hi: `संभावित वजह: आज पूरा बाज़ार ${down ? "गिरा" : "चढ़ा"} (निफ्टी ${signedPct(a.niftyPct)}), और ${a.name} उतना ही हिला जितना ऐसे दिनों में आमतौर पर हिलता है।`,
      };
    case "sector":
      return {
        en: `Likely reason: most ${a.sectorName ?? "sector"} stocks ${down ? "fell" : "rose"} today (${a.sectorIndexName ?? "sector index"} ${signedPct(a.sectorPct)}).`,
        hi: `संभावित वजह: आज ज़्यादातर ${a.sectorNameHi ?? "सेक्टर"} शेयर ${down ? "गिरे" : "चढ़े"} (${a.sectorIndexName ?? "सेक्टर इंडेक्स"} ${signedPct(a.sectorPct)})।`,
      };
    case "results":
      return {
        en: `Likely reason: ${a.name} reported quarterly results in the last two days, and the move followed.`,
        hi: `संभावित वजह: ${a.name} के तिमाही नतीजे पिछले दो दिनों में आए, और यह बदलाव उसके बाद हुआ।`,
      };
    default:
      return {
        en: `Likely reason: something specific to ${a.name}. It moved far more than the market (Nifty ${signedPct(a.niftyPct)})${a.sectorPct != null ? ` and its sector (${signedPct(a.sectorPct)})` : ""}.`,
        hi: `संभावित वजह: ${a.name} से जुड़ी कोई बात। यह बाज़ार (निफ्टी ${signedPct(a.niftyPct)})${a.sectorPct != null ? ` और अपने सेक्टर (${signedPct(a.sectorPct)})` : ""} से कहीं ज़्यादा हिला।`,
      };
  }
}

export const REASON_LABEL: Record<ReasonKind, Bi> = {
  market: { en: "Whole market", hi: "पूरा बाज़ार" },
  sector: { en: "Sector-wide", hi: "पूरा सेक्टर" },
  results: { en: "After results", hi: "नतीजों के बाद" },
  company: { en: "Company-specific", hi: "कंपनी से जुड़ा" },
};

/* ------------------------------------------------------------------ */
/* H2: why did my portfolio move today?                                 */
/* ------------------------------------------------------------------ */

const list = (names: string[], lang: Lang) => {
  if (names.length <= 1) return names.join("");
  const and = lang === "hi" ? " और " : " and ";
  return `${names.slice(0, -1).join(", ")}${and}${names.at(-1)}`;
};

export function attributionLine(a: Attribution, ownerLabel?: string | null): Bi {
  const subj = { en: ownerLabel ? `${ownerLabel}'s portfolio is` : "You're", hi: "आपका पोर्टफोलियो" };
  if (a.kind === "none") return { en: "Add holdings to see what moves your portfolio each day.", hi: "रोज़ के बदलाव देखने के लिए अपने शेयर जोड़ें।" };
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
      en: `${inr(Math.abs(m))} of today's ${dir.en} was the market moving; ${inr(Math.abs(sp))} was specific to your stocks.`,
      hi: `आज की ${dir.hi} में ${inr(Math.abs(m))} बाज़ार की वजह से था; ${inr(Math.abs(sp))} आपके शेयरों से जुड़ा था।`,
    };
  }
  // The parts pulled in opposite directions: say what the market alone would have done.
  const better = sp > 0;
  return {
    en: `The market alone would have ${m < 0 ? "cost you" : "added"} ${inr(Math.abs(m))} today; your stocks did ${inr(Math.abs(sp))} ${better ? "better" : "worse"} than that.`,
    hi: `सिर्फ़ बाज़ार की वजह से आज ${inr(Math.abs(m))} ${m < 0 ? "घटते" : "बढ़ते"}; आपके शेयरों ने उससे ${inr(Math.abs(sp))} ${better ? "बेहतर" : "कमज़ोर"} किया।`,
  };
}

export function portfolioMoveText(a: { attribution: Attribution; ownerLabel?: string | null }) {
  const pct = a.attribution.totalPct ?? 0;
  const v = fellRose(pct);
  return {
    title: { en: `${PfRefCap(a.ownerLabel)} ${v.en} ${absPct(pct)} today`, hi: `आपका पोर्टफोलियो आज ${absPct(pct)} ${v.hi}` },
    body: attributionLine(a.attribution, a.ownerLabel),
  };
}

/* ------------------------------------------------------------------ */
/* H4: results-day explainer                                            */
/* ------------------------------------------------------------------ */

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

export function resultsText(a: { name: string; quarterEnd: string; points: ResultsPoint[]; healthBefore: number | null; healthAfter: number | null; annualHealthUpdated: boolean }) {
  const q = quarterName(a.quarterEnd);
  const good = a.points.filter((p) => p.good), bad = a.points.filter((p) => !p.good);
  const health = healthLine(a);
  const summary: Bi = {
    en: [good[0] && `${good[0].en}.`, bad[0] && `${bad[0].en}.`, health.en].filter(Boolean).join(" "),
    hi: [good[0] && `${good[0].hi}।`, bad[0] && `${bad[0].hi}।`, health.hi].filter(Boolean).join(" "),
  };
  return {
    title: { en: `${a.name} reported ${q.en} results`, hi: `${a.name} के ${q.hi} के नतीजे आए` },
    body: summary,
    improved: good,
    worse: bad,
    health,
  };
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

export function healthChangeText(a: { name: string; before: number; after: number; zoneBefore?: string | null; zoneAfter?: string | null }) {
  const up = a.after > a.before;
  const zone = a.zoneAfter && a.zoneAfter !== a.zoneBefore
    ? {
        en: ` Its bankruptcy-risk zone (Altman Z) moved from ${a.zoneBefore ?? "unknown"} to ${a.zoneAfter}.`,
        hi: ` इसका दिवालियापन-जोखिम ज़ोन (Altman Z) ${zoneHi(a.zoneBefore)} से ${zoneHi(a.zoneAfter)} हुआ।`,
      }
    : { en: "", hi: "" };
  return {
    title: { en: `${a.name}'s health score ${up ? "improved" : "slipped"} to ${a.after}`, hi: `${a.name} का हेल्थ स्कोर ${up ? "बढ़कर" : "घटकर"} ${a.after} हुआ` },
    body: {
      en: `Its financial health score went from ${a.before} to ${a.after} (out of 100), based on its latest annual statements.${zone.en}`,
      hi: `ताज़ा सालाना आँकड़ों के आधार पर इसका फ़ाइनेंशियल हेल्थ स्कोर ${a.before} से ${a.after} हुआ (100 में से)।${zone.hi}`,
    },
  };
}
const zoneHi = (z?: string | null) => (z === "Safe" ? "सुरक्षित" : z === "Grey" ? "ग्रे" : z === "Distress" ? "जोखिम" : "अज्ञात");

export function concentrationText(a: { label: string; weight: number; limit: number; kind: "stock" | "sector"; ownerLabel?: string | null }) {
  const ref = pfRef(a.ownerLabel);
  return {
    title: { en: `${a.label} is now ${absPct(a.weight, 0)} of ${ref.en}`, hi: `${a.label} अब ${ref.hi} का ${absPct(a.weight, 0)} है` },
    body: {
      en: `That's above ${absPct(a.limit / 100, 0)}, the level where news about one ${a.kind === "stock" ? "company" : "sector"} starts to move the whole portfolio. See your risk checks for the full picture.`,
      hi: `यह ${absPct(a.limit / 100, 0)} से ज़्यादा है, जिसके बाद एक ${a.kind === "stock" ? "कंपनी" : "सेक्टर"} की ख़बर पूरे पोर्टफोलियो पर असर डालने लगती है। पूरी तस्वीर के लिए रिस्क चेक देखें।`,
    },
  };
}

export function upcomingText(a: { name: string; date: string }) {
  return {
    title: { en: `${a.name} reports results on ${dayLabel(a.date, "en")}`, hi: `${a.name} के नतीजे ${dayLabel(a.date, "hi")} को आएँगे` },
    body: {
      en: `Quarterly results often move the share price. Nazar will explain what changed once the numbers are out.`,
      hi: `तिमाही नतीजों पर शेयर का दाम अक्सर बदलता है। नतीजे आने पर Nazar बताएगा कि क्या बदला।`,
    },
  };
}

export function priceTargetText(a: { name: string; direction: "above" | "below"; target: number; price: number; note?: string | null }) {
  return {
    title: { en: `${a.name} is now ${a.direction} ${inr(a.target)}`, hi: `${a.name} अब ${inr(a.target)} से ${a.direction === "above" ? "ऊपर" : "नीचे"} है` },
    body: {
      en: `It closed at ${inr(a.price)}, crossing the level you asked Nazar to watch.${a.note ? ` Your note: “${a.note}”` : ""}`,
      hi: `यह ${inr(a.price)} पर बंद हुआ और आपके चुने हुए स्तर को पार कर गया।${a.note ? ` आपका नोट: “${a.note}”` : ""}`,
    },
  };
}

export function digestText(a: { count: number }) {
  return {
    title: { en: `${a.count} smaller ${a.count === 1 ? "move" : "moves"} today`, hi: `आज ${a.count} छोटे बदलाव` },
    body: { en: `To keep things calm, Nazar grouped these together. Open Alerts to see each one.`, hi: `शांति बनाए रखने के लिए Nazar ने इन्हें एक साथ रखा है। हर एक देखने के लिए अलर्ट खोलें।` },
  };
}

/* ------------------------------------------------------------------ */
/* H5: learned thresholds                                               */
/* ------------------------------------------------------------------ */

export function learnedText(a: { type: "stock_move" | "portfolio_move" | "concentration" | "results_upcoming"; value: number | null; muted: boolean }): Bi & { title: Bi } {
  const title = { en: "Nazar adjusted your alerts", hi: "Nazar ने आपके अलर्ट बदले" };
  if (a.muted || a.type === "results_upcoming")
    return {
      title,
      en: "You found upcoming-results reminders less useful, so I'll stop sending them. They'll still appear in your weekly report.",
      hi: "आपको आने वाले नतीजों के रिमाइंडर कम काम के लगे, इसलिए मैं इन्हें भेजना बंद कर रहा हूँ। ये आपकी साप्ताहिक रिपोर्ट में दिखते रहेंगे।",
    };
  const v = `${a.value}%`;
  if (a.type === "stock_move")
    return {
      title,
      en: `You found small-move alerts less useful, so I'll only alert you for moves above ${v}.`,
      hi: `आपको छोटे बदलावों वाले अलर्ट कम काम के लगे, इसलिए अब मैं सिर्फ़ ${v} से बड़े बदलावों पर अलर्ट भेजूँगा।`,
    };
  if (a.type === "portfolio_move")
    return {
      title,
      en: `You found alerts about small whole-portfolio moves less useful, so I'll only alert you when your portfolio moves more than ${v} in a day.`,
      hi: `आपको पूरे पोर्टफोलियो के छोटे बदलावों वाले अलर्ट कम काम के लगे, इसलिए अब मैं तभी अलर्ट भेजूँगा जब पोर्टफोलियो एक दिन में ${v} से ज़्यादा हिले।`,
    };
  return {
    title,
    en: `You found concentration alerts less useful at lower levels, so I'll only alert you when one stock goes above ${v} of your portfolio.`,
    hi: `आपको कम स्तर पर कंसंट्रेशन अलर्ट कम काम के लगे, इसलिए अब मैं तभी अलर्ट भेजूँगा जब कोई एक शेयर पोर्टफोलियो के ${v} से ऊपर जाए।`,
  };
}
