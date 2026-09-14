import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

/** @type {import("eslint").Linter.Config[]} */
const eslintConfig = [
  // Global ignores must be first (own object) so FlatCompat configs never see them.
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      ".pnpm-store/**",
      "out/**",
      "build/**",
      "coverage/**",
      "data/**",
      "tmp/**",
      "public/**",
      "next-env.d.ts",
      "*.tsbuildinfo",
    ],
  },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
];

export default eslintConfig;
