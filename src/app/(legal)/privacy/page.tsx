import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/legal/legal-page";

export const metadata: Metadata = { title: "Privacy", description: "What Nazar stores, who else sees any of it, and how to delete it." };

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy" updated="6 November 2026">
      <p>Nazar keeps what you enter so it can show it back to you and explain it. Your data is never traded or shared for advertising, and Nazar never changes anything in your accounts elsewhere: it cannot see your broker, your bank or your demat account.</p>
      <h2>What is stored</h2>
      <ul>
        <li><strong>Your account:</strong> your name, email address and a one-way hash of your password (never the password itself).</li>
        <li><strong>What you enter:</strong> portfolios, holdings, each purchase and sale, income, SIPs, savings goals, your Watching list, dashboards and your preferences.</li>
        <li><strong>Ask:</strong> your conversations, and for each answer which tools it used, how long it took and what it cost, kept for 90 days to check the quality of answers.</li>
        <li><strong>Usage:</strong> which screens are opened and which features are used, tied to your account, to see what is useful. Your network address is kept only as a one-way hash, for rate limits.</li>
      </ul>
      <h2>Who else sees any of it</h2>
      <ul>
        <li><strong>Market data</strong> comes from Yahoo Finance, AMFI and mfapi.in. They are asked for prices by symbol only; nothing about you is sent.</li>
        <li><strong>Ask</strong> sends your question, and the parts of your portfolio the answer needs, to the AI model that answers it, through OpenRouter. The You page says which model that is. When importing a file, only the names of rows Nazar could not match are sent, never quantities or prices.</li>
        <li><strong>Email</strong> is sent through Brevo: the code that confirms your address, a password reset link, and the weekly summary only if you switch it on.</li>
        <li><strong>Hosting:</strong> the app runs on Vercel and the database on Neon, both in the United States.</li>
        <li><strong>A shared Ask link</strong> shows that conversation to anyone with the link, with your own holdings left out. You can stop sharing it at any time.</li>
      </ul>
      <h2>Cookies and your browser</h2>
      <p>A sign-in cookie keeps you signed in, and a small one remembers which portfolio you last looked at. Your browser also keeps a few choices (the theme, Ask&apos;s model). There are no advertising or tracking cookies.</p>
      <h2>Deleting it</h2>
      <p>Delete your account on the You page and everything above that belongs to it is deleted with it. You can download a copy of what you entered first, from the same page. A demo started with &ldquo;Try the demo&rdquo; is deleted 24 hours after it starts.</p>
      <h2>Questions</h2>
      <p>See the <Link href="/contact">contact page</Link>.</p>
    </LegalPage>
  );
}
