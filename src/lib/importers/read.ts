import { parseCsv, sniffDelimiter } from "./csv";

/** Reads an uploaded CSV or XLSX into rows of cells (strings, numbers or dates). */
export async function readTable(data: ArrayBuffer | Uint8Array, filename: string): Promise<unknown[][]> {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const isXlsx = /\.xlsx$/i.test(filename) || (bytes[0] === 0x50 && bytes[1] === 0x4b); // "PK" zip header
  if (isXlsx) return readXlsx(bytes);
  if (/\.xls$/i.test(filename)) throw new Error("Old .xls files aren't supported. Open it and save as .xlsx or .csv.");
  const text = new TextDecoder("utf-8").decode(bytes);
  return parseCsv(text, sniffDelimiter(text));
}

async function readXlsx(bytes: Uint8Array): Promise<unknown[][]> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
  // Use the sheet with the most rows (Groww/Zerodha put holdings on the first or a named sheet).
  const sheet = [...wb.worksheets].sort((a, b) => b.actualRowCount - a.actualRowCount)[0];
  if (!sheet) return [];
  const rows: unknown[][] = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    const values = (row.values as unknown[]).slice(1).map((v) => {
      if (v && typeof v === "object") {
        const o = v as { result?: unknown; text?: unknown; richText?: { text: string }[] };
        if ("result" in o) return o.result;
        if (o.richText) return o.richText.map((t) => t.text).join("");
        if ("text" in o) return o.text;
        if (v instanceof Date) return v;
      }
      return v ?? "";
    });
    rows.push(values);
  });
  return rows;
}
