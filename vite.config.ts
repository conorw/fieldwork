import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import adapter from "@sveltejs/adapter-static";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vite";
import { sveltekit } from "@sveltejs/kit/vite";
import wasm from "vite-plugin-wasm";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import basicSsl from "@vitejs/plugin-basic-ssl";

const projectRoot = dirname(fileURLToPath(import.meta.url));

/** Wrangler keeps `dist` open locally; adapter-static cannot `rmSync` it. */
function adapterWriteThroughDist(
  options: Parameters<typeof adapter>[0],
) {
  const staging = resolve(projectRoot, ".svelte-kit/adapter-static");
  const dest = resolve(projectRoot, "dist");
  const inner = adapter({
    ...options,
    pages: staging,
    assets: staging,
  });
  return {
    name: inner.name,
    async adapt(builder: Parameters<NonNullable<typeof inner.adapt>>[0]) {
      await inner.adapt(builder);
      mkdirSync(dest, { recursive: true });
      for (const name of readdirSync(staging)) {
        cpSync(join(staging, name), join(dest, name), {
          recursive: true,
          force: true,
        });
      }
    },
  };
}

/** Browser OCR files. Kept out of git; copied before Vite serves or builds. */
function copyOcrAssets() {
  const dest = resolve(projectRoot, "public/ocr");
  mkdirSync(dest, { recursive: true });
  const worker = resolve(projectRoot, "node_modules/tesseract.js/dist/worker.min.js");
  const coreDir = resolve(projectRoot, "node_modules/tesseract.js-core");
  const trained = resolve(projectRoot, "eng.traineddata");
  if (!existsSync(worker) || !existsSync(trained)) {
    throw new Error("OCR assets missing. Install tesseract.js and keep eng.traineddata in the project root.");
  }
  cpSync(worker, resolve(dest, "worker.min.js"));
  for (const name of [
    "tesseract-core-lstm.wasm.js",
    "tesseract-core-lstm.wasm",
    "tesseract-core-simd-lstm.wasm.js",
    "tesseract-core-simd-lstm.wasm",
    "tesseract-core-relaxedsimd-lstm.wasm.js",
    "tesseract-core-relaxedsimd-lstm.wasm",
  ]) {
    cpSync(resolve(coreDir, name), resolve(dest, name));
  }
  cpSync(trained, resolve(dest, "eng.traineddata"));
}

function ocrAssetsPlugin() {
  return {
    name: "fieldwork-ocr-assets",
    buildStart() {
      copyOcrAssets();
    },
    configureServer() {
      copyOcrAssets();
    },
  };
}

const insecureContextSource = readFileSync(
  new URL("./src/utils/insecureContext.js", import.meta.url),
  "utf8",
);

/** PowerSync's database worker also calls these secure-context APIs. */
function insecureContextPlugin() {
  const resolved = "\0fieldwork-insecure-context";
  return {
    name: "fieldwork-insecure-context",
    enforce: "pre",
    resolveId(source) {
      if (source === "fieldwork-insecure-context") return resolved;
    },
    load(id) {
      if (id === resolved) return insecureContextSource;
    },
    transform(code, id) {
      const normalized = id.split("?")[0].replaceAll("\\", "/");
      if (
        !normalized.endsWith("/WASQLiteDB.worker.js") &&
        !normalized.endsWith("/SharedSyncImplementation.worker.js")
      ) {
        return null;
      }
      if (code.includes("fieldwork-insecure-context")) return null;
      return {
        code: `import "fieldwork-insecure-context";\n${code}`,
        map: null,
      };
    },
  };
}

