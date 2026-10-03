import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseHoldings, toNumber } from "@/lib/importers/brokers";
import { parseCsv, sniffDelimiter } from "@/lib/importers/csv";
import { readTable } from "@/lib/importers/read";
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
