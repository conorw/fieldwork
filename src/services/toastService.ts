// Toast notification service - consolidated to use PrimeVue Toast
// This service provides a consistent API for toast notifications throughout the app
// Can be used both in components (via useToastService composable) and in services

// Re-export ToastMessage type for backward compatibility (if needed by components)
export interface ToastMessage {
  readonly id: string
  readonly title: string
  readonly message: string
  readonly type: 'success' | 'error' | 'info' | 'warning'
  readonly duration?: number
  readonly actions?: readonly {
    readonly label: string
    readonly action: () => void
  }[]
}

type ToastAddFunction = (options: {
  severity: 'success' | 'error' | 'info' | 'warn'
  summary: string
  detail: string
  life?: number
}) => void

class ToastService {
  // Store a reference to PrimeVue's toast.add function
  // This allows the service to work outside component contexts
  private toastAdd: ToastAddFunction | null = null

  // Public getter to check if initialized (for fallback initialization)
  get isInitialized(): boolean {
    return this.toastAdd !== null
  }

  // Initialize toast instance (call this from App.vue or a root component)
  init(toastAdd: ToastAddFunction) {
    this.toastAdd = toastAdd
  }

  private addToast(severity: 'success' | 'error' | 'info' | 'warn', title: string, message: string, duration: number) {
    if (!this.toastAdd) {
      console.warn('ToastService: Not initialized. Call toastService.init() from App.vue setup.')
      return
    }
    this.toastAdd({
      severity,
      summary: title,
      detail: message,
      life: duration
    })
  }

  success(title: string, message: string, duration = 5000) {
    this.addToast('success', title, message, duration)
  }

  error(title: string, message: string, duration = 7000) {
    this.addToast('error', title, message, duration)
  }

  info(title: string, message: string, duration = 5000) {
    this.addToast('info', title, message, duration)
  }

  warning(title: string, message: string, duration = 5000) {
    this.addToast('warn', title, message, duration)
  }

  // Legacy methods for backward compatibility
  remove(_id: string) {
    // PrimeVue handles removal automatically
  }

  clear() {
    // PrimeVue doesn't have a clear method, but toasts auto-dismiss
  }

  // Specific method for headstone analysis completion
  headstoneAnalysisComplete(_plotId: string, personsCount: number) {
    if (personsCount > 0) {
      this.success(
        `Analysis Complete`,
        `Found ${personsCount} ${personsCount === 1 ? 'person' : 'persons'} buried in this plot`,
        6000
      )
    } else {
      this.info(
        `Analysis Complete`,
        `No persons found on this headstone`,
        5000
      )
    }
  }

  headstoneAnalysisFailed(errorMessage?: string) {
    this.error(
      `Analysis Failed`,
      errorMessage || 'Unable to analyze headstone image',
      7000
    )
  }

  headstoneAnalysisQueued() {
    this.info(
      `Analysis Queued`,
      `Headstone analysis will begin shortly`,
      3000
    )
  }
}

export const toastService = new ToastService()
