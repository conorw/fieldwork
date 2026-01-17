// Shim module to provide CommonJS 'module' polyfill for @paddlejs-models/ocr
// This must be imported before @paddlejs-models/ocr

// Create module polyfill if it doesn't exist
if (typeof module === 'undefined') {
  (globalThis as any).module = { exports: {} };
}

// Export the polyfill so it's available globally
export const modulePolyfill = (globalThis as any).module;
