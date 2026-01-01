import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import wasm from "vite-plugin-wasm";
import topLevelAwait from "vite-plugin-top-level-await";
// import vercel from "vite-plugin-vercel"; // Temporarily disabled - doesn't support Vite 7 yet
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    vue(),
    tailwindcss(),
    wasm(),
    // vercel(), // Temporarily disabled - vite-plugin-vercel@9.1.1 doesn't support Vite 7
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icons/**/*", "fonts/**/*", "screenshots/**/*"],
      manifest: {
        name: "FieldWork - Cemetery Plot Management",
        short_name: "FieldWork",
        description: "Professional cemetery plot documentation and field data collection app. Create, manage, and document cemetery plots with offline-first capabilities, GPS integration, and comprehensive plot management tools.",
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
            purpose: "any"
          },
          {
            src: "/icons/icon-96x96.png",
            sizes: "96x96",
            type: "image/png",
            purpose: "any"
          },
          {
            src: "/icons/icon-128x128.png",
            sizes: "128x128",
            type: "image/png",
            purpose: "any"
          },
          {
            src: "/icons/icon-144x144.png",
            sizes: "144x144",
            type: "image/png",
            purpose: "any"
          },
          {
            src: "/icons/icon-152x152.png",
            sizes: "152x152",
            type: "image/png",
            purpose: "any"
          },
          {
            src: "/icons/icon-192x192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any"
          },
          {
            src: "/icons/icon-192x192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "maskable"
          },
          {
            src: "/icons/icon-384x384.png",
            sizes: "384x384",
            type: "image/png",
            purpose: "any"
          },
          {
            src: "/icons/icon-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any"
          },
          {
            src: "/icons/icon-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable"
          }
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
                type: "image/png"
              }
            ]
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
                type: "image/png"
              }
            ]
          }
        ],
        screenshots: [
          {
            src: "/screenshots/map-view-wide.png",
            sizes: "1280x720",
            type: "image/png",
            form_factor: "wide",
            label: "Interactive map view with plot management tools"
          },
          {
            src: "/screenshots/settings-wide.png",
            sizes: "1280x720",
            type: "image/png",
            form_factor: "wide",
            label: "Settings and configuration panel"
          },
          {
            src: "/screenshots/plot-detail-narrow.png",
            sizes: "640x1136",
            type: "image/png",
            form_factor: "narrow",
            label: "Mobile plot detail view with management tools"
          }
        ]
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
                maxAgeSeconds: 60 * 60 * 24 * 30 // 30 days
              }
            }
          }
        ]
      },
      devOptions: {
        enabled: true,
        type: "module"
      }
    })
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
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          // Split node_modules into separate chunks
          if (id.includes("node_modules")) {
            // Large libraries get their own chunks
            if (id.includes("ol")) {
              return "openlayers";
            }
            if (id.includes("ol-ext")) {
              return "ol-extensions";
            }
            if (id.includes("@powersync")) {
              return "powersync";
            }
            if (id.includes("@supabase")) {
              return "supabase";
            }
            if (id.includes("@xenova/transformers")) {
              return "transformers";
            }
            // Split PrimeVue into its own chunk for better caching
            // cx function is now globally available and protected, so this is safe
            if (id.includes("primevue") || id.includes("@primeuix")) {
              return "primevue";
            }
            // Other node_modules go into vendor chunk
            return "vendor";
          }
        },
        // Preserve function names to help with debugging and prevent minification issues
        format: "es",
      },
      // Preserve cx function from being minified/removed
      treeshake: {
        preset: "smallest",
        propertyReadSideEffects: false,
        tryCatchDeoptimization: false,
      },
    },
  },
  optimizeDeps: {
    include: [
      "ol",
      "ol-ext",
      "@powersync/web > js-logger",
      "buffer",
      "event-iterator",
      "primevue",
      "@primeuix/themes",
    ],
    exclude: ["@journeyapps/wa-sqlite", "@powersync/web"],
    esbuildOptions: {
      // Handle CommonJS modules from event-iterator
      mainFields: ["browser", "module", "main"],
    },
  },
  worker: {
    format: "es",
    plugins: () => [wasm(), topLevelAwait()],
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
  },
});
