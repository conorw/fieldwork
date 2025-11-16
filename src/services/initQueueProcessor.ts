// Initialize the headstone analysis queue processor globally
import { setupOnlineQueueProcessor } from './headstoneAnalysisQueue'

let queueProcessorInitialized = false

export const initializeHeadstoneAnalysisQueue = () => {
  if (queueProcessorInitialized) {
    console.log('🔍 HeadstoneAnalysisQueue: Already initialized')
    return
  }

  console.log('🔍 HeadstoneAnalysisQueue: Initializing global queue processor')
  
  const processor = setupOnlineQueueProcessor()
  queueProcessorInitialized = true
  
  return processor
}

// Auto-initialize when this module is imported
initializeHeadstoneAnalysisQueue()
