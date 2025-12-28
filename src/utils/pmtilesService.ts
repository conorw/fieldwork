import { pmtilesCache } from "./pmtilesCache";

export interface PMTilesLocation {
  id: string;
  name: string;
  bbox: [number, number, number, number];
  minZoom: number;
  maxZoom: number;
  pmtilesUrl?: string; // URL to PMTiles data
}

class PMTilesService {
  /**
   * Get PMTiles data for a location using IndexedDB cache
   */
  async getPMTiles(location: PMTilesLocation): Promise<{
    data: ArrayBuffer;
    source: "local" | "generated";
  }> {
    console.log(
      `📦 [PMTilesService] getPMTiles called for location: ${location.name} (${location.id})`,
    );
    console.log("📦 [PMTilesService] Location object:", {
      id: location.id,
      name: location.name,
      pmtilesUrl: location.pmtilesUrl,
      hasPmtilesUrl: !!location.pmtilesUrl,
      pmtilesUrlType: typeof location.pmtilesUrl,
      pmtilesUrlLength: location.pmtilesUrl?.length,
      pmtilesUrlTrimmed: location.pmtilesUrl?.trim(),
      isEmpty: location.pmtilesUrl?.trim() === "",
    });

    // 1. Check if PMTiles data exists in Cache Storage (browser cache)
    const cached = await pmtilesCache.getCachedPMTiles(location.id);
    if (cached) {
      console.log(
        `Using PMTiles data from Cache Storage for ${location.name}`,
      );
      return {
        data: cached.data,
        source: "local",
      };
    }

    // 2. If not cached, download and cache the data
    console.log("📦 [PMTilesService] Checking if pmtilesUrl exists:", {
      hasPmtilesUrl: !!location.pmtilesUrl,
      pmtilesUrl: location.pmtilesUrl,
      condition: location.pmtilesUrl && location.pmtilesUrl.trim() !== "",
    });
    
    if (location.pmtilesUrl && location.pmtilesUrl.trim() !== "") {
      console.log(
        "📦 [PMTilesService] ✅ pmtilesUrl is valid, downloading from URL:",
        location.pmtilesUrl,
      );
      // Use credentials: 'omit' to prevent sending cookies/auth headers
      // PMTiles files are public assets (Vercel Blob Storage) and don't need authentication
      // This prevents the "431 Request Header Fields Too Large" error caused by
      // large Supabase auth tokens being sent automatically by the browser
      // Using a new Request object to ensure a clean fetch without any interceptors
      // Use the most minimal fetch possible to avoid sending large headers
      // PMTiles files are public assets and don't need authentication
      const requestInit: RequestInit = {
        method: 'GET',
        credentials: 'omit', // Don't send cookies or auth headers
        mode: 'cors', // Allow CORS but don't send credentials
        cache: 'default',
        redirect: 'follow',
        // Explicitly don't set any headers - let browser send only minimal required headers
        // This prevents the "431 Request Header Fields Too Large" error
      };
      
      let response: Response;
      try {
        response = await fetch(location.pmtilesUrl, requestInit);
      } catch (fetchError) {
        // If fetch fails, it might be a network error or header size issue
        console.error('PMTiles fetch error:', fetchError);
        throw new Error(
          `Failed to fetch PMTiles: ${fetchError instanceof Error ? fetchError.message : 'Unknown error'}. ` +
          `This may be due to large headers being sent. Try clearing browser cookies or using a different browser.`
        );
      }

      if (!response.ok) {
        // Provide more specific error messages
        if (response.status === 431) {
          throw new Error(
            `Failed to download PMTiles: Request Header Fields Too Large (431). ` +
            `The server rejected the request because headers were too large. ` +
            `Try clearing browser cookies or using a different browser. ` +
            `URL: ${location.pmtilesUrl}`
          );
        }
        throw new Error(
          `Failed to download PMTiles: ${response.status} ${response.statusText}`,
        );
      }

      const data = await response.arrayBuffer();

      // Check if the data is too small to be a valid PMTiles file
      if (data.byteLength < 100) {
        throw new Error(
          `PMTiles file too small (${data.byteLength} bytes) - likely an error response`,
        );
      }

      // Verify it's actually a PMTiles file
      const magicBytes = new Uint8Array(data.slice(0, 4));
      const expectedMagic = new Uint8Array([0x50, 0x4d, 0x54, 0x69]); // "PMTi"
      const isPMTiles = magicBytes.every(
        (byte, index) => byte === expectedMagic[index],
      );

      if (!isPMTiles) {
        throw new Error(
          `Invalid PMTiles format - expected magic bytes "PMTi", got: ${Array.from(
            magicBytes,
          )
            .map((b) => String.fromCharCode(b))
            .join("")}`,
        );
      }

      // Cache the data using Cache Storage API (browser cache for PWA offline support)
      try {
        await pmtilesCache.cachePMTiles(
          location.id,
          location.pmtilesUrl,
          data,
          location.bbox,
          location.minZoom,
          location.maxZoom,
        );
        console.log("PMTiles service: Data cached in Cache Storage");
      } catch (cacheError) {
        console.warn(
          "PMTiles service: Failed to cache data, but continuing:",
          cacheError,
        );
      }

      return {
        data,
        source: "generated",
      };
    }

    console.error("📦 [PMTilesService] ❌ No PMTiles data found:", {
      locationId: location.id,
      locationName: location.name,
      pmtilesUrl: location.pmtilesUrl,
      hasPmtilesUrl: !!location.pmtilesUrl,
    });
    throw new Error(`PMTiles data not found for ${location.name}. pmtilesUrl: ${location.pmtilesUrl || 'not set'}`);
  }

  /**
   * Preload PMTiles for a location
   */
  async preloadPMTiles(location: PMTilesLocation): Promise<void> {
    try {
      await this.getPMTiles(location);
      console.log(`Preloaded PMTiles for ${location.name}`);
    } catch (error) {
      console.error(`Failed to preload PMTiles for ${location.name}:`, error);
    }
  }

  /**
   * Check if PMTiles is cached for a location
   */
  async isPMTilesCached(locationId: string): Promise<boolean> {
    return await pmtilesCache.isPMTilesCached(locationId);
  }

  /**
   * Get cache information
   */
  async getCacheInfo() {
    return await pmtilesCache.getCacheInfo();
  }

  /**
   * Clear PMTiles cache
   */
  async clearCache(): Promise<void> {
    return await pmtilesCache.clearCache();
  }

  /**
   * Remove specific PMTiles from cache
   */
  async removeFromCache(locationId: string): Promise<void> {
    return await pmtilesCache.removeCachedPMTiles(locationId);
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
    maxZoom: number,
  ): Promise<void> {
    return await pmtilesCache.cachePMTiles(
      locationId,
      pmtilesUrl,
      data,
      bbox,
      minZoom,
      maxZoom,
    );
  }
}

// Export singleton instance
export const pmtilesService = new PMTilesService();
