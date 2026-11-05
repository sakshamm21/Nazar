import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Inter, Noto_Sans_Devanagari, Sora } from "next/font/google";
import { Providers } from "@/components/providers";
import "./globals.css";

const sora = Sora({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-sora", display: "swap" });
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const plexMono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-plex-mono", display: "swap" });
const devanagari = Noto_Sans_Devanagari({ subsets: ["devanagari"], weight: ["400", "500", "600"], variable: "--font-devanagari", display: "swap" });

const SITE = process.env.NEXT_PUBLIC_SITE_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000");
const DESCRIPTION = "Track everything you own, from stocks and funds to gold, crypto and FDs, and see what your money did and why, in plain words. Free. No tips, no predictions.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: { default: "Nazar · Your portfolio, watched", template: "%s · Nazar" },
  description: DESCRIPTION,
  applicationName: "Nazar",
  manifest: "/manifest.webmanifest",
  openGraph: { type: "website", siteName: "Nazar", title: "Nazar · Your portfolio, watched", description: DESCRIPTION, locale: "en_IN" },
  twitter: { card: "summary_large_image", title: "Nazar · Your portfolio, watched", description: DESCRIPTION },
  icons: { icon: [{ url: "/icon.svg?v=rings", type: "image/svg+xml" }] },
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
    <html lang="en" data-theme="dark" suppressHydrationWarning className={`${sora.variable} ${inter.variable} ${plexMono.variable} ${devanagari.variable}`}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
