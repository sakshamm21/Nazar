/**
 * Email templates (HTML + plain text) in English and Hindi. Table layout and inline styles so they
 * render in Gmail/Outlook; light background because most mail clients force it anyway.
 */
import { DISCLAIMER } from "@/lib/guard";

type Lang = "en" | "hi";
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const C = { ink: "#0A0F1C", text: "#1B2335", muted: "#5A6478", line: "#E3E8F0", bg: "#F5F7FA", card: "#FFFFFF", blue: "#2B54F0", gain: "#0F7A66", loss: "#C2412D" };

const ring = `<table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="width:24px;height:24px;border-radius:7px;background:${C.blue};text-align:center;vertical-align:middle;font:700 14px/24px Arial,sans-serif;color:#ffffff">N</td><td style="padding-left:8px;font:600 16px/1 Arial,sans-serif;color:${C.ink};letter-spacing:-0.2px">Nazar</td></tr></table>`;

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
};
