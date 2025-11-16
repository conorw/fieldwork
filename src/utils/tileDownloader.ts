// Tile downloader utility for offline map tiles

/**
 * Calculate tiles needed for a specific zoom level
 * @param {Array} extent - [minLon, minLat, maxLon, maxLat]
 * @param {number} zoom - Zoom level
 * @returns {number} Number of tiles for this zoom level
 */
const calculateTilesForZoom = (extent: [number, number, number, number], zoom: number) => {
  const [minLon, minLat, maxLon, maxLat] = extent
  
  console.log(`calculateTilesForZoom: extent=[${minLon}, ${minLat}, ${maxLon}, ${maxLat}], zoom=${zoom}`)
  
  // Convert to tile coordinates
  const minTile = lonLatToTile(minLon, minLat, zoom)
  const maxTile = lonLatToTile(maxLon, maxLat, zoom)
  
  console.log(`calculateTilesForZoom: minTile=${JSON.stringify(minTile)}, maxTile=${JSON.stringify(maxTile)}`)
  
  // Handle the case where minTile coordinates might be greater than maxTile coordinates
  const startX = Math.min(minTile.x, maxTile.x)
  const endX = Math.max(minTile.x, maxTile.x)
  const startY = Math.min(minTile.y, maxTile.y)
  const endY = Math.max(minTile.y, maxTile.y)
  
  const tilesX = endX - startX + 1
  const tilesY = endY - startY + 1
  
  const totalTiles = tilesX * tilesY
  console.log(`calculateTilesForZoom: tilesX=${tilesX}, tilesY=${tilesY}, total=${totalTiles}`)
  
  return totalTiles
}

/**
 * Convert longitude/latitude to tile coordinates
 * @param {number} lon - Longitude
 * @param {number} lat - Latitude
 * @param {number} zoom - Zoom level
 * @returns {Object} Tile coordinates {x, y}
 */
const lonLatToTile = (lon: number, lat: number, zoom: number) => {
  console.log(`lonLatToTile: lon=${lon}, lat=${lat}, zoom=${zoom}`)
  
  const n = Math.pow(2, zoom)
  const xtile = Math.floor((lon + 180) / 360 * n)
  const ytile = Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * n)
  
  const result = { x: xtile, y: ytile }
  console.log(`lonLatToTile: result=${JSON.stringify(result)}`)
  
  return result
}

/**
 * Get tile coordinates for a given extent and zoom level
 * @param {Array} extent - [minLon, minLat, maxLon, maxLat]
 * @param {number} zoom - Zoom level
 * @returns {Array} Array of [x, y] tile coordinates
 */
const getTileCoordinates = (extent: [number, number, number, number], zoom: number) => {
  const [minLon, minLat, maxLon, maxLat] = extent
  
  console.log(`getTileCoordinates: extent=[${minLon}, ${minLat}, ${maxLon}, ${maxLat}], zoom=${zoom}`)
  
  // Convert to tile coordinates
  const minTile = lonLatToTile(minLon, minLat, zoom)
  const maxTile = lonLatToTile(maxLon, maxLat, zoom)
  
  console.log(`getTileCoordinates: minTile=${JSON.stringify(minTile)}, maxTile=${JSON.stringify(maxTile)}`)
  
  // Ensure we have valid tile coordinates
  if (minTile.x === undefined || minTile.y === undefined || maxTile.x === undefined || maxTile.y === undefined) {
    console.error('getTileCoordinates: Invalid tile coordinates calculated:', { minTile, maxTile })
    return []
  }
  
  // Handle the case where minTile coordinates might be greater than maxTile coordinates
  const startX = Math.min(minTile.x, maxTile.x)
  const endX = Math.max(minTile.x, maxTile.x)
  const startY = Math.min(minTile.y, maxTile.y)
  const endY = Math.max(minTile.y, maxTile.y)
  
  console.log(`getTileCoordinates: tile range: x=${startX} to ${endX}, y=${startY} to ${endY}`)
  
  const coordinates = []
  for (let x = startX; x <= endX; x++) {
    for (let y = startY; y <= endY; y++) {
      coordinates.push([x, y])
    }
  }
  
  console.log(`getTileCoordinates: generated ${coordinates.length} tile coordinates`)
  if (coordinates.length > 0) {
    console.log(`getTileCoordinates: first 5 coordinates:`, coordinates.slice(0, 5))
  }
  
  return coordinates
}

