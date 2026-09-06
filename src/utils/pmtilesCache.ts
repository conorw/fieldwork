// PMTiles cache manager using Cache Storage API (browser cache)
// This provides better PWA offline support than IndexedDB
// Reference: https://web.dev/learn/pwa/caching

const CACHE_NAME = "pmtiles-cache-v1";
const CACHE_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

interface CacheMetadata {
  locationId: string;
  pmtilesUrl: string;
  timestamp: number;
  size: number;
  bbox: [number, number, number, number];
  minZoom: number;
  maxZoom: number;
}

class PMTilesCacheManager {
  /**
   * Get the cache instance
   */
  private async getCache(): Promise<Cache> {
    return await caches.open(CACHE_NAME);
  }

  /**
   * Get cached PMTiles data for a location
   */
  async getCachedPMTiles(
    locationId: string,
  ): Promise<{ data: ArrayBuffer; metadata: CacheMetadata } | null> {
    try {
      const cache = await this.getCache();
      const metadataKey = this.getMetadataKey(locationId);

      // Get metadata first
      const metadataResponse = await cache.match(metadataKey);
      if (!metadataResponse) {
        return null;
      }

      const metadata: CacheMetadata = await metadataResponse.json();

      // Check if cache is expired
      if (Date.now() - metadata.timestamp > CACHE_EXPIRY_MS) {
        console.log(`PMTiles cache expired for location ${locationId}`);
        await this.removeCachedPMTiles(locationId);
        return null;
      }

      // Get the actual PMTiles data
      const dataKey = this.getDataKey(locationId);
      const dataResponse = await cache.match(dataKey);
      if (!dataResponse) {
        // Metadata exists but data is missing, clean up
        await this.removeCachedPMTiles(locationId);
        return null;
      }

      const data = await dataResponse.arrayBuffer();
      console.log(
        `Found cached PMTiles for location ${locationId} (${data.byteLength} bytes)`,
      );

      return { data, metadata };
    } catch (error) {
      console.error("Error retrieving cached PMTiles:", error);
      return null;
    }
  }

  /**
   * Cache PMTiles data using Cache Storage API
   */
  async cachePMTiles(
    locationId: string,
    pmtilesUrl: string,
    data: ArrayBuffer,
    bbox: [number, number, number, number],
    minZoom: number,
    maxZoom: number,
  ): Promise<void> {
    try {
      const cache = await this.getCache();

      // Create metadata
      const metadata: CacheMetadata = {
        locationId,
        pmtilesUrl,
        timestamp: Date.now(),
        size: data.byteLength,
        bbox: [...bbox],
        minZoom,
        maxZoom,
      };

      // Store metadata as JSON response
      const metadataKey = this.getMetadataKey(locationId);
      console.log(
        "📦 [PMTilesCache] Storing metadata with key:",
        metadataKey.url,
      );
      const metadataResponse = new Response(JSON.stringify(metadata), {
        headers: { "Content-Type": "application/json" },
      });
      await cache.put(metadataKey, metadataResponse);

      // Store PMTiles data as ArrayBuffer response
      const dataKey = this.getDataKey(locationId);
      console.log("📦 [PMTilesCache] Storing data with key:", dataKey.url);
      const dataResponse = new Response(data, {
        headers: { "Content-Type": "application/octet-stream" },
      });
      await cache.put(dataKey, dataResponse);

      console.log(
        `Cached PMTiles for location ${locationId} (${data.byteLength} bytes)`,
      );
    } catch (error) {
      console.error("Error caching PMTiles:", error);
      throw error;
    }
  }

  /**
   * Remove cached PMTiles for a location
   */
  async removeCachedPMTiles(locationId: string): Promise<void> {
    try {
      const cache = await this.getCache();
      await cache.delete(this.getMetadataKey(locationId));
      await cache.delete(this.getDataKey(locationId));
      console.log(`Removed cached PMTiles for location ${locationId}`);
    } catch (error) {
      console.error("Error removing cached PMTiles:", error);
    }
  }

  /**
   * Check if PMTiles is cached for a location
   */
  async isPMTilesCached(locationId: string): Promise<boolean> {
    const cached = await this.getCachedPMTiles(locationId);
    return cached !== null;
  }

  /**
   * Get cached PMTiles URL for a location
   */
  async getCachedPMTilesUrl(locationId: string): Promise<string | null> {
    const cached = await this.getCachedPMTiles(locationId);
    return cached ? cached.metadata.pmtilesUrl : null;
  }

  /**
   * Get cache information
   */
  async getCacheInfo(): Promise<{
    totalSize: number;
    totalEntries: number;
    entries: Array<{
      locationId: string;
      size: number;
      timestamp: number;
      age: string;
    }>;
  }> {
    try {
      const cache = await this.getCache();
      const keys = await cache.keys();

      const entries: Array<{
        locationId: string;
        size: number;
        timestamp: number;
        age: string;
      }> = [];
      let totalSize = 0;

      // Process metadata keys only (skip data keys)
      for (const key of keys) {
        if (key.url.includes("/pmtiles-cache/metadata/")) {
          const response = await cache.match(key);
          if (response) {
            const metadata: CacheMetadata = await response.json();
            entries.push({
              locationId: metadata.locationId,
              size: metadata.size,
              timestamp: metadata.timestamp,
              age: this.formatAge(Date.now() - metadata.timestamp),
            });
            totalSize += metadata.size;
          }
        }
      }

      return {
        totalSize,
        totalEntries: entries.length,
        entries: entries.sort((a, b) => b.timestamp - a.timestamp),
      };
    } catch (error) {
      console.error("Error getting cache info:", error);
      return { totalSize: 0, totalEntries: 0, entries: [] };
    }
  }

  /**
   * Clear all cached PMTiles
   */
  async clearCache(): Promise<void> {
    try {
      const cache = await this.getCache();
      const keys = await cache.keys();
      await Promise.all(keys.map((key) => cache.delete(key)));
      console.log("PMTiles cache cleared");
    } catch (error) {
      console.error("Error clearing cache:", error);
    }
  }

  /**
   * Get metadata key for a location
   * Using relative URLs to avoid conflicts with real URLs
   * Cache Storage API only supports http/https URLs or relative paths
   */
  private getMetadataKey(locationId: string): Request {
    // Use a relative URL with a unique prefix to avoid conflicts
    // The origin will be the current page origin, but this is just a cache key
    return new Request(`/pmtiles-cache/metadata/${locationId}`, {
      method: "GET",
    });
  }

  /**
   * Get data key for a location
   * Using relative URLs to avoid conflicts with real URLs
   * Cache Storage API only supports http/https URLs or relative paths
   */
  private getDataKey(locationId: string): Request {
    // Use a relative URL with a unique prefix to avoid conflicts
    return new Request(`/pmtiles-cache/data/${locationId}`, {
      method: "GET",
    });
  }

  /**
   * Format age string
   */
  private formatAge(ms: number): string {
    const days = Math.floor(ms / (24 * 60 * 60 * 1000));
    const hours = Math.floor((ms % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
    const minutes = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000));

    if (days > 0) return `${days}d ${hours}h ago`;
    if (hours > 0) return `${hours}h ${minutes}m ago`;
    return `${minutes}m ago`;
  }
}

// Export singleton instance
export const pmtilesCache = new PMTilesCacheManager();

// Export types for use in other modules
export type { CacheMetadata };
