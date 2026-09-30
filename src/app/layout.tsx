import type { Metadata, Viewport } from "next";
import { Providers } from "@/components/Providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "Stock AI — Equity Research Copilot",
  description: "Conversational AI for equity research: live quotes, fundamentals, financial statements, DCF and analyst views rendered as interactive charts.",
};

export const viewport: Viewport = { themeColor: "#09090b" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
