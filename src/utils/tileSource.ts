import { pmtilesService, type PMTilesLocation } from './pmtilesService.js'
import VectorTile from "ol/layer/VectorTile";
import { PMTilesVectorSource } from "ol-pmtiles";
import { Style, Stroke, Fill, Icon } from 'ol/style';

const ONLINE_PMTILES_URL = "https://6ftgthlf9zt2ofxl.public.blob.vercel-storage.com/pmtiles/OUTPUT.pmtiles"

export const createOnlinePMTilesTileSource = (sourceName = 'Unknown') => {
  const url = ONLINE_PMTILES_URL
  const vectorLayer = createVectorTile(url);
  console.log(`${sourceName}: Online PMTiles tile source created successfully`)
  return vectorLayer
}

const createVectorTile = (url: string) => {
  const source = new PMTilesVectorSource({
    url: url,
    attributions: ["© PMTiles"],
  })

  // Add debug logging
  logAvailableFeatures(source)

  return new VectorTile({
    source: source,
    style: createVectorTileStyle
  });
}

// Debug function to log all available features
const logAvailableFeatures = (source: any) => {
  console.log('🔍 Analyzing PMTiles features...')

  // This will be called when tiles load
  source.on('tileloadend', (event: any) => {
    const tile = event.tile
    if (tile && tile.getFeatures) {
      const features = tile.getFeatures()
      console.log(`📊 Tile loaded with ${features.length} features`)

      // Log unique feature types
      const featureTypes = new Set()
      features.forEach((feature: any) => {
        const layer = feature.get('layer')
        const type = feature.get('type')
        const name = feature.get('name')
        if (layer) featureTypes.add(`layer:${layer}`)
        if (type) featureTypes.add(`type:${type}`)
        if (name) featureTypes.add(`name:${name}`)
      })
    }
  })
}

// Global layer visibility state
let layerVisibilityState: Record<string, boolean> = {
  buildings: true,
  earth: true,
  landuse: true,
  pois: false,
  roads: true,
  water: true
}

// Function to update layer visibility
export const updateLayerVisibility = (newVisibility: Record<string, boolean>) => {
  layerVisibilityState = { ...layerVisibilityState, ...newVisibility }
  console.log('Layer visibility updated:', layerVisibilityState)
}

// Function to get current layer visibility
export const getLayerVisibility = () => layerVisibilityState

// Function to refresh map layers (forces re-styling)
export const refreshMapLayers = (mapInstance: any) => {
  if (!mapInstance) return
  
  try {
    const layers = mapInstance.getLayers()
    layers.forEach((layer: any) => {
      // Force layer refresh by triggering a style update
      if (layer.getStyle && typeof layer.getStyle === 'function') {
        // Force re-render by changing the style function reference
        const currentStyle = layer.getStyle()
        layer.setStyle(currentStyle)
        
        // Also trigger a change event to force re-render
        layer.changed()
      }
      
      // For vector tile layers, also refresh the source
      if (layer.getSource && layer.getSource().refresh) {
        layer.getSource().refresh()
      }
    })
    
    // Force map re-render
    mapInstance.render()
    
    console.log('Map layers refreshed and re-rendered')
  } catch (error) {
    console.error('Error refreshing map layers:', error)
  }
}

// Create a comprehensive style function for vector tiles
const createVectorTileStyle = (feature: any): Style | Style[] | void => {
  const featureType = feature.get('layer') || feature.get('type') || 'unknown'

  // Check if this layer type should be visible (always get current state)
  const currentVisibility = getLayerVisibility()
  if (!currentVisibility[featureType as keyof typeof currentVisibility]) {
    return undefined // Don't render this feature
  }

  // Style based on feature type/layer
  switch (featureType) {
    case 'buildings':
      return new Style({
        stroke: new Stroke({
          color: '#8B4513',
          width: 1
        }),
        fill: new Fill({
          color: 'rgba(139, 69, 19, 0.3)'
        })
      })

    case 'roads':
      return new Style({
        stroke: new Stroke({
          color: '#666666',
          width: 1
        })
      })

    case 'water':
      return new Style({
        stroke: new Stroke({
          color: '#4A90E2',
          width: 1
        }),
        fill: new Fill({
          color: 'rgba(74, 144, 226, 0.4)'
        })
      })

    case 'landuse':
      return new Style({
        stroke: new Stroke({
          color: '#90EE90',
          width: 1
        }),
        fill: new Fill({
          color: 'rgba(144, 238, 144, 0.3)'
        })
      })

    case 'earth':
      return new Style({
        stroke: new Stroke({
          color: '#8B7355',
          width: 1
        }),
        fill: new Fill({
          color: 'rgba(139, 115, 85, 0.2)'
        })
      })

    case 'pois':
      // Handle points of interest
      return new Style({
        image: new Icon({
          src: 'data:image/svg+xml;base64,' + btoa(`
            <svg width="12" height="12" viewBox="0 0 12 12" xmlns="http://www.w3.org/2000/svg">
              <circle cx="6" cy="6" r="4" fill="#FF6B6B" stroke="#FFFFFF" stroke-width="2"/>
            </svg>
          `),
          scale: 1
        })
      })

    default:
      // Default style for unknown features
      return new Style({
        stroke: new Stroke({
          color: '#000000',
          width: 1
        }),
        fill: new Fill({
          color: 'rgba(0, 0, 0, 0.1)'
        })
      })
  }
}

export const createOfflinePMTilesTileSource = (sourceData: ArrayBuffer, sourceName = 'Unknown') => {
  console.log(`${sourceName}: Creating offline PMTiles tile source from ArrayBuffer`)

  // Create a blob URL from the ArrayBuffer
  const blob = new Blob([sourceData], { type: 'application/octet-stream' })
  const blobUrl = URL.createObjectURL(blob)

  try {
    const vectorLayer = createVectorTile(blobUrl)
    console.log(`${sourceName}: Offline PMTiles tile source created successfully`)
    return vectorLayer
  } catch (error) {
    console.error(`${sourceName}: Error creating offline PMTiles tile source:`, error)
    // Clean up the blob URL if there was an error
    URL.revokeObjectURL(blobUrl)
    throw error
  }
}

/**
 * Creates a PMTiles tile source with hybrid caching
 * @param {PMTilesLocation} location - Location data for PMTiles
 * @param {string} sourceName - Name for logging purposes
 * @returns {PMTilesTileSource} Configured PMTiles tile source
 */
export const createPMTilesTileSourceForLocation = async (
  location: PMTilesLocation,
  sourceName = 'Unknown'
) => {
  let sourceData: { data: ArrayBuffer, source: 'local' | 'generated' }
  sourceData = await pmtilesService.getPMTiles(location)
  return createOfflinePMTilesTileSource(sourceData.data, sourceName)
}

/**
 * Creates the best available tile source for a location
 * Priority: PMTiles (if available) -> Offline tiles -> CartoDB
 * @param {PMTilesLocation} location - Location data
 * @param {string} sourceName - Name for logging purposes
 * @returns {XYZ | PMTilesTileSource} Best available tile source
 */
export const createBestTileSource = async (
  location: PMTilesLocation,
  sourceName = 'Unknown'
) => {
  // 1. Try PMTiles if supported and location has PMTiles URL
  if (location?.pmtilesUrl) {
    console.log(`${sourceName}: Using PMTiles for ${location.name}`)
    return await createPMTilesTileSourceForLocation(location, sourceName)
  }
  // 3. Fallback to online pmtiles source
  console.log(`${sourceName}: Using online PMTiles`)
  return createOnlinePMTilesTileSource(sourceName)
}