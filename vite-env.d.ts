/// <reference types="vite/client" />

// Buffer polyfill for Node.js compatibility
declare global {
  interface Window {
    Buffer: typeof import('buffer').Buffer
  }
  var Buffer: typeof import('buffer').Buffer
}

interface ImportMetaEnv {
  readonly VITE_ZERO_SERVER: string
  readonly VITE_POWERSYNC_URL: string
  readonly VITE_POWERSYNC_DEV_TOKEN: string
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  // Add more env variables here as needed
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
