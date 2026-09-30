import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@electric-sql/pglite", "yahoo-finance2"],
  eslint: { ignoreDuringBuilds: true },
  // Hide the floating dev-mode badge (it overlaps the sidebar footer in demos/screenshots).
  devIndicators: false,
  // Pin the project root (a stray lockfile higher up the tree otherwise confuses Next's inference).
  outputFileTracingRoot: __dirname,
};

export default nextConfig;
