// PMTiles cache manager with IndexedDB storage
import { openDB, DBSchema, IDBPDatabase } from 'idb'

interface PMTilesCacheDB extends DBSchema {
  pmtiles: {
    key: string // locationId
    value: {
      locationId: string
      pmtilesUrl: string
      data: string // Store as base64 string for IndexedDB compatibility
      timestamp: number
      size: number
      bbox: [number, number, number, number]
      minZoom: number
      maxZoom: number
    }
    indexes: { 'by-timestamp': number }
  }
}

interface CachedPMTiles {
  locationId: string
  pmtilesUrl: string
  data: string // Store as base64 string for IndexedDB compatibility
  timestamp: number
  size: number
  bbox: [number, number, number, number]
  minZoom: number
  maxZoom: number
}

// Interface for data returned from cache (with ArrayBuffer for compatibility)
interface CachedPMTilesResult {
  locationId: string
  pmtilesUrl: string
  data: ArrayBuffer
  timestamp: number
  size: number
  bbox: [number, number, number, number]
  minZoom: number
  maxZoom: number
}

class PMTilesCacheManager {
  private db: IDBPDatabase<PMTilesCacheDB> | null = null
  private readonly DB_NAME = 'pmtiles-cache'
  private readonly DB_VERSION = 1

  // Helper function to convert ArrayBuffer to base64
  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer)
    let binary = ''
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i])
    }
    return btoa(binary)
  }

  // Helper function to convert base64 to ArrayBuffer
  private base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i)
    }
    return bytes.buffer
  }
  private readonly CACHE_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000 // 7 days
  private readonly MAX_CACHE_SIZE_MB = 100 // 100MB max cache size

  async initialize(): Promise<void> {
    if (this.db) return

    try {
      this.db = await openDB<PMTilesCacheDB>(this.DB_NAME, this.DB_VERSION, {
        upgrade(db) {
          if (!db.objectStoreNames.contains('pmtiles')) {
            const store = db.createObjectStore('pmtiles', { keyPath: 'locationId' })
            store.createIndex('by-timestamp', 'timestamp')
          }
        }
      })
      console.log('PMTiles cache database initialized')
    } catch (error) {
      console.error('Failed to initialize PMTiles cache database:', error)
      throw error
    }
  }

  async getCachedPMTiles(locationId: string): Promise<CachedPMTilesResult | null> {
    if (!this.db) await this.initialize()

    try {
      const cached = await this.db!.get('pmtiles', locationId)
      if (!cached) return null

      // Check if cache is expired
      if (Date.now() - cached.timestamp > this.CACHE_EXPIRY_MS) {
        console.log(`PMTiles cache expired for location ${locationId}`)
        await this.removeCachedPMTiles(locationId)
        return null
      }

      console.log(`Found cached PMTiles for location ${locationId} (${cached.size} bytes)`)
      
      // Convert base64 back to ArrayBuffer for compatibility with existing code
      return {
        ...cached,
        data: this.base64ToArrayBuffer(cached.data)
      }
    } catch (error) {
      console.error('Error retrieving cached PMTiles:', error)
      return null
    }
  }

  async cachePMTiles(
    locationId: string,
    pmtilesUrl: string,
    data: ArrayBuffer,
    bbox: [number, number, number, number],
    minZoom: number,
    maxZoom: number
  ): Promise<void> {
    if (!this.db) await this.initialize()

    try {
      // Check cache size before adding
      await this.ensureCacheSizeLimit(data.byteLength)

      const cacheEntry: CachedPMTiles = {
        locationId,
        pmtilesUrl,
        data: this.arrayBufferToBase64(data), // Convert ArrayBuffer to base64 for IndexedDB compatibility
        timestamp: Date.now(),
        size: data.byteLength,
        bbox: [...bbox], // Create a new array to ensure proper cloning
        minZoom,
        maxZoom
      }

      await this.db!.put('pmtiles', cacheEntry)
      console.log(`Cached PMTiles for location ${locationId} (${data.byteLength} bytes)`)
    } catch (error) {
      console.error('Error caching PMTiles:', error)
      throw error
    }
  }

  async removeCachedPMTiles(locationId: string): Promise<void> {
    if (!this.db) await this.initialize()

    try {
      await this.db!.delete('pmtiles', locationId)
      console.log(`Removed cached PMTiles for location ${locationId}`)
    } catch (error) {
      console.error('Error removing cached PMTiles:', error)
    }
  }

  async getCacheInfo(): Promise<{
    totalSize: number
    totalEntries: number
    entries: Array<{
      locationId: string
      size: number
      timestamp: number
      age: string
    }>
  }> {
    if (!this.db) await this.initialize()

    try {
      const allEntries = await this.db!.getAll('pmtiles')
      const totalSize = allEntries.reduce((sum, entry) => sum + entry.size, 0)

      const entries = allEntries.map(entry => ({
        locationId: entry.locationId,
        size: entry.size,
        timestamp: entry.timestamp,
        age: this.formatAge(Date.now() - entry.timestamp)
      }))

      return {
        totalSize,
        totalEntries: allEntries.length,
        entries: entries.sort((a, b) => b.timestamp - a.timestamp)
      }
    } catch (error) {
      console.error('Error getting cache info:', error)
      return { totalSize: 0, totalEntries: 0, entries: [] }
    }
  }

  async clearCache(): Promise<void> {
    if (!this.db) await this.initialize()

    try {
      await this.db!.clear('pmtiles')
      console.log('PMTiles cache cleared')
    } catch (error) {
      console.error('Error clearing cache:', error)
    }
  }

  private async ensureCacheSizeLimit(newEntrySize: number): Promise<void> {
    if (!this.db) return

    try {
      const cacheInfo = await this.getCacheInfo()
      const maxSizeBytes = this.MAX_CACHE_SIZE_MB * 1024 * 1024

      // If adding this entry would exceed the limit, remove oldest entries
      if (cacheInfo.totalSize + newEntrySize > maxSizeBytes) {
        console.log('Cache size limit exceeded, removing oldest entries')

        const entries = await this.db!.getAllFromIndex('pmtiles', 'by-timestamp')
        const sortedEntries = entries.sort((a, b) => a.timestamp - b.timestamp)

        let currentSize = cacheInfo.totalSize
        for (const entry of sortedEntries) {
          if (currentSize + newEntrySize <= maxSizeBytes) break

          await this.db!.delete('pmtiles', entry.locationId)
          currentSize -= entry.size
          console.log(`Removed old cache entry: ${entry.locationId}`)
        }
      }
    } catch (error) {
      console.error('Error managing cache size:', error)
    }
  }

  private formatAge(ms: number): string {
    const days = Math.floor(ms / (24 * 60 * 60 * 1000))
    const hours = Math.floor((ms % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000))
    const minutes = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000))

    if (days > 0) return `${days}d ${hours}h ago`
    if (hours > 0) return `${hours}h ${minutes}m ago`
    return `${minutes}m ago`
  }

  async isPMTilesCached(locationId: string): Promise<boolean> {
    const cached = await this.getCachedPMTiles(locationId)
    return cached !== null
  }

  async getCachedPMTilesUrl(locationId: string): Promise<string | null> {
    const cached = await this.getCachedPMTiles(locationId)
    return cached ? cached.pmtilesUrl : null
  }
}

// Export singleton instance
export const pmtilesCache = new PMTilesCacheManager()

// Export types for use in other modules
export type { CachedPMTiles, CachedPMTilesResult }
