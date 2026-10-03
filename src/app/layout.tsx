import type { Metadata, Viewport } from "next";
import { Figtree, Fraunces, IBM_Plex_Mono, Noto_Sans_Devanagari, Space_Grotesk, Syne } from "next/font/google";
import { Providers } from "@/components/providers";
import "./globals.css";

// Four voices: Syne for headlines, Fraunces italic for the one word that matters, Figtree for
// reading, Space Grotesk for every number. Plex Mono stays for tickers and codes.
const syne = Syne({ subsets: ["latin"], weight: ["600", "700", "800"], variable: "--font-syne", display: "swap" });
const fraunces = Fraunces({ subsets: ["latin"], style: ["italic"], weight: ["400", "500", "600"], variable: "--font-fraunces", display: "swap" });
const figtree = Figtree({ subsets: ["latin"], variable: "--font-figtree", display: "swap" });
const grotesk = Space_Grotesk({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-grotesk", display: "swap" });
const plexMono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-plex-mono", display: "swap" });
const devanagari = Noto_Sans_Devanagari({ subsets: ["devanagari"], weight: ["400", "500", "600"], variable: "--font-devanagari", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Nazar · Your portfolio, watched", template: "%s · Nazar" },
  description: "Nazar watches your stocks every day and messages you only when something important happens, explaining what happened and why, in plain language.",
  applicationName: "Nazar",
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0a0f1c" },
    { media: "(prefers-color-scheme: light)", color: "#f5f7fa" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning className={`${syne.variable} ${fraunces.variable} ${figtree.variable} ${grotesk.variable} ${plexMono.variable} ${devanagari.variable}`}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
