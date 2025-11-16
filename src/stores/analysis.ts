import { defineStore } from 'pinia'
import { ref } from 'vue'

export interface AnalysisResult {
  success: boolean
  persons: any[]
  full_text_transcription?: string
  raw_analysis?: string
  error?: string
  metadata?: {
    analysis_timestamp: string
    model_used: string
    confidence_level: string
  }
  timestamp: number
}

export const useAnalysisStore = defineStore('analysis', () => {
  // Store for pending analysis results
  const pendingResults = ref<Map<string, AnalysisResult>>(new Map())
  
  // Store for temporary plot ID mapping
  const tempPlotIdMapping = ref<string | null>(null)

  // Store analysis results
  const storeAnalysisResult = (tempPlotId: string, result: AnalysisResult) => {
    console.log('📦 AnalysisStore: Storing analysis result for temp plot ID:', tempPlotId)
    pendingResults.value.set(tempPlotId, result)
  }

  // Get analysis results
  const getAnalysisResult = (tempPlotId: string): AnalysisResult | undefined => {
    return pendingResults.value.get(tempPlotId)
  }

  // Check if analysis results exist
  const hasAnalysisResult = (tempPlotId: string): boolean => {
    return pendingResults.value.has(tempPlotId)
  }

  // Remove analysis results
  const removeAnalysisResult = (tempPlotId: string) => {
    console.log('🗑️ AnalysisStore: Removing analysis result for temp plot ID:', tempPlotId)
    pendingResults.value.delete(tempPlotId)
  }

  // Set temporary plot ID mapping
  const setTempPlotIdMapping = (plotId: string) => {
    console.log('🔗 AnalysisStore: Setting temp plot ID mapping:', plotId)
    tempPlotIdMapping.value = plotId
  }

  // Get temporary plot ID mapping
  const getTempPlotIdMapping = (): string | null => {
    return tempPlotIdMapping.value
  }

  // Clear temporary plot ID mapping
  const clearTempPlotIdMapping = () => {
    console.log('🔗 AnalysisStore: Clearing temp plot ID mapping')
    tempPlotIdMapping.value = null
  }

  // Clean up old analysis results (older than 10 minutes)
  const cleanupOldResults = () => {
    const now = Date.now()
    const tenMinutesAgo = now - (10 * 60 * 1000)
    
    for (const [tempPlotId, result] of pendingResults.value.entries()) {
      if (result.timestamp < tenMinutesAgo) {
        console.log('🧹 AnalysisStore: Cleaning up old analysis result:', tempPlotId)
        pendingResults.value.delete(tempPlotId)
      }
    }
  }

  // Check if analysis is pending for a plot
  const isAnalysisPending = (tempPlotId: string): boolean => {
    return pendingResults.value.has(tempPlotId)
  }

  // Get all pending analysis results
  const getAllPendingResults = (): Map<string, AnalysisResult> => {
    return pendingResults.value
  }

  // Clear all analysis results
  const clearAllResults = () => {
    console.log('🧹 AnalysisStore: Clearing all analysis results')
    pendingResults.value.clear()
    tempPlotIdMapping.value = null
  }

  return {
    // State
    pendingResults,
    tempPlotIdMapping,
    
    // Actions
    storeAnalysisResult,
    getAnalysisResult,
    hasAnalysisResult,
    removeAnalysisResult,
    setTempPlotIdMapping,
    getTempPlotIdMapping,
    clearTempPlotIdMapping,
    cleanupOldResults,
    isAnalysisPending,
    getAllPendingResults,
    clearAllResults
  }
})
