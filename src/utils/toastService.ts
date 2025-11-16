// Toast utility functions - consolidated to use PrimeVue Toast
// This composable provides a convenient interface for components
import { useToast } from 'primevue/usetoast'
import { toastService } from '../services/toastService'

// Toast utility functions - provides a composable interface for components
export const useToastService = () => {
  const toast = useToast()

  // Initialize the global toast service on first use (fallback)
  // This allows services to use toastService outside component contexts
  // Note: App.vue should initialize it in onMounted, but this is a fallback
  if (!toastService.isInitialized) {
    toastService.init(toast.add.bind(toast))
  }

  const showSuccess = (message: string, summary = 'Success') => {
    toast.add({
      severity: 'success',
      summary,
      detail: message,
      life: 3000
    })
  }

  const showError = (message: string, summary = 'Error') => {
    toast.add({
      severity: 'error',
      summary,
      detail: message,
      life: 5000
    })
  }

  const showInfo = (message: string, summary = 'Info') => {
    toast.add({
      severity: 'info',
      summary,
      detail: message,
      life: 3000
    })
  }

  const showWarning = (message: string, summary = 'Warning') => {
    toast.add({
      severity: 'warn',
      summary,
      detail: message,
      life: 4000
    })
  }

  return {
    showSuccess,
    showError,
    showInfo,
    showWarning
  }
}
