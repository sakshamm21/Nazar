/**
 * Yahoo's sectors are US-style ("Financial Services / Banks - Regional"). Nazar shows Indian-friendly
 * labels and links each to the Nifty sector index used by the "likely reason" classifier.
 */
export type SectorInfo = { label: string; labelHi: string; index: string | null; indexName: string | null; financial: boolean };

const S = (label: string, labelHi: string, index: string | null, indexName: string | null, financial = false): SectorInfo => ({ label, labelHi, index, indexName, financial });

export function sectorOf(sector: string | null | undefined, industry: string | null | undefined): SectorInfo {
  const s = (sector ?? "").toLowerCase(), i = (industry ?? "").toLowerCase();
  if (s.includes("financial")) {
    if (/bank/.test(i)) return S("Banks", "बैंक", "^NSEBANK", "Nifty Bank", true);
    if (/insurance/.test(i)) return S("Insurance", "बीमा", "NIFTY_FIN_SERVICE.NS", "Nifty Financial Services", true);
    return S("Financial services", "वित्तीय सेवाएँ", "NIFTY_FIN_SERVICE.NS", "Nifty Financial Services", true);
  }
  if (s.includes("technology")) return S("IT", "आईटी", "^CNXIT", "Nifty IT");
  if (s.includes("consumer cyclical")) {
    if (/auto/.test(i)) return S("Auto", "ऑटो", "^CNXAUTO", "Nifty Auto");
    return S("Consumer", "कंज़्यूमर", null, null);
  }
  if (s.includes("consumer defensive")) return S("FMCG", "एफएमसीजी", "^CNXFMCG", "Nifty FMCG");
  if (s.includes("healthcare")) return S("Pharma & healthcare", "फ़ार्मा और हेल्थकेयर", "^CNXPHARMA", "Nifty Pharma");
  if (s.includes("basic materials")) {
    if (/steel|alumin|copper|metal|mining|iron/.test(i)) return S("Metals", "धातु", "^CNXMETAL", "Nifty Metal");
    return S("Materials", "मटीरियल्स", null, null);
  }
  if (s.includes("energy") || s.includes("utilities")) return S("Energy & power", "ऊर्जा और बिजली", "^CNXENERGY", "Nifty Energy");
  if (s.includes("real estate")) return S("Realty", "रियल्टी", "^CNXREALTY", "Nifty Realty");
  if (s.includes("industrials")) return S("Industrials", "इंडस्ट्रियल्स", null, null);
  if (s.includes("communication")) return S("Telecom & media", "टेलीकॉम और मीडिया", null, null);
  return S("Other", "अन्य", null, null);
}

/** Every sector index the pipeline fetches alongside holdings. */
export const SECTOR_INDICES = ["^NSEBANK", "NIFTY_FIN_SERVICE.NS", "^CNXIT", "^CNXAUTO", "^CNXFMCG", "^CNXPHARMA", "^CNXMETAL", "^CNXENERGY", "^CNXREALTY"];
export const NIFTY = "^NSEI";
export const isIndex = (s: string) => s.startsWith("^") || s === "NIFTY_FIN_SERVICE.NS";
