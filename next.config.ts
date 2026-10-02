import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@electric-sql/pglite", "yahoo-finance2", "pino"],
  // Hide the floating dev-mode badge (it overlaps the bottom tab bar in screenshots).
  devIndicators: false,
  // Pin the project root (a stray lockfile higher up the tree otherwise confuses Next's inference).
  outputFileTracingRoot: __dirname,
  // Bundled data files read at runtime by server code.
  outputFileTracingIncludes: { "/**": ["./src/data/**/*", "./drizzle/**/*"] },
  poweredByHeader: false,
};

export default nextConfig;
