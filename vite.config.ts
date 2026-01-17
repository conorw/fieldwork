import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import wasm from "vite-plugin-wasm";
import topLevelAwait from "vite-plugin-top-level-await";
// import vercel from "vite-plugin-vercel"; // Temporarily disabled - doesn't support Vite 7 yet
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Plugin to inject CommonJS 'module' polyfill for @paddlejs-models/ocr
const modulePolyfillPlugin = () => ({
  name: "module-polyfill",
  enforce: 'pre' as const, // Run before other plugins
  transformIndexHtml(html: string) {
    // Inject polyfill as the VERY FIRST script, before any module scripts
    return html.replace(
      /<head>/i,
      `<head>
    <script>
      // CRITICAL: CommonJS 'module' polyfill - MUST be first, before any modules load
      // This is required by @paddlejs-models/ocr which uses CommonJS
      (function() {
        if (typeof module === 'undefined') {
          var module = { exports: {} };
          if (typeof globalThis !== 'undefined') globalThis.module = module;
          if (typeof window !== 'undefined') window.module = module;
          if (typeof global !== 'undefined') global.module = module;
        }
      })();
    </script>`
    );
  },
  // Load hook runs before transform - inject polyfill here
  load(id: string) {
    // Match @paddlejs-models/ocr files (including optimized versions)
    if (id.includes('@paddlejs-models/ocr') || 
        id.includes('paddlejs-models') || 
        id.includes('paddlejs-models_ocr')) {
      // Return null to let Vite load the file normally, then transform will handle it
      return null;
    }
    return null;
  },
  // Transform code to inject module polyfill at the top of modules that need it
  transform(code: string, id: string) {
    // Match @paddlejs-models/ocr files (including optimized versions with underscores)
    // The optimized file is named @paddlejs-models_ocr.js (with underscore)
    if (id.includes('@paddlejs-models/ocr') || 
        id.includes('@paddlejs-models_ocr') ||
        id.includes('paddlejs-models') || 
        id.includes('paddlejs-models_ocr') ||
        id.includes('node_modules/@paddlejs-models/ocr') ||
        id.includes('.vite/deps/@paddlejs-models_ocr')) {
      console.log(`[module-polyfill] Transforming file: ${id.substring(id.length - 100)}`);
      
      // CRITICAL: The code uses both 'module' (lowercase) and 'Module' (capital M)
      // The error "Module is not defined" shows we need to polyfill Module (capital M) too
      let transformedCode = code;
      
      // Fix: Replace the pattern that checks for Module and ensure it's available
      // Pattern: "undefined" == typeof Module && (Module = {})
      transformedCode = transformedCode.replace(
        /"undefined"\s*==\s*typeof\s+Module\s*&&\s*\(Module\s*=\s*\{\}\)/g,
        '(typeof Module !== "undefined" ? Module : (Module = typeof module !== "undefined" ? module : {}))'
      );
      
      // Inject polyfill for both module and Module at the top
      if (!transformedCode.includes('var module') && 
          !transformedCode.includes('let module') && 
          !transformedCode.includes('const module') &&
          !transformedCode.trim().startsWith('if(typeof module')) {
        const polyfill = `if(typeof module==='undefined'){var module={exports:{}};if(typeof globalThis!=='undefined')globalThis.module=module;if(typeof window!=='undefined')window.module=module;}if(typeof Module==='undefined'){var Module=module||{exports:{}};if(typeof globalThis!=='undefined')globalThis.Module=Module;if(typeof window!=='undefined')window.Module=Module;}`;
        transformedCode = `${polyfill}\n${transformedCode}`;
        console.log(`[module-polyfill] Injected polyfill for both module and Module`);
        return {
          code: transformedCode,
          map: null
        };
      } else if (transformedCode !== code) {
        console.log(`[module-polyfill] Fixed Module references`);
        return {
          code: transformedCode,
          map: null
        };
      } else {
        console.log(`[module-polyfill] Polyfill already present`);
      }
    }
    return null;
  },
});

export default defineConfig({
  plugins: [
    modulePolyfillPlugin(), // Must be first to inject polyfill early
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
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff,woff2,onnx,txt}"],
        maximumFileSizeToCacheInBytes: 20 * 1024 * 1024, // 20 MB limit (for OCR models)
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
      "@": path.resolve(__dirname, "./src"),
      // Polyfill for Node.js Buffer (required by PowerSync)
      buffer: "buffer",
    },
    // Handle CommonJS modules from event-iterator and Paddle.js
    mainFields: ["browser", "module", "main"],
  },
  define: {
    // Make Buffer available globally
    global: "globalThis",
    // CRITICAL: Define module globally so CommonJS code can access it
    // This replaces all references to 'module' with a global module object
    // However, this might break things, so we'll use a plugin instead
  },
  build: {
    target: "esnext",
    chunkSizeWarningLimit: 2000, // Increase warning limit to 2MB (vendor chunk can be large)
    minify: "esbuild", // Use esbuild for faster builds
    commonjsOptions: {
      // Transform CommonJS modules that use 'module' variable (required by @paddlejs-models/ocr)
      transformMixedEsModules: true,
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
      "@paddlejs-models/ocr",
      "@paddlejs/paddlejs-core",
      "@paddlejs/paddlejs-backend-webgl",
      // Note: @paddlejs-mediapipe/opencv is excluded because it has an invalid main entry (directory instead of file)
      // It will be handled as a transitive dependency by Paddle.js packages
    ],
    exclude: [
      "@journeyapps/wa-sqlite", 
      "@powersync/web",
      "@paddlejs-mediapipe/opencv", // Exclude due to invalid package.json main field
    ],
    esbuildOptions: {
      // Handle CommonJS modules from event-iterator and Paddle.js
      mainFields: ["browser", "module", "main"],
      // Inject comprehensive module polyfill during pre-bundling
      // CRITICAL: Must polyfill both 'module' (lowercase) and 'Module' (capital M)
      // The code at line 3170 checks for 'Module' (capital M), not 'module'
      banner: {
        js: `if(typeof module==='undefined'){var module={exports:{}};if(typeof globalThis!=='undefined')globalThis.module=module;if(typeof window!=='undefined')window.module=module;}if(typeof Module==='undefined'){var Module=typeof module!=='undefined'?module:{exports:{}};if(typeof globalThis!=='undefined')globalThis.Module=Module;if(typeof window!=='undefined')window.Module=Module;}`,
      },
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
