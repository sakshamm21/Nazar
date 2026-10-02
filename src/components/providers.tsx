"use client";
import { ThemeProvider } from "next-themes";
import type { ReactNode } from "react";
import { Toaster } from "sonner";

/** Dark by default (DESIGN.md); light is a user choice in Settings or on /design. */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider attribute="data-theme" defaultTheme="dark" enableSystem={false} themes={["dark", "light"]} disableTransitionOnChange>
      {children}
      <Toaster
        position="top-center"
        toastOptions={{
          style: { background: "var(--surface-1)", color: "var(--text)", border: "1px solid var(--line)", borderRadius: 14, boxShadow: "var(--shadow-pop)", fontFamily: "var(--font-sans)" },
        }}
      />
    </ThemeProvider>
  );
}
