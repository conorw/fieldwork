// Wrapper for @paddlejs-models/ocr that ensures module polyfill is available
// Use this instead of importing @paddlejs-models/ocr directly

// CRITICAL: Set up module polyfill BEFORE any code executes
// This must happen at module load time, not runtime
// Use var to ensure it's function-scoped and available everywhere
(function setupModulePolyfill() {
  'use strict';
  if (typeof module === 'undefined') {
    var module = { exports: {} };
    // Make it available globally
    try {
      (globalThis as any).module = module;
      if (typeof window !== 'undefined') {
        (window as any).module = module;
      }
      if (typeof global !== 'undefined') {
        (global as any).module = module;
      }
    } catch (e) {
      // Ignore errors in strict mode
    }
  }
})();

// Export a function that loads the OCR module with polyfill guaranteed
export async function loadPaddleOCRModule() {
  'use strict';
  // Double-check polyfill is set up - use var to ensure function scope
  if (typeof module === 'undefined') {
    var module = { exports: {} };
    try {
      (globalThis as any).module = module;
      if (typeof window !== 'undefined') {
        (window as any).module = module;
      }
      if (typeof global !== 'undefined') {
        (global as any).module = module;
      }
    } catch (e) {
      // Ignore errors
    }
  }
  
  // Use dynamic import to load the actual module
  // This ensures polyfill is set up before the module code executes
  const ocrModule = await import("@paddlejs-models/ocr");
  return ocrModule.default || ocrModule;
}
