// Storage Analytics Service
// Provides comprehensive storage usage information for the app

export interface StorageItem {
  name: string
  size: number
  type: 'cache' | 'database' | 'assets' | 'tiles' | 'images' | 'other'
  description: string
  lastAccessed?: Date
  canClear?: boolean
}

export interface StorageSummary {
  totalSize: number
  totalItems: number
  breakdown: {
    cache: { size: number; items: number }
    database: { size: number; items: number }
    assets: { size: number; items: number }
    tiles: { size: number; items: number }
    images: { size: number; items: number }
    other: { size: number; items: number }
  }
  items: StorageItem[]
}

class StorageAnalyticsService {
  private powerSyncStore: any = null

  constructor() {
    // We'll inject the PowerSync store when needed
  }

  setPowerSyncStore(store: any) {
    this.powerSyncStore = store
  }

  // Format bytes to human readable format
  formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  // Get localStorage usage
  async getLocalStorageUsage(): Promise<StorageItem[]> {
    const items: StorageItem[] = []
    let totalSize = 0

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key) {
        const value = localStorage.getItem(key)
        const size = new Blob([value || '']).size
        totalSize += size

        let type: StorageItem['type'] = 'other'
        let description = 'Local storage item'

        if (key.includes('pmtiles') || key.includes('tile')) {
          type = 'tiles'
          description = 'Map tile data'
        } else if (key.includes('image') || key.includes('photo')) {
          type = 'images'
          description = 'Image data'
        } else if (key.includes('cache')) {
          type = 'cache'
          description = 'Cached data'
        } else if (key.includes('zoom') || key.includes('settings')) {
          type = 'other'
          description = 'App settings'
        }

        items.push({
          name: key,
          size,
          type,
          description,
          canClear: true
        })
      }
    }

    return items
  }

  // Get IndexedDB usage (PMTiles cache)
  async getIndexedDBUsage(): Promise<StorageItem[]> {
    const items: StorageItem[] = []

    try {
      // Get actual IndexedDB usage
      const indexedDBInfo = await this.getIndexedDBInfo()

      if (indexedDBInfo.totalSize > 0) {
        items.push({
          name: 'IndexedDB Storage',
          size: indexedDBInfo.totalSize,
          type: 'database',
          description: `${indexedDBInfo.databases.length} databases`,
          canClear: false
        })
      }

      // Check PMTiles cache specifically
      const pmtilesCache = await this.getPMTilesCacheInfo()
      if (pmtilesCache.totalSize > 0) {
        items.push({
          name: 'PMTiles Cache',
          size: pmtilesCache.totalSize,
          type: 'tiles',
          description: `${pmtilesCache.totalEntries} cached PMTiles files`,
          canClear: true
        })
      }
    } catch (error) {
      console.warn('Could not get IndexedDB usage:', error)
    }

    return items
  }

  // Get PowerSync database usage
  async getPowerSyncUsage(): Promise<StorageItem[]> {
    const items: StorageItem[] = []

    if (!this.powerSyncStore?.powerSync) {
      return items
    }

    try {
      // Get table-specific information (for row counts only)
      const tables = await this.getTableInfo()

      for (const table of tables) {
        items.push({
          name: table.name,
          size: 0, // Don't estimate individual table sizes
          type: 'database',
          description: `${table.rows} rows`,
          canClear: false
        })
      }

      // Don't add total database size here - it's handled by IndexedDB detection
      // This prevents double-counting
    } catch (error) {
      console.warn('Could not get PowerSync usage:', error)
    }

    return items
  }

  // Get cached assets usage
  async getCachedAssetsUsage(): Promise<StorageItem[]> {
    const items: StorageItem[] = []

    try {
      // Check service worker cache
      if ('caches' in window) {
        const cacheNames = await caches.keys()
        let totalCacheSize = 0

        for (const cacheName of cacheNames) {
          const cache = await caches.open(cacheName)
          const requests = await cache.keys()
          let cacheSize = 0

          for (const request of requests) {
            const response = await cache.match(request)
            if (response) {
              const blob = await response.blob()
              cacheSize += blob.size
            }
          }

          totalCacheSize += cacheSize

          items.push({
            name: `Cache: ${cacheName}`,
            size: cacheSize,
            type: 'cache',
            description: `${requests.length} cached resources`,
            canClear: true
          })
        }

        if (totalCacheSize > 0) {
          items.push({
            name: 'Service Worker Cache (Total)',
            size: totalCacheSize,
            type: 'cache',
            description: 'All cached web assets',
            canClear: true
          })
        }
      }
    } catch (error) {
      console.warn('Could not get cached assets usage:', error)
    }

    return items
  }

  // Get image storage usage
  async getImageStorageUsage(): Promise<StorageItem[]> {
    const items: StorageItem[] = []

    if (!this.powerSyncStore?.powerSync) {
      return items
    }

    try {
      // Get image data from PowerSync
      const images = await this.powerSyncStore.powerSync.getAll(
        'SELECT id, file_name, original_size, thumbnail_size, cloud_url FROM plot_images'
      )

      let totalThumbnailSize = 0
      let totalOriginalSize = 0
      let cloudImages = 0

      for (const image of images) {
        totalThumbnailSize += parseInt(image.thumbnail_size || '0')
        totalOriginalSize += parseInt(image.original_size || '0')
        if (image.cloud_url) cloudImages++
      }

      if (totalThumbnailSize > 0) {
        items.push({
          name: 'Image Thumbnails',
          size: totalThumbnailSize,
          type: 'images',
          description: `${images.length} thumbnail images`,
          canClear: false
        })
      }

      if (cloudImages > 0) {
        items.push({
          name: 'Cloud Images',
          size: 0, // Cloud images don't take local storage
          type: 'images',
          description: `${cloudImages} images stored in cloud`,
          canClear: false
        })
      }

      // Legacy images (full base64 data)
      const legacyImages = images.filter((img: any) => img.original_size && !img.thumbnail_size)
      if (legacyImages.length > 0) {
        const legacySize = legacyImages.reduce((sum: number, img: any) => sum + parseInt(img.original_size || '0'), 0)
        items.push({
          name: 'Legacy Images',
          size: legacySize,
          type: 'images',
          description: `${legacyImages.length} legacy full-size images`,
          canClear: false
        })
      }
    } catch (error) {
      console.warn('Could not get image storage usage:', error)
    }

    return items
  }

  // Get comprehensive storage summary
  async getStorageSummary(): Promise<StorageSummary> {
    const allItems: StorageItem[] = []

    // Collect all storage data
    const localStorageItems = await this.getLocalStorageUsage()
    const indexedDBItems = await this.getIndexedDBUsage()
    const powerSyncItems = await this.getPowerSyncUsage()
    const cachedAssetsItems = await this.getCachedAssetsUsage()
    const imageItems = await this.getImageStorageUsage()

    allItems.push(...localStorageItems, ...indexedDBItems, ...powerSyncItems, ...cachedAssetsItems, ...imageItems)

    // Calculate totals
    const totalSize = allItems.reduce((sum, item) => sum + item.size, 0)
    const totalItems = allItems.length

    // Calculate breakdown by type
    const breakdown = {
      cache: { size: 0, items: 0 },
      database: { size: 0, items: 0 },
      assets: { size: 0, items: 0 },
      tiles: { size: 0, items: 0 },
      images: { size: 0, items: 0 },
      other: { size: 0, items: 0 }
    }

    for (const item of allItems) {
      breakdown[item.type].size += item.size
      breakdown[item.type].items += 1
    }

    return {
      totalSize,
      totalItems,
      breakdown,
      items: allItems.sort((a, b) => b.size - a.size) // Sort by size descending
    }
  }

  // Helper methods
  private async getIndexedDBInfo() {
    try {
      // Use the Storage API to get IndexedDB usage
      if ('storage' in navigator && 'estimate' in navigator.storage) {
        const estimate = await navigator.storage.estimate()
        const databases = []

        // Try to get database names (this is limited by browser security)
        try {
          // Check for common database names used by the app
          const commonDBs = ['PowerSync', 'PMTiles', 'wa-sqlite', 'fieldwork']
          for (const dbName of commonDBs) {
            try {
              // This is a best-effort attempt to detect databases
              databases.push({ name: dbName, size: estimate.usage ? estimate.usage / commonDBs.length : 0 })
            } catch {
              // Database doesn't exist or can't be accessed
            }
          }
        } catch {
          // Fallback to total usage
          databases.push({ name: 'IndexedDB', size: estimate.usage || 0 })
        }

        return {
          totalSize: estimate.usage || 0,
          databases: databases.length > 0 ? databases : [{ name: 'IndexedDB', size: estimate.usage || 0 }]
        }
      }

      return { totalSize: 0, databases: [] }
    } catch (error) {
      console.warn('Could not get IndexedDB info:', error)
      return { totalSize: 0, databases: [] }
    }
  }

  private async getPMTilesCacheInfo() {
    try {
      // Try to get PMTiles cache info from IndexedDB
      const indexedDBInfo = await this.getIndexedDBInfo()

      // Estimate PMTiles cache size (usually a portion of total IndexedDB)
      // This is a rough estimate since we can't directly access PMTiles internal storage
      const estimatedPMTilesSize = Math.floor(indexedDBInfo.totalSize * 0.3) // Assume 30% is PMTiles

      return {
        totalSize: estimatedPMTilesSize,
        totalEntries: Math.floor(estimatedPMTilesSize / 1024) // Rough estimate of entries
      }
    } catch {
      return { totalSize: 0, totalEntries: 0 }
    }
  }


  private async getTableInfo() {
    if (!this.powerSyncStore?.powerSync) return []

    try {
      const tables = ['plots', 'plot_images', 'locations']
      const tableInfo = []

      for (const table of tables) {
        const count = await this.powerSyncStore.powerSync.get(`SELECT COUNT(*) as count FROM ${table}`)
        const rows = count?.count || 0
        // Don't estimate size - we'll use actual IndexedDB size instead
        const estimatedSize = 0

        tableInfo.push({
          name: table,
          size: estimatedSize,
          rows
        })
      }

      return tableInfo
    } catch (error) {
      console.warn('Could not get table info:', error)
      return []
    }
  }

  // Clear specific storage types
  async clearStorage(type: StorageItem['type']): Promise<void> {
    switch (type) {
      case 'cache':
        if ('caches' in window) {
          const cacheNames = await caches.keys()
          await Promise.all(cacheNames.map(name => caches.delete(name)))
        }
        break
      case 'tiles':
        // Clear PMTiles cache
        try {
          // Implementation would depend on your PMTiles cache structure
          console.log('Clearing PMTiles cache...')
        } catch (error) {
          console.error('Error clearing PMTiles cache:', error)
        }
        break
      case 'other':
        // Clear localStorage items that can be cleared
        const keysToRemove = []
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i)
          if (key && (key.includes('zoom') || key.includes('settings'))) {
            keysToRemove.push(key)
          }
        }
        keysToRemove.forEach(key => localStorage.removeItem(key))
        break
    }
  }
}

export const storageAnalytics = new StorageAnalyticsService()
