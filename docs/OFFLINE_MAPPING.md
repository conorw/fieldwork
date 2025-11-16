# Offline Mapping

Fieldwork uses PMTiles (a single-file tile format) with IndexedDB caching to enable full offline map functionality. This allows users to view and interact with maps even without an internet connection.

## Overview

The offline mapping system consists of:
- **PMTiles**: Efficient single-file tile archives
- **IndexedDB Cache**: Browser-based storage for PMTiles data
- **Automatic Caching**: Maps are cached as you view them
- **Cache Management**: Automatic size limits and expiry

## How It Works

### 1. PMTiles Format

PMTiles is a single-file archive format that contains all map tiles for a location. Instead of downloading individual tiles, the entire map data is packaged into one file, making it:
- **Efficient**: Single HTTP request instead of hundreds
- **Fast**: Optimized for streaming and random access
- **Compact**: Better compression than individual tiles

### 2. Caching Strategy

When you view a location on the map:

1. **Check Cache**: The app first checks if PMTiles data is already cached in IndexedDB
2. **Use Cached Data**: If found, loads immediately from cache (works offline)
3. **Download if Missing**: If not cached, downloads from the PMTiles URL
4. **Cache Automatically**: Downloads are automatically stored in IndexedDB for future use

### 3. Cache Storage

PMTiles are stored in IndexedDB with the following structure:

```typescript
{
  locationId: string,        // Unique location identifier
  pmtilesUrl: string,         // Source URL for the PMTiles file
  data: ArrayBuffer,          // The actual PMTiles data
  timestamp: number,          // When it was cached
  size: number,               // Size in bytes
  bbox: [number, number, number, number],  // Bounding box
  minZoom: number,           // Minimum zoom level
  maxZoom: number            // Maximum zoom level
}
```

## Cache Management

### Size Limits

- **Maximum Cache Size**: 100MB total
- **Automatic Cleanup**: Oldest entries are removed when limit is reached
- **LRU Strategy**: Least recently used entries are removed first

### Cache Expiry

- **Expiry Time**: 7 days
- **Automatic Removal**: Expired entries are removed on access
- **Manual Clear**: Users can clear cache from Settings

### Cache Information

You can check cache status:
- Total size used
- Number of cached locations
- Age of each cached entry
- Individual entry sizes

## Implementation Details

### PMTiles Service (`src/utils/pmtilesService.ts`)

The PMTiles service handles:
- Retrieving PMTiles from cache or URL
- Automatic caching of downloaded data
- Cache validation and verification

```typescript
// Get PMTiles for a location (checks cache first)
const pmtiles = await pmtilesService.getPMTiles(location)

// Preload PMTiles for offline use
await pmtilesService.preloadPMTiles(location)
```

### PMTiles Cache Manager (`src/utils/pmtilesCache.ts`)

The cache manager handles:
- IndexedDB operations
- Cache size management
- Expiry checking
- Cache information retrieval

```typescript
// Check if location is cached
const isCached = await pmtilesCache.isPMTilesCached(locationId)

// Get cache information
const info = await pmtilesCache.getCacheInfo()

// Clear all cache
await pmtilesCache.clearCache()
```

### Tile Source Creation (`src/utils/tileSource.ts`)

The tile source factory creates OpenLayers tile sources:
- Checks cache first
- Falls back to download if needed
- Creates appropriate tile source for OpenLayers

## Usage

### Automatic Caching

Maps are cached automatically when you:
- View a location on the map
- Navigate to different areas
- Zoom in/out to different levels

No manual action required - the app handles everything automatically.

### Preloading Maps

You can preload maps for offline use:

1. **Navigate to Settings**
2. **Select a Location**
3. **View the Map** - This triggers automatic caching
4. **Wait for Download** - Progress is shown in the UI

### Offline Usage

Once cached, maps work completely offline:
- View cached locations
- Navigate around cached areas
- Zoom in/out within cached zoom levels
- Create and edit plots (data is stored locally)

## Technical Details

### IndexedDB Storage

- **Database Name**: `pmtiles-cache`
- **Object Store**: `pmtiles`
- **Key**: `locationId`
- **Index**: `by-timestamp` (for LRU cleanup)

### PMTiles Format

- **Magic Bytes**: `PMTi` (0x50 0x4D 0x54 0x69)
- **Format**: Single-file archive with optimized structure
- **Compression**: Internal compression for efficient storage

### Performance

- **First Load**: Downloads PMTiles file (varies by size, typically 1-10MB)
- **Cached Load**: Instant from IndexedDB
- **Cache Write**: Asynchronous, doesn't block map rendering
- **Cache Read**: Fast, typically < 100ms

## Troubleshooting

### Maps Not Loading Offline

1. **Check Cache Status**: Verify location is cached in Settings
2. **Check Cache Size**: Ensure cache hasn't been cleared
3. **Verify Location**: Make sure you're viewing a cached location
4. **Check Browser Storage**: Ensure IndexedDB is enabled

### Cache Not Working

1. **Browser Support**: Ensure browser supports IndexedDB
2. **Storage Quota**: Check if browser storage quota is exceeded
3. **Private Browsing**: Some browsers disable IndexedDB in private mode
4. **Clear and Retry**: Try clearing cache and re-downloading

### Cache Size Issues

1. **Automatic Cleanup**: Oldest entries are removed automatically
2. **Manual Clear**: Clear cache from Settings if needed
3. **Selective Caching**: Only frequently used locations are cached
4. **Storage Limits**: Browser may limit IndexedDB size (typically 50% of disk space)

## Best Practices

1. **Preload Important Locations**: Cache frequently used locations before going offline
2. **Monitor Cache Size**: Check cache size periodically
3. **Clear Unused Cache**: Remove locations you no longer need
4. **Plan Ahead**: Download maps before going to areas with poor connectivity

## Related Documentation

- [Offline Data](./OFFLINE_DATA.md) - Data synchronization and storage
- [Photo Handling](./PHOTO_HANDLING.md) - Image caching and storage
- [Main README](../README.md) - General application documentation

