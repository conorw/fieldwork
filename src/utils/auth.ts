/**
 * Get the correct redirect URL for authentication callbacks
 * Uses window.location.origin in the browser, or an environment variable override
 */
export function getAuthRedirectUrl(): string {
  // Allow override via environment variable for production builds
  const envRedirectUrl = import.meta.env.VITE_AUTH_REDIRECT_URL
  
  if (envRedirectUrl) {
    return envRedirectUrl
  }
  
  // In browser, use current origin
  if (typeof window !== 'undefined') {
    return `${window.location.origin}/auth/callback`
  }
  
  // Fallback (shouldn't happen in browser context)
  throw new Error('Unable to determine redirect URL')
}

