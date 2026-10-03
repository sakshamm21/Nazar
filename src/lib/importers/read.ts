import { parseCsv, sniffDelimiter } from "./csv";

/** Reads an uploaded CSV or XLSX into its tables, largest first: one for a CSV, one per sheet for a workbook. */
export async function readTables(data: ArrayBuffer | Uint8Array, filename: string): Promise<unknown[][][]> {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const isXlsx = /\.xlsx$/i.test(filename) || (bytes[0] === 0x50 && bytes[1] === 0x4b); // "PK" zip header
  if (isXlsx) return readXlsx(bytes);
  if (/\.xls$/i.test(filename)) throw new Error("Old .xls files aren't supported. Open it and save as .xlsx or .csv.");
  const text = new TextDecoder("utf-8").decode(bytes);
  return [parseCsv(text, sniffDelimiter(text))];
}

/** The largest table in the file (the holdings sheet of a single-sheet export). */
export const readTable = async (data: ArrayBuffer | Uint8Array, filename: string): Promise<unknown[][]> => (await readTables(data, filename))[0] ?? [];

export const isPdf = (bytes: Uint8Array, filename: string) => /\.pdf$/i.test(filename) || (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46); // "%PDF"

/** Thrown when a PDF needs a password, or the one given is wrong. */
export class PdfPasswordError extends Error {
  constructor(public readonly wrong: boolean) {
    super(wrong ? "That password didn't open the statement." : "This statement is password-protected.");
  }
}

/** The text of a PDF, page after page. Statements from CAMS and KFintech are encrypted with a password the investor chose. */
export async function readPdfText(bytes: Uint8Array, password?: string): Promise<string> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  try {
    const pdf = await getDocumentProxy(new Uint8Array(bytes), password ? { password } : {});
    const { text } = await extractText(pdf, { mergePages: false });
    return (Array.isArray(text) ? text : [text]).join("\n");
  } catch (e) {
    const err = e as { name?: string; code?: number; message?: string };
    if (err?.name === "PasswordException" || /password/i.test(err?.message ?? "")) throw new PdfPasswordError(Boolean(password));
    throw new Error("Couldn't read that PDF. Upload the statement exactly as it was emailed to you.");
  }
}

async function readXlsx(bytes: Uint8Array): Promise<unknown[][][]> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
  // Largest sheet first (Groww/Zerodha put holdings on the first or a named sheet; funds can sit on another).
  return [...wb.worksheets].sort((a, b) => b.actualRowCount - a.actualRowCount).map(sheetRows).filter((t) => t.length);
}

function sheetRows(sheet: import("exceljs").Worksheet): unknown[][] {
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
