import type { ParseResult, ParsedHolding } from "./brokers";

/**
 * Mutual fund statements: the Consolidated Account Statement (CAS) that CAMS and KFintech email as
 * a PDF. Works on the text of the PDF, scheme by scheme. Each scheme block carries its ISIN and ends
 * with a summary line such as
 *
 *   Closing Unit Balance: 3,965.696 NAV on 30-Sep-2026: INR 88.2569
 *   Total Cost Value: 350,000.00 Market Value on 30-Sep-2026: INR 350,000.12
 *
 * (a "detailed" statement has the cost; a "summary" one doesn't). The same scheme held in two
 * folios is added together. Written from the published layout and checked against generated
 * statements, not yet against a real investor's file.
 */
const num = (s: string | undefined) => (s ? Number(s.replace(/,/g, "")) : NaN);
const NUM = "([\\d,]+(?:\\.\\d+)?)";
const ISIN = /ISIN\s*:?\s*(IN[A-Z0-9]{10})/g;
const CLOSING = new RegExp(`Closing Unit Balance\\s*:?\\s*${NUM}`, "i");
const COST = new RegExp(`Total Cost Value\\s*:?\\s*(?:INR|Rs\\.?)?\\s*${NUM}`, "i");
const VALUE = new RegExp(`(?:Market Value|Valuation)(?: on [^:]{0,20})?\\s*:\\s*(?:INR|Rs\\.?)?\\s*${NUM}`, "i");

export function parseCas(text: string): ParseResult & { notes: string[] } {
  if (!/Closing Unit Balance/i.test(text) || !/ISIN/i.test(text)) throw new Error("This PDF doesn't look like a mutual fund statement. Upload the Consolidated Account Statement from CAMS or KFintech.");
  const marks = [...text.matchAll(ISIN)];
  const byIsin = new Map<string, { units: number; cost: number; value: number; costKnown: boolean; name: string; line: number }>();
  const skipped: { line: number; reason: string }[] = [];
  marks.forEach((m, i) => {
    const block = text.slice(m.index!, marks[i + 1]?.index ?? text.length);
    const units = num(CLOSING.exec(block)?.[1]);
    // The scheme's name is what precedes "ISIN" on its line, after the registrar's own code.
    const name = text.slice(Math.max(0, m.index! - 160), m.index!).split(/\n/).at(-1)!.replace(/^.*?\b[A-Z0-9]{2,12}\s*-\s*(?=[A-Z])/, "").replace(/[\s(\-–]+$/, "").trim();
    if (!Number.isFinite(units)) return; // the ISIN was mentioned outside a scheme block
    if (units <= 0) return void skipped.push({ line: i + 1, reason: `${name || m[1]}: fully redeemed` });
    const cost = num(COST.exec(block)?.[1]), value = num(VALUE.exec(block)?.[1]);
    const cur = byIsin.get(m[1]) ?? { units: 0, cost: 0, value: 0, costKnown: true, name, line: i + 1 };
    byIsin.set(m[1], { ...cur, units: cur.units + units, cost: cur.cost + (cost > 0 ? cost : 0), value: cur.value + (value > 0 ? value : 0), costKnown: cur.costKnown && cost > 0 });
  });
  const rows: ParsedHolding[] = [];
  const noCost: string[] = [];
  for (const [isin, h] of byIsin) {
    // Without a cost (summary statements) the best available average is today's NAV: gain shows as zero.
    const avg = h.costKnown ? h.cost / h.units : h.value > 0 ? h.value / h.units : NaN;
    if (!(avg > 0)) {
      skipped.push({ line: h.line, reason: `${h.name || isin}: no cost or value in the statement` });
      continue;
    }
    if (!h.costKnown) noCost.push(h.name || isin);
    rows.push({ line: h.line, rawName: h.name || isin, symbol: null, isin, quantity: Math.round(h.units * 1000) / 1000, avgPrice: Math.round(avg * 10000) / 10000, buyDate: null });
  }
  if (!rows.length) throw new Error("No mutual fund holdings with units were found in this statement.");
  const notes = noCost.length ? [`${noCost.length === 1 ? "One fund has" : `${noCost.length} funds have`} no cost in this statement, so today's NAV is used as the average and the gain shows as zero. Request a "detailed" statement to get the cost, or correct it after importing.`] : [];
  return { broker: "cas", format: "Mutual fund statement (CAMS / KFintech)", rows, skipped, notes };
}
