// Utility functions for progressive image loading in the UI

export interface ImageDisplayData {
  id: string
  thumbnail?: string
  preview?: string
  cloudUrl?: string
  originalData?: string // Legacy fallback
  dimensions?: { width: number; height: number }
  originalSize?: number
  format?: string
}

export interface ImageDisplayState {
  currentSrc: string
  loading: boolean
  error: string | null
  loadedLevel: 'thumbnail' | 'preview' | 'full' | 'legacy'
}

/**
 * Get the appropriate image source based on available data and loading state
 */
export function getImageSource(image: ImageDisplayData, state: ImageDisplayState): string {
  // Priority order: thumbnail -> preview -> cloud -> legacy data
  
  if (state.loading) {
    // Show thumbnail while loading higher quality
    if (image.thumbnail) {
      return `data:image/jpeg;base64,${image.thumbnail}`
    }
    if (image.preview) {
      return `data:image/jpeg;base64,${image.preview}`
    }
    if (image.originalData) {
      return image.originalData.startsWith('data:') ? image.originalData : `data:image/jpeg;base64,${image.originalData}`
    }
  }

  // Return current source based on loaded level
  switch (state.loadedLevel) {
    case 'thumbnail':
      return image.thumbnail ? `data:image/jpeg;base64,${image.thumbnail}` : ''
    case 'preview':
      return image.preview ? `data:image/jpeg;base64,${image.preview}` : ''
    case 'full':
      return image.cloudUrl || ''
    case 'legacy':
      return image.originalData ? (image.originalData.startsWith('data:') ? image.originalData : `data:image/jpeg;base64,${image.originalData}`) : ''
    default:
      return ''
  }
}

/**
 * Check if an image has hybrid data (thumbnail/preview/cloud)
 */
export function hasHybridData(image: ImageDisplayData): boolean {
  return !!(image.thumbnail || image.preview || image.cloudUrl)
}

/**
 * Check if an image is legacy (only has originalData)
 */
export function isLegacyImage(image: ImageDisplayData): boolean {
  return !hasHybridData(image) && !!image.originalData
}

/**
 * Get image dimensions from stored dimensions string
 */
export function getImageDimensions(image: ImageDisplayData): { width: number; height: number } | null {
  if (image.dimensions) {
    return image.dimensions
  }
  
  if (image.originalData) {
    // For legacy images, we might need to extract dimensions from the image
    // This would require loading the image, which is expensive
    return null
  }
  
  return null
}

/**
 * Format file size for display
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

/**
 * Get compression ratio for display
 */
export function getCompressionRatio(image: ImageDisplayData): string {
  if (!image.originalSize || !image.thumbnail || !image.preview) {
    return 'N/A'
  }
  
  const thumbnailSize = image.thumbnail.length * 0.75 // Approximate base64 to bytes
  const previewSize = image.preview.length * 0.75
  const totalCompressedSize = thumbnailSize + previewSize
  const ratio = Math.round((1 - totalCompressedSize / image.originalSize) * 100)
  
  return `${ratio}%`
}

/**
 * Create a progressive loading strategy for images
 */
export class ProgressiveImageLoader {
  private imageStates = new Map<string, ImageDisplayState>()
  
  getImageState(imageId: string): ImageDisplayState {
    if (!this.imageStates.has(imageId)) {
      this.imageStates.set(imageId, {
        currentSrc: '',
        loading: false,
        error: null,
        loadedLevel: 'thumbnail'
      })
    }
    return this.imageStates.get(imageId)!
  }
  
  async loadImage(image: ImageDisplayData, targetLevel: 'preview' | 'full' = 'preview'): Promise<ImageDisplayState> {
    const state = this.getImageState(image.id)
    
    if (state.loading) {
      return state
    }
    
    state.loading = true
    state.error = null
    
    try {
      // Load thumbnail first if available
      if (image.thumbnail && state.loadedLevel === 'thumbnail') {
        state.currentSrc = `data:image/jpeg;base64,${image.thumbnail}`
        state.loadedLevel = 'thumbnail'
      }
      
      // Load preview if requested and available
      if (targetLevel === 'preview' && image.preview && state.loadedLevel === 'thumbnail') {
        state.currentSrc = `data:image/jpeg;base64,${image.preview}`
        state.loadedLevel = 'preview'
      }
      
      // Load full resolution if requested and available
      if (targetLevel === 'full' && image.cloudUrl && state.loadedLevel !== 'full') {
        // Test if cloud URL is accessible
        const response = await fetch(image.cloudUrl, { method: 'HEAD' })
        if (response.ok) {
          state.currentSrc = image.cloudUrl
          state.loadedLevel = 'full'
        } else {
          throw new Error('Cloud image not accessible')
        }
      }
      
      state.loading = false
      return state
      
    } catch (error) {
      state.loading = false
      state.error = error instanceof Error ? error.message : 'Unknown error'
      
      // Fallback to legacy data if available
      if (image.originalData && state.loadedLevel !== 'legacy') {
        state.currentSrc = image.originalData.startsWith('data:') ? image.originalData : `data:image/jpeg;base64,${image.originalData}`
        state.loadedLevel = 'legacy'
      }
      
      return state
    }
  }
  
  clearState(imageId: string): void {
    this.imageStates.delete(imageId)
  }
}

// Export singleton instance
export const progressiveImageLoader = new ProgressiveImageLoader()
