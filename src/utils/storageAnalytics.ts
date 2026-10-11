// Storage Analytics Service
// Provides comprehensive storage usage information for the app

export interface StorageItem {
  name: string;
  size: number;
  type: "cache" | "database" | "assets" | "tiles" | "images" | "other";
  description: string;
  lastAccessed?: Date;
  canClear?: boolean;
}

export interface StorageSummary {
  totalSize: number;
  quota: number;
  totalItems: number;
  breakdown: {
    cache: { size: number; items: number };
    database: { size: number; items: number };
    assets: { size: number; items: number };
    tiles: { size: number; items: number };
    images: { size: number; items: number };
    models: { size: number; items: number; copies: number };
    other: { size: number; items: number };
  };
  items: StorageItem[];
}

export type CacheBucket = "models" | "tiles" | "cache";

/** Which on-device bucket a Cache Storage entry belongs to. */
export function classifyCacheEntry(cacheName: string, url: string): CacheBucket {
  const name = cacheName.toLowerCase();
  const href = url.toLowerCase();
  if (
    name.includes("transformer") ||
    name.includes("vlm") ||
    href.includes("huggingface.co") ||
    href.includes(".onnx") ||
    href.includes("fastvlm")
  ) {
    return "models";
  }
  if (
    name.includes("pmtiles") ||
    name.includes("tile") ||
    href.includes(".pmtiles") ||
    href.includes("/tiles/")
  ) {
    return "tiles";
  }
  return "cache";
}

