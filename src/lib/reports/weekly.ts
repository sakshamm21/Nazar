/**
 * Weekly report (Sundays, H6): performance vs the Nifty, what moved it, what changed, what's
 * coming next week. Built as structured data, rendered in English and simple Hindi, and checked by
 * the no-advice guard like every alert.
 */
import { safeText } from "@/lib/alerts/guard";
import { dayLabel, inr, signedPct } from "@/lib/format";

export type WeeklyInput = {
  portfolioName: string;
  ownerLabel: string | null;
  weekStart: string;
  weekEnd: string;
  holdings: { symbol: string; name: string; quantity: number; startPrice: number | null; endPrice: number | null }[];
  niftyStart: number | null;
  niftyEnd: number | null;
  alerts: { type: string; titleEn: string; titleHi: string }[];
  results: { name: string; summaryEn: string; summaryHi: string }[];
  upcoming: { name: string; date: string }[];
};

export type Section = { heading: string; lines: string[] };
export type WeeklyContent = {
  data: { valueStart: number; valueEnd: number; change: number; changePct: number | null; niftyPct: number | null; movers: { symbol: string; name: string; amount: number; pct: number | null }[] };
  en: { subject: string; title: string; sections: Section[] };
  hi: { subject: string; title: string; sections: Section[] };
};

export function buildWeekly(i: WeeklyInput): WeeklyContent {
  const rows = i.holdings
    .filter((h) => h.startPrice != null && h.endPrice != null)
    .map((h) => ({ symbol: h.symbol, name: h.name, amount: h.quantity * (h.endPrice! - h.startPrice!), pct: h.endPrice! / h.startPrice! - 1, start: h.quantity * h.startPrice!, end: h.quantity * h.endPrice! }));
  const valueStart = rows.reduce((a, r) => a + r.start, 0);
  const valueEnd = rows.reduce((a, r) => a + r.end, 0);
  const change = valueEnd - valueStart;
  const changePct = valueStart ? valueEnd / valueStart - 1 : null;
  const niftyPct = i.niftyStart && i.niftyEnd ? i.niftyEnd / i.niftyStart - 1 : null;
  const movers = [...rows].sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount)).slice(0, 3);
  const up = change >= 0;
  const ref = i.ownerLabel ? `${i.ownerLabel}'s portfolio` : "Your portfolio";
  const range = { en: `${dayLabel(i.weekStart, "en", false)} – ${dayLabel(i.weekEnd, "en", false)}`, hi: `${dayLabel(i.weekStart, "hi", false)} – ${dayLabel(i.weekEnd, "hi", false)}` };

  const en: Section[] = [
    {
      heading: "This week",
      lines: [
        `${ref} ${up ? "rose" : "fell"} ${signedPct(changePct).replace(/^[+−]/, "")} (${inr(change, { sign: true })}) between ${range.en}.`,
        niftyPct != null ? `The Nifty 50 ${niftyPct >= 0 ? "rose" : "fell"} ${signedPct(niftyPct).replace(/^[+−]/, "")} over the same days, so ${i.ownerLabel ? `${i.ownerLabel}'s portfolio` : "your portfolio"} did ${changePct != null && changePct > niftyPct ? "better than" : changePct != null && Math.abs(changePct - niftyPct) < 0.001 ? "about the same as" : "worse than"} the market.` : "Nifty data wasn't available for the full week.",
      ],
    },
    { heading: "What moved it", lines: movers.length ? movers.map((m) => `${m.name}: ${inr(m.amount, { sign: true })} (${signedPct(m.pct)})`) : ["No price changes recorded this week."] },
    {
      heading: "What changed",
      lines: [
        ...i.results.map((r) => r.summaryEn),
        ...i.alerts.filter((a) => a.type !== "results").slice(0, 4).map((a) => a.titleEn),
      ].slice(0, 6).concat(i.results.length || i.alerts.length ? [] : ["A calm week: nothing needed your attention."]),
    },
    { heading: "Coming up next week", lines: i.upcoming.length ? i.upcoming.map((u) => `${u.name} reports quarterly results on ${dayLabel(u.date, "en")}.`) : ["No results expected from your holdings next week."] },
  ];
  const hi: Section[] = [
    {
      heading: "इस हफ़्ते",
      lines: [
        `${range.hi} के बीच आपका पोर्टफोलियो ${signedPct(changePct).replace(/^[+−]/, "")} ${up ? "बढ़ा" : "घटा"} (${inr(change, { sign: true })})।`,
        niftyPct != null ? `इन्हीं दिनों में निफ्टी 50 ${signedPct(niftyPct).replace(/^[+−]/, "")} ${niftyPct >= 0 ? "बढ़ा" : "घटा"}, यानी आपका पोर्टफोलियो बाज़ार से ${changePct != null && changePct > niftyPct ? "बेहतर" : changePct != null && Math.abs(changePct - niftyPct) < 0.001 ? "लगभग बराबर" : "कमज़ोर"} रहा।` : "पूरे हफ़्ते का निफ्टी डेटा उपलब्ध नहीं था।",
      ],
    },
    { heading: "किसकी वजह से", lines: movers.length ? movers.map((m) => `${m.name}: ${inr(m.amount, { sign: true })} (${signedPct(m.pct)})`) : ["इस हफ़्ते कोई बदलाव दर्ज नहीं हुआ।"] },
    {
      heading: "क्या बदला",
      lines: [...i.results.map((r) => r.summaryHi), ...i.alerts.filter((a) => a.type !== "results").slice(0, 4).map((a) => a.titleHi)].slice(0, 6).concat(i.results.length || i.alerts.length ? [] : ["शांत हफ़्ता: किसी बात पर ध्यान देने की ज़रूरत नहीं पड़ी।"]),
    },
    { heading: "अगले हफ़्ते", lines: i.upcoming.length ? i.upcoming.map((u) => `${u.name} के तिमाही नतीजे ${dayLabel(u.date, "hi")} को आएँगे।`) : ["अगले हफ़्ते आपके शेयरों के कोई नतीजे नहीं आने वाले।"] },
  ];
  const clean = (ss: Section[], lang: "en" | "hi") => ss.map((s) => ({ heading: s.heading, lines: s.lines.map((l) => safeText(l, lang === "hi" ? "विवरण उपलब्ध नहीं" : "Details unavailable", "weekly report")) }));
  const pct = signedPct(changePct);
  return {
    data: { valueStart, valueEnd, change, changePct, niftyPct, movers: movers.map((m) => ({ symbol: m.symbol, name: m.name, amount: m.amount, pct: m.pct })) },
    en: { subject: `Your week with Nazar: ${i.ownerLabel ? `${i.ownerLabel}'s portfolio` : i.portfolioName} ${pct}`, title: `Weekly report · ${range.en}`, sections: clean(en, "en") },
    hi: { subject: `Nazar साप्ताहिक रिपोर्ट: आपका पोर्टफोलियो ${pct}`, title: `साप्ताहिक रिपोर्ट · ${range.hi}`, sections: clean(hi, "hi") },
  };
}
