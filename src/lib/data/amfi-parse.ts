/**
 * Parser for AMFI's daily NAV file (https://www.amfiindia.com/spages/NAVAll.txt), which lists every
 * mutual fund scheme in India with its latest NAV. Pure, so it is shared by the catalogue refresh
 * script, the live NAV fetcher and the tests.
 *
 * The file is semicolon-separated, grouped under headings:
 *   Open Ended Schemes(Equity Scheme - Flexi Cap Fund)     ← category
 *   PPFAS Mutual Fund                                      ← fund house
 *   122639;INF879O01027;-;Parag Parikh Flexi Cap Fund;Direct Plan;Growth Option;88.2569;01-Oct-2026
 * Older versions of the file have no Plan and Option columns (they are part of the name), so
 * columns are found from the header row.
 */
export type AmfiScheme = { code: string; isin: string | null; isin2: string | null; name: string; category: string; amc: string; nav: number; date: string };

const MONTHS: Record<string, string> = { jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06", jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12" };

/** "01-Oct-2026" → "2026-10-01". */
function isoDate(s: string): string | null {
  const m = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/.exec(s.trim());
  const mm = m && MONTHS[m[2].toLowerCase()];
  return m && mm ? `${m[3]}-${mm}-${m[1].padStart(2, "0")}` : null;
}

const isin = (s: string | undefined) => (s && /^IN[A-Z0-9]{10}$/.test(s.trim()) ? s.trim() : null);

/** "Direct Plan" + "Growth Option" → "Direct · Growth" appended to the scheme name. */
function fullName(name: string, plan?: string, option?: string) {
  const parts = [plan, option].map((p) => p?.replace(/\s*\b(plan|option)\b\s*/gi, " ").trim()).filter((p) => p && p !== "-" && !name.toLowerCase().includes(p.toLowerCase()));
  return [name.trim(), ...parts].join(" - ");
}

export function parseAmfi(text: string): AmfiScheme[] {
  const out: AmfiScheme[] = [];
  let cols: Record<string, number> | null = null;
  let category = "", amc = "";
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (!line.includes(";")) {
      // A heading: either "…Schemes(Category)" or a fund house name.
      const m = /Schemes?\s*\((.+)\)\s*$/i.exec(line);
      if (m) category = m[1].trim();
      else amc = line;
      continue;
    }
    const cells = line.split(";");
    if (/^scheme code$/i.test(cells[0].trim())) {
      const find = (re: RegExp) => cells.findIndex((c) => re.test(c.trim()));
      cols = { code: 0, isin: find(/isin.*growth|isin div payout/i), isin2: find(/isin div reinvestment/i), name: find(/^scheme name$/i), plan: find(/^plan$/i), option: find(/^option$/i), nav: find(/net asset value/i), date: find(/^date$/i) };
      continue;
    }
    if (!cols) continue;
    const nav = Number(cells[cols.nav]);
    const date = isoDate(cells[cols.date] ?? "");
    const code = cells[cols.code].trim();
    if (!/^\d+$/.test(code) || !Number.isFinite(nav) || !date) continue;
    out.push({ code, isin: isin(cells[cols.isin]), isin2: isin(cells[cols.isin2]), name: fullName(cells[cols.name] ?? "", cols.plan >= 0 ? cells[cols.plan] : undefined, cols.option >= 0 ? cells[cols.option] : undefined), category, amc, nav, date });
  }
  return out;
}
