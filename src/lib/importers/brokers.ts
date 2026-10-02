/**
 * Broker holdings exports → normalised rows. Detection is header-based: we scan the first rows for
 * a header that matches a known broker's column set, so preamble rows (client name, report date)
 * don't matter and column order can change.
 *
 * Formats (as documented by each broker; Groww and Upstox are unverified against real files):
 * - Zerodha Console "Holdings" XLSX/CSV: Symbol, ISIN, Sector, Quantity Available, Quantity Discrepant,
 *   Quantity Long Term, Quantity Pledged (Margin), Quantity Pledged (Loan), Average Price, …
 * - Zerodha Kite holdings CSV: Instrument, Qty., Avg. cost, LTP, Cur. val, P&L, Net chg., Day chg.
 * - Groww stocks holdings XLSX: Stock Name, ISIN, Quantity, Average buy price, Buy value, Closing price, …
 * - Upstox holdings: Scrip Name / Company Name, ISIN, Qty / Quantity, Avg. Price, LTP, …
 * - Generic: any file with a name/symbol column, a quantity column and an average price column.
 */

export type Broker = "zerodha" | "groww" | "upstox" | "generic";

export type ParsedHolding = {
  line: number;
  rawName: string;
  symbol: string | null;
  isin: string | null;
  quantity: number;
  avgPrice: number;
  buyDate: string | null;
};

export type ParseResult = { broker: Broker; format: string; rows: ParsedHolding[]; skipped: { line: number; reason: string }[] };

const norm = (s: unknown) => String(s ?? "").toLowerCase().replace(/[^a-z0-9&()]+/g, " ").trim();

type ColSpec = { [field: string]: string[] };

const FORMATS: { broker: Broker; format: string; required: string[]; cols: ColSpec; qtyCols?: string[] }[] = [
  {
    broker: "zerodha",
    format: "Zerodha Console holdings",
    required: ["symbol", "isin", "avg", "qtyAvailable"],
    cols: {
      symbol: ["symbol"],
      isin: ["isin"],
      avg: ["average price"],
      qtyAvailable: ["quantity available"],
      qtyDiscrepant: ["quantity discrepant"],
      qtyMargin: ["quantity pledged (margin)", "quantity pledged margin"],
      qtyLoan: ["quantity pledged (loan)", "quantity pledged loan"],
    },
    qtyCols: ["qtyAvailable", "qtyDiscrepant", "qtyMargin", "qtyLoan"],
  },
  {
    broker: "zerodha",
    format: "Zerodha Kite holdings",
    required: ["symbol", "qty", "avg"],
    cols: { symbol: ["instrument"], qty: ["qty", "qty."], avg: ["avg cost", "avg. cost"] },
  },
  {
    broker: "groww",
    format: "Groww holdings",
    required: ["name", "qty", "avg"],
    cols: { name: ["stock name"], isin: ["isin"], qty: ["quantity"], avg: ["average buy price", "avg buy price", "average price"] },
  },
  {
    broker: "upstox",
    format: "Upstox holdings",
    required: ["name", "qty", "avg"],
    cols: { name: ["scrip name", "company name", "scrip", "instrument name"], symbol: ["symbol", "trading symbol"], isin: ["isin"], qty: ["qty", "quantity", "net qty"], avg: ["avg price", "avg. price", "average price", "buy avg"] },
  },
  {
    broker: "generic",
    format: "Generic holdings",
    required: ["name", "qty", "avg"],
    cols: {
      name: ["symbol", "ticker", "instrument", "stock", "stock name", "scrip", "company", "company name", "name", "security"],
      isin: ["isin"],
      qty: ["quantity", "qty", "shares", "units", "no of shares", "holding"],
      avg: ["average price", "avg price", "avg cost", "average cost", "buy price", "purchase price", "cost price", "avg buy price", "average buy price"],
      buyDate: ["buy date", "purchase date", "date"],
    },
  },
];

function findCol(header: string[], aliases: string[]): number {
  const h = header.map(norm);
  for (const a of aliases.map(norm)) {
    const i = h.indexOf(a);
    if (i >= 0) return i;
  }
  return -1;
}

export function toNumber(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v ?? "").replace(/[₹,\s]/g, "").replace(/^\((.*)\)$/, "-$1");
  if (!s || s === "-") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function toIsoDate(v: unknown): string | null {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  const s = String(v ?? "").trim();
  if (!s) return null;
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(s); // Indian format: DD/MM/YYYY
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

/** Detects the format from the first 25 rows and maps every data row. */
export function parseHoldings(table: unknown[][]): ParseResult {
  const scan = Math.min(table.length, 25);
  for (const f of FORMATS) {
    for (let r = 0; r < scan; r++) {
      const header = (table[r] ?? []).map((c) => String(c ?? ""));
      const idx: Record<string, number> = {};
      for (const [field, aliases] of Object.entries(f.cols)) idx[field] = findCol(header, aliases);
      if (!f.required.every((k) => idx[k] >= 0)) continue;
      return mapRows(table, r, f, idx);
    }
  }
  throw new Error("Couldn't recognise this file. Export your holdings from Zerodha Console, Kite, Groww or Upstox, or use a sheet with name, quantity and average price columns.");
}

function mapRows(table: unknown[][], headerRow: number, f: (typeof FORMATS)[number], idx: Record<string, number>): ParseResult {
  const rows: ParsedHolding[] = [];
  const skipped: { line: number; reason: string }[] = [];
  for (let r = headerRow + 1; r < table.length; r++) {
    const row = table[r] ?? [];
    const cell = (k: string) => (idx[k] >= 0 ? row[idx[k]] : undefined);
    const nameCell = String(cell("name") ?? cell("symbol") ?? "").trim();
    if (!nameCell || /^(total|grand total|net)\b/i.test(nameCell)) continue;
    const qty = f.qtyCols ? f.qtyCols.reduce((a, k) => a + (toNumber(cell(k)) ?? 0), 0) : toNumber(cell("qty"));
    const avg = toNumber(cell("avg"));
    if (qty == null || qty <= 0) {
      skipped.push({ line: r + 1, reason: `${nameCell}: no quantity` });
      continue;
    }
    if (avg == null || avg <= 0) {
      skipped.push({ line: r + 1, reason: `${nameCell}: no average price` });
      continue;
    }
    const symbolCell = idx.symbol >= 0 ? String(cell("symbol") ?? "").trim() : "";
    const isin = String(cell("isin") ?? "").trim().toUpperCase();
    rows.push({
      line: r + 1,
      rawName: nameCell,
      symbol: symbolCell ? symbolCell.replace(/-(EQ|BE|BZ|SM)$/i, "").toUpperCase() : null,
      isin: /^IN[A-Z0-9]{10}$/.test(isin) ? isin : null,
      quantity: qty,
      avgPrice: avg,
      buyDate: idx.buyDate >= 0 ? toIsoDate(cell("buyDate")) : null,
    });
  }
  return { broker: f.broker, format: f.format, rows, skipped };
}