export default defineConfig({
  plugins: [
    sveltekit({
      adapter: adapterWriteThroughDist({
        pages: "dist",
        assets: "dist",
        fallback: "index.html",
        strict: false,
      }),
      files: {
        assets: "public",
      },
      alias: {
        "@": "src",
        $lib: "src/lib",
      },
      paths: {
        relative: false,
      },
      preprocess: vitePreprocess(),
    }),
    basicSsl({
      name: "fieldwork",
      domains: ["localhost", "127.0.0.1", "192.168.18.12"],
    }),
    ocrAssetsPlugin(),
    insecureContextPlugin(),
    tailwindcss(),
    wasm(),
    VitePWA({
      // boot.ts registers the worker only on the production host.
      // An injected registerSW.js was re-registering a stale precache on localhost.
      injectRegister: null,
      registerType: "autoUpdate",
      includeAssets: ["icons/**/*", "fonts/**/*", "screenshots/**/*"],
      manifest: {
        name: "FieldWork - Cemetery Plot Management",
        short_name: "FieldWork",
        description:
          "Professional cemetery plot documentation and field data collection app. Create, manage, and document cemetery plots with offline-first capabilities, GPS integration, and comprehensive plot management tools.",
        theme_color: "#3b82f6",
        background_color: "#ffffff",
        display: "standalone",
        orientation: "any",
        scope: "/",
        start_url: "/",
        icons: [
          {
            src: "/icons/icon-72x72.png",
            sizes: "72x72",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/icons/icon-96x96.png",
            sizes: "96x96",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/icons/icon-128x128.png",
            sizes: "128x128",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/icons/icon-144x144.png",
            sizes: "144x144",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/icons/icon-152x152.png",
            sizes: "152x152",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/icons/icon-192x192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/icons/icon-192x192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "maskable",
          },
          {
            src: "/icons/icon-384x384.png",
            sizes: "384x384",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/icons/icon-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/icons/icon-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
        shortcuts: [
          {
            name: "Map View",
            short_name: "Map",
            description: "Interactive map for plot management",
            url: "/",
            icons: [
              {
                src: "/icons/icon-192x192.png",
                sizes: "192x192",
                type: "image/png",
              },
            ],
          },
          {
            name: "Settings",
            short_name: "Settings",
            description: "App settings and facility management",
            url: "/settings",
            icons: [
              {
                src: "/icons/icon-192x192.png",
                sizes: "192x192",
                type: "image/png",
              },
            ],
          },
        ],
        screenshots: [
          {
            src: "/screenshots/map-view-wide.png",
            sizes: "1280x720",
            type: "image/png",
            form_factor: "wide",
            label: "Interactive map view with plot management tools",
          },
          {
            src: "/screenshots/settings-wide.png",
            sizes: "1280x720",
            type: "image/png",
            form_factor: "wide",
            label: "Settings and configuration panel",
          },
          {
            src: "/screenshots/plot-detail-narrow.png",
            sizes: "640x1136",
            type: "image/png",
            form_factor: "narrow",
            label: "Mobile plot detail view with management tools",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff,woff2}"],
        globIgnores: ["**/ocr/**"],
        // The headstone worker and its ONNX runtime are larger than 5 MB.
        // Leave them out of the precache and an offline photo cannot start the model.
        maximumFileSizeToCacheInBytes: 25 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/.*\.(png|jpg|jpeg|svg|gif|webp)$/i,
            handler: "CacheFirst",
            options: {
              cacheName: "images-cache",
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
              },
            },
          },
          // Model hosts stay out of the service worker. Hugging Face answers
          // config.json with a relative redirect; a worker route resolves that
          // against this site and the loader parses the HTML app shell.
        ],
      },
      devOptions: {
        // A dev service worker caches Vue modules and kept serving the
        // broken Sign out tooltip after the source was fixed.
        enabled: false,
      },
    }),
  ],
  resolve: {
    alias: {
      "@": "/src",
      vue: resolve(projectRoot, "src/compat/vue.svelte.ts"),
      pinia: resolve(projectRoot, "src/compat/pinia.svelte.ts"),
      "vue-router": resolve(projectRoot, "src/compat/router.ts"),
      "@vueuse/core": resolve(projectRoot, "src/compat/vueuse.svelte.ts"),
      "primevue/usetoast": resolve(projectRoot, "src/compat/usetoast.ts"),
      buffer: "buffer",
    },
    // Handle CommonJS modules from event-iterator
    mainFields: ["browser", "module", "main"],
  },
  define: {
    // Make Buffer available globally
    global: "globalThis",
  },
  build: {
    target: "esnext",
    chunkSizeWarningLimit: 2000, // Increase warning limit to 2MB (vendor chunk can be large)
    minify: true,
  },
  optimizeDeps: {
    include: [
      "ol",
      "ol-ext",
      "buffer",
      "event-iterator",
    ],
    exclude: [
      "@journeyapps/wa-sqlite",
      "@powersync/web",
      "@huggingface/transformers",
      "tesseract.js",
    ],
  },
  worker: {
    format: "es",
    plugins: () => [insecureContextPlugin(), wasm()],
  },
  server: {
    port: 3000,
    host: true,
    proxy: {
      "/api": { target: "http://127.0.0.1:8787", changeOrigin: true },
      "/files": { target: "http://127.0.0.1:8787", changeOrigin: true },
    },
  },
});
