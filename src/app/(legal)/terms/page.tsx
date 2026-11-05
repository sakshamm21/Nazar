import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/legal/legal-page";

export const metadata: Metadata = { title: "Terms", description: "The terms for using Nazar." };

export default function TermsPage() {
  return (
    <LegalPage title="Terms of use" updated="6 November 2026">
      <p>By using Nazar you agree to these terms. If you do not, please do not use it.</p>
      <h2>What Nazar is, and is not</h2>
      <p>Nazar tracks what you own and explains what it did, from arithmetic over market data. <strong>It is not a SEBI-registered investment adviser or research analyst, and nothing in it is investment, tax or legal advice.</strong> It never recommends a trade. Decisions about your money are yours; for advice, speak to a registered adviser.</p>
      <h2>The figures</h2>
      <ul>
        <li>Prices and fund NAVs come from free third-party sources and can be delayed, missing or wrong.</li>
        <li>Values, returns and gains depend on what you enter. Nazar cannot check them against your broker.</li>
        <li>Capital gains and tax figures are indicative calculations from the published rates. They leave out surcharge and losses carried from earlier years, and do not replace a tax filer.</li>
        <li>Ask&apos;s answers are written by an AI model. They are checked by code, and can still be incomplete or wrong.</li>
      </ul>
      <h2>Your account</h2>
      <p>Keep your password to yourself, and use Nazar only for your own money or money you are allowed to track. Don&apos;t try to reach other people&apos;s data, overload the service or get around its limits. Accounts that do can be closed.</p>
      <h2>The service</h2>
      <p>Nazar is free and provided as it is, without any warranty. It may change, pause or stop, and features may be added or removed. To the extent the law allows, its makers are not liable for losses from using it or relying on it.</p>
      <h2>Changes</h2>
      <p>These terms may be updated; the date above says when they last changed. See also the <Link href="/privacy">privacy page</Link>.</p>
    </LegalPage>
  );
}