/**
 * Download a single tile
 * @param {string} tileUrl - Tile URL
 * @returns {Promise<string|null>} Base64 encoded tile data or null if failed
 */
const downloadTile = async (tileUrl: string): Promise<string | null> => {
  try {
    const response = await fetch(tileUrl)
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    const blob = await response.blob()
    return await blobToBase64(blob)
  } catch (error) {
    console.warn(`Failed to download tile ${tileUrl}:`, error)
    return null
  }
}

/**
 * Convert blob to base64
 * @param {Blob} blob - Blob to convert
 * @returns {Promise<string>} Base64 string
 */
const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result
      if (typeof result === 'string') {
        const base64 = result.split(',')[1] // Remove data:image/png;base64, prefix
        resolve(base64)
      } else if (result) {
        // ArrayBuffer branch
        const bytes = new Uint8Array(result)
        let binary = ''
        for (let i = 0; i < bytes.byteLength; i++) {
          binary += String.fromCharCode(bytes[i])
        }
        resolve(btoa(binary))
      } else {
        reject(new Error('Failed to read blob'))
      }
    }
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

/**
 * Download tiles for a given extent and zoom levels
 * @param {Array} extent - [minLon, minLat, maxLon, maxLat]
 * @param {number} minZoom - Minimum zoom level
 * @param {number} maxZoom - Maximum zoom level
 * @param {Function} onProgress - Progress callback (progress: number)
 * @returns {Promise<Object>} Downloaded tiles data
 */
export const downloadTiles = async (
  extent: [number, number, number, number],
  minZoom: number,
  maxZoom: number,
  onProgress: (progress: number) => void
) => {
  try {
    console.log('Starting tile download...')
    console.log('Download parameters:', { extent, minZoom, maxZoom })
    
    // Validate input parameters
    if (!extent || extent.length !== 4) {
      throw new Error('Invalid extent: must be an array of 4 values [minLon, minLat, maxLon, maxLat]')
    }
    
    if (minZoom < 0 || maxZoom < 0 || minZoom > maxZoom) {
      throw new Error('Invalid zoom levels: minZoom and maxZoom must be positive and minZoom <= maxZoom')
    }
    
    let totalTiles = 0
    for (let z = minZoom; z <= maxZoom; z++) {
      const tilesForZoom = calculateTilesForZoom(extent, z)
      totalTiles += tilesForZoom
      console.log(`Zoom ${z}: calculated ${tilesForZoom} tiles`)
    }
    console.log(`Total tiles to download: ${totalTiles}`)
    
    if (totalTiles === 0) {
      throw new Error('No tiles to download: calculated 0 tiles for the given extent and zoom levels')
    }
    
    let downloadedTiles = 0
    const tileCache: Record<string, string> = {}
    
    for (let z = minZoom; z <= maxZoom; z++) {
      console.log(`Downloading tiles for zoom level ${z}...`)
      const tileCoords = getTileCoordinates(extent, z)
      console.log(`Zoom ${z}: got ${tileCoords.length} tile coordinates`)
      
      if (tileCoords.length === 0) {
        console.warn(`No tile coordinates generated for zoom level ${z}`)
        continue
      }
      
      console.log(`Zoom ${z}: ${calculateTilesForZoom(extent, z)} tiles, coordinates:`, tileCoords.slice(0, 5))
      
      for (const [x, y] of tileCoords) {
        try {
          const tileUrl = `https://cartodb-basemaps-a.global.ssl.fastly.net/light_all/${z}/${x}/${y}.png`
          const tileData: string | null = await downloadTile(tileUrl)
          if (tileData) {
            const tileKey = `${z}/${x}/${y}`
            tileCache[tileKey] = tileData
            downloadedTiles++
            // Assuming downloadProgress is a global variable or passed as an argument
            // If not, this line will cause an error. For now, commenting out.
            // downloadProgress.value = Math.round((downloadedTiles / totalTiles) * 100)
            onProgress(Math.round((downloadedTiles / totalTiles) * 100))
            await new Promise(resolve => setTimeout(resolve, 50)) // Rate limiting
          }
        } catch (error) {
          console.warn(`Failed to download tile ${z}/${x}/${y}:`, error)
        }
      }
    }
    
    console.log('Saving tiles to localStorage...')
    const tileData = { 
      tiles: tileCache, 
      extent: extent, 
      minZoom: minZoom, 
      maxZoom: maxZoom, 
      timestamp: Date.now() 
    }
    
    try {
      localStorage.setItem('offlineMapTiles', JSON.stringify(tileData))
      console.log('Tiles saved to localStorage successfully')
      
      // Verify storage
      const testData = localStorage.getItem('offlineMapTiles')
      if (testData) {
        const testParsed = JSON.parse(testData)
        console.log('Verification - stored tile count:', Object.keys(testParsed.tiles).length)
        console.log('Verification - sample tile keys:', Object.keys(testParsed.tiles).slice(0, 5))
      }
      
      console.log('Tile download completed')
      return tileData
    } catch (error) {
      console.error('Error saving tiles to localStorage:', error)
      throw new Error('Download completed but failed to save to localStorage')
    }
  } catch (error) {
    console.error('Error downloading tiles:', error)
    throw error
  }
}

