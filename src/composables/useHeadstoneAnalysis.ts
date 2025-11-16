// Composable for managing headstone analysis notifications and status
import { ref, onMounted, onUnmounted } from 'vue'

export interface HeadstoneAnalysisEvent {
  plotId: string
  imageId: string
  persons?: any[]
  metadata?: {
    analysis_timestamp: string
    model_used: string
    confidence_level: string
  }
  error?: string
}

export function useHeadstoneAnalysis() {
  const isAnalyzing = ref(false)
  const analysisResults = ref<Array<HeadstoneAnalysisEvent>>([])
  const currentAnalysis = ref<HeadstoneAnalysisEvent | null>(null)

  const eventHandlers = {
    'headstone-analysis-start': (event: CustomEvent) => {
      isAnalyzing.value = true
      currentAnalysis.value = event.detail
      console.log('🔍 Headstone analysis started:', event.detail)
    },

    'headstone-analysis-completed': (event: CustomEvent) => {
      isAnalyzing.value = false
      currentAnalysis.value = null
      analysisResults.value.push(event.detail)
      console.log('✅ Headstone analysis completed:', event.detail)
      
      // Show success notification
      showNotification('Headstone Analysis Complete', 
        `Successfully analyzed headstone and created ${event.detail.persons?.length || 0} person(s)`, 
        'success'
      )
    },

    'headstone-analysis-failed': (event: CustomEvent) => {
      isAnalyzing.value = false
      currentAnalysis.value = null
      console.warn('❌ Headstone analysis failed:', event.detail)
      
      // Show error notification
      showNotification('Headstone Analysis Failed', 
        event.detail.error || 'Unknown error occurred during analysis', 
        'error'
      )
    },

    'headstone-analysis-error': (event: CustomEvent) => {
      isAnalyzing.value = false
      currentAnalysis.value = null
      console.error('💥 Headstone analysis error:', event.detail)
      
      // Show error notification
      showNotification('Headstone Analysis Error', 
        event.detail.error || 'An unexpected error occurred', 
        'error'
      )
    }
  }

  const showNotification = (title: string, message: string, type: 'success' | 'error' | 'info' = 'info') => {
    // You can integrate with your preferred notification system here
    // For now, we'll use browser notifications (requires user permission)
    
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, {
        body: message,
        icon: type === 'success' ? '/icons/icon-192x192.png' : '/icons/icon-192x192.png'
      })
    } else if ('Notification' in window && Notification.permission !== 'denied') {
      Notification.requestPermission().then(permission => {
        if (permission === 'granted') {
          new Notification(title, {
            body: message,
            icon: type === 'success' ? '/icons/icon-192x192.png' : '/icons/icon-192x192.png'
          })
        }
      })
    } else {
      // Fallback to console
      console.log(`[${type.toUpperCase()}] ${title}: ${message}`)
    }
  }

  const getAnalysisResultsForPlot = (plotId: string) => {
    return analysisResults.value.filter(result => result.plotId === plotId)
  }

  const clearAnalysisResults = () => {
    analysisResults.value = []
  }

  const getLatestAnalysisForPlot = (plotId: string) => {
    const results = getAnalysisResultsForPlot(plotId)
    let latest = results[results.length - 1]
    
    if (!latest && currentAnalysis.value?.plotId === plotId) {
      latest = currentAnalysis.value
    }
    
    return latest
  }

  onMounted(() => {
    // Register event listeners
    Object.entries(eventHandlers).forEach(([eventName, handler]) => {
      window.addEventListener(eventName, handler as EventListener)
    })
  })

  onUnmounted(() => {
    // Clean up event listeners
    Object.entries(eventHandlers).forEach(([eventName, handler]) => {
      window.removeEventListener(eventName, handler as EventListener)
    })
  })

  return {
    // Reactive state
    isAnalyzing,
    analysisResults,
    currentAnalysis,
    
    // Methods
    getAnalysisResultsForPlot,
    clearAnalysisResults,
    getLatestAnalysisForPlot,
    showNotification
  }
}
