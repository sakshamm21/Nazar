/**
 * Email templates (HTML + plain text) in English and Hindi. Table layout and inline styles so they
 * render in Gmail/Outlook; light background because most mail clients force it anyway.
 */
import { DISCLAIMER } from "@/lib/alerts/guard";

type Lang = "en" | "hi";
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const C = { ink: "#0A0F1C", text: "#1B2335", muted: "#5A6478", line: "#E3E8F0", bg: "#F5F7FA", card: "#FFFFFF", blue: "#2B54F0", gain: "#0F7A66", loss: "#C2412D" };

const ring = `<table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="width:22px;height:22px;border-radius:50%;border:2px solid ${C.blue};text-align:center;vertical-align:middle"><div style="width:8px;height:8px;border-radius:50%;background:${C.blue};margin:0 auto"></div></td><td style="padding-left:8px;font:600 16px/1 Arial,sans-serif;color:${C.ink};letter-spacing:-0.2px">Nazar</td></tr></table>`;

function layout(opts: { lang: Lang; preheader: string; body: string; footer?: string }) {
  const font = opts.lang === "hi" ? "'Noto Sans Devanagari',Mangal,Arial,sans-serif" : "Inter,Segoe UI,Arial,sans-serif";
  return `<!doctype html><html lang="${opts.lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Nazar</title></head>
<body style="margin:0;background:${C.bg};font-family:${font};color:${C.text}">
<span style="display:none;max-height:0;overflow:hidden">${esc(opts.preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.bg}"><tr><td align="center" style="padding:28px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">
<tr><td style="padding:0 4px 16px">${ring}</td></tr>
<tr><td style="background:${C.card};border:1px solid ${C.line};border-radius:20px;padding:28px 26px;font-size:15px;line-height:1.6">${opts.body}</td></tr>
<tr><td style="padding:18px 8px;font-size:12px;line-height:1.6;color:${C.muted}">${opts.footer ?? ""}${esc(DISCLAIMER[opts.lang])}</td></tr>
</table></td></tr></table></body></html>`;
}

const button = (href: string, label: string) =>
  `<a href="${esc(href)}" style="display:inline-block;background:${C.blue};color:#fff;text-decoration:none;font-weight:600;padding:11px 20px;border-radius:12px">${esc(label)}</a>`;

/* ------------------------------------------------------------------ */
/* Account emails                                                      */
/* ------------------------------------------------------------------ */

export const emails = {
  verificationCode({ name, code, minutes }: { name: string; code: string; minutes: number }) {
    const subject = `${code} is your Nazar code`;
    const text = `Hi ${name},\n\nYour Nazar verification code is ${code}. It expires in ${minutes} minutes.\n\nIf you didn't ask for this, you can ignore this email.`;
    const html = layout({
      lang: "en",
      preheader: `Your code is ${code}`,
      body: `<p style="margin:0 0 12px">Hi ${esc(name)},</p><p style="margin:0 0 18px">Here's your code to finish setting up Nazar:</p>
<div style="font:600 32px/1.2 'IBM Plex Mono',Consolas,monospace;letter-spacing:8px;color:${C.ink};background:${C.bg};border-radius:14px;padding:16px;text-align:center">${code}</div>
<p style="margin:18px 0 0;color:${C.muted};font-size:13px">It expires in ${minutes} minutes. If you didn't ask for this, ignore this email.</p>`,
    });
    return { subject, text, html };
  },

  passwordReset({ name, url, minutes }: { name: string; url: string; minutes: number }) {
    const subject = "Reset your Nazar password";
    const text = `Hi ${name},\n\nReset your password here (valid for ${minutes} minutes):\n${url}\n\nIf you didn't ask for this, you can ignore this email.`;
    const html = layout({
      lang: "en",
      preheader: "Reset your password",
      body: `<p style="margin:0 0 12px">Hi ${esc(name)},</p><p style="margin:0 0 20px">Someone (hopefully you) asked to reset your Nazar password.</p>${button(url, "Choose a new password")}
<p style="margin:20px 0 0;color:${C.muted};font-size:13px">The link works for ${minutes} minutes. If you didn't ask for this, ignore this email.</p>`,
    });
    return { subject, text, html };
  },

  recipientConfirm({ ownerName, portfolioName, url, lang }: { ownerName: string; portfolioName: string; url: string; lang: Lang }) {
    if (lang === "hi") {
      const subject = `${ownerName} चाहते हैं कि Nazar आपको "${portfolioName}" के अपडेट भेजे`;
      const text = `नमस्ते,\n\n${ownerName} ने Nazar पर "${portfolioName}" पोर्टफोलियो के लिए आपको जोड़ा है। Nazar हर हफ़्ते एक छोटी रिपोर्ट और ज़रूरी बदलावों की जानकारी हिंदी में भेजेगा।\n\nपुष्टि करने के लिए यह लिंक खोलें: ${url}\n\nअगर आप ये ईमेल नहीं चाहते, तो इसे अनदेखा करें।`;
      const html = layout({ lang, preheader: "एक क्लिक में पुष्टि करें", body: `<p style="margin:0 0 12px">नमस्ते,</p><p style="margin:0 0 20px">${esc(ownerName)} ने Nazar पर <b>${esc(portfolioName)}</b> पोर्टफोलियो के लिए आपको जोड़ा है। Nazar हर रविवार एक छोटी रिपोर्ट और ज़रूरी बदलावों की जानकारी हिंदी में भेजेगा।</p>${button(url, "हाँ, मुझे अपडेट भेजें")}<p style="margin:20px 0 0;color:${C.muted};font-size:13px">अगर आप ये ईमेल नहीं चाहते, तो इसे अनदेखा करें। कुछ नहीं भेजा जाएगा।</p>` });
      return { subject, text, html };
    }
    const subject = `${ownerName} wants Nazar to send you updates on "${portfolioName}"`;
    const text = `Hi,\n\n${ownerName} added you to the "${portfolioName}" portfolio on Nazar. Nazar will send a short weekly report and important changes.\n\nConfirm here: ${url}\n\nIf you don't want these emails, ignore this one.`;
    const html = layout({ lang, preheader: "Confirm with one click", body: `<p style="margin:0 0 12px">Hi,</p><p style="margin:0 0 20px">${esc(ownerName)} added you to the <b>${esc(portfolioName)}</b> portfolio on Nazar. Nazar will send a short weekly report every Sunday and tell you when something important happens.</p>${button(url, "Yes, send me updates")}<p style="margin:20px 0 0;color:${C.muted};font-size:13px">If you don't want these emails, ignore this one. Nothing will be sent.</p>` });
    return { subject, text, html };
  },
};

