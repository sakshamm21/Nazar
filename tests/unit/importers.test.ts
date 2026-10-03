import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseHoldings, parseSheets, toNumber } from "@/lib/importers/brokers";
import { parseCas } from "@/lib/importers/cas";
import { getCatalog } from "@/lib/instruments/catalog";
import { parseCsv, sniffDelimiter } from "@/lib/importers/csv";
import { isPdf, readPdfText, readTable, readTables } from "@/lib/importers/read";
import { resolve, resolveLocal } from "@/lib/importers/resolve";
import { buildIndex, getMaster, normalizeName, shortName } from "@/lib/instruments/master";

const fixture = (f: string) => readFileSync(path.join(__dirname, "..", "fixtures", f), "utf8");
const table = (f: string) => parseCsv(fixture(f), sniffDelimiter(fixture(f)));

describe("CSV reader", () => {
  it("handles quotes, escaped quotes, CRLF and a BOM", () => {
    const rows = parseCsv('﻿a,"b, c","say ""hi"""\r\n1,2,3\r\n');
    expect(rows).toEqual([
      ["a", "b, c", 'say "hi"'],
      ["1", "2", "3"],
    ]);
  });
  it("sniffs semicolon and tab delimiters", () => {
    expect(sniffDelimiter("a;b;c\n1;2;3")).toBe(";");
    expect(sniffDelimiter("a\tb\tc\n1\t2\t3")).toBe("\t");
  });
  it("parses Indian-formatted numbers", () => {
    expect(toNumber("₹1,23,456.50")).toBe(123456.5);
    expect(toNumber("(1,200)")).toBe(-1200);
    expect(toNumber("-")).toBeNull();
  });
});

