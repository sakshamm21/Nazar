import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/legal-page";

export const metadata: Metadata = { title: "Contact", description: "How to reach the people who make Nazar." };

const REPO = "https://github.com/sakshamm21/Nazar";

export default function ContactPage() {
  return (
    <LegalPage title="Contact">
      <p>Nazar is built in the open. The quickest way to reach us is an issue on GitHub: a bug, something that reads wrong, an idea, or a question about your data.</p>
      <p>
        <a href={`${REPO}/issues/new`}>Open an issue on GitHub</a>
      </p>
      <p>Please don&apos;t post anything private there, such as your holdings or email address: issues are public. Say which screen you were on and what you expected instead.</p>
      <p>About an answer in Ask, the thumbs up or down under it reaches us directly, with the answer attached.</p>
    </LegalPage>
  );
}
