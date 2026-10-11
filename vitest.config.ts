import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.spec.ts"],
    // clip.spec.ts hits a live Worker; it only runs when named explicitly (`npm run test:clip`).
    exclude: process.argv.some((arg) => arg.includes("clip.spec"))
      ? []
      : ["tests/clip.spec.ts"],
    globals: false,
    clearMocks: true,
    restoreMocks: true,
    testTimeout: 15_000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
