declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}

// Global type declarations
declare global {
  interface Window {
    backgroundDownloader?: any
    powerSyncStore?: any
    clearAllData?: () => void
  }
} 