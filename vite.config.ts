import { readFileSync } from "node:fs";
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import wasm from "vite-plugin-wasm";
import topLevelAwait from "vite-plugin-top-level-await";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import basicSsl from "@vitejs/plugin-basic-ssl";

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
    basicSsl({
      name: "fieldwork",
      domains: ["localhost", "127.0.0.1", "192.168.18.12"],
    }),
    insecureContextPlugin(),
    vue({
      features: {
        vapor: true, // Vue 3.6+: compile SFCs as Vapor unless they already have a vapor marker
      },
    }),
    tailwindcss(),
    wasm(),
    VitePWA({
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
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, // 5 MB limit
        // Explicitly include screenshots in precache manifest
        additionalManifestEntries: [
          { url: "/screenshots/map-view-wide.png", revision: null },
          { url: "/screenshots/settings-wide.png", revision: null },
          { url: "/screenshots/plot-detail-narrow.png", revision: null },
        ],
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
      // Polyfill for Node.js Buffer (required by PowerSync)
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
    minify: "esbuild", // Use esbuild for faster builds
  },
  optimizeDeps: {
    include: [
      "ol",
      "ol-ext",
      "buffer",
      "event-iterator",
      "primevue",
      "@primeuix/themes",
    ],
    exclude: [
      "@journeyapps/wa-sqlite",
      "@powersync/web",
      "@huggingface/transformers",
    ],
    esbuildOptions: {
      // Handle CommonJS modules from event-iterator
      mainFields: ["browser", "module", "main"],
    },
  },
  worker: {
    format: "es",
    plugins: () => [insecureContextPlugin(), wasm(), topLevelAwait()],
  },
  esbuild: {
    target: "esnext",
    supported: {
      "top-level-await": true,
    },
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
