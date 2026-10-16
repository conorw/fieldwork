import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));

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
      "@": path.resolve(root, "src"),
      vue: path.resolve(root, "src/compat/vue.svelte.ts"),
      pinia: path.resolve(root, "src/compat/pinia.svelte.ts"),
      "vue-router": path.resolve(root, "src/compat/router.ts"),
      "@vueuse/core": path.resolve(root, "src/compat/vueuse.svelte.ts"),
      "primevue/usetoast": path.resolve(root, "src/compat/usetoast.ts"),
    },
  },
});