/* ------------------------------------------------------------------ */
/* Alert digest (one email per recipient per day)                      */
/* ------------------------------------------------------------------ */

export type DigestItem = { title: string; body: string; severity: "critical" | "important" | "info"; link: string; usefulUrl?: string; notUsefulUrl?: string; simulated?: boolean };

const sevDot = (s: DigestItem["severity"]) => (s === "critical" ? C.loss : s === "important" ? C.blue : C.muted);

export function digestEmail(opts: { lang: Lang; portfolioName: string; items: DigestItem[]; appLink: string; unsubscribeUrl?: string; headline?: string }) {
  const hi = opts.lang === "hi";
  const n = opts.items.length;
  const subject = opts.headline ?? (hi ? `Nazar: ${opts.portfolioName} में ${n} ज़रूरी ${n === 1 ? "बदलाव" : "बदलाव"}` : `Nazar: ${n} ${n === 1 ? "thing" : "things"} worth knowing about ${opts.portfolioName}`);
  const rows = opts.items
    .map(
      (it) => `<tr><td style="padding:16px 0;border-top:1px solid ${C.line}">
<div style="font-weight:600;color:${C.ink};font-size:16px"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${sevDot(it.severity)};margin-right:8px;vertical-align:middle"></span>${it.simulated ? `<span style="font-size:11px;letter-spacing:1px;color:${C.muted}">${hi ? "सिमुलेशन · " : "SIMULATION · "}</span>` : ""}${esc(it.title)}</div>
<div style="margin-top:6px;color:${C.text}">${esc(it.body)}</div>
<div style="margin-top:10px;font-size:13px"><a href="${esc(it.link)}" style="color:${C.blue};text-decoration:none;font-weight:600">${hi ? "पूरी जानकारी देखें →" : "See the full picture →"}</a>${it.usefulUrl ? `<span style="color:${C.muted}"> &nbsp;·&nbsp; ${hi ? "काम का था?" : "Useful?"} <a href="${esc(it.usefulUrl)}" style="color:${C.gain};text-decoration:none">${hi ? "हाँ" : "Yes"}</a> / <a href="${esc(it.notUsefulUrl!)}" style="color:${C.loss};text-decoration:none">${hi ? "नहीं" : "No"}</a></span>` : ""}</div>
</td></tr>`,
    )
    .join("");
  const intro = hi ? `<b>${esc(opts.portfolioName)}</b> के लिए आज की ज़रूरी बातें:` : `Here's what's worth knowing about <b>${esc(opts.portfolioName)}</b> today:`;
  const html = layout({
    lang: opts.lang,
    preheader: opts.items[0]?.title ?? subject,
    body: `<p style="margin:0 0 6px">${intro}</p><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table><div style="margin-top:18px">${button(opts.appLink, hi ? "Nazar खोलें" : "Open Nazar")}</div>`,
    footer: opts.unsubscribeUrl ? `<a href="${esc(opts.unsubscribeUrl)}" style="color:${C.muted}">${hi ? "ये ईमेल बंद करें" : "Stop these emails"}</a><br>` : "",
  });
  const text = `${hi ? `${opts.portfolioName} के लिए आज:` : `Today in ${opts.portfolioName}:`}\n\n${opts.items.map((i) => `• ${i.simulated ? "[SIMULATION] " : ""}${i.title}\n  ${i.body}\n  ${i.link}`).join("\n\n")}`;
  return { subject, text, html };
}

/* ------------------------------------------------------------------ */
/* Weekly report                                                       */
/* ------------------------------------------------------------------ */

export function reportEmail(opts: { lang: Lang; subject: string; sections: { heading: string; lines: string[] }[]; link: string; unsubscribeUrl?: string }) {
  const hi = opts.lang === "hi";
  const body = opts.sections
    .map((s) => `<h3 style="margin:22px 0 8px;font-size:13px;letter-spacing:0.6px;text-transform:uppercase;color:${C.muted}">${esc(s.heading)}</h3>${s.lines.map((l) => `<p style="margin:0 0 8px">${esc(l)}</p>`).join("")}`)
    .join("");
  const html = layout({
    lang: opts.lang,
    preheader: opts.sections[0]?.lines[0] ?? opts.subject,
    body: `${body}<div style="margin-top:22px">${button(opts.link, hi ? "पूरी रिपोर्ट देखें" : "Open the full report")}</div>`,
    footer: opts.unsubscribeUrl ? `<a href="${esc(opts.unsubscribeUrl)}" style="color:${C.muted}">${hi ? "ये ईमेल बंद करें" : "Stop these emails"}</a><br>` : "",
  });
  const text = opts.sections.map((s) => `${s.heading}\n${s.lines.map((l) => `- ${l}`).join("\n")}`).join("\n\n") + `\n\n${opts.link}`;
  return { subject: opts.subject, text, html };
}
