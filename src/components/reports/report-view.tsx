"use client";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Segmented } from "@/components/ui/switch";
import { cn } from "@/lib/cn";

type Lang = { subject: string; title: string; sections: { heading: string; lines: string[] }[] };

/** H6: the weekly report exactly as the family member receives it, with an English toggle for the owner. */
export function ReportView({ en, hi, defaultLang, recipient }: { en: Lang; hi: Lang; defaultLang: "en" | "hi"; recipient: string | null }) {
  const [lang, setLang] = useState<"en" | "hi">(defaultLang);
  const c = lang === "hi" ? hi : en;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented
          label="Report language"
          value={lang}
          onChange={setLang}
          options={[
            { value: "hi", label: "हिंदी" },
            { value: "en", label: "English" },
          ]}
          size="sm"
        />
        {recipient && <span className="t-caption">Emailed to {recipient} in {defaultLang === "hi" ? "Hindi" : "English"}</span>}
      </div>
      <Card className="p-5 sm:p-8" lang={lang}>
        <div className="t-caption">{lang === "hi" ? "विषय" : "Subject"}: {c.subject}</div>
        <h2 className={cn("t-title-1 mt-2 text-text", lang === "hi" && "hi")}>{c.title}</h2>
        {c.sections.map((s) => (
          <section key={s.heading} className="mt-6">
            <h3 className="t-overline">{s.heading}</h3>
            <ul className={cn("mt-2 space-y-2 text-[16px] leading-7 text-text", lang === "hi" && "hi")}>
              {s.lines.map((l, i) => (
                <li key={i}>{l}</li>
              ))}
            </ul>
          </section>
        ))}
        <p className={cn("mt-8 border-t border-line pt-4 text-[13px] text-subtle", lang === "hi" && "hi")}>
          {lang === "hi" ? "हम नज़र रखते हैं और समझाते हैं; फ़ैसला आपका है। Nazar SEBI-पंजीकृत निवेश सलाहकार नहीं है।" : "We watch and explain; you decide. Nazar is not a SEBI-registered investment adviser."}
        </p>
      </Card>
    </div>
  );
}
