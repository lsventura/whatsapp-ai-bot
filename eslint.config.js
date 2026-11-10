import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", "node_modules", "coverage", "profitchart-ntsl"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/consistent-type-imports": "error",
    },
  },
  {
    // scripts utilitários em Node puro (.mjs)
    files: ["scripts/**/*.mjs"],
    languageOptions: { globals: { console: "readonly", fetch: "readonly", process: "readonly" } },
  },
);
