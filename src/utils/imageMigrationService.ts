// Migration service for converting existing images to hybrid storage
import { imageProcessingService } from './imageProcessingService'

export interface MigrationProgress {
  total: number
  processed: number
  successful: number
  failed: number
  currentImage?: string
  errors: string[]
}

export interface MigrationOptions {
  batchSize?: number
  skipExisting?: boolean
  onProgress?: (progress: MigrationProgress) => void
  onComplete?: (progress: MigrationProgress) => void
  onError?: (error: string) => void
}

class ImageMigrationService {
  private isRunning = false
  private currentProgress: MigrationProgress = {
    total: 0,
    processed: 0,
    successful: 0,
    failed: 0,
    errors: []
  }

  /**
   * Migrate existing images to hybrid storage
   */
  async migrateImages(
    powerSync: any,
    options: MigrationOptions = {}
  ): Promise<MigrationProgress> {
    if (this.isRunning) {
      throw new Error('Migration is already running')
    }

    this.isRunning = true
    this.currentProgress = {
      total: 0,
      processed: 0,
      successful: 0,
      failed: 0,
      errors: []
    }

    try {
      console.log('🔄 ImageMigration: Starting migration process...')

      // Get all images that need migration (have data but no hybrid fields)
      const imagesToMigrate = await powerSync.getAll(`
        SELECT * FROM plot_images 
        WHERE data IS NOT NULL 
        AND data != '' 
        AND (thumbnail_data IS NULL OR thumbnail_data = '' OR cloud_url IS NULL OR cloud_url = '')
        ORDER BY date_created DESC
      `)

      this.currentProgress.total = imagesToMigrate.length
      console.log(`🔄 ImageMigration: Found ${imagesToMigrate.length} images to migrate`)

      if (imagesToMigrate.length === 0) {
        console.log('✅ ImageMigration: No images need migration')
        this.isRunning = false
        return this.currentProgress
      }

      const batchSize = options.batchSize || 5
      const skipExisting = options.skipExisting || true

      // Process images in batches
      for (let i = 0; i < imagesToMigrate.length; i += batchSize) {
        const batch = imagesToMigrate.slice(i, i + batchSize)
        
        await this.processBatch(batch, powerSync, skipExisting, options)
        
        // Report progress
        if (options.onProgress) {
          options.onProgress({ ...this.currentProgress })
        }
      }

      console.log('✅ ImageMigration: Migration completed successfully')
      console.log(`📊 ImageMigration: Results - ${this.currentProgress.successful} successful, ${this.currentProgress.failed} failed`)

      if (options.onComplete) {
        options.onComplete({ ...this.currentProgress })
      }

      this.isRunning = false
      return this.currentProgress

    } catch (error) {
      console.error('❌ ImageMigration: Migration failed:', error)
      this.isRunning = false
      
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      this.currentProgress.errors.push(errorMessage)
      
      if (options.onError) {
        options.onError(errorMessage)
      }
      
      throw error
    }
  }

  /**
   * Process a batch of images
   */
  private async processBatch(
    batch: any[],
    powerSync: any,
    skipExisting: boolean,
    options: MigrationOptions
  ): Promise<void> {
    const promises = batch.map(image => this.processImage(image, powerSync, skipExisting, options))
    await Promise.allSettled(promises)
  }