/**
 * Load tiles from localStorage
 * @returns {Object|null} Tiles data or null if not found
 */
export const loadTiles = (): {
  tiles: Record<string, string>
  extent: [number, number, number, number]
  minZoom: number
  maxZoom: number
  timestamp: number
} | null => {
  try {
    const tileData = localStorage.getItem('offlineMapTiles')
    if (tileData) {
      const parsed = JSON.parse(tileData)
      console.log('Loaded tiles from localStorage:', {
        tileCount: Object.keys(parsed.tiles).length,
        extent: parsed.extent,
        zoomRange: `${parsed.minZoom}-${parsed.maxZoom}`,
        timestamp: new Date(parsed.timestamp).toLocaleString()
      })
      return parsed
    }
    return null
  } catch (error) {
    console.error('Error loading tiles from localStorage:', error)
    return null
  }
}

/**
 * Check if offline tiles are available
 * @returns {boolean} True if offline tiles exist
 */
export const hasOfflineTiles = (): boolean => {
  const tiles = loadTiles()
  return tiles !== null && Object.keys(tiles.tiles).length > 0
}

/**
 * Test function to debug tile coordinate calculation
 * @param {Array} extent - [minLon, minLat, maxLon, maxLat]
 * @param {number} minZoom - Minimum zoom level
 * @param {number} maxZoom - Maximum zoom level
 */
export const testTileCalculation = (
  extent: [number, number, number, number],
  minZoom: number,
  maxZoom: number
) => {
  console.log('=== TILE CALCULATION TEST ===')
  console.log('Input extent:', extent)
  console.log('Zoom range:', minZoom, 'to', maxZoom)
  
  for (let z = minZoom; z <= maxZoom; z++) {
    console.log(`\n--- Zoom Level ${z} ---`)
    const tiles = calculateTilesForZoom(extent, z)
    const coords = getTileCoordinates(extent, z)
    console.log(`Calculated tiles: ${tiles}`)
    console.log(`Generated coordinates: ${coords.length}`)
    if (coords.length > 0) {
      console.log(`First 3 coordinates:`, coords.slice(0, 3))
    }
  }
  console.log('=== END TEST ===')
}

/**
 * Clear offline tiles from localStorage
 */
export const clearTiles = () => {
  try {
    localStorage.removeItem('offlineMapTiles')
    console.log('Offline tiles cleared from localStorage')
  } catch (error) {
    console.error('Error clearing offline tiles:', error)
  }
} 