describe("Broker detection and parsing", () => {
  it("Zerodha Console: skips the preamble, adds pledged quantities, keeps ISINs", () => {
    const r = parseHoldings(table("zerodha-console.csv"));
    expect(r.broker).toBe("zerodha");
    expect(r.format).toBe("Zerodha Console holdings");
    expect(r.rows).toHaveLength(5);
    const hdfc = r.rows.find((x) => x.symbol === "HDFCBANK")!;
    expect(hdfc.quantity).toBe(60); // 50 available + 10 pledged for margin
    expect(hdfc.avgPrice).toBe(1610.5);
    expect(hdfc.isin).toBe("INE040A01034");
  });

  it("Zerodha Kite: quoted Indian numbers", () => {
    const r = parseHoldings(table("kite-holdings.csv"));
    expect(r.format).toBe("Zerodha Kite holdings");
    expect(r.rows.map((x) => [x.symbol, x.quantity, x.avgPrice])).toEqual([
      ["TCS", 12, 3450.1],
      ["SBIN", 40, 610],
      ["BAJAJ-AUTO", 2, 8100],
    ]);
  });

  it("Groww: metadata rows and a blank line before the header", () => {
    const r = parseHoldings(table("groww-holdings.csv"));
    expect(r.broker).toBe("groww");
    expect(r.rows).toHaveLength(3);
    expect(r.rows[1]).toMatchObject({ rawName: "ITC Ltd.", isin: "INE154A01025", quantity: 100, avgPrice: 400.5 });
  });

  it("Upstox: scrip name, symbol and ISIN", () => {
    const r = parseHoldings(table("upstox-holdings.csv"));
    expect(r.broker).toBe("upstox");
    expect(r.rows[0]).toMatchObject({ symbol: "RELIANCE", isin: "INE002A01018", quantity: 15, avgPrice: 1290.4 });
  });

  it("Generic sheet with a buy date in Indian format", () => {
    const r = parseHoldings([["Company", "Shares", "Buy Price", "Purchase Date"], ["Titan Company Ltd", "8", "3100", "15/03/2025"], ["Total", "", "", ""]]);
    expect(r.broker).toBe("generic");
    expect(r.rows).toEqual([expect.objectContaining({ rawName: "Titan Company Ltd", quantity: 8, avgPrice: 3100, buyDate: "2025-03-15" })]);
  });

  it("flags rows without a quantity or price instead of guessing", () => {
    const r = parseHoldings([["Symbol", "Quantity", "Average Price"], ["INFY", "10", ""], ["TCS", "0", "100"], ["ITC", "5", "400"]]);
    expect(r.rows.map((x) => x.rawName)).toEqual(["ITC"]);
    expect(r.skipped).toHaveLength(2);
  });

  it("rejects an unrecognisable file with a helpful message", () => {
    expect(() => parseHoldings([["foo", "bar"], ["1", "2"]])).toThrow(/Couldn't recognise this file/);
  });

  it("reads XLSX files too", async () => {
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Holdings");
    ws.addRow(["Stock Name", "ISIN", "Quantity", "Average buy price"]);
    ws.addRow(["Infosys Limited", "INE009A01021", 10, 1500]);
    const buf = await wb.xlsx.writeBuffer();
    const t = await readTable(new Uint8Array(buf as ArrayBuffer), "groww.xlsx");
    expect(parseHoldings(t).rows[0]).toMatchObject({ isin: "INE009A01021", quantity: 10 });
  });
});

describe("Ticker resolution", () => {
  const index = getMaster();

  it("ISIN first: exact NSE match", () => {
    expect(resolveLocal(index, { rawName: "whatever", isin: "INE009A01021" })).toMatchObject({ status: "matched", symbol: "INFY.NS", via: "isin" });
  });
  it("renamed companies resolve through their ISIN and known aliases", () => {
    expect(resolveLocal(index, { rawName: "ZOMATO", symbol: "ZOMATO" })).toMatchObject({ status: "matched", symbol: "ETERNAL.NS" });
    expect(resolveLocal(index, { rawName: "TATAMOTORS", symbol: "TATAMOTORS" })).toMatchObject({ status: "matched", symbol: "TMPV.NS", via: "alias" });
  });
  it("exact NSE symbols, with or without .NS or the -EQ series suffix", () => {
    expect(resolveLocal(index, { rawName: "x", symbol: "BAJAJ-AUTO" })).toMatchObject({ symbol: "BAJAJ-AUTO.NS", via: "symbol" });
    expect(resolveLocal(index, { rawName: "RELIANCE.NS" })).toMatchObject({ symbol: "RELIANCE.NS" });
  });
  it("company names, ignoring Ltd/Limited and &", () => {
    expect(resolveLocal(index, { rawName: "Larsen & Toubro Ltd." })).toMatchObject({ status: "matched", symbol: "LT.NS" });
    expect(resolveLocal(index, { rawName: "HDFC Bank" })).toMatchObject({ status: "matched", symbol: "HDFCBANK.NS" });
  });
  it("flags names it can't match", () => {
    expect(resolveLocal(index, { rawName: "Definitely Not A Company Pvt" }).status).toBe("unmatched");
  });
  it("ambiguous names offer candidates", () => {
    const small = buildIndex([
      { symbol: "ABC", name: "Alpha Beta Limited", isin: "INE000000001" },
      { symbol: "ABCX", name: "Alpha Beta Exports Limited", isin: "INE000000002" },
    ]);
    const r = resolveLocal(small, { rawName: "Alpha Beta" });
    expect(r.status).toBe("matched"); // exact normalised name wins
    expect(resolveLocal(small, { rawName: "Alpha" }).status).toBe("ambiguous");
  });
  it("falls back to search (NSE listing preferred) only when the local list fails", async () => {
    let calls = 0;
    const search = async () => {
      calls++;
      return [
        { symbol: "XYZ", name: "XYZ Corp", type: "EQUITY" },
        { symbol: "XYZIND.NS", name: "XYZ India", type: "EQUITY" },
      ];
    };
    expect(await resolve(index, { rawName: "XYZ India Ventures" }, search)).toMatchObject({ status: "matched", symbol: "XYZIND.NS", via: "search" });
    await resolve(index, { rawName: "Infosys Limited" }, search);
    expect(calls).toBe(1);
  });
  it("normalises and shortens names for display", () => {
    expect(normalizeName("Larsen & Toubro Ltd.")).toBe("larsen toubro");
    expect(shortName("ETERNAL LIMITED")).toBe("Eternal");
    expect(shortName("ICICI BANK LIMITED")).toBe("ICICI Bank");
    expect(shortName("Infosys Limited")).toBe("Infosys");
  });
});

describe("mutual funds: sheets and statements", () => {
  it("a fund sheet with units and the amount invested works out the average NAV", () => {
    const r = parseHoldings([["Scheme Name", "ISIN", "Units", "Invested Value", "Current Value"], ["Parag Parikh Flexi Cap Fund Direct Growth", "INF879O01027", "1,000.500", "75,000", "88,300"], ["Total", "", "", "75,000", ""]]);
    expect(r.broker).toBe("generic");
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]).toMatchObject({ isin: "INF879O01027", quantity: 1000.5 });
    expect(r.rows[0].avgPrice).toBeCloseTo(74.9625, 3);
  });

  it("a workbook with stocks on one sheet and funds on another imports both", async () => {
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    const eq = wb.addWorksheet("Equity");
    eq.addRow(["Symbol", "ISIN", "Sector", "Quantity Available", "Quantity Discrepant", "Quantity Long Term", "Quantity Pledged (Margin)", "Quantity Pledged (Loan)", "Average Price"]);
    eq.addRow(["INFY", "INE009A01021", "IT", 10, 0, 0, 0, 0, 1500]);
    eq.addRow(["TCS", "INE467B01029", "IT", 5, 0, 0, 0, 0, 3200]);
    const mf = wb.addWorksheet("Mutual Funds");
    mf.addRow(["Symbol", "ISIN", "Instrument Type", "Quantity Available", "Quantity Discrepant", "Quantity Long Term", "Quantity Pledged (Margin)", "Quantity Pledged (Loan)", "Average Price"]);
    mf.addRow(["PARAG PARIKH FLEXI CAP FUND - DIRECT PLAN", "INF879O01027", "MF", 250.75, 0, 0, 0, 0, 71.2]);
    const tables = await readTables(new Uint8Array((await wb.xlsx.writeBuffer()) as ArrayBuffer), "holdings.xlsx");
    expect(tables).toHaveLength(2);
    const r = parseSheets(tables);
    expect(r.rows.map((x) => x.isin)).toEqual(["INE009A01021", "INE467B01029", "INF879O01027"]);
    expect(getCatalog().byIsin.get(r.rows[2].isin!)).toMatchObject({ assetClass: "mf", symbol: "MF:122639" });
  });

  const CAS = [
    "Consolidated Account Statement 01-Apr-2025 To 30-Sep-2026",
    "PPFAS Mutual Fund",
    "Folio No: 12345678 / 0",
    "PP001ZG-Parag Parikh Flexi Cap Fund - Direct Plan - Growth (Advisor: DIRECT) - ISIN: INF879O01027",
    "Opening Unit Balance: 0.000",
    "10-Apr-2025 Purchase 2,00,000.00 2,800.112 71.4257 2,800.112",
    "Closing Unit Balance: 3,965.696 NAV on 30-Sep-2026: INR 88.2569 Total Cost Value: 3,00,000.00 Market Value on 30-Sep-2026: INR 3,50,000.12",
    "Folio No: 99887766 / 0",
    "PP001ZG-Parag Parikh Flexi Cap Fund - Direct Plan - Growth (Advisor: DIRECT) - ISIN: INF879O01027",
    "Closing Unit Balance: 34.304 NAV on 30-Sep-2026: INR 88.2569 Total Cost Value: 2,500.00 Market Value on 30-Sep-2026: INR 3,027.56",
    "UTI Mutual Fund",
    "Folio No: 555 / 12",
    "120716-UTI Nifty 50 Index Fund - Direct Plan - Growth (Advisor: DIRECT) - ISIN: INF789F01XA0",
    "Closing Unit Balance: 1,000.000 NAV on 30-Sep-2026: INR 157.8901 Market Value on 30-Sep-2026: INR 1,57,890.10",
    "HDFC Mutual Fund",
    "H02T-HDFC Liquid Fund - Direct Plan - Growth - ISIN: INF179KB1HP9",
    "Closing Unit Balance: 0.000 NAV on 30-Sep-2026: INR 5,598.08 Total Cost Value: 0.00 Market Value on 30-Sep-2026: INR 0.00",
  ].join("\n");

  it("a CAMS / KFintech statement: units and cost per scheme, folios added together", () => {
    const r = parseCas(CAS);
    expect(r).toMatchObject({ broker: "cas", format: "Mutual fund statement (CAMS / KFintech)" });
    expect(r.rows).toHaveLength(2);
    const flexi = r.rows.find((x) => x.isin === "INF879O01027")!;
    expect(flexi.quantity).toBe(4000);
    expect(flexi.avgPrice).toBeCloseTo(302_500 / 4000, 4);
    expect(flexi.rawName).toMatch(/^Parag Parikh Flexi Cap Fund - Direct Plan - Growth/);
    // No cost in the statement: valued at the NAV, and the user is told.
    expect(r.rows.find((x) => x.isin === "INF789F01XA0")).toMatchObject({ quantity: 1000, avgPrice: 157.8901 });
    expect(r.notes[0]).toMatch(/One fund has no cost/);
    expect(r.skipped).toEqual([expect.objectContaining({ reason: expect.stringMatching(/HDFC Liquid Fund.*fully redeemed/) })]);
  });

  it("refuses a PDF that isn't a fund statement", () => {
    expect(() => parseCas("Invoice 42\nTotal due: 100")).toThrow(/doesn't look like a mutual fund statement/);
  });

  it("reads the statement out of a real PDF file", async () => {
    const text = await readPdfText(pdfOf(CAS.split("\n")));
    expect(isPdf(pdfOf(["x"]), "statement.bin")).toBe(true);
    const r = parseCas(text);
    expect(r.rows.map((x) => [x.isin, x.quantity])).toEqual([["INF879O01027", 4000], ["INF789F01XA0", 1000]]);
  });
});

/** A minimal one-page PDF with one line of text per entry (enough for a text extractor to read). */
function pdfOf(lines: string[]): Uint8Array {
  const esc = (s: string) => s.replace(/[\\()]/g, (c) => "\\" + c);
  const stream = "BT /F1 9 Tf 40 780 Td 12 TL\n" + lines.map((l) => `(${esc(l)}) Tj T*`).join("\n") + "\nET";
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("");
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(out);
}
