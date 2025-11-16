// Service for managing queued headstone analysis tasks
import { toastService } from './toastService'

interface QueuedAnalysisTask {
  id: string
  photoData: string // Base64 image data
  fileName: string
  fileSize: number
  fileType: string
  plotId?: string // Will be set when plot is created, undefined if cancelled
  queueTimestamp: number
  attempts: number
}

interface QueueService {
  addTask: (photoData: string, fileName: string, fileSize: number, fileType: string) => string
  attachToPlot: (taskId: string, plotId: string) => void
  removeCancelledTasks: () => void
  processQueue: () => Promise<void>
  isQueueEmpty: () => boolean
  getQueueSize: () => number
}

class HeadstoneAnalysisQueueService implements QueueService {
  private queue: QueuedAnalysisTask[] = []
  private readonly STORAGE_KEY = 'headstone_analysis_queue'
  private readonly MAX_RETRIES = 3
  private readonly RETRY_DELAY = 5000 // 5 seconds between retries

  constructor() {
    this.loadQueueFromStorage()
  }

  /**
   * Add a new analysis task to the queue
   */
  addTask(photoData: string, fileName: string, fileSize: number, fileType: string): string {
    const taskId = `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    const task: QueuedAnalysisTask = {
      id: taskId,
      photoData,
      fileName,
      fileSize,
      fileType,
      queueTimestamp: Date.now(),
      attempts: 0
    }

    this.queue.push(task)
    this.saveQueueToStorage()

    console.log(`🔍 HeadstoneAnalysisQueue: Added task ${taskId} to queue. Queue size: ${this.queue.length}`)

    // Show queued toast notification
    toastService.headstoneAnalysisQueued()

    return taskId
  }

  /**
   * Attach a queued task to a created plot and trigger immediate processing
   */
  attachToPlot(taskId: string, plotId: string): void {
    const task = this.queue.find(t => t.id === taskId)
    if (task) {
      task.plotId = plotId
      this.saveQueueToStorage()
      console.log(`🔍 HeadstoneAnalysisQueue: Attached task ${taskId} to plot ${plotId}`)

      // Trigger immediate processing of this specific task
      this.processSpecificTask(task).catch(error => {
        console.error(`❌ HeadstoneAnalysisQueue: Error processing attached task ${taskId}:`, error)
      })
    }
  }

  /**
   * Remove cancelled tasks (without plotId) from the queue
   */
  removeCancelledTasks(): void {
    const initialSize = this.queue.length
    this.queue = this.queue.filter(task => task.plotId !== undefined)
    const removedCount = initialSize - this.queue.length

    if (removedCount > 0) {
      this.saveQueueToStorage()
      console.log(`🔍 HeadstoneAnalysisQueue: Removed ${removedCount} cancelled task(s) from queue`)
    }
  }

  /**
   * Process a specific task immediately
   */
  async processSpecificTask(task: QueuedAnalysisTask): Promise<void> {
    console.log(`🔍 HeadstoneAnalysisQueue: Processing specific task ${task.id} for plot ${task.plotId}`)

    if (!task.plotId) {
      console.log(`⚠️ HeadstoneAnalysisQueue: Task ${task.id} has no plot ID, skipping`)
      return
    }

    if (task.attempts >= this.MAX_RETRIES) {
      console.log(`⚠️ HeadstoneAnalysisQueue: Task ${task.id} exceeded max retries (${task.attempts}), removing`)
      this.queue = this.queue.filter(t => t.id !== task.id)
      this.saveQueueToStorage()
      return
    }

    try {
      await this.processTask(task)

      // Task completed successfully (marked as MAX_RETRIES in processTask), remove it
      this.queue = this.queue.filter(t => t.id !== task.id)
      this.saveQueueToStorage()
      console.log(`✅ HeadstoneAnalysisQueue: Task ${task.id} completed and removed`)

    } catch (error) {
      task.attempts++
      this.saveQueueToStorage()
      console.error(`❌ HeadstoneAnalysisQueue: Task ${task.id} failed (attempt ${task.attempts}/${this.MAX_RETRIES}):`, error)

      // Schedule retry if not exceeded
      if (task.attempts < this.MAX_RETRIES) {
        console.log(`🔄 HeadstoneAnalysisQueue: Scheduling retry for task ${task.id} in ${this.RETRY_DELAY}ms`)
        setTimeout(() => {
          this.processSpecificTask(task).catch(err => {
            console.error(`❌ HeadstoneAnalysisQueue: Retry failed for task ${task.id}:`, err)
          })
        }, this.RETRY_DELAY)
      }
    }
  }

  /**
   * Process all queued tasks that have plot IDs
   */
  async processQueue(): Promise<void> {
    const tasksToProcess = this.queue.filter(task => task.plotId && task.attempts < this.MAX_RETRIES)

    if (tasksToProcess.length === 0) {
      console.log('🔍 HeadstoneAnalysisQueue: No tasks to process')
      return
    }

    console.log(`🔍 HeadstoneAnalysisQueue: Processing ${tasksToProcess.length} task(s)...`)

    for (const task of tasksToProcess) {
      try {
        await this.processTask(task)
      } catch (error) {
        console.error(`❌ HeadstoneAnalysisQueue: Error processing task ${task.id}:`, error)
        task.attempts++
      }
    }

    // Remove completed/failed tasks
    this.queue = this.queue.filter(task =>
      !task.plotId || task.attempts >= this.MAX_RETRIES
    )

    this.saveQueueToStorage()
    console.log(`✅ HeadstoneAnalysisQueue: Queue processing complete. Remaining tasks: ${this.queue.length}`)
  }

  /**
   * Process a single task
   */
  private async processTask(task: QueuedAnalysisTask): Promise<void> {
    console.log(`🔍 HeadstoneAnalysisQueue: Processing task ${task.id} for plot ${task.plotId}`)

    if (!task.plotId) {
      throw new Error('Task has no plot ID')
    }

    // Convert base64 data back to File object
    const imageFile = this.base64ToFile(task.photoData, task.fileName, task.fileType)

    // Import and analyze the image
    console.log(`🔍 HeadstoneAnalysisQueue: Importing headstoneAnalysisService...`)
    const { headstoneAnalysisService } = await import('../utils/headstoneAnalysisService')

    console.log(`🔍 HeadstoneAnalysisQueue: About to analyze image for plot ${task.plotId}`)
    const result = await headstoneAnalysisService.analyzeHeadstoneImage(imageFile, task.plotId)

    console.log(`🔍 HeadstoneAnalysisQueue: Analysis result for task ${task.id}:`, {
      success: result.success,
      personsCount: result.persons?.length || 0,
      error: result.error
    })

    if (result.success && result.persons.length > 0) {
      console.log(`✅ HeadstoneAnalysisQueue: Successfully analyzed task ${task.id} - found ${result.persons.length} person(s)`)

      // Show success toast notification
      toastService.headstoneAnalysisComplete(task.plotId!, result.persons.length)

      // Task completed successfully, mark for removal
      task.attempts = this.MAX_RETRIES
    } else if (result.success && result.persons.length === 0) {
      console.log(`✅ HeadstoneAnalysisQueue: Successfully analyzed task ${task.id} - no persons found`)

      // Show info toast notification for no persons found
      toastService.headstoneAnalysisComplete(task.plotId!, 0)

      // Task completed successfully, mark for removal
      task.attempts = this.MAX_RETRIES
    } else {
      // Show error toast notification
      toastService.headstoneAnalysisFailed(result.error)

      throw new Error(result.error || 'Analysis failed')
    }
  }

  /**
   * Convert base64 data back to File object
   */
  private base64ToFile(base64Data: string, fileName: string, fileType: string): File {
    // Remove data URL prefix if present
    const base64 = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data

    // Convert base64 to binary
    const byteCharacters = atob(base64)
    const byteNumbers = new Array(byteCharacters.length)

    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i)
    }

    const byteArray = new Uint8Array(byteNumbers)
    const blob = new Blob([byteArray], { type: fileType })

    return new File([blob], fileName, { type: fileType })
  }

  /**
   * Check if queue is empty
   */
  isQueueEmpty(): boolean {
    return this.queue.length === 0
  }

  /**
   * Get queue size
   */
  getQueueSize(): number {
    return this.queue.length
  }

  /**
   * Load queue from localStorage
   */
  private loadQueueFromStorage(): void {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY)
      if (stored) {
        this.queue = JSON.parse(stored)
        console.log(`🔍 HeadstoneAnalysisQueue: Loaded ${this.queue.length} task(s) from storage`)
      }
    } catch (error) {
      console.error('❌ HeadstoneAnalysisQueue: Error loading queue from storage:', error)
      this.queue = []
    }
  }

  /**
   * Save queue to localStorage
   */
  private saveQueueToStorage(): void {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.queue))
    } catch (error) {
      console.error('❌ HeadstoneAnalysisQueue: Error saving queue to storage:', error)
    }
  }
}

// Export singleton instance
export const headstoneAnalysisQueue = new HeadstoneAnalysisQueueService()

// Export function to check online status and process queue
export const setupOnlineQueueProcessor = () => {
  let isProcessing = false

  const processQueueWhenOnline = async () => {
    if (isProcessing) return

    try {
      isProcessing = true
      console.log('🌐 HeadstoneAnalysisQueue: Device came back online, processing queue...')
      await headstoneAnalysisQueue.processQueue()
    } catch (error) {
      console.error('❌ HeadstoneAnalysisQueue: Error processing queue:', error)
    } finally {
      isProcessing = false
    }
  }

  // Listen for online events
  window.addEventListener('online', processQueueWhenOnline)

  // Also process immediately if online
  if (navigator.onLine) {
    setTimeout(processQueueWhenOnline, 2000) // Delay to ensure system is ready
  }

  return {
    processQueue: processQueueWhenOnline,
    removeCancelledTasks: () => headstoneAnalysisQueue.removeCancelledTasks(),
    forceProcessing: () => headstoneAnalysisQueue.processQueue()
  }
}
