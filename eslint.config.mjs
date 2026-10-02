import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = [
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Yahoo payloads are untyped; a few `any`s at the provider boundary are deliberate.
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  { ignores: ["node_modules/**", ".next/**", "out/**", "build/**", "next-env.d.ts", "playwright-report/**", "test-results/**"] },
];

export default eslintConfig;