  /**
   * Process a single image
   */
  private async processImage(
    image: any,
    powerSync: any,
    skipExisting: boolean,
    options: MigrationOptions
  ): Promise<void> {
    try {
      this.currentProgress.currentImage = image.file_name
      this.currentProgress.processed++

      // Skip if already migrated
      if (skipExisting && image.thumbnail_data && image.cloud_url) {
        console.log(`⏭️ ImageMigration: Skipping already migrated image: ${image.file_name}`)
        this.currentProgress.successful++
        return
      }

      console.log(`🔄 ImageMigration: Processing image: ${image.file_name} (${image.data.length} chars)`)

      // Convert base64 data to File object for processing
      const file = await this.base64ToFile(image.data, image.file_name || 'image.jpg')

      // Process the image using the image processing service
      const processedImage = await imageProcessingService.processImage(file)

      // Update the database record
      await powerSync.execute(`
        UPDATE plot_images 
        SET 
          thumbnail_data = ?,
          preview_data = ?,
          cloud_url = ?,
          original_size = ?,
          thumbnail_size = ?,
          preview_size = ?,
          dimensions = ?,
          format = ?
        WHERE id = ?
      `, [
        processedImage.thumbnail,
        null, // preview not available
        processedImage.cloudUrl,
        processedImage.metadata.originalSize.toString(),
        processedImage.metadata.thumbnailSize.toString(),
        0, // previewSize not available
        JSON.stringify(processedImage.metadata.dimensions),
        processedImage.metadata.format,
        image.id
      ])

      console.log(`✅ ImageMigration: Successfully migrated image: ${image.file_name}`)
      this.currentProgress.successful++

    } catch (error) {
      console.error(`❌ ImageMigration: Failed to migrate image ${image.file_name}:`, error)
      
      const errorMessage = `Failed to migrate ${image.file_name}: ${error instanceof Error ? error.message : 'Unknown error'}`
      this.currentProgress.errors.push(errorMessage)
      this.currentProgress.failed++

      if (options.onError) {
        options.onError(errorMessage)
      }
    }
  }

  /**
   * Convert base64 string to File object
   */
  private async base64ToFile(base64Data: string, fileName: string): Promise<File> {
    // Handle data URL format
    const base64 = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data
    
    // Convert base64 to blob
    const byteCharacters = atob(base64)
    const byteNumbers = new Array(byteCharacters.length)
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i)
    }
    const byteArray = new Uint8Array(byteNumbers)
    const blob = new Blob([byteArray], { type: 'image/jpeg' })
    
    return new File([blob], fileName, { type: 'image/jpeg' })
  }

  /**
   * Get migration status
   */
  getStatus(): { isRunning: boolean; progress: MigrationProgress } {
    return {
      isRunning: this.isRunning,
      progress: { ...this.currentProgress }
    }
  }

  /**
   * Stop migration
   */
  stop(): void {
    this.isRunning = false
    console.log('⏹️ ImageMigration: Migration stopped by user')
  }

  /**
   * Get statistics about images in the database
   */
  async getImageStats(powerSync: any): Promise<{
    total: number
    legacy: number
    hybrid: number
    partial: number
    totalSize: number
    estimatedSavings: number
  }> {
    const allImages = await powerSync.getAll('SELECT * FROM plot_images')
    
    let legacy = 0
    let hybrid = 0
    let partial = 0
    let totalSize = 0
    let estimatedSavings = 0

    for (const image of allImages) {
      const hasData = image.data && image.data.length > 0
      const hasThumbnail = image.thumbnail_data && image.thumbnail_data.length > 0
      const hasPreview = image.preview_data && image.preview_data.length > 0
      const hasCloudUrl = image.cloud_url && image.cloud_url.length > 0

      if (hasData && hasThumbnail && hasPreview && hasCloudUrl) {
        hybrid++
        // Estimate savings: original size vs thumbnail + preview
        const originalSize = parseInt(image.original_size) || image.data.length * 0.75
        const thumbnailSize = parseInt(image.thumbnail_size) || 0
        const previewSize = parseInt(image.preview_size) || 0
        estimatedSavings += originalSize - (thumbnailSize + previewSize)
      } else if (hasData && (hasThumbnail || hasPreview || hasCloudUrl)) {
        partial++
      } else if (hasData) {
        legacy++
      }

      totalSize += image.data ? image.data.length * 0.75 : 0 // Approximate base64 to bytes
    }

    return {
      total: allImages.length,
      legacy,
      hybrid,
      partial,
      totalSize,
      estimatedSavings
    }
  }
}

// Export singleton instance
export const imageMigrationService = new ImageMigrationService()