/** Hub revision in a transformers.js cache key, when the URL has one. */
export function modelRevisionFromUrl(url: string): string | null {
  const match = url.match(/\/resolve\/([^/?#]+)\//i);
  return match ? decodeURIComponent(match[1]) : null;
}

export async function cachedResponseSize(response: Response): Promise<number> {
  const header = Number(response.headers.get("content-length"));
  if (Number.isFinite(header) && header > 0) return header;
  try {
    return (await response.clone().blob()).size;
  } catch {
    return 0;
  }
}

/**
 * Rows that add up to site usage. Cache bytes are measured. App data is the
 * rest of navigator.storage usage, with photo bytes pulled out of that rest.
 */
export function summarizeMeasuredStorage(input: {
  usage: number;
  quota: number;
  models: { size: number; items: number; copies: number };
  tiles: { size: number; items: number };
  otherCache: { size: number; items: number };
  images: { size: number; items: number };
}): StorageSummary {
  const cacheAccounted =
    input.models.size + input.tiles.size + input.otherCache.size;
  const originRemainder =
    input.usage > 0 ? Math.max(0, input.usage - cacheAccounted) : 0;
  const photoSize =
    input.usage > 0
      ? Math.min(input.images.size, originRemainder)
      : input.images.size;
  const database = input.usage > 0 ? originRemainder - photoSize : 0;
  const totalSize =
    input.usage > 0
      ? input.usage
      : cacheAccounted + input.images.size;

  const items: StorageItem[] = [
    {
      name: "AI model",
      size: input.models.size,
      type: "assets",
      description:
        input.models.copies > 1
          ? `${input.models.copies} downloaded versions`
          : "On-device reader",
      canClear: false,
    },
    {
      name: "Map tiles",
      size: input.tiles.size,
      type: "tiles",
      description: "Offline map",
      canClear: true,
    },
    {
      name: "Photos",
      size: photoSize,
      type: "images",
      description: "Plot photos on this device",
      canClear: false,
    },
    {
      name: "App data",
      size: database,
      type: "database",
      description: "Cemeteries, plots, and names",
      canClear: false,
    },
  ];
  if (input.otherCache.size > 0) {
    items.push({
      name: "Other cache",
      size: input.otherCache.size,
      type: "cache",
      description: "Saved pages and files",
      canClear: true,
    });
  }

  return {
    totalSize,
    quota: input.quota,
    totalItems: items.length,
    breakdown: {
      cache: input.otherCache,
      database: { size: database, items: 1 },
      assets: { size: 0, items: 0 },
      tiles: input.tiles,
      images: { size: photoSize, items: input.images.items },
      models: input.models,
      other: { size: 0, items: 0 },
    },
    items,
  };
}

class StorageAnalyticsService {
  private powerSyncStore: any = null;

  constructor() {
    // We'll inject the PowerSync store when needed
  }

  setPowerSyncStore(store: any) {
    this.powerSyncStore = store;
  }

  // Format bytes to human readable format
  formatBytes(bytes: number): string {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  }

  // Get localStorage usage
  async getLocalStorageUsage(): Promise<StorageItem[]> {
    const items: StorageItem[] = [];
    let totalSize = 0;

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) {
        const value = localStorage.getItem(key);
        const size = new Blob([value || ""]).size;
        totalSize += size;

        let type: StorageItem["type"] = "other";
        let description = "Local storage item";

        if (key.includes("pmtiles") || key.includes("tile")) {
          type = "tiles";
          description = "Map tile data";
        } else if (key.includes("image") || key.includes("photo")) {
          type = "images";
          description = "Image data";
        } else if (key.includes("cache")) {
          type = "cache";
          description = "Cached data";
        } else if (key.includes("zoom") || key.includes("settings")) {
          type = "other";
          description = "App settings";
        }

        items.push({
          name: key,
          size,
          type,
          description,
          canClear: true,
        });
      }
    }

    return items;
  }

  // Get IndexedDB usage (PMTiles cache)
  async getIndexedDBUsage(): Promise<StorageItem[]> {
    const items: StorageItem[] = [];

    try {
      // Get actual IndexedDB usage
      const indexedDBInfo = await this.getIndexedDBInfo();

      if (indexedDBInfo.totalSize > 0) {
        items.push({
          name: "IndexedDB Storage",
          size: indexedDBInfo.totalSize,
          type: "database",
          description: `${indexedDBInfo.databases.length} databases`,
          canClear: false,
        });
      }

      // Check PMTiles cache specifically
      const pmtilesCache = await this.getPMTilesCacheInfo();
      if (pmtilesCache.totalSize > 0) {
        items.push({
          name: "PMTiles Cache",
          size: pmtilesCache.totalSize,
          type: "tiles",
          description: `${pmtilesCache.totalEntries} cached PMTiles files`,
          canClear: true,
        });
      }
    } catch (error) {
      console.warn("Could not get IndexedDB usage:", error);
    }

    return items;
  }

  // Get PowerSync database usage
  async getPowerSyncUsage(): Promise<StorageItem[]> {
    const items: StorageItem[] = [];

    if (!this.powerSyncStore?.powerSync) {
      return items;
    }

    try {
      // Get table-specific information (for row counts only)
      const tables = await this.getTableInfo();

      for (const table of tables) {
        items.push({
          name: table.name,
          size: 0, // Don't estimate individual table sizes
          type: "database",
          description: `${table.rows} rows`,
          canClear: false,
        });
      }

      // Don't add total database size here - it's handled by IndexedDB detection
      // This prevents double-counting
    } catch (error) {
      console.warn("Could not get PowerSync usage:", error);
    }

    return items;
  }

  // Get cached assets usage
  async getCachedAssetsUsage(): Promise<StorageItem[]> {
    const items: StorageItem[] = [];

    try {
      // Check service worker cache
      if ("caches" in window) {
        const cacheNames = await caches.keys();
        let totalCacheSize = 0;

        for (const cacheName of cacheNames) {
          const cache = await caches.open(cacheName);
          const requests = await cache.keys();
          let cacheSize = 0;

          for (const request of requests) {
            const response = await cache.match(request);
            if (response) {
              const blob = await response.blob();
              cacheSize += blob.size;
            }
          }

          totalCacheSize += cacheSize;

          items.push({
            name: `Cache: ${cacheName}`,
            size: cacheSize,
            type: "cache",
            description: `${requests.length} cached resources`,
            canClear: true,
          });
        }

        if (totalCacheSize > 0) {
          items.push({
            name: "Service Worker Cache (Total)",
            size: totalCacheSize,
            type: "cache",
            description: "All cached web assets",
            canClear: true,
          });
        }
      }
    } catch (error) {
      console.warn("Could not get cached assets usage:", error);
    }

    return items;
  }

  // Get image storage usage
  async getImageStorageUsage(): Promise<StorageItem[]> {
    const items: StorageItem[] = [];

    if (!this.powerSyncStore?.powerSync) {
      return items;
    }

    try {
      // Get image data from PowerSync
      const images = await this.powerSyncStore.powerSync.getAll(
        "SELECT id, file_name, original_size, thumbnail_size, cloud_url FROM plot_images",
      );

      let totalThumbnailSize = 0;
      let totalOriginalSize = 0;
      let cloudImages = 0;

      for (const image of images) {
        totalThumbnailSize += parseInt(image.thumbnail_size || "0");
        totalOriginalSize += parseInt(image.original_size || "0");
        if (image.cloud_url) cloudImages++;
      }

      if (totalThumbnailSize > 0) {
        items.push({
          name: "Image Thumbnails",
          size: totalThumbnailSize,
          type: "images",
          description: `${images.length} thumbnail images`,
          canClear: false,
        });
      }

      if (cloudImages > 0) {
        items.push({
          name: "Cloud Images",
          size: 0, // Cloud images don't take local storage
          type: "images",
          description: `${cloudImages} images stored in cloud`,
          canClear: false,
        });
      }

      // Legacy images (full base64 data)
      const legacyImages = images.filter(
        (img: any) => img.original_size && !img.thumbnail_size,
      );
      if (legacyImages.length > 0) {
        const legacySize = legacyImages.reduce(
          (sum: number, img: any) => sum + parseInt(img.original_size || "0"),
          0,
        );
        items.push({
          name: "Legacy Images",
          size: legacySize,
          type: "images",
          description: `${legacyImages.length} legacy full-size images`,
          canClear: false,
        });
      }
    } catch (error) {
      console.warn("Could not get image storage usage:", error);
    }

    return items;
  }

  // Get comprehensive storage summary
  async getStorageSummary(): Promise<StorageSummary> {
    const estimate = await this.readStorageEstimate();
    const caches = await this.measureCacheStorage();
    const images = await this.measureImageBytes();
    return summarizeMeasuredStorage({
      usage: estimate.usage,
      quota: estimate.quota,
      models: caches.models,
      tiles: caches.tiles,
      otherCache: caches.cache,
      images,
    });
  }

  private async readStorageEstimate(): Promise<{ usage: number; quota: number }> {
    try {
      if ("storage" in navigator && "estimate" in navigator.storage) {
        const estimate = await navigator.storage.estimate();
        return { usage: estimate.usage || 0, quota: estimate.quota || 0 };
      }
    } catch (error) {
      console.warn("Could not read storage estimate:", error);
    }
    return { usage: 0, quota: 0 };
  }

  private async measureImageBytes(): Promise<{ size: number; items: number }> {
    const items = await this.getImageStorageUsage();
    return {
      size: items.reduce((sum, item) => sum + item.size, 0),
      items: items.length,
    };
  }

  private async measureCacheStorage(): Promise<{
    models: { size: number; items: number; copies: number };
    tiles: { size: number; items: number };
    cache: { size: number; items: number };
  }> {
    const models = { size: 0, items: 0, copies: 0 };
    const tiles = { size: 0, items: 0 };
    const cache = { size: 0, items: 0 };
    const revisions = new Set<string>();

    if (!("caches" in window)) {
      return { models, tiles, cache };
    }

    try {
      const names = await caches.keys();
      for (const name of names) {
        const bucket = await caches.open(name);
        const requests = await bucket.keys();
        for (const request of requests) {
          const response = await bucket.match(request);
          if (!response) continue;
          const size = await cachedResponseSize(response);
          const kind = classifyCacheEntry(name, request.url);
          if (kind === "models") {
            models.size += size;
            models.items += 1;
            const revision = modelRevisionFromUrl(request.url);
            if (revision && size > 1_000_000) revisions.add(revision);
          } else if (kind === "tiles") {
            tiles.size += size;
            tiles.items += 1;
          } else {
            cache.size += size;
            cache.items += 1;
          }
        }
      }
    } catch (error) {
      console.warn("Could not measure cache storage:", error);
    }

    models.copies =
      revisions.size > 0 ? revisions.size : models.size > 0 ? 1 : 0;
    return { models, tiles, cache };
  }

  // Helper methods
  private async getIndexedDBInfo() {
    try {
      // Use the Storage API to get IndexedDB usage
      if ("storage" in navigator && "estimate" in navigator.storage) {
        const estimate = await navigator.storage.estimate();
        const databases = [];

        // Try to get database names (this is limited by browser security)
        try {
          // Check for common database names used by the app
          const commonDBs = ["PowerSync", "PMTiles", "wa-sqlite", "fieldwork"];
          for (const dbName of commonDBs) {
            try {
              // This is a best-effort attempt to detect databases
              databases.push({
                name: dbName,
                size: estimate.usage ? estimate.usage / commonDBs.length : 0,
              });
            } catch {
              // Database doesn't exist or can't be accessed
            }
          }
        } catch {
          // Fallback to total usage
          databases.push({ name: "IndexedDB", size: estimate.usage || 0 });
        }

        return {
          totalSize: estimate.usage || 0,
          databases:
            databases.length > 0
              ? databases
              : [{ name: "IndexedDB", size: estimate.usage || 0 }],
        };
      }

      return { totalSize: 0, databases: [] };
    } catch (error) {
      console.warn("Could not get IndexedDB info:", error);
      return { totalSize: 0, databases: [] };
    }
  }

  private async getPMTilesCacheInfo() {
    try {
      // Try to get PMTiles cache info from IndexedDB
      const indexedDBInfo = await this.getIndexedDBInfo();

      // Estimate PMTiles cache size (usually a portion of total IndexedDB)
      // This is a rough estimate since we can't directly access PMTiles internal storage
      const estimatedPMTilesSize = Math.floor(indexedDBInfo.totalSize * 0.3); // Assume 30% is PMTiles

      return {
        totalSize: estimatedPMTilesSize,
        totalEntries: Math.floor(estimatedPMTilesSize / 1024), // Rough estimate of entries
      };
    } catch {
      return { totalSize: 0, totalEntries: 0 };
    }
  }

  private async getTableInfo() {
    if (!this.powerSyncStore?.powerSync) return [];

    try {
      const tables = ["plots", "plot_images", "locations"];
      const tableInfo = [];

      for (const table of tables) {
        const count = await this.powerSyncStore.powerSync.get(
          `SELECT COUNT(*) as count FROM ${table}`,
        );
        const rows = count?.count || 0;
        // Don't estimate size - we'll use actual IndexedDB size instead
        const estimatedSize = 0;

        tableInfo.push({
          name: table,
          size: estimatedSize,
          rows,
        });
      }

      return tableInfo;
    } catch (error) {
      console.warn("Could not get table info:", error);
      return [];
    }
  }

  // Clear specific storage types
  async clearStorage(type: StorageItem["type"]): Promise<void> {
    switch (type) {
      case "cache":
        if ("caches" in window) {
          const cacheNames = await caches.keys();
          await Promise.all(cacheNames.map((name) => caches.delete(name)));
        }
        break;
      case "tiles":
        // Clear PMTiles cache
        try {
          // Implementation would depend on your PMTiles cache structure
          console.log("Clearing PMTiles cache...");
        } catch (error) {
          console.error("Error clearing PMTiles cache:", error);
        }
        break;
      case "other":
        // Clear localStorage items that can be cleared
        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && (key.includes("zoom") || key.includes("settings"))) {
            keysToRemove.push(key);
          }
        }
        keysToRemove.forEach((key) => localStorage.removeItem(key));
        break;
    }
  }
}

export const storageAnalytics = new StorageAnalyticsService();
