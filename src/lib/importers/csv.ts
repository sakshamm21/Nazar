/** Minimal RFC 4180 CSV parser: quoted fields, escaped quotes, CRLF/LF, a leading BOM. */
export function parseCsv(text: string, delimiter = ","): string[][] {
  const s = text.replace(/^﻿/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === delimiter) {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((x) => x.trim() !== ""));
}

/** Guesses the delimiter from the first lines (comma, semicolon or tab). */
export function sniffDelimiter(text: string): string {
  const head = text.split(/\r?\n/).slice(0, 10).join("\n");
  const counts = [",", ";", "\t"].map((d) => [d, head.split(d).length] as const);
  return counts.sort((a, b) => b[1] - a[1])[0][0];
}
