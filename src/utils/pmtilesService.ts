
import { pmtilesCache } from './pmtilesCache'

export interface PMTilesLocation {
  id: string
  name: string
  bbox: [number, number, number, number]
  minZoom: number
  maxZoom: number
  pmtilesUrl?: string // URL to PMTiles data
}

class PMTilesService {

  /**
   * Get PMTiles data for a location using IndexedDB cache
   */
  async getPMTiles(location: PMTilesLocation): Promise<{
    data: ArrayBuffer
    source: 'local' | 'generated'
  }> {
    console.log(`Getting PMTiles for location: ${location.name} (${location.id})`)

    // 1. Check if PMTiles data exists in IndexedDB cache
    const cached = await pmtilesCache.getCachedPMTiles(location.id)
    if (cached) {
      console.log(`Using PMTiles data from IndexedDB cache for ${location.name}`)
      return {
        data: cached.data,
        source: 'local'
      }
    }

    // 2. If not cached, download and cache the data
    if (location.pmtilesUrl) {
      console.log('PMTiles service: Downloading from URL:', location.pmtilesUrl)
      const response = await fetch(location.pmtilesUrl)
      
      if (!response.ok) {
        throw new Error(`Failed to download PMTiles: ${response.status} ${response.statusText}`)
      }

      const data = await response.arrayBuffer()

      // Check if the data is too small to be a valid PMTiles file
      if (data.byteLength < 100) {
        throw new Error(`PMTiles file too small (${data.byteLength} bytes) - likely an error response`)
      }

      // Verify it's actually a PMTiles file
      const magicBytes = new Uint8Array(data.slice(0, 4))
      const expectedMagic = new Uint8Array([0x50, 0x4D, 0x54, 0x69]) // "PMTi"
      const isPMTiles = magicBytes.every((byte, index) => byte === expectedMagic[index])

      if (!isPMTiles) {
        throw new Error(`Invalid PMTiles format - expected magic bytes "PMTi", got: ${Array.from(magicBytes).map(b => String.fromCharCode(b)).join('')}`)
      }

      // Cache the data in IndexedDB
      try {
        await pmtilesCache.cachePMTiles(
          location.id,
          location.pmtilesUrl,
          data,
          location.bbox,
          location.minZoom,
          location.maxZoom
        )
        console.log('PMTiles service: Data cached in IndexedDB')
      } catch (cacheError) {
        console.warn('PMTiles service: Failed to cache data, but continuing:', cacheError)
      }

      return {
        data,
        source: 'generated'
      }
    }

    throw new Error(`PMTiles data not found for ${location.name}`)
  }

  /**
   * Preload PMTiles for a location
   */
  async preloadPMTiles(location: PMTilesLocation): Promise<void> {
    try {
      await this.getPMTiles(location)
      console.log(`Preloaded PMTiles for ${location.name}`)
    } catch (error) {
      console.error(`Failed to preload PMTiles for ${location.name}:`, error)
    }
  }

  /**
   * Check if PMTiles is cached for a location
   */
  async isPMTilesCached(locationId: string): Promise<boolean> {
    return await pmtilesCache.isPMTilesCached(locationId)
  }

  /**
   * Get cache information
   */
  async getCacheInfo() {
    return await pmtilesCache.getCacheInfo()
  }

  /**
   * Clear PMTiles cache
   */
  async clearCache(): Promise<void> {
    return await pmtilesCache.clearCache()
  }

  /**
   * Remove specific PMTiles from cache
   */
  async removeFromCache(locationId: string): Promise<void> {
    return await pmtilesCache.removeCachedPMTiles(locationId)
  }

  /**
   * Store PMTiles data directly (for generated data)
   */
  async storePMTiles(
    locationId: string,
    pmtilesUrl: string,
    data: ArrayBuffer,
    bbox: [number, number, number, number],
    minZoom: number,
    maxZoom: number
  ): Promise<void> {
    return await pmtilesCache.cachePMTiles(
      locationId,
      pmtilesUrl,
      data,
      bbox,
      minZoom,
      maxZoom
    )
  }
}

// Export singleton instance
export const pmtilesService = new PMTilesService()
