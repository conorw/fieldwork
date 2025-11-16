// Tile storage calculator utility
export const calculateTileStorage = (
  extent: [number, number, number, number],
  minZoom: number,
  maxZoom: number
) => {
  const results = {
    totalTiles: 0,
    storageMB: 0,
    byZoomLevel: {} as Record<number, { tiles: number; storageMB: number; metersPerPixel: number }>
  }
  
  // Average tile size: ~15KB for PNG tiles
  const avgTileSizeKB = 15
  
  for (let z = minZoom; z <= maxZoom; z++) {
    const tilesForZoom = calculateTilesForZoom(extent, z)
    const storageKB = tilesForZoom * avgTileSizeKB
    const storageMB = storageKB / 1024
    
    results.byZoomLevel[z] = {
      tiles: tilesForZoom,
      storageMB: storageMB,
      metersPerPixel: 156543.03392804097 / Math.pow(2, z)
    }
    
    results.totalTiles += tilesForZoom
    results.storageMB += storageMB
  }
  
  return results
}

const calculateTilesForZoom = (extent: [number, number, number, number], zoom: number) => {
  const [minLon, minLat, maxLon, maxLat] = extent
  
  const minTile = lonLatToTile(minLon, minLat, zoom)
  const maxTile = lonLatToTile(maxLon, maxLat, zoom)
  
  const startX = Math.min(minTile.x, maxTile.x)
  const endX = Math.max(minTile.x, maxTile.x)
  const startY = Math.min(minTile.y, maxTile.y)
  const endY = Math.max(minTile.y, maxTile.y)
  
  const tilesX = endX - startX + 1
  const tilesY = endY - startY + 1
  
  return tilesX * tilesY
}

const lonLatToTile = (lon: number, lat: number, zoom: number) => {
  const n = Math.pow(2, zoom)
  const xtile = Math.floor((lon + 180) / 360 * n)
  const ytile = Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * n)
  return { x: xtile, y: ytile }
}

// Example calculation for 1km x 1km area
export const exampleCalculation = () => {
  // 1km x 1km area (roughly 0.009 degrees)
  const extent = [-6.238, 55.204, -6.229, 55.213] // Example coordinates
  
  console.log('=== TILE STORAGE CALCULATION ===')
  console.log('Area: 1km x 1km')
  console.log('Extent:', extent)
  
  // Calculate for different zoom ranges
  const scenarios = [
    { name: 'Basic (16-18)', minZoom: 16, maxZoom: 18 },
    { name: 'Standard (16-19)', minZoom: 16, maxZoom: 19 },
    { name: 'Detailed (16-20)', minZoom: 16, maxZoom: 20 },
    { name: 'High Detail (16-21)', minZoom: 16, maxZoom: 21 },
    { name: 'Ultra Detail (16-22)', minZoom: 16, maxZoom: 22 }
  ]
  
  scenarios.forEach(scenario => {
    const result = calculateTileStorage(extent as [number, number, number, number], scenario.minZoom, scenario.maxZoom)
    console.log(`\n${scenario.name}:`)
    console.log(`  Total tiles: ${result.totalTiles.toLocaleString()}`)
    console.log(`  Storage: ${result.storageMB.toFixed(1)} MB`)
    console.log(`  Zoom breakdown:`)
    
    Object.entries(result.byZoomLevel).forEach(([zoom, data]) => {
      console.log(`    Zoom ${zoom}: ${data.tiles} tiles (${data.storageMB.toFixed(1)} MB, ${data.metersPerPixel.toFixed(1)}m/pixel)`)
    })
  })
  
  console.log('\n=== RECOMMENDATIONS ===')
  console.log('For cemetery management:')
  console.log('- Zoom 16-18: Perfect for plot-level work')
  console.log('- Zoom 19: Good for detailed inspection')
  console.log('- Zoom 20+: Usually unnecessary, high storage cost')
  console.log('- Recommended range: 16-19 (saves ~70% storage vs 16-22)')
} 