import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import tsParser from "@typescript-eslint/parser";
import globals from "globals";

export default [
  js.configs.recommended,
  {
    files: ["**/*.{js,mjs,cjs}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
    },
  },
  {
    files: ["**/*.ts"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
      },
    },
  },
  {
    files: ["**/*.{js,mjs,cjs,ts}"],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.es2021,
      },
    },
  },
  prettier,
  {
    ignores: [
      "node_modules/**",
      "dist/**",
      "dist-ssr/**",
      "build/**",
      "out/**",
      "coverage/**",
      ".cache/**",
      ".svelte-kit/**",
      ".vite/**",
      "*.local",
      ".vercel/**",
      "bin/**",
    ],
  },
];
