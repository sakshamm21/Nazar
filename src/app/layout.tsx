import type { Metadata, Viewport } from "next";
import { Big_Shoulders, DM_Serif_Display, Noto_Sans_Devanagari, Outfit, Space_Grotesk, Space_Mono } from "next/font/google";
import { Providers } from "@/components/providers";
import "./globals.css";

// Five voices: Big Shoulders (condensed capitals) for headlines, DM Serif italic for the one word that matters, Outfit for
// reading, Space Grotesk for every number, Space Mono for labels and tickers.
const shoulders = Big_Shoulders({ subsets: ["latin"], weight: ["700", "800", "900"], variable: "--font-shoulders", display: "swap" });
const serif = DM_Serif_Display({ subsets: ["latin"], style: ["italic"], weight: "400", variable: "--font-serif", display: "swap" });
const outfit = Outfit({ subsets: ["latin"], variable: "--font-outfit", display: "swap" });
const grotesk = Space_Grotesk({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-grotesk", display: "swap" });
const spaceMono = Space_Mono({ subsets: ["latin"], weight: ["400", "700"], variable: "--font-space-mono", display: "swap" });
const devanagari = Noto_Sans_Devanagari({ subsets: ["devanagari"], weight: ["400", "500", "600"], variable: "--font-devanagari", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Nazar · Your portfolio, watched", template: "%s · Nazar" },
  description: "Nazar watches your stocks every day and messages you only when something important happens, explaining what happened and why, in plain language.",
  applicationName: "Nazar",
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
    { media: "(prefers-color-scheme: light)", color: "#f2eee3" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning className={`${shoulders.variable} ${serif.variable} ${outfit.variable} ${grotesk.variable} ${spaceMono.variable} ${devanagari.variable}`}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
