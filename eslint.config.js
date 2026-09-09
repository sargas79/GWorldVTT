import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/**", "coverage/**", "node_modules/**", "design/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-non-null-assertion": "off",
    },
  },
  {
    // The integration layer talks to Foundry documents, which ship no types.
    // `any` is the honest annotation at that boundary; the pure rules engine
    // under src/rules stays fully typed and keeps the rule on.
    files: ["src/system/**/*.ts", "src/gworld.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  {
    // Foundry ships no official types, so the ambient declarations deliberately
    // use `any` where the real API surface is untyped or too large to mirror.
    files: ["**/*.d.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unsafe-function-type": "off",
      "no-var": "off",
    },
  },
  {
    // Build tooling runs under Node, not in the Foundry browser context.
    files: ["tools/**/*.mjs"],
    languageOptions: {
      globals: { console: "readonly", process: "readonly" },
    },
  },
);
