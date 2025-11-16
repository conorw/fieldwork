import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import wasm from "vite-plugin-wasm";
import topLevelAwait from "vite-plugin-top-level-await";
import vercel from 'vite-plugin-vercel';
// VitePWA import removed - plugin temporarily disabled

export default defineConfig({
  plugins: [
    vue(),
    wasm(),
    vercel()
    // VitePWA plugin temporarily disabled to fix service worker registration errors
    // Re-enable when service worker issues are resolved
  ],
  resolve: {
    alias: {
      '@': '/src',
      // Polyfill for Node.js Buffer (required by PowerSync)
      'buffer': 'buffer'
    },
    // Handle CommonJS modules from event-iterator
    mainFields: ['browser', 'module', 'main']
  },
  define: {
    // Make Buffer available globally
    'global': 'globalThis',
  },
  build: {
    target: 'esnext',
    rollupOptions: {
      output: {
        manualChunks: {
          openlayers: ['ol'],
          'ol-extensions': ['ol-ext']
        }
      }
    }
  },
  optimizeDeps: {
    include: ['ol', 'ol-ext', "@powersync/web > js-logger", 'buffer', 'event-iterator'],
    exclude: ["@journeyapps/wa-sqlite", "@powersync/web"],
    esbuildOptions: {
      // Handle CommonJS modules from event-iterator
      mainFields: ['browser', 'module', 'main']
    }
  },
  worker: {
    format: "es",
    plugins: () => [wasm(), topLevelAwait()],
  },
  esbuild: {
    target: 'esnext',
    supported: {
      'top-level-await': true
    }
  },
  server: {
    port: 3000,
    host: true
  }
})