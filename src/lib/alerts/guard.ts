/**
 * HARD RULE: Nazar never tells anyone to buy, sell or hold, and never gives a target price
 * (SEBI: we are not a registered investment adviser). "We watch and explain; you decide."
 *
 * Every alert, report, digest and Hindi template is checked against these patterns in tests
 * (tests/unit/no-advice.test.ts) and again at runtime before anything is saved or sent.
 */

const EN = [
  /\bbuy(ing)?\b/i,
  /\bsell(ing)?\b/i,
  /\bhold\b/i,
  /\bhold on\b/i,
  /\baccumulate\b/i,
  /\bbook (your |some )?profits?\b/i,
  /\bexit (the|your|this) (stock|position|trade)\b/i,
  /\badd more\b/i,
  /\baverage (down|out)\b/i,
  /\btarget price\b/i,
  /\bprice target\b/i,
  /\bstop[- ]?loss\b/i,
  /\bshould (you|i|we) (buy|sell|hold|invest|exit)\b/i,
  /\b(we|i) recommend\b/i,
  /\brecommendation\b/i,
  /\bstrong (buy|sell)\b/i,
  /\b(under|over)valued\b/i,
  /\bmultibagger\b/i,
  /\bto the moon\b/i,
  /\bdon'?t miss\b/i,
  /\bact now\b/i,
  /\bguaranteed? returns?\b/i,
];

const HI = [
  /ख़?रीद(ें|ो|ना|ने|िए|ें।)/u,
  /बेच(ें|ो|ना|ने|िए|कर)/u,
  /होल्ड/u,
  /लक्ष्य\s*मूल्य/u,
  /टारगेट/u,
  /स्टॉप\s*-?\s*लॉस/u,
  /निवेश\s*कर(ें|ो|िए)/u,
  /मुनाफ़?ा\s*वसूल/u,
  /बने\s*रह(ें|ो|िए)/u,
  /सलाह\s*(देते|है\s*कि)/u,
];

const HINGLISH = [/\bkharid(o|en|na|iye)\b/i, /\bbech(o|en|na|iye|do)\b/i, /\bhold kar(o|en|iye)\b/i];

const ADVICE_PATTERNS = [...EN, ...HI, ...HINGLISH];

export type AdviceViolation = { pattern: string; match: string };

export function findAdvice(raw: string): AdviceViolation[] {
  // NFC splits precomposed nukta letters (ख़ → ख + ़), so one pattern covers both spellings.
  const text = raw.normalize("NFC");
  const out: AdviceViolation[] = [];
  for (const p of ADVICE_PATTERNS) {
    const m = p.exec(text);
    if (m) out.push({ pattern: p.source, match: m[0] });
  }
  return out;
}

export const isAdviceFree = (text: string) => findAdvice(text).length === 0;

/** Runtime net: if a generated text ever trips the guard, replace it with a safe fallback and log. */
export function safeText(text: string, fallback: string, context = "text"): string {
  const v = findAdvice(text);
  if (!v.length) return text;
  console.error(`[no-advice] blocked ${context}: ${v.map((x) => x.match).join(", ")}`);
  return fallback;
}

/** The shared disclaimer used in the footer, onboarding, emails and reports. */
export const DISCLAIMER = {
  en: "We watch and explain; you decide. Nazar is not a SEBI-registered investment adviser and never tells you what to do with your money.",
  hi: "हम नज़र रखते हैं और समझाते हैं; फ़ैसला आपका है। Nazar SEBI-पंजीकृत निवेश सलाहकार नहीं है और आपके पैसों के बारे में कोई निर्देश नहीं देता।",
};
