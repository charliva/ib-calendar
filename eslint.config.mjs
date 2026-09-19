import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Replaces the default ignores of eslint-config-next, which this config
  // would otherwise drop. Everything here is generated output or scratch state,
  // never hand-edited source.
  globalIgnores([
    ".next/**",
    ".unlazy/**",
    ".vinext/**",
    ".wrangler/**",
    "dist/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
